/**
 * Urlaubsanträge und Abwesenheiten – das Kernmodul.
 *
 * Konsistenz:
 * - Pro Mitarbeiter werden schreibende Vorgänge über `SELECT … FOR UPDATE` serialisiert.
 * - Jeder gezählte Tag wird in leave_request_days gespeichert; ein eindeutiger Index
 *   (employee_id, date) verhindert Überschneidungen auch bei parallelen Requests.
 * - Statuswechsel erfolgen mit Bedingung auf den bisherigen Status
 *   (`UPDATE … WHERE status = 'submitted'`), damit Doppelentscheidungen unmöglich sind.
 */
import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql, sum } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { schema, type Tx } from "../db";
import { withTenant, type TxHooks } from "../db/tenant";
import { can, requirePermission, type TenantContext } from "../authz";
import { conflict, forbidden, invalid, isUniqueViolation, notFound, assertId } from "../errors";
import { audit } from "./audit";
import { notify } from "./notifications";
import {
  canDecideFor,
  canSeeSensitive,
  canViewEmployeeLeave,
  managedEmployeeIds,
  responsibleApproverUserIds,
  userIdForEmployee,
} from "./scope";
import { calculateLeave, computeBalance, LeaveCalculationError, type LeaveBalance, type LeaveCalculation } from "@/lib/leave-calc";
import { holidayMapForRange, HolidayRangeError, isStateCode, type StateCode } from "@/lib/holidays";
import { formatDays, formatRange, isIsoDate, todayIso, yearOf, type IsoDate } from "@/lib/dates";

export type LeaveStatus = (typeof schema.leaveStatus.enumValues)[number];

const noteSchema = z.string().trim().max(1000, "Höchstens 1000 Zeichen.").optional();

export const leaveInputSchema = z.object({
  startDate: z.string().refine(isIsoDate, "Bitte ein gültiges Startdatum wählen."),
  endDate: z.string().refine(isIsoDate, "Bitte ein gültiges Enddatum wählen."),
  absenceTypeId: z.string().uuid("Bitte eine Abwesenheitsart wählen."),
  note: noteSchema,
});

export type LeaveInput = z.infer<typeof leaveInputSchema>;

// ---------------------------------------------------------------------------
// Berechnungsgrundlagen eines Mitarbeiters
// ---------------------------------------------------------------------------

async function loadCalcBasis(tx: Tx, companyId: string, employeeId: string, start: IsoDate, end: IsoDate) {
  const [row] = await tx
    .select({
      employeeId: schema.employees.id,
      status: schema.employees.status,
      locationId: schema.employees.locationId,
      locationState: schema.locations.state,
      optionalHolidays: schema.locations.optionalHolidays,
      defaultState: schema.companies.defaultState,
      defaultWorkWeek: schema.companies.defaultWorkWeek,
      allowNegativeBalance: schema.companies.allowNegativeBalance,
    })
    .from(schema.employees)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.employees.companyId))
    .leftJoin(schema.locations, eq(schema.locations.id, schema.employees.locationId))
    .where(and(eq(schema.employees.id, employeeId), eq(schema.employees.companyId, companyId)))
    .limit(1);
  if (!row) throw notFound("Mitarbeiter");

  const schedules = await tx
    .select({ validFrom: schema.workSchedules.validFrom, weekdays: schema.workSchedules.weekdays })
    .from(schema.workSchedules)
    .where(and(eq(schema.workSchedules.companyId, companyId), eq(schema.workSchedules.employeeId, employeeId)));

  const custom = await tx
    .select({ date: schema.companyHolidays.date, name: schema.companyHolidays.name })
    .from(schema.companyHolidays)
    .where(
      and(
        eq(schema.companyHolidays.companyId, companyId),
        gte(schema.companyHolidays.date, start),
        lte(schema.companyHolidays.date, end),
        row.locationId
          ? or(isNull(schema.companyHolidays.locationId), eq(schema.companyHolidays.locationId, row.locationId))
          : isNull(schema.companyHolidays.locationId),
      ),
    );

  const stateRaw = row.locationState ?? row.defaultState;
  const state: StateCode = isStateCode(stateRaw) ? stateRaw : "NW";
  const holidays = holidayMapForRange(start, end, state, row.locationState ? (row.optionalHolidays ?? []) : [], custom);
  return { ...row, state, schedules, holidays };
}

