import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/server/auth/current";
import { getDatabaseSecurityStatus, getPlatformStats } from "@/server/services/platform";
import { isEmailConfigured } from "@/server/email";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, Notice, PageHeader, Stat } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Plattform-Admin" };

export default async function AdminHome() {
  const { ctx } = await requirePlatformAdmin();
  const [stats, security] = await Promise.all([getPlatformStats(ctx), getDatabaseSecurityStatus(ctx)]);
  const emailReady = isEmailConfigured();

  return (
    <>
      <PageHeader title="Plattform-Übersicht" actions={<ButtonLink href="/admin/unternehmen/neu">Unternehmen anlegen</ButtonLink>} />
      {!security.rlsEnforced && (
        <Notice tone="danger" className="mb-6" title="Row-Level Security wird umgangen">
          Die Anwendung verbindet sich mit einer Datenbankrolle mit SUPERUSER- oder BYPASSRLS-Recht. Die datenbankseitige
          Mandantentrennung ist dadurch wirkungslos. Bitte DATABASE_URL auf die eingeschränkte Anwendungsrolle umstellen.
        </Notice>
      )}
      {!emailReady && (
        <Notice tone="warn" className="mb-6" title="E-Mail-Versand ist nicht eingerichtet">
          Einladungen und Benachrichtigungen werden nicht per E-Mail zugestellt. Einladungslinks werden nach dem Anlegen einmalig angezeigt.
          {stats.emails.notConfigured > 0 && ` In den letzten 30 Tagen betraf das ${stats.emails.notConfigured} Nachrichten.`}
        </Notice>
      )}
      {stats.emails.failed > 0 && (
        <Notice tone="danger" className="mb-6" title={`${stats.emails.failed} E-Mails konnten in den letzten 30 Tagen nicht zugestellt werden`}>
          Bitte SMTP-Konfiguration und Server-Logs prüfen.
        </Notice>
      )}
      <section aria-label="Kennzahlen" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Unternehmen" value={stats.companies.total} hint={`${stats.companies.active} aktiv`} href="/admin/unternehmen" />
        <Stat label="Registrierte Nutzer" value={stats.users} />
        <Stat label="Neue Anfragen" value={stats.contactRequests.new} href="/admin/anfragen?status=new" tone={stats.contactRequests.new ? "attention" : undefined} />
        <Stat label="Offene Anfragen" value={stats.contactRequests.open} hint={`${stats.contactRequests.last30} in 30 Tagen`} href="/admin/anfragen?status=open" />
      </section>
      <Card>
        <CardHeader title="Zuletzt angelegte Unternehmen" />
        {stats.recentCompanies.length === 0 ? (
          <EmptyState title="Noch keine Unternehmen" description="Lege das erste Unternehmen an, sobald eine Anfrage qualifiziert ist." />
        ) : (
          <ul className="divide-y divide-line">
            {stats.recentCompanies.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/unternehmen/${c.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-2">
                  <span className="font-medium">{c.name}</span>
                  <span className="flex items-center gap-3 text-sm text-muted">
                    {c.status === "suspended" && <Badge tone="danger">Gesperrt</Badge>}
                    {formatDateTime(c.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
