/**
 * Datenschutzfunktionen: Auskunft/Datenexport (Art. 15, 20 DSGVO), endgültige Löschung
 * ausgeschiedener Mitarbeiter (Art. 17) und automatische Aufbewahrungsfristen.
 *
 * Welche Fristen rechtlich gelten, legt das Unternehmen als Verantwortlicher fest; die
 * Standardwerte sind konfigurierbare Vorschläge (siehe docs/DATENSCHUTZ.md).
 */
import "server-only";
import { and, asc, desc, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { schema, type Tx } from "../db";
import { withSystem, withTenant } from "../db/tenant";
import { requirePermission, type TenantContext } from "../authz";
import { assertId, conflict, forbidden, notFound } from "../errors";
import { audit } from "./audit";
import { assertMayGrantRole, lockCompanyAccess } from "./roles";
import { env } from "../env";

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Auskunft / Datenexport
// ---------------------------------------------------------------------------

async function collectEmployeeData(tx: Tx, ctx: TenantContext, employeeId: string, includeNotifications: boolean) {
  const [employee] = await tx
    .select()
    .from(schema.employees)
    .where(and(eq(schema.employees.id, employeeId), eq(schema.employees.companyId, ctx.companyId)));
  if (!employee) throw notFound("Mitarbeiter");
  const [company] = await tx.select({ name: schema.companies.name }).from(schema.companies).where(eq(schema.companies.id, ctx.companyId));
  const [membership] = await tx
    .select({
      userId: schema.memberships.userId,
      status: schema.memberships.status,
      createdAt: schema.memberships.createdAt,
      roleName: schema.roles.name,
      email: schema.users.email,
      name: schema.users.name,
      accountCreatedAt: schema.users.createdAt,
      lastLoginAt: schema.users.lastLoginAt,
    })
    .from(schema.memberships)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(and(eq(schema.memberships.companyId, ctx.companyId), eq(schema.memberships.employeeId, employeeId)));

  const [team, location, schedules, entitlements, requests] = await Promise.all([
    employee.teamId
      ? tx.select({ name: schema.teams.name }).from(schema.teams).where(eq(schema.teams.id, employee.teamId)).then((r) => r[0]?.name ?? null)
      : null,
    employee.locationId
      ? tx.select({ name: schema.locations.name }).from(schema.locations).where(eq(schema.locations.id, employee.locationId)).then((r) => r[0]?.name ?? null)
      : null,
    tx
      .select({ validFrom: schema.workSchedules.validFrom, weekdays: schema.workSchedules.weekdays })
      .from(schema.workSchedules)
      .where(and(eq(schema.workSchedules.companyId, ctx.companyId), eq(schema.workSchedules.employeeId, employeeId)))
      .orderBy(asc(schema.workSchedules.validFrom)),
    tx
      .select({
        year: schema.leaveEntitlements.year,
        days: schema.leaveEntitlements.days,
        carryoverDays: schema.leaveEntitlements.carryoverDays,
        note: schema.leaveEntitlements.note,
      })
      .from(schema.leaveEntitlements)
      .where(and(eq(schema.leaveEntitlements.companyId, ctx.companyId), eq(schema.leaveEntitlements.employeeId, employeeId)))
      .orderBy(asc(schema.leaveEntitlements.year)),
    tx
      .select({
        id: schema.leaveRequests.id,
        type: schema.absenceTypes.name,
        startDate: schema.leaveRequests.startDate,
        endDate: schema.leaveRequests.endDate,
        status: schema.leaveRequests.status,
        workingDays: schema.leaveRequests.workingDays,
        employeeNote: schema.leaveRequests.employeeNote,
        decisionNote: schema.leaveRequests.decisionNote,
        createdAt: schema.leaveRequests.createdAt,
        decidedAt: schema.leaveRequests.decidedAt,
      })
      .from(schema.leaveRequests)
      .innerJoin(schema.absenceTypes, eq(schema.absenceTypes.id, schema.leaveRequests.absenceTypeId))
      .where(and(eq(schema.leaveRequests.companyId, ctx.companyId), eq(schema.leaveRequests.employeeId, employeeId)))
      .orderBy(asc(schema.leaveRequests.startDate)),
  ]);

  const events = requests.length
    ? await tx
        .select({
          requestId: schema.leaveRequestEvents.requestId,
          type: schema.leaveRequestEvents.type,
          note: schema.leaveRequestEvents.note,
          createdAt: schema.leaveRequestEvents.createdAt,
        })
        .from(schema.leaveRequestEvents)
        .innerJoin(schema.leaveRequests, eq(schema.leaveRequests.id, schema.leaveRequestEvents.requestId))
        .where(and(eq(schema.leaveRequestEvents.companyId, ctx.companyId), eq(schema.leaveRequests.employeeId, employeeId)))
        .orderBy(asc(schema.leaveRequestEvents.createdAt))
    : [];

  const notifications =
    includeNotifications && membership
      ? await tx
          .select({
            title: schema.notifications.title,
            body: schema.notifications.body,
            createdAt: schema.notifications.createdAt,
            readAt: schema.notifications.readAt,
          })
          .from(schema.notifications)
          .where(and(eq(schema.notifications.companyId, ctx.companyId), eq(schema.notifications.userId, membership.userId)))
          .orderBy(desc(schema.notifications.createdAt))
      : undefined;

  return {
    format: "pflegewerk-datenexport/1",
    exportedAt: new Date().toISOString(),
    company: company?.name ?? null,
    employee: {
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
      personnelNumber: employee.personnelNumber,
      jobTitle: employee.jobTitle,
      team,
      location,
      status: employee.status,
      entryDate: employee.entryDate,
      exitDate: employee.exitDate,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
    },
    account: membership
      ? {
          email: membership.email,
          name: membership.name,
          role: membership.roleName,
          accessStatus: membership.status,
          memberSince: membership.createdAt,
          accountCreatedAt: membership.accountCreatedAt,
          lastLoginAt: membership.lastLoginAt,
        }
      : null,
    workSchedules: schedules,
    leaveEntitlements: entitlements,
    leaveRequests: requests.map(({ id, ...r }) => ({ ...r, history: events.filter((e) => e.requestId === id).map(({ requestId: _r, ...e }) => e) })),
    ...(notifications ? { notifications } : {}),
  };
}

/** Export der eigenen Daten im aktuellen Unternehmen. */
export async function exportOwnData(ctx: TenantContext) {
  return withTenant(ctx, async (tx) => {
    const data = await collectEmployeeData(tx, ctx, ctx.employeeId, true);
    await audit(tx, {
      companyId: ctx.companyId,
      actorUserId: ctx.userId,
      action: "privacy.exported",
      entityType: "employee",
      entityId: ctx.employeeId,
      metadata: { self: true },
    });
    return data;
  });
}

/** Export für ein Auskunftsersuchen, das an das Unternehmen gerichtet wurde. */
export async function exportEmployeeData(ctx: TenantContext, employeeId: string) {
  assertId(employeeId, "Mitarbeiter");
  if (employeeId !== ctx.employeeId) requirePermission(ctx, "employees.manage");
  return withTenant(ctx, async (tx) => {
    const data = await collectEmployeeData(tx, ctx, employeeId, employeeId === ctx.employeeId);
    await audit(tx, {
      companyId: ctx.companyId,
      actorUserId: ctx.userId,
      action: "privacy.exported",
      entityType: "employee",
      entityId: employeeId,
    });
    return data;
  });
}

// ---------------------------------------------------------------------------
// Endgültige Löschung
// ---------------------------------------------------------------------------

/**
 * Löscht einen ausgeschiedenen Mitarbeiter mit allen Abwesenheiten, Ansprüchen,
 * Arbeitszeitmodellen, Einladungen und dem Zugang zu diesem Unternehmen.
 * Das Nutzerkonto wird ebenfalls gelöscht, wenn es keinem anderen Unternehmen angehört.
 * Im Audit-Log bleibt nur die pseudonyme ID mit dem Hinweis auf die Löschung.
 */
export async function deleteEmployeePermanently(ctx: TenantContext, employeeId: string) {
  requirePermission(ctx, "employees.manage");
  assertId(employeeId, "Mitarbeiter");
  if (employeeId === ctx.employeeId) throw forbidden("Du kannst dich nicht selbst löschen.");

  const userId = await withTenant(ctx, async (tx) => {
    await lockCompanyAccess(tx, ctx.companyId);
    const [employee] = await tx
      .select({ id: schema.employees.id, status: schema.employees.status })
      .from(schema.employees)
      .where(and(eq(schema.employees.id, employeeId), eq(schema.employees.companyId, ctx.companyId)))
      .for("update");
    if (!employee) throw notFound("Mitarbeiter");
    if (employee.status !== "inactive") {
      throw conflict("Nur ausgeschiedene Mitarbeiter können endgültig gelöscht werden. Markiere die Person zuerst als ausgeschieden.");
    }
    const [membership] = await tx
      .select({
        id: schema.memberships.id,
        userId: schema.memberships.userId,
        isOwner: schema.roles.isOwner,
        permissions: schema.roles.permissions,
      })
      .from(schema.memberships)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
      .where(and(eq(schema.memberships.companyId, ctx.companyId), eq(schema.memberships.employeeId, employeeId)));
    if (membership) {
      assertMayGrantRole(ctx, membership);
      await tx
        .delete(schema.notifications)
        .where(and(eq(schema.notifications.companyId, ctx.companyId), eq(schema.notifications.userId, membership.userId)));
      await tx
        .delete(schema.memberships)
        .where(and(eq(schema.memberships.id, membership.id), eq(schema.memberships.companyId, ctx.companyId)));
    }
    // Kaskadiert: Arbeitszeitmodelle, Ansprüche, Einladungen, Anträge inkl. Tage und Verlauf.
    // Verweise als Führungskraft/Teamleitung werden per Fremdschlüssel auf NULL gesetzt.
    await tx.delete(schema.employees).where(and(eq(schema.employees.id, employeeId), eq(schema.employees.companyId, ctx.companyId)));
    await audit(tx, {
      companyId: ctx.companyId,
      actorUserId: ctx.userId,
      action: "employee.deleted",
      entityType: "employee",
      entityId: employeeId,
      metadata: { hadAccess: Boolean(membership) },
    });
    return membership?.userId ?? null;
  });

  if (userId) await deleteUserIfOrphaned(userId, ctx.userId);
}

/** Löscht ein Nutzerkonto ohne Mitgliedschaften (außer Plattform-Admins). */
async function deleteUserIfOrphaned(userId: string, actorUserId: string) {
  await withSystem(async (tx) => {
    const [remaining] = await tx
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.memberships)
      .where(eq(schema.memberships.userId, userId));
    const [admin] = await tx.select().from(schema.platformAdmins).where(eq(schema.platformAdmins.userId, userId));
    if ((remaining?.n ?? 0) > 0 || admin) return;
    // Sitzungen und Reset-Tokens werden per Fremdschlüssel mitgelöscht.
    await tx.delete(schema.users).where(eq(schema.users.id, userId));
    await audit(tx, { companyId: null, actorUserId, action: "user.deleted", entityType: "user", entityId: userId });
  });
}