function calculate(basis: Awaited<ReturnType<typeof loadCalcBasis>>, start: IsoDate, end: IsoDate): LeaveCalculation {
  try {
    return calculateLeave({
      startDate: start,
      endDate: end,
      defaultWeekdays: basis.defaultWorkWeek,
      schedules: basis.schedules,
      holidays: basis.holidays,
    });
  } catch (error) {
    if (error instanceof LeaveCalculationError || error instanceof HolidayRangeError) {
      throw invalid(error.message);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Salden
// ---------------------------------------------------------------------------

async function usedDaysByYear(tx: Tx, companyId: string, employeeId: string, years: number[]) {
  const rows = await tx
    .select({
      year: sql<number>`extract(year from ${schema.leaveRequestDays.date})::int`,
      status: schema.leaveRequests.status,
      total: sum(schema.leaveRequestDays.amount).mapWith(Number),
    })
    .from(schema.leaveRequestDays)
    .innerJoin(schema.leaveRequests, eq(schema.leaveRequests.id, schema.leaveRequestDays.requestId))
    .innerJoin(schema.absenceTypes, eq(schema.absenceTypes.id, schema.leaveRequests.absenceTypeId))
    .where(
      and(
        eq(schema.leaveRequestDays.companyId, companyId),
        eq(schema.leaveRequestDays.employeeId, employeeId),
        eq(schema.absenceTypes.deductsLeave, true),
        inArray(sql`extract(year from ${schema.leaveRequestDays.date})::int`, years),
      ),
    )
    .groupBy(sql`1`, schema.leaveRequests.status);
  const out = new Map<number, { approved: number; pending: number }>();
  for (const y of years) out.set(y, { approved: 0, pending: 0 });
  for (const r of rows) {
    const entry = out.get(Number(r.year));
    if (!entry) continue;
    if (r.status === "approved") entry.approved += r.total ?? 0;
    if (r.status === "submitted") entry.pending += r.total ?? 0;
  }
  return out;
}

async function balancesFor(tx: Tx, companyId: string, employeeId: string, years: number[]): Promise<LeaveBalance[]> {
  const entitlements = await tx
    .select()
    .from(schema.leaveEntitlements)
    .where(
      and(
        eq(schema.leaveEntitlements.companyId, companyId),
        eq(schema.leaveEntitlements.employeeId, employeeId),
        inArray(schema.leaveEntitlements.year, years),
      ),
    );
  const used = await usedDaysByYear(tx, companyId, employeeId, years);
  return years.map((year) => {
    const e = entitlements.find((x) => x.year === year);
    const u = used.get(year)!;
    return computeBalance({
      year,
      entitlement: e ? { days: e.days, carryoverDays: e.carryoverDays } : null,
      approved: u.approved,
      pending: u.pending,
    });
  });
}

export async function getBalance(ctx: TenantContext, employeeId: string, year: number) {
  assertId(employeeId);
  return withTenant(ctx, async (tx) => {
    if (!(await canViewEmployeeLeave(tx, ctx, employeeId))) throw forbidden();
    const [b] = await balancesFor(tx, ctx.companyId, employeeId, [year]);
    return b;
  });
}

/** Salden mehrerer Mitarbeiter in einer Abfrage (für Listen, vermeidet N+1). */
export async function balancesForEmployees(tx: Tx, companyId: string, employeeIds: string[], year: number) {
  const result = new Map<string, LeaveBalance>();
  if (employeeIds.length === 0) return result;
  const entitlements = await tx
    .select()
    .from(schema.leaveEntitlements)
    .where(
      and(
        eq(schema.leaveEntitlements.companyId, companyId),
        eq(schema.leaveEntitlements.year, year),
        inArray(schema.leaveEntitlements.employeeId, employeeIds),
      ),
    );
  const used = await tx
    .select({
      employeeId: schema.leaveRequestDays.employeeId,
      status: schema.leaveRequests.status,
      total: sum(schema.leaveRequestDays.amount).mapWith(Number),
    })
    .from(schema.leaveRequestDays)
    .innerJoin(schema.leaveRequests, eq(schema.leaveRequests.id, schema.leaveRequestDays.requestId))
    .innerJoin(schema.absenceTypes, eq(schema.absenceTypes.id, schema.leaveRequests.absenceTypeId))
    .where(
      and(
        eq(schema.leaveRequestDays.companyId, companyId),
        inArray(schema.leaveRequestDays.employeeId, employeeIds),
        eq(schema.absenceTypes.deductsLeave, true),
        gte(schema.leaveRequestDays.date, `${year}-01-01`),
        lte(schema.leaveRequestDays.date, `${year}-12-31`),
      ),
    )
    .groupBy(schema.leaveRequestDays.employeeId, schema.leaveRequests.status);
  for (const id of employeeIds) {
    const e = entitlements.find((x) => x.employeeId === id);
    const approved = used.filter((u) => u.employeeId === id && u.status === "approved").reduce((s, u) => s + (u.total ?? 0), 0);
    const pending = used.filter((u) => u.employeeId === id && u.status === "submitted").reduce((s, u) => s + (u.total ?? 0), 0);
    result.set(
      id,
      computeBalance({ year, entitlement: e ? { days: e.days, carryoverDays: e.carryoverDays } : null, approved, pending }),
    );
  }
  return result;
}

function assertWithinBalance(calc: LeaveCalculation, balances: LeaveBalance[], opts: { includePending: boolean }) {
  for (const b of balances) {
    const requested = calc.byYear[b.year] ?? 0;
    if (requested === 0 || !b.configured) continue;
    const left = opts.includePending ? b.available : b.remaining;
    if (requested > left) {
      throw invalid(
        `Für ${b.year} stehen nur noch ${formatDays(Math.max(0, left))} zur Verfügung, beantragt sind ${formatDays(requested)}.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Vorschau
// ---------------------------------------------------------------------------

export type LeavePreview = {
  total: number;
  days: LeaveCalculation["days"];
  byYear: Record<number, number>;
  deductsLeave: boolean;
  balances: LeaveBalance[];
  overlaps: { startDate: string; endDate: string; status: LeaveStatus }[];
};

export async function previewLeave(
  ctx: TenantContext,
  input: { employeeId?: string; startDate: string; endDate: string; absenceTypeId: string },
): Promise<LeavePreview> {
  const employeeId = input.employeeId ?? ctx.employeeId;
  assertId(employeeId, "Mitarbeiter");
  if (!/^[0-9a-f-]{36}$/i.test(input.absenceTypeId)) throw invalid("Bitte eine Abwesenheitsart wählen.");
  if (employeeId !== ctx.employeeId) requirePermission(ctx, "leave.manage");
  if (!isIsoDate(input.startDate) || !isIsoDate(input.endDate)) throw invalid("Bitte gültige Daten wählen.");
  return withTenant(ctx, async (tx) => {
    const type = await getAbsenceType(tx, ctx.companyId, input.absenceTypeId);
    const basis = await loadCalcBasis(tx, ctx.companyId, employeeId, input.startDate, input.endDate);
    const calc = calculate(basis, input.startDate, input.endDate);
    const years = Object.keys(calc.byYear).map(Number);
    const balances = type.deductsLeave && years.length ? await balancesFor(tx, ctx.companyId, employeeId, years) : [];
    const overlaps = await findOverlaps(tx, ctx.companyId, employeeId, input.startDate, input.endDate);
    return { total: calc.total, days: calc.days, byYear: calc.byYear, deductsLeave: type.deductsLeave, balances, overlaps };
  });
}

async function getAbsenceType(tx: Tx, companyId: string, id: string) {
  const [type] = await tx
    .select()
    .from(schema.absenceTypes)
    .where(and(eq(schema.absenceTypes.id, id), eq(schema.absenceTypes.companyId, companyId)))
    .limit(1);
  if (!type || type.archivedAt) throw invalid("Diese Abwesenheitsart ist nicht verfügbar.");
  return type;
}

async function findOverlaps(tx: Tx, companyId: string, employeeId: string, start: IsoDate, end: IsoDate) {
  return tx
    .select({
      startDate: schema.leaveRequests.startDate,
      endDate: schema.leaveRequests.endDate,
      status: schema.leaveRequests.status,
    })
    .from(schema.leaveRequests)
    .where(
      and(
        eq(schema.leaveRequests.companyId, companyId),
        eq(schema.leaveRequests.employeeId, employeeId),
        inArray(schema.leaveRequests.status, ["submitted", "approved"]),
        lte(schema.leaveRequests.startDate, end),
        gte(schema.leaveRequests.endDate, start),
      ),
    );
}

// ---------------------------------------------------------------------------
// Anlegen
// ---------------------------------------------------------------------------

async function createRequest(
  tx: Tx,
  hooks: TxHooks,
  ctx: TenantContext,
  opts: { employeeId: string; input: LeaveInput; mode: "request" | "record" },
) {
  const { employeeId, input, mode } = opts;
  // Schreibvorgänge pro Mitarbeiter serialisieren
  const [locked] = await tx
    .select({ id: schema.employees.id, status: schema.employees.status, firstName: schema.employees.firstName, lastName: schema.employees.lastName })
    .from(schema.employees)
    .where(and(eq(schema.employees.id, employeeId), eq(schema.employees.companyId, ctx.companyId)))
    .for("update");
  if (!locked) throw notFound("Mitarbeiter");
  if (locked.status !== "active") throw invalid("Für inaktive Mitarbeiter können keine Anträge erstellt werden.");

  const type = await getAbsenceType(tx, ctx.companyId, input.absenceTypeId);
  if (mode === "request" && !type.employeeCanRequest) {
    throw invalid("Diese Abwesenheitsart kann nur von der Verwaltung erfasst werden.");
  }

  const basis = await loadCalcBasis(tx, ctx.companyId, employeeId, input.startDate, input.endDate);
  const calc = calculate(basis, input.startDate, input.endDate);
  if (calc.total === 0) {
    throw invalid("Im gewählten Zeitraum liegen keine Arbeitstage. Bitte prüfe die Daten.");
  }

  const overlaps = await findOverlaps(tx, ctx.companyId, employeeId, input.startDate, input.endDate);
  if (overlaps.length > 0) {
    const o = overlaps[0];
    throw conflict(
      `Der Zeitraum überschneidet sich mit einem bestehenden Antrag (${formatRange(o.startDate, o.endDate)}).`,
    );
  }

  const autoApprove = mode === "record" || !type.requiresApproval;
  if (type.deductsLeave && !basis.allowNegativeBalance) {
    const balances = await balancesFor(tx, ctx.companyId, employeeId, Object.keys(calc.byYear).map(Number));
    assertWithinBalance(calc, balances, { includePending: true });
  }

  const now = new Date();
  const [request] = await tx
    .insert(schema.leaveRequests)
    .values({
      companyId: ctx.companyId,
      employeeId,
      absenceTypeId: type.id,
      startDate: input.startDate,
      endDate: input.endDate,
      status: autoApprove ? "approved" : "submitted",
      workingDays: calc.total,
      employeeNote: input.note || null,
      createdByUserId: ctx.userId,
      decidedByUserId: autoApprove ? ctx.userId : null,
      decidedAt: autoApprove ? now : null,
    })
    .returning();

  try {
    await tx.insert(schema.leaveRequestDays).values(
      calc.countedDates.map((date) => ({
        companyId: ctx.companyId,
        requestId: request.id,
        employeeId,
        date,
        amount: 1,
      })),
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict("Der Zeitraum überschneidet sich mit einem bestehenden Antrag.");
    }
    throw error;
  }

  await tx.insert(schema.leaveRequestEvents).values({
    companyId: ctx.companyId,
    requestId: request.id,
    type: mode === "record" ? "recorded" : autoApprove ? "approved" : "submitted",
    actorUserId: ctx.userId,
    note: input.note || null,
  });
  await audit(tx, {
    companyId: ctx.companyId,
    actorUserId: ctx.userId,
    action: mode === "record" ? "leave.recorded" : "leave.submitted",
    entityType: "leave_request",
    entityId: request.id,
    // Keine Abwesenheitsart im Protokoll (kann Gesundheitsdaten offenlegen)
    metadata: { employeeId, days: calc.total },
  });

  const employeeName = `${locked.firstName} ${locked.lastName}`;
  if (!autoApprove) {
    const approvers = await responsibleApproverUserIds(tx, ctx.companyId, employeeId);
    await notify(tx, hooks, {
      companyId: ctx.companyId,
      userIds: approvers.filter((id) => id !== ctx.userId),
      type: "leave.submitted",
      title: `Neuer Antrag von ${employeeName}`,
      body: `${type.name}: ${formatRange(input.startDate, input.endDate)} (${formatDays(calc.total)})`,
      link: `/app/genehmigungen/${request.id}`,
      dedupeBase: `leave:${request.id}:submitted`,
      email: true,
    });
  } else if (mode === "record") {
    const userId = await userIdForEmployee(tx, ctx.companyId, employeeId);
    if (userId && userId !== ctx.userId) {
      await notify(tx, hooks, {
        companyId: ctx.companyId,
        userIds: [userId],
        type: "leave.recorded",
        title: "Abwesenheit wurde für dich eingetragen",
        body: `${type.name}: ${formatRange(input.startDate, input.endDate)}`,
        link: `/app/antraege/${request.id}`,
        dedupeBase: `leave:${request.id}:recorded`,
      });
    }
  }
  return request;
}

/** Mitarbeiter stellt einen eigenen Antrag. */
export async function submitLeaveRequest(ctx: TenantContext, raw: unknown) {
  const input = parseLeaveInput(raw);
  return withTenant(ctx, (tx, hooks) => createRequest(tx, hooks, ctx, { employeeId: ctx.employeeId, input, mode: "request" }));
}

/** Verwaltung erfasst eine Abwesenheit direkt (z. B. Krankmeldung, Nachtrag). */
export async function recordAbsence(ctx: TenantContext, employeeId: string, raw: unknown) {
  assertId(employeeId);
  requirePermission(ctx, "leave.manage");
  const input = parseLeaveInput(raw);
  return withTenant(ctx, (tx, hooks) => createRequest(tx, hooks, ctx, { employeeId, input, mode: "record" }));
}

function parseLeaveInput(raw: unknown): LeaveInput {
  const parsed = leaveInputSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    throw invalid(parsed.error.issues[0].message, fieldErrors);
  }
  if (parsed.data.endDate < parsed.data.startDate) {
    throw invalid("Das Enddatum darf nicht vor dem Startdatum liegen.", { endDate: "Liegt vor dem Startdatum." });
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Statuswechsel
// ---------------------------------------------------------------------------

/**
 * Sperrt zuerst den Mitarbeiter, dann den Antrag – dieselbe Reihenfolge wie beim Anlegen.
 * So werden Saldo-Prüfungen paralleler Vorgänge desselben Mitarbeiters serialisiert.
 */
async function lockRequest(tx: Tx, ctx: TenantContext, id: string) {
  const [owner] = await tx
    .select({ employeeId: schema.leaveRequests.employeeId })
    .from(schema.leaveRequests)
    .where(and(eq(schema.leaveRequests.id, id), eq(schema.leaveRequests.companyId, ctx.companyId)));
  if (!owner) throw notFound("Antrag");
  await tx
    .select({ id: schema.employees.id })
    .from(schema.employees)
    .where(and(eq(schema.employees.id, owner.employeeId), eq(schema.employees.companyId, ctx.companyId)))
    .for("update");
  const [request] = await tx
    .select()
    .from(schema.leaveRequests)
    .where(and(eq(schema.leaveRequests.id, id), eq(schema.leaveRequests.companyId, ctx.companyId)))
    .for("update");
  if (!request) throw notFound("Antrag");
  return request;
}

async function releaseDays(tx: Tx, companyId: string, requestId: string) {
  await tx
    .delete(schema.leaveRequestDays)
    .where(and(eq(schema.leaveRequestDays.companyId, companyId), eq(schema.leaveRequestDays.requestId, requestId)));
}

export async function withdrawLeaveRequest(ctx: TenantContext, id: string) {
  assertId(id);
  return withTenant(ctx, async (tx, hooks) => {
    const request = await lockRequest(tx, ctx, id);
    if (request.employeeId !== ctx.employeeId) throw forbidden("Du kannst nur eigene Anträge zurückziehen.");
    if (request.status !== "submitted") {
      throw conflict("Nur noch nicht entschiedene Anträge können zurückgezogen werden.");
    }
    await tx
      .update(schema.leaveRequests)
      .set({ status: "withdrawn", updatedAt: new Date() })
      .where(eq(schema.leaveRequests.id, id));
    await releaseDays(tx, ctx.companyId, id);
    await tx.insert(schema.leaveRequestEvents).values({
      companyId: ctx.companyId,
      requestId: id,
      type: "withdrawn",
      actorUserId: ctx.userId,
    });
    await audit(tx, {
      companyId: ctx.companyId,
      actorUserId: ctx.userId,
      action: "leave.withdrawn",
      entityType: "leave_request",
      entityId: id,
    });
    const approvers = await responsibleApproverUserIds(tx, ctx.companyId, request.employeeId);
    await notify(tx, hooks, {
      companyId: ctx.companyId,
      userIds: approvers.filter((u) => u !== ctx.userId),
      type: "leave.withdrawn",
      title: "Antrag zurückgezogen",
      body: `Zeitraum ${formatRange(request.startDate, request.endDate)}`,
      link: `/app/genehmigungen/${id}`,
      dedupeBase: `leave:${id}:withdrawn`,
    });
  });
}

export const decisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve"), note: noteSchema }),
  z.object({
    decision: z.literal("reject"),
    note: z.string().trim().min(3, "Bitte eine kurze Begründung angeben.").max(1000, "Höchstens 1000 Zeichen."),
  }),
]);

export async function decideLeaveRequest(ctx: TenantContext, id: string, raw: unknown) {
  assertId(id);
  const parsed = decisionSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error.issues[0].message, { note: parsed.error.issues[0].message });
  const { decision, note } = parsed.data;

  return withTenant(ctx, async (tx, hooks) => {
    const request = await lockRequest(tx, ctx, id);
    if (!(await canDecideFor(tx, ctx, request.employeeId))) {
      throw forbidden(
        request.employeeId === ctx.employeeId
          ? "Eigene Anträge können nicht selbst entschieden werden."
          : "Du bist für diesen Antrag nicht zuständig.",
      );
    }
    if (request.status !== "submitted") throw conflict("Dieser Antrag wurde bereits entschieden.");

    if (decision === "approve") {
      const [type] = await tx
        .select({ deductsLeave: schema.absenceTypes.deductsLeave })
        .from(schema.absenceTypes)
        .where(eq(schema.absenceTypes.id, request.absenceTypeId));
      const [company] = await tx
        .select({ allowNegativeBalance: schema.companies.allowNegativeBalance })
        .from(schema.companies)
        .where(eq(schema.companies.id, ctx.companyId));
      if (type?.deductsLeave && !company?.allowNegativeBalance) {
        const days = await tx
          .select({ date: schema.leaveRequestDays.date, amount: schema.leaveRequestDays.amount })
          .from(schema.leaveRequestDays)
          .where(eq(schema.leaveRequestDays.requestId, id));
        const byYear: Record<number, number> = {};
        for (const d of days) byYear[yearOf(d.date)] = (byYear[yearOf(d.date)] ?? 0) + d.amount;
        const balances = await balancesFor(tx, ctx.companyId, request.employeeId, Object.keys(byYear).map(Number));
        assertWithinBalance({ total: request.workingDays, byYear, days: [], countedDates: [] }, balances, {
          includePending: false,
        });
      }
    }

    const status: LeaveStatus = decision === "approve" ? "approved" : "rejected";
    const [updated] = await tx
      .update(schema.leaveRequests)
      .set({
        status,
        decisionNote: note || null,
        decidedByUserId: ctx.userId,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.leaveRequests.id, id), eq(schema.leaveRequests.status, "submitted")))
      .returning();
    if (!updated) throw conflict("Dieser Antrag wurde bereits entschieden.");
    if (status === "rejected") await releaseDays(tx, ctx.companyId, id);

    await tx.insert(schema.leaveRequestEvents).values({
      companyId: ctx.companyId,
      requestId: id,
      type: status,
      actorUserId: ctx.userId,
      note: note || null,
    });
    await audit(tx, {
      companyId: ctx.companyId,
      actorUserId: ctx.userId,
      action: `leave.${status}`,
      entityType: "leave_request",
      entityId: id,
      metadata: { employeeId: request.employeeId },
    });
    const employeeUserId = await userIdForEmployee(tx, ctx.companyId, request.employeeId);
    if (employeeUserId) {
      await notify(tx, hooks, {
        companyId: ctx.companyId,
        userIds: [employeeUserId],
        type: `leave.${status}`,
        title: status === "approved" ? "Dein Antrag wurde genehmigt" : "Dein Antrag wurde abgelehnt",
        body: `${formatRange(request.startDate, request.endDate)}${note ? ` – ${note}` : ""}`,
        link: `/app/antraege/${id}`,
        dedupeBase: `leave:${id}:${status}`,
        email: true,
      });
    }
    return updated;
  });
}

/** Storniert eine bereits genehmigte Abwesenheit (z. B. auf Wunsch des Mitarbeiters). */
export async function cancelLeaveRequest(ctx: TenantContext, id: string, rawNote: unknown) {
  assertId(id);
  const note = z.string().trim().min(3, "Bitte eine kurze Begründung angeben.").max(1000).safeParse(rawNote);
  if (!note.success) throw invalid(note.error.issues[0].message, { note: note.error.issues[0].message });
  return withTenant(ctx, async (tx, hooks) => {
    const request = await lockRequest(tx, ctx, id);
    const allowed = can(ctx, "leave.manage") || (await canDecideFor(tx, ctx, request.employeeId));
    if (!allowed) throw forbidden();
    if (request.status !== "approved") throw conflict("Nur genehmigte Abwesenheiten können storniert werden.");
    await tx
      .update(schema.leaveRequests)
      .set({ status: "cancelled", decisionNote: note.data, updatedAt: new Date() })
      .where(eq(schema.leaveRequests.id, id));
    await releaseDays(tx, ctx.companyId, id);
    await tx.insert(schema.leaveRequestEvents).values({
      companyId: ctx.companyId,
      requestId: id,
      type: "cancelled",
      actorUserId: ctx.userId,
      note: note.data,
    });
    await audit(tx, {
      companyId: ctx.companyId,
      actorUserId: ctx.userId,
      action: "leave.cancelled",
      entityType: "leave_request",
      entityId: id,
      metadata: { employeeId: request.employeeId },
    });
    const employeeUserId = await userIdForEmployee(tx, ctx.companyId, request.employeeId);
    if (employeeUserId && employeeUserId !== ctx.userId) {
      await notify(tx, hooks, {
        companyId: ctx.companyId,
        userIds: [employeeUserId],
        type: "leave.cancelled",
        title: "Eine genehmigte Abwesenheit wurde storniert",
        body: `${formatRange(request.startDate, request.endDate)} – ${note.data}`,
        link: `/app/antraege/${id}`,
        dedupeBase: `leave:${id}:cancelled`,
        email: true,
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

const requestColumns = {
  id: schema.leaveRequests.id,
  employeeId: schema.leaveRequests.employeeId,
  startDate: schema.leaveRequests.startDate,
  endDate: schema.leaveRequests.endDate,
  status: schema.leaveRequests.status,
  workingDays: schema.leaveRequests.workingDays,
  employeeNote: schema.leaveRequests.employeeNote,
  decisionNote: schema.leaveRequests.decisionNote,
  decidedAt: schema.leaveRequests.decidedAt,
  createdAt: schema.leaveRequests.createdAt,
  typeId: schema.absenceTypes.id,
  typeName: schema.absenceTypes.name,
  typeColor: schema.absenceTypes.color,
  deductsLeave: schema.absenceTypes.deductsLeave,
  isSensitive: schema.absenceTypes.isSensitive,
  firstName: schema.employees.firstName,
  lastName: schema.employees.lastName,
};

export async function listMyRequests(ctx: TenantContext, opts: { year?: number } = {}) {
  const year = opts.year ?? yearOf(todayIso());
  return withTenant(ctx, async (tx) => {
    const requests = await tx
      .select(requestColumns)
      .from(schema.leaveRequests)
      .innerJoin(schema.absenceTypes, eq(schema.absenceTypes.id, schema.leaveRequests.absenceTypeId))
      .innerJoin(schema.employees, eq(schema.employees.id, schema.leaveRequests.employeeId))
      .where(
        and(
          eq(schema.leaveRequests.companyId, ctx.companyId),
          eq(schema.leaveRequests.employeeId, ctx.employeeId),
          lte(schema.leaveRequests.startDate, `${year}-12-31`),
          gte(schema.leaveRequests.endDate, `${year}-01-01`),
        ),
      )
      .orderBy(desc(schema.leaveRequests.startDate));
    const [balance] = await balancesFor(tx, ctx.companyId, ctx.employeeId, [year]);
    return { requests, balance, year };
  });
}

export async function getLeaveRequest(ctx: TenantContext, id: string) {
  assertId(id);
  return withTenant(ctx, async (tx) => {
    const [request] = await tx
      .select(requestColumns)
      .from(schema.leaveRequests)
      .innerJoin(schema.absenceTypes, eq(schema.absenceTypes.id, schema.leaveRequests.absenceTypeId))
      .innerJoin(schema.employees, eq(schema.employees.id, schema.leaveRequests.employeeId))
      .where(and(eq(schema.leaveRequests.id, id), eq(schema.leaveRequests.companyId, ctx.companyId)))
      .limit(1);
    if (!request) throw notFound("Antrag");
    const isOwn = request.employeeId === ctx.employeeId;
    const canDecide = await canDecideFor(tx, ctx, request.employeeId);
    if (!isOwn && !canDecide && !(await canViewEmployeeLeave(tx, ctx, request.employeeId))) {
      // Bewusst "nicht gefunden", um die Existenz nicht preiszugeben.
      throw notFound("Antrag");
    }
    if (request.isSensitive && !isOwn && !canSeeSensitive(ctx)) throw notFound("Antrag");
    const actor = alias(schema.users, "actor");
    const events = await tx
      .select({
        id: schema.leaveRequestEvents.id,
        type: schema.leaveRequestEvents.type,
        note: schema.leaveRequestEvents.note,
        createdAt: schema.leaveRequestEvents.createdAt,
        actorName: actor.name,
      })
      .from(schema.leaveRequestEvents)
      .leftJoin(actor, eq(actor.id, schema.leaveRequestEvents.actorUserId))
      .where(and(eq(schema.leaveRequestEvents.companyId, ctx.companyId), eq(schema.leaveRequestEvents.requestId, id)))
      .orderBy(asc(schema.leaveRequestEvents.createdAt));
    const years = [...new Set([yearOf(request.startDate), yearOf(request.endDate)])];
    const balances = request.deductsLeave ? await balancesFor(tx, ctx.companyId, request.employeeId, years) : [];
    const overlappingTeam = canDecide ? await teamAbsencesDuring(tx, ctx.companyId, request.employeeId, request.startDate, request.endDate) : [];
    return {
      request,
      events,
      balances,
      overlappingTeam,
      permissions: {
        isOwn,
        canDecide: canDecide && request.status === "submitted",
        canWithdraw: isOwn && request.status === "submitted",
        canCancel: request.status === "approved" && (can(ctx, "leave.manage") || canDecide),
      },
    };
  });
}

/** Wer aus demselben Team ist im Zeitraum ebenfalls abwesend? (Entscheidungshilfe) */
async function teamAbsencesDuring(tx: Tx, companyId: string, employeeId: string, start: IsoDate, end: IsoDate) {
  const [emp] = await tx
    .select({ teamId: schema.employees.teamId })
    .from(schema.employees)
    .where(eq(schema.employees.id, employeeId));
  if (!emp?.teamId) return [];
  return tx
    .select({
      requestId: schema.leaveRequests.id,
      firstName: schema.employees.firstName,
      lastName: schema.employees.lastName,
      startDate: schema.leaveRequests.startDate,
      endDate: schema.leaveRequests.endDate,
      status: schema.leaveRequests.status,
    })
    .from(schema.leaveRequests)
    .innerJoin(schema.employees, eq(schema.employees.id, schema.leaveRequests.employeeId))
    .where(
      and(
        eq(schema.leaveRequests.companyId, companyId),
        eq(schema.employees.teamId, emp.teamId),
        sql`${schema.leaveRequests.employeeId} <> ${employeeId}`,
        inArray(schema.leaveRequests.status, ["submitted", "approved"]),
        lte(schema.leaveRequests.startDate, end),
        gte(schema.leaveRequests.endDate, start),
      ),
    )
    .orderBy(asc(schema.leaveRequests.startDate));
}

/** Offene Anträge, die `ctx` entscheiden darf. */
export async function listPendingApprovals(ctx: TenantContext, opts: { limit?: number } = {}) {
  if (!can(ctx, "leave.approve_all") && !can(ctx, "leave.approve_team")) return [];
  return withTenant(ctx, async (tx) => {
    let scope: string[] | null = null;
    if (!can(ctx, "leave.approve_all")) {
      scope = [...(await managedEmployeeIds(tx, ctx))];
      if (scope.length === 0) return [];
    }
    return tx
      .select({ ...requestColumns, teamName: schema.teams.name })
      .from(schema.leaveRequests)
      .innerJoin(schema.absenceTypes, eq(schema.absenceTypes.id, schema.leaveRequests.absenceTypeId))
      .innerJoin(schema.employees, eq(schema.employees.id, schema.leaveRequests.employeeId))
      .leftJoin(schema.teams, eq(schema.teams.id, schema.employees.teamId))
      .where(
        and(
          eq(schema.leaveRequests.companyId, ctx.companyId),
          eq(schema.leaveRequests.status, "submitted"),
          sql`${schema.leaveRequests.employeeId} <> ${ctx.employeeId}`,
          scope ? inArray(schema.leaveRequests.employeeId, scope) : undefined,
        ),
      )
      .orderBy(asc(schema.leaveRequests.createdAt))
      .limit(Math.min(opts.limit ?? 100, 200));
  });
}

/** Anzahl offener Anträge, die `ctx` entscheiden darf (für Navigation und Dashboard). */
export async function countPendingApprovals(ctx: TenantContext): Promise<number> {
  if (!can(ctx, "leave.approve_all") && !can(ctx, "leave.approve_team")) return 0;
  return withTenant(ctx, async (tx) => {
    let scope: string[] | null = null;
    if (!can(ctx, "leave.approve_all")) {
      scope = [...(await managedEmployeeIds(tx, ctx))];
      if (scope.length === 0) return 0;
    }
    const [row] = await tx
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.leaveRequests)
      .where(
        and(
          eq(schema.leaveRequests.companyId, ctx.companyId),
          eq(schema.leaveRequests.status, "submitted"),
          sql`${schema.leaveRequests.employeeId} <> ${ctx.employeeId}`,
          scope ? inArray(schema.leaveRequests.employeeId, scope) : undefined,
        ),
      );
    return row?.n ?? 0;
  });
}

/** Entschiedene Anträge (Verlauf) für Entscheider. */
export async function listDecidedRequests(ctx: TenantContext, opts: { limit?: number } = {}) {
  if (!can(ctx, "leave.approve_all") && !can(ctx, "leave.approve_team") && !can(ctx, "leave.view_all")) return [];
  return withTenant(ctx, async (tx) => {
    let scope: string[] | null = null;
    if (!can(ctx, "leave.approve_all") && !can(ctx, "leave.view_all")) {
      scope = [...(await managedEmployeeIds(tx, ctx))];
      if (scope.length === 0) return [];
    }
    return tx
      .select(requestColumns)
      .from(schema.leaveRequests)
      .innerJoin(schema.absenceTypes, eq(schema.absenceTypes.id, schema.leaveRequests.absenceTypeId))
      .innerJoin(schema.employees, eq(schema.employees.id, schema.leaveRequests.employeeId))
      .where(
        and(
          eq(schema.leaveRequests.companyId, ctx.companyId),
          inArray(schema.leaveRequests.status, ["approved", "rejected", "cancelled"]),
          scope ? inArray(schema.leaveRequests.employeeId, scope) : undefined,
          canSeeSensitive(ctx) ? undefined : eq(schema.absenceTypes.isSensitive, false),
        ),
      )
      .orderBy(desc(schema.leaveRequests.decidedAt))
      .limit(Math.min(opts.limit ?? 50, 200));
  });
}

export async function listRequestableTypes(ctx: TenantContext, opts: { forRecording?: boolean } = {}) {
  return withTenant(ctx, (tx) =>
    tx
      .select({
        id: schema.absenceTypes.id,
        name: schema.absenceTypes.name,
        deductsLeave: schema.absenceTypes.deductsLeave,
        requiresApproval: schema.absenceTypes.requiresApproval,
      })
      .from(schema.absenceTypes)
      .where(
        and(
          eq(schema.absenceTypes.companyId, ctx.companyId),
          isNull(schema.absenceTypes.archivedAt),
          opts.forRecording ? undefined : eq(schema.absenceTypes.employeeCanRequest, true),
        ),
      )
      .orderBy(asc(schema.absenceTypes.sortOrder), asc(schema.absenceTypes.name)),
  );
}

/** Erinnerungen an offene Entscheidungen (vom Cron-Job aufgerufen, System-Kontext). */
export async function sendPendingReminders(tx: Tx, hooks: TxHooks, today: IsoDate) {
  const pending = await tx
    .select({
      id: schema.leaveRequests.id,
      companyId: schema.leaveRequests.companyId,
      employeeId: schema.leaveRequests.employeeId,
      startDate: schema.leaveRequests.startDate,
      endDate: schema.leaveRequests.endDate,
      createdAt: schema.leaveRequests.createdAt,
      reminderAfterDays: schema.companies.reminderAfterDays,
      firstName: schema.employees.firstName,
      lastName: schema.employees.lastName,
    })
    .from(schema.leaveRequests)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.leaveRequests.companyId))
    .innerJoin(schema.employees, eq(schema.employees.id, schema.leaveRequests.employeeId))
    .where(
      and(
        eq(schema.leaveRequests.status, "submitted"),
        eq(schema.companies.status, "active"),
        sql`${schema.companies.reminderAfterDays} > 0`,
        sql`${schema.leaveRequests.createdAt} < now() - make_interval(days => ${schema.companies.reminderAfterDays})`,
      ),
    )
    .limit(500);
  let sent = 0;
  for (const p of pending) {
    const approvers = await responsibleApproverUserIds(tx, p.companyId, p.employeeId);
    sent += await notify(tx, hooks, {
      companyId: p.companyId,
      userIds: approvers,
      type: "leave.reminder",
      title: `Erinnerung: Antrag von ${p.firstName} ${p.lastName} wartet auf Entscheidung`,
      body: formatRange(p.startDate, p.endDate),
      link: `/app/genehmigungen/${p.id}`,
      // Höchstens eine Erinnerung pro Antrag und Tag
      dedupeBase: `leave:${p.id}:reminder:${today}`,
      email: true,
    });
  }
  return sent;
}
