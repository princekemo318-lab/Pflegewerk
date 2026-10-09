/**
 * Organisation: Teams, Standorte, betriebliche Feiertage, Abwesenheitsarten und
 * Unternehmenseinstellungen.
 */
import "server-only";
import { and, asc, count, eq, gte, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { schema, type Tx } from "../db";
import { withTenant } from "../db/tenant";
import { requirePermission, type TenantContext } from "../authz";
import { invalid, notFound, assertId } from "../errors";
import { audit } from "./audit";
import { isOptionalHolidayKey, isStateCode, OPTIONAL_HOLIDAYS } from "@/lib/holidays";
import { isIsoDate } from "@/lib/dates";

function parse<T extends z.ZodTypeAny>(s: T, raw: unknown): z.infer<T> {
  const r = s.safeParse(raw);
  if (!r.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of r.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    throw invalid("Bitte prüfe die markierten Felder.", fieldErrors);
  }
  return r.data;
}

const optionalUuid = z
  .string()
  .uuid()
  .optional()
  .or(z.literal(""))
  .transform((v) => v || null);

export const ABSENCE_COLORS = ["teal", "blue", "violet", "amber", "rose", "slate"] as const;

// ---------------------------------------------------------------------------
// Übersicht
// ---------------------------------------------------------------------------

export async function getOrganization(ctx: TenantContext) {
  requirePermission(ctx, "organization.manage");
  return withTenant(ctx, async (tx) => {
    const memberCounts = tx
      .select({ teamId: schema.employees.teamId, n: count().as("n") })
      .from(schema.employees)
      .where(and(eq(schema.employees.companyId, ctx.companyId), eq(schema.employees.status, "active")))
      .groupBy(schema.employees.teamId)
      .as("team_counts");
    const teams = await tx
      .select({
        id: schema.teams.id,
        name: schema.teams.name,
        locationId: schema.teams.locationId,
        locationName: schema.locations.name,
        leadEmployeeId: schema.teams.leadEmployeeId,
        leadFirstName: schema.employees.firstName,
        leadLastName: schema.employees.lastName,
        memberCount: memberCounts.n,
      })
      .from(schema.teams)
      .leftJoin(schema.locations, eq(schema.locations.id, schema.teams.locationId))
      .leftJoin(schema.employees, eq(schema.employees.id, schema.teams.leadEmployeeId))
      .leftJoin(memberCounts, eq(memberCounts.teamId, schema.teams.id))
      .where(and(eq(schema.teams.companyId, ctx.companyId), isNull(schema.teams.archivedAt)))
      .orderBy(asc(schema.teams.name));
    const locations = await tx
      .select()
      .from(schema.locations)
      .where(and(eq(schema.locations.companyId, ctx.companyId), isNull(schema.locations.archivedAt)))
      .orderBy(asc(schema.locations.name));
    return { teams: teams.map((t) => ({ ...t, memberCount: Number(t.memberCount ?? 0) })), locations };
  });
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

const teamSchema = z.object({
  name: z.string().trim().min(2, "Bitte einen Namen angeben.").max(80),
  locationId: optionalUuid,
  leadEmployeeId: optionalUuid,
});

async function assertTeamRefs(
  tx: Tx,
  companyId: string,
  input: { locationId: string | null; leadEmployeeId: string | null },
) {
  if (input.locationId) {
    const [l] = await tx
      .select({ id: schema.locations.id })
      .from(schema.locations)
      .where(and(eq(schema.locations.id, input.locationId), eq(schema.locations.companyId, companyId)));
    if (!l) throw invalid("Ungültiger Standort.", { locationId: "Ungültig." });
  }
  if (input.leadEmployeeId) {
    const [e] = await tx
      .select({ id: schema.employees.id })
      .from(schema.employees)
      .where(and(eq(schema.employees.id, input.leadEmployeeId), eq(schema.employees.companyId, companyId)));
    if (!e) throw invalid("Ungültige Teamleitung.", { leadEmployeeId: "Ungültig." });
  }
}

export async function createTeam(ctx: TenantContext, raw: unknown) {
  requirePermission(ctx, "organization.manage");
  const input = parse(teamSchema, raw);
  return withTenant(ctx, async (tx) => {
    await assertTeamRefs(tx, ctx.companyId, input);
    const [team] = await tx
      .insert(schema.teams)
      .values({ companyId: ctx.companyId, ...input })
      .returning();
    await audit(tx, {
      companyId: ctx.companyId,
      actorUserId: ctx.userId,
      action: "team.created",
      entityType: "team",
      entityId: team.id,
      metadata: { name: team.name },
    });
    return team;
  });
}

export async function updateTeam(ctx: TenantContext, teamId: string, raw: unknown) {
  assertId(teamId);
  requirePermission(ctx, "organization.manage");
  const input = parse(teamSchema, raw);
  return withTenant(ctx, async (tx) => {
    await assertTeamRefs(tx, ctx.companyId, input);
    const [team] = await tx
      .update(schema.teams)
      .set(input)
      .where(and(eq(schema.teams.id, teamId), eq(schema.teams.companyId, ctx.companyId)))
      .returning();
    if (!team) throw notFound("Team");
    await audit(tx, {
      companyId: ctx.companyId,
      actorUserId: ctx.userId,
      action: "team.updated",
      entityType: "team",
      entityId: teamId,
      metadata: { leadEmployeeId: input.leadEmployeeId },
    });
    return team;
  });
}

export async function archiveTeam(ctx: TenantContext, teamId: string) {
  assertId(teamId);
  requirePermission(ctx, "organization.manage");
  return withTenant(ctx, async (tx) => {
    const [team] = await tx
      .update(schema.teams)
      .set({ archivedAt: new Date() })
      .where(and(eq(schema.teams.id, teamId), eq(schema.teams.companyId, ctx.companyId), isNull(schema.teams.archivedAt)))
      .returning({ id: schema.teams.id });
    if (!team) throw notFound("Team");
    // Mitarbeiter bleiben erhalten, verlieren nur die Teamzuordnung.
    await tx
      .update(schema.employees)
      .set({ teamId: null, updatedAt: new Date() })
      .where(and(eq(schema.employees.companyId, ctx.companyId), eq(schema.employees.teamId, teamId)));
    await audit(tx, { companyId: ctx.companyId, actorUserId: ctx.userId, action: "team.archived", entityType: "team", entityId: teamId });
  });
}

// ---------------------------------------------------------------------------
// Standorte
// ---------------------------------------------------------------------------

const locationSchema = z.object({
  name: z.string().trim().min(2, "Bitte einen Namen angeben.").max(80),
  city: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((v) => v || null),
  state: z.string().refine(isStateCode, "Bitte ein Bundesland wählen."),
  optionalHolidays: z.array(z.string()).default([]),
});

function cleanOptionalHolidays(state: string, list: string[]) {
  return [...new Set(list.filter((k) => isOptionalHolidayKey(k) && OPTIONAL_HOLIDAYS[k].state === state))];
}

export async function createLocation(ctx: TenantContext, raw: unknown) {
  requirePermission(ctx, "organization.manage");
  const input = parse(locationSchema, raw);
  return withTenant(ctx, async (tx) => {
    const [location] = await tx
      .insert(schema.locations)
      .values({
        companyId: ctx.companyId,
        name: input.name,
        city: input.city,
        state: input.state,
        optionalHolidays: cleanOptionalHolidays(input.state, input.optionalHolidays),
      })
      .returning();
    await audit(tx, {
      companyId: ctx.companyId,
      actorUserId: ctx.userId,
      action: "location.created",
      entityType: "location",
      entityId: location.id,
      metadata: { name: location.name, state: location.state },
    });
    return location;
  });
}

export async function updateLocation(ctx: TenantContext, locationId: string, raw: unknown) {
  assertId(locationId);
  requirePermission(ctx, "organization.manage");
  const input = parse(locationSchema, raw);
  return withTenant(ctx, async (tx) => {
    const [location] = await tx
      .update(schema.locations)
      .set({
        name: input.name,
        city: input.city,
        state: input.state,
        optionalHolidays: cleanOptionalHolidays(input.state, input.optionalHolidays),
      })
      .where(and(eq(schema.locations.id, locationId), eq(schema.locations.companyId, ctx.companyId)))
      .returning();
    if (!location) throw notFound("Standort");
    await audit(tx, {
      companyId: ctx.companyId,
      actorUserId: ctx.userId,
      action: "location.updated",
      entityType: "location",
      entityId: locationId,
      metadata: { state: location.state, optionalHolidays: location.optionalHolidays },
    });
    return location;
  });
}

export async function archiveLocation(ctx: TenantContext, locationId: string) {
  assertId(locationId);
  requirePermission(ctx, "organization.manage");
  return withTenant(ctx, async (tx) => {
    const [location] = await tx
      .update(schema.locations)
      .set({ archivedAt: new Date() })
      .where(
        and(eq(schema.locations.id, locationId), eq(schema.locations.companyId, ctx.companyId), isNull(schema.locations.archivedAt)),
      )
      .returning({ id: schema.locations.id });
    if (!location) throw notFound("Standort");
    await tx
      .update(schema.employees)
      .set({ locationId: null, updatedAt: new Date() })
      .where(and(eq(schema.employees.companyId, ctx.companyId), eq(schema.employees.locationId, locationId)));
    await tx
      .update(schema.teams)
      .set({ locationId: null })
      .where(and(eq(schema.teams.companyId, ctx.companyId), eq(schema.teams.locationId, locationId)));
    await audit(tx, {
      companyId: ctx.companyId,
      actorUserId: ctx.userId,
      action: "location.archived",
      entityType: "location",
      entityId: locationId,
    });
  });
}

// ---------------------------------------------------------------------------
// Betriebliche Feiertage
// ---------------------------------------------------------------------------

export async function listCompanyHolidays(ctx: TenantContext, year: number) {
  requirePermission(ctx, "organization.manage");
  return withTenant(ctx, (tx) =>
    tx
      .select({
        id: schema.companyHolidays.id,
        date: schema.companyHolidays.date,
        name: schema.companyHolidays.name,
        locationId: schema.companyHolidays.locationId,
        locationName: schema.locations.name,
      })
      .from(schema.companyHolidays)
      .leftJoin(schema.locations, eq(schema.locations.id, schema.companyHolidays.locationId))
      .where(
        and(
          eq(schema.companyHolidays.companyId, ctx.companyId),
          gte(schema.companyHolidays.date, `${year}-01-01`),
          lte(schema.companyHolidays.date, `${year}-12-31`),
        ),
      )
      .orderBy(asc(schema.companyHolidays.date)),
  );
}

export async function createCompanyHoliday(ctx: TenantContext, raw: unknown) {
  requirePermission(ctx, "organization.manage");
  const input = parse(
    z.object({
      date: z.string().refine(isIsoDate, "Ungültiges Datum."),
      name: z.string().trim().min(2, "Bitte eine Bezeichnung angeben.").max(80),
      locationId: optionalUuid,
    }),
    raw,
  );
  return withTenant(ctx, async (tx) => {
    if (input.locationId) {
      const [l] = await tx
        .select({ id: schema.locations.id })
        .from(schema.locations)
        .where(and(eq(schema.locations.id, input.locationId), eq(schema.locations.companyId, ctx.companyId)));
      if (!l) throw invalid("Ungültiger Standort.", { locationId: "Ungültig." });
    }
    const [holiday] = await tx
      .insert(schema.companyHolidays)
      .values({ companyId: ctx.companyId, ...input })
      .returning();
    await audit(tx, {
      companyId: ctx.companyId,
      actorUserId: ctx.userId,
      action: "holiday.created",
      entityType: "holiday",
      entityId: holiday.id,
      metadata: { date: holiday.date, name: holiday.name },
    });
    return holiday;
  });
}

export async function deleteCompanyHoliday(ctx: TenantContext, holidayId: string) {
  assertId(holidayId);
  requirePermission(ctx, "organization.manage");
  return withTenant(ctx, async (tx) => {
    const [holiday] = await tx
      .delete(schema.companyHolidays)
      .where(and(eq(schema.companyHolidays.id, holidayId), eq(schema.companyHolidays.companyId, ctx.companyId)))
      .returning();
    if (!holiday) throw notFound("Feiertag");
    await audit(tx, {
      companyId: ctx.companyId,
      actorUserId: ctx.userId,
      action: "holiday.deleted",
      entityType: "holiday",
      entityId: holidayId,
      metadata: { date: holiday.date, name: holiday.name },
    });
  });
}

// ---------------------------------------------------------------------------
// Abwesenheitsarten
// ---------------------------------------------------------------------------

export async function listAbsenceTypes(ctx: TenantContext) {
  requirePermission(ctx, "organization.manage");
  return withTenant(ctx, (tx) =>
    tx
      .select()
      .from(schema.absenceTypes)
      .where(eq(schema.absenceTypes.companyId, ctx.companyId))
      .orderBy(asc(schema.absenceTypes.sortOrder), asc(schema.absenceTypes.name)),
  );
}

const absenceTypeSchema = z.object({
  name: z.string().trim().min(2, "Bitte einen Namen angeben.").max(60),
  color: z.enum(ABSENCE_COLORS).default("teal"),
  deductsLeave: z.boolean(),
  requiresApproval: z.boolean(),
  employeeCanRequest: z.boolean(),
  isSensitive: z.boolean().default(false),
  archived: z.boolean().default(false),
});

export async function upsertAbsenceType(ctx: TenantContext, typeId: string | null, raw: unknown) {
  if (typeId !== null) assertId(typeId);
  requirePermission(ctx, "organization.manage");
  const input = parse(absenceTypeSchema, raw);
  return withTenant(ctx, async (tx) => {
    const values = {
      name: input.name,
      color: input.color,
      deductsLeave: input.deductsLeave,
      // Sensible Arten werden ausschließlich von der Verwaltung erfasst (DB-Constraint).
      requiresApproval: input.isSensitive ? false : input.requiresApproval,
      employeeCanRequest: input.isSensitive ? false : input.employeeCanRequest,
      isSensitive: input.isSensitive,
      archivedAt: input.archived ? new Date() : null,
    };
    let id = typeId;
    if (typeId) {
      const [t] = await tx
        .update(schema.absenceTypes)
        .set(values)
        .where(and(eq(schema.absenceTypes.id, typeId), eq(schema.absenceTypes.companyId, ctx.companyId)))
        .returning({ id: schema.absenceTypes.id });
      if (!t) throw notFound("Abwesenheitsart");
    } else {
      const [t] = await tx
        .insert(schema.absenceTypes)
        .values({ companyId: ctx.companyId, ...values, sortOrder: 50 })
        .returning({ id: schema.absenceTypes.id });
      id = t.id;
    }
    await audit(tx, {
      companyId: ctx.companyId,
      actorUserId: ctx.userId,
      action: typeId ? "absence_type.updated" : "absence_type.created",
      entityType: "absence_type",
      entityId: id,
      metadata: { name: input.name, deductsLeave: input.deductsLeave, isSensitive: input.isSensitive, archived: input.archived },
    });
  });
}

// ---------------------------------------------------------------------------
// Unternehmenseinstellungen
// ---------------------------------------------------------------------------

export async function getCompanySettings(ctx: TenantContext) {
  requirePermission(ctx, "organization.manage");
  return withTenant(ctx, async (tx) => {
    const [company] = await tx.select().from(schema.companies).where(eq(schema.companies.id, ctx.companyId));
    if (!company) throw notFound("Unternehmen");
    return company;
  });
}

const settingsSchema = z.object({
  name: z.string().trim().min(2, "Bitte einen Namen angeben.").max(120),
  defaultState: z.string().refine(isStateCode, "Bitte ein Bundesland wählen."),
  defaultWorkWeek: z.coerce.number().int().min(1, "Mindestens ein Arbeitstag.").max(127),
  defaultAnnualLeaveDays: z.coerce.number().min(0).max(366).multipleOf(0.5),
  employeeCalendarScope: z.enum(["none", "team", "company"]),
  allowNegativeBalance: z.boolean(),
  reminderAfterDays: z.coerce.number().int().min(0).max(30),
});

export async function updateCompanySettings(ctx: TenantContext, raw: unknown) {
  requirePermission(ctx, "organization.manage");
  const input = parse(settingsSchema, raw);
  return withTenant(ctx, async (tx) => {
    const [before] = await tx.select().from(schema.companies).where(eq(schema.companies.id, ctx.companyId));
    await tx
      .update(schema.companies)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(schema.companies.id, ctx.companyId));
    const changed = (Object.keys(input) as (keyof typeof input)[]).filter((k) => before[k] !== input[k]);
    await audit(tx, {
      companyId: ctx.companyId,
      actorUserId: ctx.userId,
      action: "company.settings_updated",
      entityType: "company",
      entityId: ctx.companyId,
      metadata: { fields: changed },
    });
  });
}
