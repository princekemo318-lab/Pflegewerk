/**
 * Plattform-Administration: Unternehmen anlegen, freischalten, sperren und
 * Administratoren zuweisen. Ausschließlich für Plattform-Administratoren.
 * Alle Kennzahlen werden aus echten Daten berechnet.
 */
import "server-only";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, type Tx } from "../db";
import { withSystem, type TxHooks } from "../db/tenant";
import type { PlatformContext } from "../authz";
import { conflict, invalid, isUniqueViolation, notFound, assertId } from "../errors";
import { audit } from "./audit";
import { createInvitationTx } from "./invitations";
import { emailSchema } from "../auth/accounts";
import { DEFAULT_ROLES } from "@/lib/permissions";
import { isStateCode, STATES } from "@/lib/holidays";
import { FIVE_DAY_WEEK, todayIso, yearOf } from "@/lib/dates";

export const DEFAULT_ABSENCE_TYPES = [
  { key: "vacation", name: "Urlaub", color: "teal", deductsLeave: true, requiresApproval: true, employeeCanRequest: true, isSensitive: false },
  { key: "special_leave", name: "Sonderurlaub", color: "violet", deductsLeave: false, requiresApproval: true, employeeCanRequest: true, isSensitive: false },
  { key: "training", name: "Fortbildung", color: "blue", deductsLeave: false, requiresApproval: true, employeeCanRequest: true, isSensitive: false },
  { key: "overtime", name: "Überstundenausgleich", color: "amber", deductsLeave: false, requiresApproval: true, employeeCanRequest: true, isSensitive: false },
  // Gesundheitsbezogen (Art. 9 DSGVO): nur von der Verwaltung erfasst; die Art sehen nur
  // die betroffene Person und die Personalverwaltung, alle anderen nur "Abwesend".
  { key: "sick", name: "Arbeitsunfähigkeit", color: "rose", deductsLeave: false, requiresApproval: false, employeeCanRequest: false, isSensitive: true },
] as const;

const PAGE_SIZE = 25;

export function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export const createCompanySchema = z.object({
  name: z.string().trim().min(2, "Bitte einen Unternehmensnamen angeben.").max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/, "Nur Kleinbuchstaben, Ziffern und Bindestriche.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  defaultState: z.string().refine(isStateCode, "Bitte ein Bundesland wählen."),
  ownerFirstName: z.string().trim().min(1, "Vorname fehlt.").max(80),
  ownerLastName: z.string().trim().min(1, "Nachname fehlt.").max(80),
  ownerEmail: emailSchema,
  contactRequestId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
});

/** Legt Rollen und Abwesenheitsarten für ein neues Unternehmen an. */
export async function seedCompanyDefaults(tx: Tx, companyId: string) {
  const roles = await tx
    .insert(schema.roles)
    .values(
      DEFAULT_ROLES.map((r) => ({
        companyId,
        name: r.name,
        description: r.description,
        permissions: r.permissions,
        isOwner: r.isOwner ?? false,
        isDefault: r.isDefault ?? false,
      })),
    )
    .returning({ id: schema.roles.id, isOwner: schema.roles.isOwner, isDefault: schema.roles.isDefault });
  await tx.insert(schema.absenceTypes).values(
    DEFAULT_ABSENCE_TYPES.map((t, i) => ({ companyId, ...t, sortOrder: i })),
  );
  return {
    ownerRoleId: roles.find((r) => r.isOwner)!.id,
    defaultRoleId: roles.find((r) => r.isDefault)!.id,
  };
}

