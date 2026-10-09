/**
 * Test-Fabriken: legen über die echten Services vollständige Unternehmen,
 * Mitarbeiter und Zugänge an.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { schema } from "@/server/db";
import { withSystem } from "@/server/db/tenant";
import { resolveTenantContext, type TenantContext } from "@/server/authz";
import { createCompany } from "@/server/services/platform";
import { acceptInvitation } from "@/server/services/invitations";
import { createEmployee } from "@/server/services/employees";
import { hashPassword } from "@/server/auth/crypto";
import { FIVE_DAY_WEEK } from "@/lib/dates";

export const PASSWORD = "sicheres-passwort-123";

export function uniq(prefix = "t") {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

export function tokenFromUrl(url: string) {
  return url.split("/").pop()!;
}

export async function createPlatformAdmin() {
  const email = `${uniq("admin")}@example.test`;
  const passwordHash = await hashPassword(PASSWORD);
  const [user] = await withSystem(async (tx) => {
    const rows = await tx.insert(schema.users).values({ email, name: "Plattform Admin", passwordHash }).returning();
    await tx.insert(schema.platformAdmins).values({ userId: rows[0].id });
    return rows;
  });
  return { userId: user.id, email };
}

export async function ctxFor(userId: string, companyId: string): Promise<TenantContext> {
  const ctx = await resolveTenantContext(userId, companyId);
  if (!ctx) throw new Error("Kein Kontext");
  return ctx;
}

export async function roleId(companyId: string, name: string) {
  const [role] = await withSystem((tx) =>
    tx.select().from(schema.roles).where(eq(schema.roles.companyId, companyId)),
  ).then((rows) => rows.filter((r) => r.name === name));
  if (!role) throw new Error(`Rolle ${name} fehlt`);
  return role.id;
}

export async function setupCompany(opts: { name?: string; state?: string } = {}) {
  const admin = await createPlatformAdmin();
  const ownerEmail = `${uniq("owner")}@example.test`;
  const { company, invitation } = await createCompany(
    { userId: admin.userId },
    {
      name: opts.name ?? uniq("Pflegedienst"),
      defaultState: opts.state ?? "NW",
      ownerFirstName: "Olga",
      ownerLastName: "Owner",
      ownerEmail,
    },
  );
  const accepted = await acceptInvitation({
    token: tokenFromUrl(invitation.url),
    currentUserId: null,
    name: "Olga Owner",
    password: PASSWORD,
  });
  const [user] = await withSystem((tx) => tx.select().from(schema.users).where(eq(schema.users.email, ownerEmail)));
  const owner = await ctxFor(user.id, company.id);
  return { company, owner, ownerEmail, platformAdmin: admin, session: accepted.session };
}

export async function addMember(
  owner: TenantContext,
  opts: {
    firstName?: string;
    lastName?: string;
    role?: string;
    teamId?: string;
    managerId?: string;
    locationId?: string;
    weekdays?: number;
    annualLeaveDays?: number;
  } = {},
) {
  const email = `${uniq("m")}@example.test`;
  const { employee, invitation } = await createEmployee(owner, {
    firstName: opts.firstName ?? "Mia",
    lastName: opts.lastName ?? uniq("Muster"),
    email,
    teamId: opts.teamId ?? "",
    managerId: opts.managerId ?? "",
    locationId: opts.locationId ?? "",
    weekdays: opts.weekdays ?? FIVE_DAY_WEEK,
    annualLeaveDays: opts.annualLeaveDays ?? 30,
    invite: true,
    roleId: await roleId(owner.companyId, opts.role ?? "Mitarbeiter"),
  });
  await acceptInvitation({
    token: tokenFromUrl(invitation!.url),
    currentUserId: null,
    name: `${opts.firstName ?? "Mia"} Test`,
    password: PASSWORD,
  });
  const [user] = await withSystem((tx) => tx.select().from(schema.users).where(eq(schema.users.email, email)));
  return { employee, email, userId: user.id, ctx: await ctxFor(user.id, owner.companyId) };
}

export async function absenceTypeId(companyId: string, key: string) {
  const rows = await withSystem((tx) => tx.select().from(schema.absenceTypes).where(eq(schema.absenceTypes.companyId, companyId)));
  const type = rows.find((r) => r.key === key);
  if (!type) throw new Error(`Typ ${key} fehlt`);
  return type.id;
}
