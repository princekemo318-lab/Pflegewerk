/**
 * Rollen und Rollenzuweisung mit Schutz vor Rechteausweitung:
 * - Niemand kann sich selbst eine andere Rolle geben.
 * - Rollen dürfen nur Rechte enthalten bzw. zugewiesen werden, die man selbst besitzt.
 * - Die Inhaberrolle kann nur von Inhabern vergeben werden.
 * - Es bleibt immer mindestens ein aktiver Inhaber bestehen.
 */
import "server-only";
import { and, asc, count, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, type Tx } from "../db";
import { withTenant } from "../db/tenant";
import { requirePermission, type TenantContext } from "../authz";
import { conflict, forbidden, invalid, isUniqueViolation, notFound, assertId } from "../errors";
import { audit } from "./audit";
import { isPermission, type Permission } from "@/lib/permissions";

type RoleRow = typeof schema.roles.$inferSelect;

export async function getRole(tx: Tx, companyId: string, roleId: string): Promise<RoleRow> {
  const [role] = await tx
    .select()
    .from(schema.roles)
    .where(and(eq(schema.roles.id, roleId), eq(schema.roles.companyId, companyId)))
    .limit(1);
  if (!role) throw notFound("Rolle");
  return role;
}

/** Prüft, ob `ctx` die Rolle vergeben darf (ohne Rechteausweitung). */
export function assertMayGrantRole(ctx: TenantContext, role: Pick<RoleRow, "isOwner" | "permissions">) {
  if (ctx.isOwner) return;
  if (role.isOwner) throw forbidden("Nur Inhaber können die Inhaberrolle vergeben.");
  const missing = role.permissions.filter((p) => isPermission(p) && !ctx.permissions.has(p));
  if (missing.length > 0) {
    throw forbidden("Du kannst keine Rolle vergeben, die mehr Rechte hat als deine eigene.");
  }
}

/**
 * Serialisiert Änderungen an Rollen und Zugängen eines Unternehmens (transaktionsweit),
 * damit z. B. zwei Inhaber sich nicht gleichzeitig gegenseitig herabstufen können.
 */