export async function createCompany(ctx: PlatformContext, raw: unknown) {
  const parsed = createCompanySchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    throw invalid(parsed.error.issues[0].message, fieldErrors);
  }
  const input = parsed.data;
  const slug = input.slug || slugify(input.name) || "unternehmen";

  try {
    return await withSystem(
      async (tx, hooks) => {
        const [company] = await tx
          .insert(schema.companies)
          .values({
            name: input.name,
            slug,
            defaultState: input.defaultState,
            defaultWorkWeek: FIVE_DAY_WEEK,
          })
          .returning();
        const { ownerRoleId } = await seedCompanyDefaults(tx, company.id);
        const [owner] = await tx
          .insert(schema.employees)
          .values({
            companyId: company.id,
            firstName: input.ownerFirstName,
            lastName: input.ownerLastName,
            email: input.ownerEmail,
            jobTitle: "Geschäftsführung",
          })
          .returning({ id: schema.employees.id });
        await tx.insert(schema.leaveEntitlements).values({
          companyId: company.id,
          employeeId: owner.id,
          year: yearOf(todayIso()),
          days: company.defaultAnnualLeaveDays,
        });
        if (input.contactRequestId) {
          await tx
            .update(schema.contactRequests)
            .set({ companyId: company.id, status: "won", updatedAt: new Date() })
            .where(eq(schema.contactRequests.id, input.contactRequestId));
        }
        await audit(tx, {
          companyId: null,
          actorUserId: ctx.userId,
          action: "company.created",
          entityType: "company",
          entityId: company.id,
          metadata: { name: company.name, slug },
        });
        const invitation = await createInvitationTx(tx, hooks, {
          companyId: company.id,
          companyName: company.name,
          email: input.ownerEmail,
          roleId: ownerRoleId,
          employeeId: owner.id,
          invitedByUserId: ctx.userId,
          inviterName: null,
        });
        return { company, invitation };
      },
      { userId: ctx.userId },
    );
  } catch (error) {
    if (isUniqueViolation(error, "companies_slug_key")) {
      throw invalid("Diese Kurzbezeichnung ist bereits vergeben.", { slug: "Bereits vergeben." });
    }
    throw error;
  }
}

export async function setCompanyStatus(
  ctx: PlatformContext,
  companyId: string,
  status: "active" | "suspended",
  reason?: string,
) {
  assertId(companyId, "Unternehmen");
  return withSystem(
    async (tx) => {
      const [company] = await tx
        .update(schema.companies)
        .set({
          status,
          suspendedAt: status === "suspended" ? new Date() : null,
          suspendedReason: status === "suspended" ? reason?.trim().slice(0, 500) || null : null,
          updatedAt: new Date(),
        })
        .where(eq(schema.companies.id, companyId))
        .returning({ id: schema.companies.id });
      if (!company) throw notFound("Unternehmen");
      // Eine Sperre löscht keine Daten – sie verhindert nur den Zugriff.
      await audit(tx, {
        companyId: null,
        actorUserId: ctx.userId,
        action: status === "suspended" ? "company.suspended" : "company.activated",
        entityType: "company",
        entityId: companyId,
        metadata: reason ? { reason: reason.slice(0, 500) } : undefined,
      });
    },
    { userId: ctx.userId },
  );
}

export async function getPlatformStats(_ctx: PlatformContext) {
  return withSystem(async (tx) => {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [companies] = await tx
      .select({
        total: count(),
        active: sql<number>`count(*) filter (where ${schema.companies.status} = 'active')`.mapWith(Number),
      })
      .from(schema.companies);
    const [users] = await tx.select({ total: count() }).from(schema.users);
    const [requests] = await tx
      .select({
        newCount: sql<number>`count(*) filter (where ${schema.contactRequests.status} = 'new')`.mapWith(Number),
        open: sql<number>`count(*) filter (where ${schema.contactRequests.status} in ('new','in_progress','contacted','qualified'))`.mapWith(Number),
        last30: sql<number>`count(*) filter (where ${schema.contactRequests.createdAt} >= ${since.toISOString()})`.mapWith(Number),
      })
      .from(schema.contactRequests);
    const recentCompanies = await tx
      .select({
        id: schema.companies.id,
        name: schema.companies.name,
        status: schema.companies.status,
        createdAt: schema.companies.createdAt,
      })
      .from(schema.companies)
      .orderBy(desc(schema.companies.createdAt))
      .limit(5);
    const [emails] = await tx
      .select({
        notConfigured: sql<number>`count(*) filter (where ${schema.emailDeliveries.status} = 'not_configured')`.mapWith(Number),
        failed: sql<number>`count(*) filter (where ${schema.emailDeliveries.status} = 'failed')`.mapWith(Number),
      })
      .from(schema.emailDeliveries)
      .where(gte(schema.emailDeliveries.createdAt, since));
    return {
      companies: { total: companies?.total ?? 0, active: companies?.active ?? 0 },
      users: users?.total ?? 0,
      contactRequests: { new: requests?.newCount ?? 0, open: requests?.open ?? 0, last30: requests?.last30 ?? 0 },
      recentCompanies,
      emails: { notConfigured: emails?.notConfigured ?? 0, failed: emails?.failed ?? 0 },
    };
  });
}