// ---------------------------------------------------------------------------
// Aufbewahrungsfristen (vom Cron-Job aufgerufen)
// ---------------------------------------------------------------------------

export type RetentionResult = {
  contactRequests: number;
  emailDeliveries: number;
  notifications: number;
  invitations: number;
};

export async function applyRetention(now = new Date()): Promise<RetentionResult> {
  const e = env();
  const before = (days: number) => new Date(now.getTime() - days * DAY_MS);
  return withSystem(async (tx) => {
    // Anfragen: ab der letzten Bearbeitung gerechnet
    const contacts = await tx
      .delete(schema.contactRequests)
      .where(lt(schema.contactRequests.updatedAt, before(e.CONTACT_RETENTION_DAYS)))
      .returning({ id: schema.contactRequests.id });
    const emails = await tx
      .delete(schema.emailDeliveries)
      .where(lt(schema.emailDeliveries.createdAt, before(e.EMAIL_LOG_RETENTION_DAYS)))
      .returning({ id: schema.emailDeliveries.id });
    const notes = await tx
      .delete(schema.notifications)
      .where(lt(schema.notifications.createdAt, before(e.NOTIFICATION_RETENTION_DAYS)))
      .returning({ id: schema.notifications.id });
    // Erledigte Einladungen (angenommen, widerrufen oder abgelaufen) enthalten nur noch die E-Mail-Adresse
    const cutoff = before(e.INVITATION_RETENTION_DAYS);
    const invites = await tx
      .delete(schema.invitations)
      .where(
        or(
          and(isNotNull(schema.invitations.acceptedAt), lt(schema.invitations.acceptedAt, cutoff)),
          and(isNotNull(schema.invitations.revokedAt), lt(schema.invitations.revokedAt, cutoff)),
          and(isNull(schema.invitations.acceptedAt), lt(schema.invitations.expiresAt, cutoff)),
        ),
      )
      .returning({ id: schema.invitations.id });
    if (contacts.length) {
      await audit(tx, {
        companyId: null,
        actorUserId: null,
        action: "retention.contact_requests_deleted",
        entityType: "contact_request",
        metadata: { count: contacts.length },
      });
    }
    return {
      contactRequests: contacts.length,
      emailDeliveries: emails.length,
      notifications: notes.length,
      invitations: invites.length,
    };
  });
}

