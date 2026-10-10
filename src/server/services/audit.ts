/**
 * Audit-Protokoll. Einträge sind in der Datenbank nur anhängbar (Trigger +
 * entzogene UPDATE/DELETE-Rechte). Metadaten enthalten nur notwendige,
 * nicht-sensible Angaben (z. B. Namen geänderter Felder, keine Inhalte).
 */
import "server-only";
import { and, count, desc, eq, isNull, like } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { schema, type Tx } from "../db";
import { withSystem, withTenant } from "../db/tenant";
import { requirePermission, type PlatformContext, type TenantContext } from "../authz";

export type AuditEntry = {
  companyId: string | null;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function audit(tx: Tx, entry: AuditEntry) {
  await tx.insert(schema.auditLogs).values({
    companyId: entry.companyId,
    actorUserId: entry.actorUserId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    metadata: entry.metadata ?? null,
  });
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "company.created": "Unternehmen angelegt",
  "company.suspended": "Unternehmen gesperrt",
  "company.activated": "Unternehmen freigeschaltet",
  "company.settings_updated": "Unternehmenseinstellungen geändert",
  "company.admin_invited": "Administrator eingeladen",
  "company.admin_assigned": "Administrator zugewiesen",
  "employee.created": "Mitarbeiter angelegt",
  "employee.updated": "Mitarbeiterdaten geändert",
  "employee.status_changed": "Beschäftigungsstatus geändert",
  "employee.schedule_set": "Arbeitszeitmodell geändert",
  "employee.entitlement_set": "Urlaubsanspruch geändert",
  "membership.role_changed": "Rolle geändert",
  "membership.deactivated": "Zugang deaktiviert",
  "membership.reactivated": "Zugang reaktiviert",
  "invitation.created": "Einladung versendet",
  "invitation.revoked": "Einladung widerrufen",
  "invitation.accepted": "Einladung angenommen",
  "role.created": "Rolle erstellt",
  "role.updated": "Rolle geändert",
  "role.deleted": "Rolle gelöscht",
  "leave.submitted": "Antrag eingereicht",
  "leave.recorded": "Abwesenheit erfasst",
  "leave.approved": "Antrag genehmigt",
  "leave.rejected": "Antrag abgelehnt",
  "leave.withdrawn": "Antrag zurückgezogen",
  "leave.cancelled": "Genehmigung storniert",
  "team.created": "Team erstellt",
  "team.updated": "Team geändert",
  "team.archived": "Team archiviert",
  "location.created": "Standort erstellt",
  "location.updated": "Standort geändert",
  "location.archived": "Standort archiviert",
  "holiday.created": "Betrieblicher Feiertag angelegt",
  "holiday.deleted": "Betrieblicher Feiertag entfernt",
  "absence_type.created": "Abwesenheitsart erstellt",
  "absence_type.updated": "Abwesenheitsart geändert",
  "contact.status_changed": "Anfragestatus geändert",
  "contact.assigned": "Anfrage zugewiesen",
  "contact.deleted": "Anfrage gelöscht",
  "user.password_reset": "Passwort zurückgesetzt",
  "user.password_changed": "Passwort geändert",
  "platform.admin_created": "Plattform-Administrator angelegt",
  "employee.deleted": "Mitarbeiter endgültig gelöscht",
  "user.deleted": "Nutzerkonto gelöscht",
  "privacy.exported": "Datenauskunft exportiert",
  "retention.contact_requests_deleted": "Anfragen nach Ablauf der Frist gelöscht",
};

const PAGE_SIZE = 50;

export async function listCompanyAuditLogs(ctx: TenantContext, opts: { page?: number; action?: string } = {}) {
  requirePermission(ctx, "audit.view");
  const page = Math.max(1, opts.page ?? 1);
  return withTenant(ctx, async (tx) => {
    const where = and(
      eq(schema.auditLogs.companyId, ctx.companyId),
      opts.action ? like(schema.auditLogs.action, `${opts.action.replace(/[%_]/g, "")}%`) : undefined,
    );
    const actor = alias(schema.users, "actor");
    const rows = await tx
      .select({
        id: schema.auditLogs.id,
        action: schema.auditLogs.action,
        entityType: schema.auditLogs.entityType,
        entityId: schema.auditLogs.entityId,
        metadata: schema.auditLogs.metadata,
        createdAt: schema.auditLogs.createdAt,
        actorName: actor.name,
      })
      .from(schema.auditLogs)
      .leftJoin(actor, eq(actor.id, schema.auditLogs.actorUserId))
      .where(where)
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(PAGE_SIZE + 1)
      .offset((page - 1) * PAGE_SIZE);
    return { rows: rows.slice(0, PAGE_SIZE), page, hasMore: rows.length > PAGE_SIZE };
  });
}

export async function listPlatformAuditLogs(_ctx: PlatformContext, opts: { page?: number; platformOnly?: boolean } = {}) {
  const page = Math.max(1, opts.page ?? 1);
  return withSystem(async (tx) => {
    const actor = alias(schema.users, "actor");
    const rows = await tx
      .select({
        id: schema.auditLogs.id,
        companyId: schema.auditLogs.companyId,
        companyName: schema.companies.name,
        action: schema.auditLogs.action,
        entityType: schema.auditLogs.entityType,
        entityId: schema.auditLogs.entityId,
        metadata: schema.auditLogs.metadata,
        createdAt: schema.auditLogs.createdAt,
        actorName: actor.name,
      })
      .from(schema.auditLogs)
      .leftJoin(actor, eq(actor.id, schema.auditLogs.actorUserId))
      .leftJoin(schema.companies, eq(schema.companies.id, schema.auditLogs.companyId))
      .where(opts.platformOnly ? isNull(schema.auditLogs.companyId) : undefined)
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(PAGE_SIZE + 1)
      .offset((page - 1) * PAGE_SIZE);
    return { rows: rows.slice(0, PAGE_SIZE), page, hasMore: rows.length > PAGE_SIZE };
  });
}

export async function countAuditLogs(tx: Tx, companyId: string) {
  const [row] = await tx
    .select({ n: count() })
    .from(schema.auditLogs)
    .where(eq(schema.auditLogs.companyId, companyId));
  return row?.n ?? 0;
}
