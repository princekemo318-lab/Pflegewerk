/**
 * Autorisierung: Aufbau des Mandantenkontexts und Berechtigungsprüfungen.
 *
 * Der Kontext wird bei jeder Anfrage serverseitig aus Sitzung + Mitgliedschaft
 * ermittelt. IDs aus dem Frontend werden nie als Beleg für Zugehörigkeit verwendet.
 */
import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { schema } from "./db";
import { withSystem } from "./db/tenant";
import { forbidden } from "./errors";
import { ALL_PERMISSIONS, isPermission, type Permission } from "@/lib/permissions";

export type TenantContext = {
  userId: string;
  companyId: string;
  companyName: string;
  membershipId: string;
  employeeId: string;
  roleId: string;
  roleName: string;
  isOwner: boolean;
  permissions: ReadonlySet<Permission>;
};

export type MembershipSummary = {
  companyId: string;
  companyName: string;
  companyStatus: "active" | "suspended";
  membershipStatus: "active" | "deactivated";
};

export async function listMemberships(userId: string): Promise<MembershipSummary[]> {
  return withSystem((tx) =>
    tx
      .select({
        companyId: schema.companies.id,
        companyName: schema.companies.name,
        companyStatus: schema.companies.status,
        membershipStatus: schema.memberships.status,
      })
      .from(schema.memberships)
      .innerJoin(schema.companies, eq(schema.companies.id, schema.memberships.companyId))
      .where(eq(schema.memberships.userId, userId))
      .orderBy(asc(schema.companies.name)),
  );
}

/**
 * Liefert den Kontext nur, wenn Mitgliedschaft UND Unternehmen aktiv sind.
 * Gesperrte Unternehmen behalten ihre Daten, sind aber nicht zugänglich.
 */
export async function resolveTenantContext(
  userId: string,
  companyId: string,
): Promise<TenantContext | null> {
  const [row] = await withSystem((tx) =>
    tx
      .select({
        membershipId: schema.memberships.id,
        employeeId: schema.memberships.employeeId,
        membershipStatus: schema.memberships.status,
        roleId: schema.roles.id,
        roleName: schema.roles.name,
        permissions: schema.roles.permissions,
        isOwner: schema.roles.isOwner,
        companyName: schema.companies.name,
        companyStatus: schema.companies.status,
      })
      .from(schema.memberships)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
      .innerJoin(schema.companies, eq(schema.companies.id, schema.memberships.companyId))
      .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.companyId, companyId)))
      .limit(1),
  );
  if (!row || row.membershipStatus !== "active" || row.companyStatus !== "active") return null;

  const permissions = new Set<Permission>(
    row.isOwner ? ALL_PERMISSIONS : row.permissions.filter(isPermission),
  );
  return {
    userId,
    companyId,
    companyName: row.companyName,
    membershipId: row.membershipId,
    employeeId: row.employeeId,
    roleId: row.roleId,
    roleName: row.roleName,
    isOwner: row.isOwner,
    permissions,
  };
}

export function can(ctx: TenantContext, permission: Permission): boolean {
  return ctx.permissions.has(permission);
}

export function canAny(ctx: TenantContext, ...permissions: Permission[]): boolean {
  return permissions.some((p) => ctx.permissions.has(p));
}

export function requirePermission(ctx: TenantContext, permission: Permission) {
  if (!can(ctx, permission)) throw forbidden();
}

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const [row] = await withSystem((tx) =>
    tx
      .select({ userId: schema.platformAdmins.userId })
      .from(schema.platformAdmins)
      .where(eq(schema.platformAdmins.userId, userId))
      .limit(1),
  );
  return Boolean(row);
}

export type PlatformContext = { userId: string };

export async function resolvePlatformContext(userId: string): Promise<PlatformContext | null> {
  return (await isPlatformAdmin(userId)) ? { userId } : null;
}
