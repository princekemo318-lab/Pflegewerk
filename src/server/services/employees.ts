/**
 * Mitarbeiterverwaltung: Profile, Zugänge, Arbeitszeitmodelle, Urlaubsansprüche.
 */
import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { schema, type Tx } from "../db";
import { withTenant } from "../db/tenant";
import { can, canAny, requirePermission, type TenantContext } from "../authz";
import { conflict, forbidden, invalid, notFound, assertId } from "../errors";
import { audit } from "./audit";
import { createInvitationTx } from "./invitations";
import { assertMayGrantRole, countActiveOwners, getRole, lockCompanyAccess } from "./roles";
import { canSeeSensitive, managedEmployeeIds } from "./scope";
import { balancesForEmployees } from "./leave";
import { emailSchema } from "../auth/accounts";
import { isIsoDate, todayIso, yearOf } from "@/lib/dates";

const PAGE_SIZE = 50;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Höchstens ${max} Zeichen.`)
    .optional()
    .transform((v) => v || null);
const optionalUuid = z
  .string()
  .uuid()
  .optional()
  .or(z.literal(""))
  .transform((v) => v || null);
const optionalDate = z
  .string()
  .optional()
  .refine((v) => !v || isIsoDate(v), "Ungültiges Datum.")
  .transform((v) => v || null);

export const employeeSchema = z.object({
  firstName: z.string().trim().min(1, "Vorname fehlt.").max(80),
  lastName: z.string().trim().min(1, "Nachname fehlt.").max(80),
  email: emailSchema.optional().or(z.literal("").transform(() => undefined)),
  personnelNumber: optionalText(40),
  jobTitle: optionalText(80),
  teamId: optionalUuid,
  locationId: optionalUuid,
  managerId: optionalUuid,
  entryDate: optionalDate,
  exitDate: optionalDate,
});

export const createEmployeeSchema = employeeSchema.extend({
  weekdays: z.coerce.number().int().min(1, "Mindestens ein Arbeitstag.").max(127),
  annualLeaveDays: z.coerce.number().min(0).max(366).multipleOf(0.5, "Nur ganze oder halbe Tage."),
  invite: z.boolean().default(false),
  roleId: optionalUuid,
});

function parse<T extends z.ZodTypeAny>(s: T, raw: unknown): z.infer<T> {
  const r = s.safeParse(raw);
  if (!r.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of r.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    throw invalid("Bitte prüfe die markierten Felder.", fieldErrors);
  }
  return r.data;
}

/** Stellt sicher, dass referenzierte Datensätze zum eigenen Unternehmen gehören. */
async function assertReferences(
  tx: Tx,
  companyId: string,
  refs: { teamId?: string | null; locationId?: string | null; managerId?: string | null },
) {
  if (refs.teamId) {
    const [t] = await tx
      .select({ id: schema.teams.id })
      .from(schema.teams)
      .where(and(eq(schema.teams.id, refs.teamId), eq(schema.teams.companyId, companyId), isNull(schema.teams.archivedAt)));
    if (!t) throw invalid("Das gewählte Team existiert nicht.", { teamId: "Ungültiges Team." });
  }
  if (refs.locationId) {
    const [l] = await tx
      .select({ id: schema.locations.id })
      .from(schema.locations)
      .where(and(eq(schema.locations.id, refs.locationId), eq(schema.locations.companyId, companyId), isNull(schema.locations.archivedAt)));
    if (!l) throw invalid("Der gewählte Standort existiert nicht.", { locationId: "Ungültiger Standort." });
  }
  if (refs.managerId) {
    const [m] = await tx
      .select({ id: schema.employees.id })
      .from(schema.employees)
      .where(and(eq(schema.employees.id, refs.managerId), eq(schema.employees.companyId, companyId)));
    if (!m) throw invalid("Die gewählte Führungskraft existiert nicht.", { managerId: "Ungültige Führungskraft." });
  }
}

// ---------------------------------------------------------------------------
// Liste & Detail
// ---------------------------------------------------------------------------

export type EmployeeListFilter = {
  q?: string;
  teamId?: string;
  locationId?: string;
  status?: "active" | "inactive" | "all";
  page?: number;
};

export async function listEmployees(ctx: TenantContext, filter: EmployeeListFilter = {}) {
  const fullAccess = can(ctx, "employees.view") || can(ctx, "employees.manage");
  if (!fullAccess && !can(ctx, "leave.approve_team")) throw forbidden();
  const page = Math.max(1, filter.page ?? 1);
  const year = yearOf(todayIso());

  return withTenant(ctx, async (tx) => {
    let scope: string[] | null = null;
    if (!fullAccess) {
      scope = [...(await managedEmployeeIds(tx, ctx))];
      if (scope.length === 0) return { rows: [], page, hasMore: false, total: 0, year };
    }
    const q = filter.q?.trim().slice(0, 80).replace(/[%_\\]/g, "");
    const manager = alias(schema.employees, "manager");
    const where = and(
      eq(schema.employees.companyId, ctx.companyId),
      filter.status === "all" ? undefined : eq(schema.employees.status, filter.status ?? "active"),
      filter.teamId ? eq(schema.employees.teamId, filter.teamId) : undefined,
      filter.locationId ? eq(schema.employees.locationId, filter.locationId) : undefined,
      q
        ? or(
            ilike(schema.employees.firstName, `%${q}%`),
            ilike(schema.employees.lastName, `%${q}%`),
            ilike(schema.employees.personnelNumber, `%${q}%`),
            ilike(sql`${schema.employees.firstName} || ' ' || ${schema.employees.lastName}`, `%${q}%`),
          )
        : undefined,
      scope ? inArray(schema.employees.id, scope) : undefined,
    );
    const openInvites = tx
      .select({ employeeId: schema.invitations.employeeId, n: count().as("n") })
      .from(schema.invitations)
      .where(
        and(
          eq(schema.invitations.companyId, ctx.companyId),
          isNull(schema.invitations.acceptedAt),
          isNull(schema.invitations.revokedAt),
          sql`${schema.invitations.expiresAt} > now()`,
        ),
      )
      .groupBy(schema.invitations.employeeId)
      .as("open_invites");

    const rows = await tx
      .select({
        id: schema.employees.id,
        firstName: schema.employees.firstName,
        lastName: schema.employees.lastName,
        jobTitle: schema.employees.jobTitle,
        status: schema.employees.status,
        teamName: schema.teams.name,
        locationName: schema.locations.name,
        managerFirstName: manager.firstName,
        managerLastName: manager.lastName,
        roleName: schema.roles.name,
        membershipStatus: schema.memberships.status,
        hasOpenInvite: sql<boolean>`coalesce(${openInvites.n}, 0) > 0`,
      })
      .from(schema.employees)
      .leftJoin(schema.teams, eq(schema.teams.id, schema.employees.teamId))
      .leftJoin(schema.locations, eq(schema.locations.id, schema.employees.locationId))
      .leftJoin(manager, eq(manager.id, schema.employees.managerId))
      .leftJoin(schema.memberships, eq(schema.memberships.employeeId, schema.employees.id))
      .leftJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
      .leftJoin(openInvites, eq(openInvites.employeeId, schema.employees.id))
      .where(where)
      .orderBy(asc(schema.employees.lastName), asc(schema.employees.firstName))
      .limit(PAGE_SIZE + 1)
      .offset((page - 1) * PAGE_SIZE);
    const [{ total }] = await tx.select({ total: count() }).from(schema.employees).where(where);

    const pageRows = rows.slice(0, PAGE_SIZE);
    const balances = await balancesForEmployees(tx, ctx.companyId, pageRows.map((r) => r.id), year);
    return {
      rows: pageRows.map((r) => ({
        ...r,
        accountStatus: r.membershipStatus
          ? (r.membershipStatus as "active" | "deactivated")
          : r.hasOpenInvite
            ? ("invited" as const)
            : ("none" as const),
        balance: balances.get(r.id) ?? null,
      })),
      page,
      hasMore: rows.length > PAGE_SIZE,
      total,
      year,
    };
  });
}

export async function getEmployee(ctx: TenantContext, employeeId: string) {
  assertId(employeeId);
  const fullAccess = can(ctx, "employees.view") || can(ctx, "employees.manage");
  return withTenant(ctx, async (tx) => {
    if (!fullAccess && employeeId !== ctx.employeeId) {
      if (!can(ctx, "leave.approve_team") || !(await managedEmployeeIds(tx, ctx)).has(employeeId)) {
        throw notFound("Mitarbeiter");
      }
    }
    const manager = alias(schema.employees, "manager");
    const [employee] = await tx
      .select({
        id: schema.employees.id,
        firstName: schema.employees.firstName,
        lastName: schema.employees.lastName,
        email: schema.employees.email,
        personnelNumber: schema.employees.personnelNumber,
        jobTitle: schema.employees.jobTitle,
        teamId: schema.employees.teamId,
        teamName: schema.teams.name,
        locationId: schema.employees.locationId,
        locationName: schema.locations.name,
        managerId: schema.employees.managerId,
        managerName: sql<string | null>`${manager.firstName} || ' ' || ${manager.lastName}`,
        status: schema.employees.status,
        entryDate: schema.employees.entryDate,
        exitDate: schema.employees.exitDate,
        membershipId: schema.memberships.id,
        membershipStatus: schema.memberships.status,
        roleId: schema.memberships.roleId,
        roleName: schema.roles.name,
        roleIsOwner: schema.roles.isOwner,
        accountEmail: schema.users.email,
        lastLoginAt: schema.users.lastLoginAt,
      })
      .from(schema.employees)
      .leftJoin(schema.teams, eq(schema.teams.id, schema.employees.teamId))
      .leftJoin(schema.locations, eq(schema.locations.id, schema.employees.locationId))
      .leftJoin(manager, eq(manager.id, schema.employees.managerId))
      .leftJoin(schema.memberships, eq(schema.memberships.employeeId, schema.employees.id))
      .leftJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
      .leftJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(and(eq(schema.employees.id, employeeId), eq(schema.employees.companyId, ctx.companyId)))
      .limit(1);
    if (!employee) throw notFound("Mitarbeiter");

    const schedules = await tx
      .select()
      .from(schema.workSchedules)
      .where(and(eq(schema.workSchedules.companyId, ctx.companyId), eq(schema.workSchedules.employeeId, employeeId)))
      .orderBy(desc(schema.workSchedules.validFrom));
    const entitlements = await tx
      .select()
      .from(schema.leaveEntitlements)
      .where(and(eq(schema.leaveEntitlements.companyId, ctx.companyId), eq(schema.leaveEntitlements.employeeId, employeeId)))
      .orderBy(desc(schema.leaveEntitlements.year));
    const [invitation] = await tx
      .select({ id: schema.invitations.id, email: schema.invitations.email, expiresAt: schema.invitations.expiresAt })
      .from(schema.invitations)
      .where(
        and(
          eq(schema.invitations.companyId, ctx.companyId),
          eq(schema.invitations.employeeId, employeeId),
          isNull(schema.invitations.acceptedAt),
          isNull(schema.invitations.revokedAt),
        ),
      )
      .orderBy(desc(schema.invitations.createdAt))
      .limit(1);
    const requests = await tx
      .select({
        id: schema.leaveRequests.id,
        startDate: schema.leaveRequests.startDate,
        endDate: schema.leaveRequests.endDate,
        status: schema.leaveRequests.status,
        workingDays: schema.leaveRequests.workingDays,
        typeName: schema.absenceTypes.name,
        isSensitive: schema.absenceTypes.isSensitive,
      })
      .from(schema.leaveRequests)
      .innerJoin(schema.absenceTypes, eq(schema.absenceTypes.id, schema.leaveRequests.absenceTypeId))
      .where(and(eq(schema.leaveRequests.companyId, ctx.companyId), eq(schema.leaveRequests.employeeId, employeeId)))
      .orderBy(desc(schema.leaveRequests.startDate))
      .limit(20);
    const year = yearOf(todayIso());
    const balance = (await balancesForEmployees(tx, ctx.companyId, [employeeId], year)).get(employeeId) ?? null;
    const showSensitive = employeeId === ctx.employeeId || canSeeSensitive(ctx);
    const visibleRequests = requests.map((r) =>
      r.isSensitive && !showSensitive ? { ...r, typeName: "Abwesenheit" } : r,
    );
    return { employee, schedules, entitlements, invitation: invitation ?? null, requests: visibleRequests, balance, year };
  });
}

/** Auswahllisten für Formulare (Teams, Standorte, Führungskräfte, Rollen). */
export async function getEmployeeFormOptions(ctx: TenantContext) {
  if (!canAny(ctx, "employees.manage", "roles.manage", "organization.manage")) throw forbidden();
  return withTenant(ctx, async (tx) => {
    const [teams, locations, managers, roles, company] = await Promise.all([
      tx
        .select({ id: schema.teams.id, name: schema.teams.name })
        .from(schema.teams)
        .where(and(eq(schema.teams.companyId, ctx.companyId), isNull(schema.teams.archivedAt)))
        .orderBy(asc(schema.teams.name)),
      tx
        .select({ id: schema.locations.id, name: schema.locations.name })
        .from(schema.locations)
        .where(and(eq(schema.locations.companyId, ctx.companyId), isNull(schema.locations.archivedAt)))
        .orderBy(asc(schema.locations.name)),
      tx
        .select({ id: schema.employees.id, firstName: schema.employees.firstName, lastName: schema.employees.lastName })
        .from(schema.employees)
        .where(and(eq(schema.employees.companyId, ctx.companyId), eq(schema.employees.status, "active")))
        .orderBy(asc(schema.employees.lastName))
        .limit(1000),
      tx
        .select({
          id: schema.roles.id,
          name: schema.roles.name,
          isOwner: schema.roles.isOwner,
          isDefault: schema.roles.isDefault,
          permissions: schema.roles.permissions,
        })
        .from(schema.roles)
        .where(eq(schema.roles.companyId, ctx.companyId))
        .orderBy(asc(schema.roles.name)),
      tx
        .select({ defaultWorkWeek: schema.companies.defaultWorkWeek, defaultAnnualLeaveDays: schema.companies.defaultAnnualLeaveDays })
        .from(schema.companies)
        .where(eq(schema.companies.id, ctx.companyId))
        .then((r) => r[0]),
    ]);
    const assignableRoles = roles.filter((r) => {
      try {
        assertMayGrantRole(ctx, r);
        return true;
      } catch {
        return false;
      }
    });
    return { teams, locations, managers, roles, assignableRoles, company };
  });
}

// ---------------------------------------------------------------------------
// Schreiben
// ---------------------------------------------------------------------------

export async function createEmployee(ctx: TenantContext, raw: unknown) {
  requirePermission(ctx, "employees.manage");
  const input = parse(createEmployeeSchema, raw);
  if (input.invite && !input.email) {
    throw invalid("Für eine Einladung wird eine E-Mail-Adresse benötigt.", { email: "E-Mail fehlt." });
  }
  if (input.exitDate && input.entryDate && input.exitDate < input.entryDate) {
    throw invalid("Das Austrittsdatum liegt vor dem Eintrittsdatum.", { exitDate: "Liegt vor dem Eintritt." });
  }

  return withTenant(ctx, async (tx, hooks) => {
    await assertReferences(tx, ctx.companyId, input);
    let roleId: string | null = null;
    if (input.invite) {
      const role = input.roleId
        ? await getRole(tx, ctx.companyId, input.roleId)
        : (
            await tx
              .select()
              .from(schema.roles)
              .where(and(eq(schema.roles.companyId, ctx.companyId), eq(schema.roles.isDefault, true)))
              .limit(1)
          )[0];
      if (!role) throw invalid("Bitte eine Rolle wählen.", { roleId: "Rolle fehlt." });
      if (!role.isDefault) requirePermission(ctx, "roles.manage");
      assertMayGrantRole(ctx, role);
      roleId = role.id;
      await assertEmailNotMember(tx, ctx.companyId, input.email!);
    }

    const [employee] = await tx
      .insert(schema.employees)
      .values({
        companyId: ctx.companyId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email ?? null,
        personnelNumber: input.personnelNumber,
        jobTitle: input.jobTitle,
        teamId: input.teamId,
        locationId: input.locationId,
        managerId: input.managerId,
        entryDate: input.entryDate,
        exitDate: input.exitDate,
      })
      .returning();

    const [company] = await tx
      .select({ defaultWorkWeek: schema.companies.defaultWorkWeek, name: schema.companies.name })
      .from(schema.companies)
      .where(eq(schema.companies.id, ctx.companyId));
    if (input.weekdays !== company.defaultWorkWeek) {
      await tx.insert(schema.workSchedules).values({
        companyId: ctx.companyId,
        employeeId: employee.id,
        validFrom: input.entryDate ?? "2000-01-01",
        weekdays: input.weekdays,
      });
    }
    await tx.insert(schema.leaveEntitlements).values({
      companyId: ctx.companyId,
      employeeId: employee.id,
      year: yearOf(todayIso()),
      days: input.annualLeaveDays,
      updatedByUserId: ctx.userId,
    });
    await audit(tx, {
      companyId: ctx.companyId,
      actorUserId: ctx.userId,
      action: "employee.created",
      entityType: "employee",
      entityId: employee.id,
    });

    let invitation = null;
    if (input.invite && roleId && input.email) {
      const [me] = await tx.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, ctx.userId));
      invitation = await createInvitationTx(tx, hooks, {
        companyId: ctx.companyId,
        companyName: company.name,
        email: input.email,
        roleId,
        employeeId: employee.id,
        invitedByUserId: ctx.userId,
        inviterName: me?.name ?? null,
      });
    }
    return { employee, invitation };
  });
}

async function assertEmailNotMember(tx: Tx, companyId: string, email: string) {
  const [existing] = await tx
    .select({ id: schema.memberships.id })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(and(eq(schema.memberships.companyId, companyId), eq(schema.users.email, email.toLowerCase())))
    .limit(1);
  if (existing) throw conflict("Diese E-Mail-Adresse gehört bereits zu einem Mitglied des Unternehmens.");
}

const TRACKED_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "personnelNumber",
  "jobTitle",
  "teamId",
  "locationId",
  "managerId",
  "entryDate",
  "exitDate",
] as const;

export async function updateEmployee(ctx: TenantContext, employeeId: string, raw: unknown) {
  assertId(employeeId);
  requirePermission(ctx, "employees.manage");
  const input = parse(employeeSchema, raw);
  if (input.managerId === employeeId) {
    throw invalid("Ein Mitarbeiter kann nicht seine eigene Führungskraft sein.", { managerId: "Ungültig." });
  }
  if (input.exitDate && input.entryDate && input.exitDate < input.entryDate) {
    throw invalid("Das Austrittsdatum liegt vor dem Eintrittsdatum.", { exitDate: "Liegt vor dem Eintritt." });
  }
  return withTenant(ctx, async (tx) => {
    const [before] = await tx
      .select()
      .from(schema.employees)
      .where(and(eq(schema.employees.id, employeeId), eq(schema.employees.companyId, ctx.companyId)))
      .for("update");
    if (!before) throw notFound("Mitarbeiter");
    await assertReferences(tx, ctx.companyId, input);
    const next = { ...input, email: input.email ?? null };
    const changed = TRACKED_FIELDS.filter((f) => (before[f] ?? null) !== (next[f] ?? null));
    if (changed.length === 0) return before;
    const [updated] = await tx
      .update(schema.employees)
      .set({ ...next, updatedAt: new Date() })
      .where(and(eq(schema.employees.id, employeeId), eq(schema.employees.companyId, ctx.companyId)))
      .returning();
    await audit(tx, {
      companyId: ctx.companyId,
      actorUserId: ctx.userId,
      action: "employee.updated",
      entityType: "employee",
      entityId: employeeId,
      // Nur Feldnamen protokollieren, keine Inhalte
      metadata: { fields: changed },
    });
    return updated;
  });
}

export async function setEmployeeStatus(ctx: TenantContext, employeeId: string, status: "active" | "inactive") {
  assertId(employeeId);
  requirePermission(ctx, "employees.manage");
  if (employeeId === ctx.employeeId && status === "inactive") {
    throw forbidden("Du kannst dich nicht selbst als ausgeschieden markieren.");
  }
  return withTenant(ctx, async (tx) => {
    await lockCompanyAccess(tx, ctx.companyId);
    const [membership] = await tx
      .select({ id: schema.memberships.id, isOwner: schema.roles.isOwner, permissions: schema.roles.permissions })
      .from(schema.memberships)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
      .where(and(eq(schema.memberships.companyId, ctx.companyId), eq(schema.memberships.employeeId, employeeId)))
      .limit(1);
    if (membership) assertMayGrantRole(ctx, membership);

    const [updated] = await tx
      .update(schema.employees)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(schema.employees.id, employeeId), eq(schema.employees.companyId, ctx.companyId)))
      .returning({ id: schema.employees.id });
    if (!updated) throw notFound("Mitarbeiter");
    if (status === "inactive" && membership) {
      if (membership.isOwner) {
        if ((await countActiveOwners(tx, ctx.companyId, membership.id)) === 0) {
          throw conflict("Der letzte Inhaber kann nicht als ausgeschieden markiert werden.");
        }
      }
      // Ausgeschiedene verlieren den Zugang; Daten bleiben erhalten.
      await tx
        .update(schema.memberships)
        .set({ status: "deactivated", updatedAt: new Date() })
        .where(and(eq(schema.memberships.id, membership.id), eq(schema.memberships.companyId, ctx.companyId)));
    }
    if (status === "inactive") {
      // Offene Einladungen widerrufen
      await tx
        .update(schema.invitations)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(schema.invitations.companyId, ctx.companyId),
            eq(schema.invitations.employeeId, employeeId),
            isNull(schema.invitations.acceptedAt),
            isNull(schema.invitations.revokedAt),
          ),
        );
    }
    await audit(tx, {
      companyId: ctx.companyId,
      actorUserId: ctx.userId,
      action: "employee.status_changed",
      entityType: "employee",
      entityId: employeeId,
      metadata: { status },
    });
  });
}

export async function inviteEmployee(ctx: TenantContext, employeeId: string, raw: { email: unknown; roleId: unknown }) {
  assertId(employeeId);
  requirePermission(ctx, "employees.manage");
  const input = parse(z.object({ email: emailSchema, roleId: z.string().uuid("Bitte eine Rolle wählen.") }), raw);
  return withTenant(ctx, async (tx, hooks) => {
    const [employee] = await tx
      .select()
      .from(schema.employees)
      .where(and(eq(schema.employees.id, employeeId), eq(schema.employees.companyId, ctx.companyId)))
      .limit(1);
    if (!employee) throw notFound("Mitarbeiter");
    if (employee.status !== "active") throw invalid("Ausgeschiedene Mitarbeiter können nicht eingeladen werden.");
    const [membership] = await tx
      .select({ id: schema.memberships.id })
      .from(schema.memberships)
      .where(and(eq(schema.memberships.companyId, ctx.companyId), eq(schema.memberships.employeeId, employeeId)))
      .limit(1);
    if (membership) throw conflict("Dieser Mitarbeiter hat bereits einen Zugang.");
    const role = await getRole(tx, ctx.companyId, input.roleId);
    if (!role.isDefault) requirePermission(ctx, "roles.manage");
    assertMayGrantRole(ctx, role);
    await assertEmailNotMember(tx, ctx.companyId, input.email);
    const [company] = await tx.select({ name: schema.companies.name }).from(schema.companies).where(eq(schema.companies.id, ctx.companyId));
    const [me] = await tx.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, ctx.userId));
    if (employee.email !== input.email) {
      await tx
        .update(schema.employees)
        .set({ email: input.email, updatedAt: new Date() })
        .where(and(eq(schema.employees.id, employeeId), eq(schema.employees.companyId, ctx.companyId)));
    }
    return createInvitationTx(tx, hooks, {
      companyId: ctx.companyId,
      companyName: company.name,
      email: input.email,
      roleId: role.id,
      employeeId,
      invitedByUserId: ctx.userId,
      inviterName: me?.name ?? null,
    });
  });
}

export async function revokeInvitation(ctx: TenantContext, invitationId: string) {
  assertId(invitationId);
  requirePermission(ctx, "employees.manage");
  return withTenant(ctx, async (tx) => {
    const [inv] = await tx
      .update(schema.invitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(schema.invitations.id, invitationId),
          eq(schema.invitations.companyId, ctx.companyId),
          isNull(schema.invitations.acceptedAt),
          isNull(schema.invitations.revokedAt),
        ),
      )
      .returning({ id: schema.invitations.id, employeeId: schema.invitations.employeeId });
    if (!inv) throw notFound("Einladung");
    await audit(tx, {
      companyId: ctx.companyId,
      actorUserId: ctx.userId,
      action: "invitation.revoked",
      entityType: "invitation",
      entityId: inv.id,
      metadata: { employeeId: inv.employeeId },
    });
  });
}

export async function setWorkSchedule(ctx: TenantContext, employeeId: string, raw: unknown) {
  assertId(employeeId);
  requirePermission(ctx, "employees.manage");
  const input = parse(
    z.object({
      validFrom: z.string().refine(isIsoDate, "Ungültiges Datum."),
      weekdays: z.coerce.number().int().min(1, "Mindestens ein Arbeitstag.").max(127),
    }),
    raw,
  );
  return withTenant(ctx, async (tx) => {
    const [employee] = await tx
      .select({ id: schema.employees.id })
      .from(schema.employees)
      .where(and(eq(schema.employees.id, employeeId), eq(schema.employees.companyId, ctx.companyId)));
    if (!employee) throw notFound("Mitarbeiter");
    await tx
      .insert(schema.workSchedules)
      .values({ companyId: ctx.companyId, employeeId, validFrom: input.validFrom, weekdays: input.weekdays })
      .onConflictDoUpdate({
        target: [schema.workSchedules.employeeId, schema.workSchedules.validFrom],
        set: { weekdays: input.weekdays },
      });
    await audit(tx, {
      companyId: ctx.companyId,
      actorUserId: ctx.userId,
      action: "employee.schedule_set",
      entityType: "employee",
      entityId: employeeId,
      metadata: { validFrom: input.validFrom, weekdays: input.weekdays },
    });
  });
}

export async function setEntitlement(ctx: TenantContext, employeeId: string, raw: unknown) {
  assertId(employeeId);
  requirePermission(ctx, "leave.manage");
  const input = parse(
    z.object({
      year: z.coerce.number().int().min(2018).max(2100),
      days: z.coerce.number().min(0).max(366).multipleOf(0.5, "Nur ganze oder halbe Tage."),
      carryoverDays: z.coerce.number().min(0).max(366).multipleOf(0.5, "Nur ganze oder halbe Tage.").default(0),
      note: optionalText(200),
    }),
    raw,
  );
  return withTenant(ctx, async (tx) => {
    const [employee] = await tx
      .select({ id: schema.employees.id })
      .from(schema.employees)
      .where(and(eq(schema.employees.id, employeeId), eq(schema.employees.companyId, ctx.companyId)));
    if (!employee) throw notFound("Mitarbeiter");
    await tx
      .insert(schema.leaveEntitlements)
      .values({ companyId: ctx.companyId, employeeId, ...input, updatedByUserId: ctx.userId })
      .onConflictDoUpdate({
        target: [schema.leaveEntitlements.employeeId, schema.leaveEntitlements.year],
        set: { days: input.days, carryoverDays: input.carryoverDays, note: input.note, updatedByUserId: ctx.userId, updatedAt: new Date() },
      });
    await audit(tx, {
      companyId: ctx.companyId,
      actorUserId: ctx.userId,
      action: "employee.entitlement_set",
      entityType: "employee",
      entityId: employeeId,
      metadata: { year: input.year, days: input.days, carryoverDays: input.carryoverDays },
    });
  });
}

