/**
 * Zuständigkeiten innerhalb eines Unternehmens: Wer ist für wen verantwortlich,
 * wer darf welche Anträge entscheiden und wer wird benachrichtigt.
 */
import "server-only";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { schema, type Tx } from "../db";
import { can, type TenantContext } from "../authz";
import { isPermission, type Permission } from "@/lib/permissions";

/** Mitarbeiter, für die `ctx` als Führungskraft oder Teamleitung zuständig ist. */
export async function managedEmployeeIds(tx: Tx, ctx: TenantContext): Promise<Set<string>> {
  const ledTeams = tx
    .select({ id: schema.teams.id })
    .from(schema.teams)
    .where(
      and(
        eq(schema.teams.companyId, ctx.companyId),
        eq(schema.teams.leadEmployeeId, ctx.employeeId),
        isNull(schema.teams.archivedAt),
      ),
    );
  const rows = await tx
    .select({ id: schema.employees.id })
    .from(schema.employees)
    .where(
      and(
        eq(schema.employees.companyId, ctx.companyId),
        or(eq(schema.employees.managerId, ctx.employeeId), inArray(schema.employees.teamId, ledTeams)),
      ),
    );
  const ids = new Set(rows.map((r) => r.id));
  ids.delete(ctx.employeeId);
  return ids;
}

/** Darf `ctx` Anträge dieses Mitarbeiters entscheiden? Eigene Anträge nie. */
export async function canDecideFor(tx: Tx, ctx: TenantContext, employeeId: string): Promise<boolean> {
  if (employeeId === ctx.employeeId) return false;
  if (can(ctx, "leave.approve_all")) return true;
  if (!can(ctx, "leave.approve_team")) return false;
  return (await managedEmployeeIds(tx, ctx)).has(employeeId);
}

/**
 * Sensible Abwesenheitsarten (z. B. Arbeitsunfähigkeit) sehen außer der betroffenen Person
 * nur Personen mit leave.view_all oder leave.manage – nicht Teamleitungen.
 */
export function canSeeSensitive(ctx: TenantContext): boolean {
  return can(ctx, "leave.view_all") || can(ctx, "leave.manage");
}

/** Darf `ctx` Details (Art, Status, Saldo) zu diesem Mitarbeiter sehen? */
export async function canViewEmployeeLeave(tx: Tx, ctx: TenantContext, employeeId: string): Promise<boolean> {
  if (employeeId === ctx.employeeId) return true;
  if (can(ctx, "leave.view_all") || can(ctx, "employees.view") || can(ctx, "leave.approve_all")) return true;
  if (can(ctx, "leave.approve_team")) return (await managedEmployeeIds(tx, ctx)).has(employeeId);
  return false;
}

type MemberWithRole = { userId: string; employeeId: string; permissions: string[]; isOwner: boolean };

function hasPerm(m: MemberWithRole, ...perms: Permission[]) {
  return m.isOwner || perms.some((p) => m.permissions.filter(isPermission).includes(p));
}

async function activeMembers(tx: Tx, companyId: string, employeeIds?: string[]): Promise<MemberWithRole[]> {
  return tx
    .select({
      userId: schema.memberships.userId,
      employeeId: schema.memberships.employeeId,
      permissions: schema.roles.permissions,
      isOwner: schema.roles.isOwner,
    })
    .from(schema.memberships)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
    .where(
      and(
        eq(schema.memberships.companyId, companyId),
        eq(schema.memberships.status, "active"),
        employeeIds ? inArray(schema.memberships.employeeId, employeeIds) : undefined,
      ),
    );
}

/**
 * Zuständige Entscheider für einen Mitarbeiter (für Benachrichtigungen):
 * 1. direkte Führungskraft, 2. Teamleitung, 3. sonst alle mit `leave.approve_all`.
 */
export async function responsibleApproverUserIds(tx: Tx, companyId: string, employeeId: string): Promise<string[]> {
  const [employee] = await tx
    .select({ managerId: schema.employees.managerId, teamLeadId: schema.teams.leadEmployeeId })
    .from(schema.employees)
    .leftJoin(schema.teams, eq(schema.teams.id, schema.employees.teamId))
    .where(and(eq(schema.employees.id, employeeId), eq(schema.employees.companyId, companyId)))
    .limit(1);
  if (!employee) return [];

  const direct = [employee.managerId, employee.teamLeadId].filter(
    (id): id is string => Boolean(id) && id !== employeeId,
  );
  if (direct.length > 0) {
    const members = await activeMembers(tx, companyId, direct);
    const eligible = members.filter((m) => hasPerm(m, "leave.approve_team", "leave.approve_all"));
    if (eligible.length > 0) return eligible.map((m) => m.userId);
  }
  const all = await activeMembers(tx, companyId);
  return all.filter((m) => m.employeeId !== employeeId && hasPerm(m, "leave.approve_all")).map((m) => m.userId);
}

export async function userIdForEmployee(tx: Tx, companyId: string, employeeId: string): Promise<string | null> {
  const [m] = await tx
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.companyId, companyId),
        eq(schema.memberships.employeeId, employeeId),
        eq(schema.memberships.status, "active"),
      ),
    )
    .limit(1);
  return m?.userId ?? null;
}