export async function listCompanies(
  _ctx: PlatformContext,
  opts: { q?: string; status?: "active" | "suspended"; page?: number } = {},
) {
  const page = Math.max(1, opts.page ?? 1);
  return withSystem(async (tx) => {
    const q = opts.q?.trim().slice(0, 100);
    const where = and(
      q
        ? or(
            ilike(schema.companies.name, `%${q.replace(/[%_\\]/g, "")}%`),
            ilike(schema.companies.slug, `%${q.replace(/[%_\\]/g, "")}%`),
          )
        : undefined,
      opts.status ? eq(schema.companies.status, opts.status) : undefined,
    );
    const memberCounts = tx
      .select({
        companyId: schema.memberships.companyId,
        members: count().as("members"),
      })
      .from(schema.memberships)
      .where(eq(schema.memberships.status, "active"))
      .groupBy(schema.memberships.companyId)
      .as("mc");
    const rows = await tx
      .select({
        id: schema.companies.id,
        name: schema.companies.name,
        slug: schema.companies.slug,
        status: schema.companies.status,
        createdAt: schema.companies.createdAt,
        members: sql<number>`coalesce(${memberCounts.members}, 0)`.mapWith(Number),
      })
      .from(schema.companies)
      .leftJoin(memberCounts, eq(memberCounts.companyId, schema.companies.id))
      .where(where)
      .orderBy(asc(schema.companies.name))
      .limit(PAGE_SIZE + 1)
      .offset((page - 1) * PAGE_SIZE);
    return { rows: rows.slice(0, PAGE_SIZE), page, hasMore: rows.length > PAGE_SIZE };
  });
}

export async function getCompanyDetail(_ctx: PlatformContext, companyId: string) {
  assertId(companyId);
  return withSystem(async (tx) => {
    const [company] = await tx.select().from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1);
    if (!company) throw notFound("Unternehmen");
    const members = await tx
      .select({
        membershipId: schema.memberships.id,
        status: schema.memberships.status,
        userName: schema.users.name,
        email: schema.users.email,
        roleId: schema.roles.id,
        roleName: schema.roles.name,
        isOwner: schema.roles.isOwner,
        createdAt: schema.memberships.createdAt,
      })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
      .where(eq(schema.memberships.companyId, companyId))
      .orderBy(desc(schema.roles.isOwner), asc(schema.users.name))
      .limit(500);
    const invitations = await tx
      .select({
        id: schema.invitations.id,
        email: schema.invitations.email,
        expiresAt: schema.invitations.expiresAt,
        roleName: schema.roles.name,
        createdAt: schema.invitations.createdAt,
      })
      .from(schema.invitations)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.invitations.roleId))
      .where(
        and(
          eq(schema.invitations.companyId, companyId),
          isNull(schema.invitations.acceptedAt),
          isNull(schema.invitations.revokedAt),
        ),
      )
      .orderBy(desc(schema.invitations.createdAt));
    const [employees] = await tx
      .select({ total: count() })
      .from(schema.employees)
      .where(and(eq(schema.employees.companyId, companyId), eq(schema.employees.status, "active")));
    const roles = await tx
      .select({ id: schema.roles.id, name: schema.roles.name, isOwner: schema.roles.isOwner })
      .from(schema.roles)
      .where(eq(schema.roles.companyId, companyId))
      .orderBy(asc(schema.roles.name));
    const history = await tx
      .select({
        id: schema.auditLogs.id,
        action: schema.auditLogs.action,
        createdAt: schema.auditLogs.createdAt,
        metadata: schema.auditLogs.metadata,
        actorName: schema.users.name,
      })
      .from(schema.auditLogs)
      .leftJoin(schema.users, eq(schema.users.id, schema.auditLogs.actorUserId))
      .where(
        and(
          isNull(schema.auditLogs.companyId),
          eq(schema.auditLogs.entityType, "company"),
          eq(schema.auditLogs.entityId, companyId),
        ),
      )
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(20);
    return {
      company,
      members,
      invitations,
      roles,
      activeEmployees: employees?.total ?? 0,
      history,
      stateName: isStateCode(company.defaultState) ? STATES[company.defaultState] : company.defaultState,
    };
  });
}