export async function lockCompanyAccess(tx: Tx, companyId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"access:" + companyId}, 0))`);
}

export async function countActiveOwners(tx: Tx, companyId: string, excludeMembershipId?: string) {
  const [row] = await tx
    .select({ n: count() })
    .from(schema.memberships)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
    .where(
      and(
        eq(schema.memberships.companyId, companyId),
        eq(schema.memberships.status, "active"),
        eq(schema.roles.isOwner, true),
        excludeMembershipId ? ne(schema.memberships.id, excludeMembershipId) : undefined,
      ),
    );
  return row?.n ?? 0;
}

export async function listRoles(ctx: TenantContext) {
  requirePermission(ctx, "roles.manage");
  return withTenant(ctx, async (tx) => {
    const members = tx
      .select({ roleId: schema.memberships.roleId, n: count().as("n") })
      .from(schema.memberships)
      .where(eq(schema.memberships.companyId, ctx.companyId))
      .groupBy(schema.memberships.roleId)
      .as("members");
    const rows = await tx
      .select({
        id: schema.roles.id,
        name: schema.roles.name,
        description: schema.roles.description,
        permissions: schema.roles.permissions,
        isOwner: schema.roles.isOwner,
        isDefault: schema.roles.isDefault,
        memberCount: members.n,
      })
      .from(schema.roles)
      .leftJoin(members, eq(members.roleId, schema.roles.id))
      .where(eq(schema.roles.companyId, ctx.companyId))
      .orderBy(asc(schema.roles.name));
    return rows.map((r) => ({ ...r, memberCount: Number(r.memberCount ?? 0) }));
  });
}

const roleSchema = z.object({
  name: z.string().trim().min(2, "Bitte einen Namen angeben.").max(60, "Höchstens 60 Zeichen."),
  description: z.string().trim().max(200).optional(),
  permissions: z.array(z.string()).transform((list) => [...new Set(list.filter(isPermission))] as Permission[]),
});

export async function createRole(ctx: TenantContext, raw: unknown) {
  requirePermission(ctx, "roles.manage");
  const input = roleSchema.safeParse(raw);
  if (!input.success) throw invalid(input.error.issues[0].message, { name: input.error.issues[0].message });
  assertMayGrantRole(ctx, { isOwner: false, permissions: input.data.permissions });
  try {
    return await withTenant(ctx, async (tx) => {
      const [role] = await tx
        .insert(schema.roles)
        .values({
          companyId: ctx.companyId,
          name: input.data.name,
          description: input.data.description || null,
          permissions: input.data.permissions,
        })
        .returning();
      await audit(tx, {
        companyId: ctx.companyId,
        actorUserId: ctx.userId,
        action: "role.created",
        entityType: "role",
        entityId: role.id,
        metadata: { name: role.name, permissions: role.permissions },
      });
      return role;
    });
  } catch (error) {
    if (isUniqueViolation(error, "roles_company_name_key")) throw invalid("Eine Rolle mit diesem Namen existiert bereits.");
    throw error;
  }
}

export async function updateRole(ctx: TenantContext, roleId: string, raw: unknown) {
  assertId(roleId);
  requirePermission(ctx, "roles.manage");
  const input = roleSchema.safeParse(raw);
  if (!input.success) throw invalid(input.error.issues[0].message, { name: input.error.issues[0].message });
  try {
    return await withTenant(ctx, async (tx) => {
      const role = await getRole(tx, ctx.companyId, roleId);
      if (role.isOwner) {
        // Inhaberrolle: nur Name/Beschreibung änderbar; Rechte sind immer vollständig.
        if (!ctx.isOwner) throw forbidden("Nur Inhaber können die Inhaberrolle bearbeiten.");
      } else {
        assertMayGrantRole(ctx, { isOwner: false, permissions: input.data.permissions });
        // Eine Rolle, die man nicht vollständig besitzt, darf man auch nicht verändern.
        assertMayGrantRole(ctx, role);
        if (role.id === ctx.roleId && !ctx.isOwner) {
          throw forbidden("Die eigene Rolle kann nicht bearbeitet werden.");
        }
      }
      const [updated] = await tx
        .update(schema.roles)
        .set({
          name: input.data.name,
          description: input.data.description || null,
          permissions: role.isOwner ? role.permissions : input.data.permissions,
        })
        .where(and(eq(schema.roles.id, roleId), eq(schema.roles.companyId, ctx.companyId)))
        .returning();
      await audit(tx, {
        companyId: ctx.companyId,
        actorUserId: ctx.userId,
        action: "role.updated",
        entityType: "role",
        entityId: roleId,
        metadata: { before: role.permissions, after: updated.permissions },
      });
      return updated;
    });
  } catch (error) {
    if (isUniqueViolation(error, "roles_company_name_key")) throw invalid("Eine Rolle mit diesem Namen existiert bereits.");
    throw error;
  }
}

export async function deleteRole(ctx: TenantContext, roleId: string) {
  assertId(roleId);
  requirePermission(ctx, "roles.manage");
  return withTenant(ctx, async (tx) => {
    const role = await getRole(tx, ctx.companyId, roleId);
    if (role.isOwner) throw conflict("Die Inhaberrolle kann nicht gelöscht werden.");
    if (role.isDefault) throw conflict("Die Standardrolle für neue Mitarbeiter kann nicht gelöscht werden.");
    assertMayGrantRole(ctx, role);
    const [used] = await tx
      .select({ n: count() })
      .from(schema.memberships)
      .where(and(eq(schema.memberships.companyId, ctx.companyId), eq(schema.memberships.roleId, roleId)));
    if ((used?.n ?? 0) > 0) throw conflict("Die Rolle ist noch Mitarbeitern zugewiesen.");
    await tx.delete(schema.roles).where(and(eq(schema.roles.id, roleId), eq(schema.roles.companyId, ctx.companyId)));
    await audit(tx, {
      companyId: ctx.companyId,
      actorUserId: ctx.userId,
      action: "role.deleted",
      entityType: "role",
      entityId: roleId,
      metadata: { name: role.name },
    });
  });
}

/** Ändert die Rolle eines Mitarbeiters mit Zugang. */
export async function changeMemberRole(ctx: TenantContext, employeeId: string, roleId: string) {
  assertId(employeeId);
  assertId(roleId);
  requirePermission(ctx, "roles.manage");
  if (employeeId === ctx.employeeId) throw forbidden("Du kannst deine eigene Rolle nicht ändern.");
  const affectedUserId = await withTenant(ctx, async (tx) => {
    await lockCompanyAccess(tx, ctx.companyId);
    const [membership] = await tx
      .select({
        id: schema.memberships.id,
        userId: schema.memberships.userId,
        roleId: schema.memberships.roleId,
        currentIsOwner: schema.roles.isOwner,
        currentPermissions: schema.roles.permissions,
      })
      .from(schema.memberships)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
      .where(and(eq(schema.memberships.companyId, ctx.companyId), eq(schema.memberships.employeeId, employeeId)))
      .for("update", { of: schema.memberships })
      .limit(1);
    if (!membership) throw notFound("Zugang");
    const target = await getRole(tx, ctx.companyId, roleId);
    // Wer jemanden mit mehr Rechten herabstuft, würde ebenfalls Rechte über sich hinaus ausüben.
    assertMayGrantRole(ctx, { isOwner: membership.currentIsOwner, permissions: membership.currentPermissions });
    assertMayGrantRole(ctx, target);
    if (membership.currentIsOwner && !target.isOwner && (await countActiveOwners(tx, ctx.companyId, membership.id)) === 0) {
      throw conflict("Es muss mindestens eine Person mit Inhaberrolle geben.");
    }
    await tx
      .update(schema.memberships)
      .set({ roleId, updatedAt: new Date() })
      .where(and(eq(schema.memberships.id, membership.id), eq(schema.memberships.companyId, ctx.companyId)));
    await audit(tx, {
      companyId: ctx.companyId,
      actorUserId: ctx.userId,
      action: "membership.role_changed",
      entityType: "membership",
      entityId: membership.id,
      metadata: { employeeId, fromRoleId: membership.roleId, toRoleId: roleId },
    });
    return membership.userId;
  });
  return affectedUserId;
}

/** Aktiviert oder deaktiviert den Zugang eines Mitarbeiters. Daten bleiben erhalten. */
export async function setMembershipStatus(ctx: TenantContext, employeeId: string, status: "active" | "deactivated") {
  assertId(employeeId);
  requirePermission(ctx, "employees.manage");
  if (employeeId === ctx.employeeId) throw forbidden("Du kannst deinen eigenen Zugang nicht deaktivieren.");
  const userId = await withTenant(ctx, async (tx) => {
    await lockCompanyAccess(tx, ctx.companyId);
    const [membership] = await tx
      .select({
        id: schema.memberships.id,
        userId: schema.memberships.userId,
        isOwner: schema.roles.isOwner,
        permissions: schema.roles.permissions,
      })
      .from(schema.memberships)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
      .where(and(eq(schema.memberships.companyId, ctx.companyId), eq(schema.memberships.employeeId, employeeId)))
      .limit(1);
    if (!membership) throw notFound("Zugang");
    // Höher berechtigte Personen dürfen nicht durch weniger berechtigte gesperrt werden.
    assertMayGrantRole(ctx, membership);
    if (status === "deactivated" && membership.isOwner && (await countActiveOwners(tx, ctx.companyId, membership.id)) === 0) {
      throw conflict("Der letzte Inhaber kann nicht deaktiviert werden.");
    }
    await tx
      .update(schema.memberships)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(schema.memberships.id, membership.id), eq(schema.memberships.companyId, ctx.companyId)));
    await audit(tx, {
      companyId: ctx.companyId,
      actorUserId: ctx.userId,
      action: status === "active" ? "membership.reactivated" : "membership.deactivated",
      entityType: "membership",
      entityId: membership.id,
      metadata: { employeeId },
    });
    return membership.userId;
  });
  return userId;
}