/** Weist einer bestehenden Mitgliedschaft die Inhaberrolle zu. */
export async function assignCompanyAdmin(ctx: PlatformContext, companyId: string, membershipId: string) {
  assertId(companyId);
  assertId(membershipId);
  return withSystem(
    async (tx) => {
      const [owner] = await tx
        .select({ id: schema.roles.id })
        .from(schema.roles)
        .where(and(eq(schema.roles.companyId, companyId), eq(schema.roles.isOwner, true)))
        .limit(1);
      if (!owner) throw notFound("Inhaberrolle");
      const [m] = await tx
        .update(schema.memberships)
        .set({ roleId: owner.id, updatedAt: new Date() })
        .where(and(eq(schema.memberships.id, membershipId), eq(schema.memberships.companyId, companyId)))
        .returning({ id: schema.memberships.id });
      if (!m) throw notFound("Mitglied");
      await audit(tx, {
        companyId: null,
        actorUserId: ctx.userId,
        action: "company.admin_assigned",
        entityType: "company",
        entityId: companyId,
        metadata: { membershipId },
      });
      await audit(tx, {
        companyId,
        actorUserId: ctx.userId,
        action: "membership.role_changed",
        entityType: "membership",
        entityId: membershipId,
        metadata: { roleId: owner.id, by: "platform" },
      });
    },
    { userId: ctx.userId },
  );
}

/** Lädt eine weitere Person als Administrator (Inhaberrolle) ein. */
export async function inviteCompanyAdmin(
  ctx: PlatformContext,
  companyId: string,
  raw: { firstName: unknown; lastName: unknown; email: unknown },
) {
  assertId(companyId, "Unternehmen");
  const parsed = z
    .object({
      firstName: z.string().trim().min(1, "Vorname fehlt.").max(80),
      lastName: z.string().trim().min(1, "Nachname fehlt.").max(80),
      email: emailSchema,
    })
    .safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error.issues[0].message);
  return withSystem(
    async (tx, hooks: TxHooks) => {
      const [company] = await tx.select().from(schema.companies).where(eq(schema.companies.id, companyId)).limit(1);
      if (!company) throw notFound("Unternehmen");
      const [owner] = await tx
        .select({ id: schema.roles.id })
        .from(schema.roles)
        .where(and(eq(schema.roles.companyId, companyId), eq(schema.roles.isOwner, true)))
        .limit(1);
      const [existingMember] = await tx
        .select({ id: schema.memberships.id })
        .from(schema.memberships)
        .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
        .where(and(eq(schema.memberships.companyId, companyId), eq(schema.users.email, parsed.data.email)))
        .limit(1);
      if (existingMember) throw conflict("Diese Person ist bereits Mitglied. Weise ihr stattdessen die Rolle zu.");
      const [employee] = await tx
        .insert(schema.employees)
        .values({
          companyId,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          email: parsed.data.email,
        })
        .returning({ id: schema.employees.id });
      const invitation = await createInvitationTx(tx, hooks, {
        companyId,
        companyName: company.name,
        email: parsed.data.email,
        roleId: owner.id,
        employeeId: employee.id,
        invitedByUserId: ctx.userId,
        inviterName: null,
      });
      await audit(tx, {
        companyId: null,
        actorUserId: ctx.userId,
        action: "company.admin_invited",
        entityType: "company",
        entityId: companyId,
      });
      return invitation;
    },
    { userId: ctx.userId },
  );
}

/** Prüft, ob die Datenbankrolle der Anwendung Row-Level Security umgehen könnte. */
export async function getDatabaseSecurityStatus(_ctx: PlatformContext) {
  const [row] = await withSystem((tx) =>
    tx.execute<{ rolsuper: boolean; rolbypassrls: boolean }>(
      sql`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
    ),
  );
  return { rlsEnforced: Boolean(row) && !row.rolsuper && !row.rolbypassrls };
}

export async function listUnlinkedContactRequests(_ctx: PlatformContext) {
  return withSystem((tx) =>
    tx
      .select({ id: schema.contactRequests.id, companyName: schema.contactRequests.companyName, name: schema.contactRequests.name })
      .from(schema.contactRequests)
      .where(
        and(
          isNull(schema.contactRequests.companyId),
          inArray(schema.contactRequests.status, ["new", "in_progress", "contacted", "qualified"]),
        ),
      )
      .orderBy(desc(schema.contactRequests.createdAt))
      .limit(100),
  );
}
