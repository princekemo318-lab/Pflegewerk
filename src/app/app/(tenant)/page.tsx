import type { Metadata } from "next";
import Link from "next/link";
import { CalendarPlus, CheckCircle2, Circle, Inbox, Plane, Users } from "lucide-react";
import { requireTenant } from "@/server/auth/current";
import { can } from "@/server/authz";
import { getCompanyDashboard, getPersonalDashboard } from "@/server/services/dashboard";
import { ButtonLink, Card, CardHeader, EmptyState, LeaveStatusBadge, PageHeader, Stat } from "@/components/ui/primitives";
import { BalanceSummary } from "@/components/leave/balance";
import { formatDays, formatRange } from "@/lib/dates";

export const metadata: Metadata = { title: "Übersicht" };

export default async function DashboardPage() {
  const { ctx, session } = await requireTenant();
  const personal = await getPersonalDashboard(ctx);
  const company = can(ctx, "dashboard.company") ? await getCompanyDashboard(ctx) : null;
  const firstName = session.user.name.split(" ")[0];

  return (
    <>
      <PageHeader
        title={`Hallo ${firstName}`}
        description={ctx.companyName}
        actions={
          <ButtonLink href="/app/antraege/neu" variant="primary">
            <CalendarPlus className="size-4" aria-hidden />
            Urlaub beantragen
          </ButtonLink>
        }
      />

      {company && <SetupChecklist data={company} />}

      {company && (
        <section aria-label="Kennzahlen" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Aktive Mitarbeiter" value={company.activeEmployees} href="/app/mitarbeiter" />
          <Stat
            label="Offene Anträge"
            value={company.pendingTotal}
            hint={company.pendingForMe.length ? `${company.pendingForMe.length} warten auf dich` : "Keiner wartet auf dich"}
            href="/app/genehmigungen"
            tone={company.pendingTotal > 0 ? "attention" : undefined}
          />
          <Stat label="Heute abwesend" value={company.absentToday.length} href="/app/kalender" />
          <Stat label="Rückkehr in 7 Tagen" value={company.returning.length} href="/app/kalender" />
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          {company && (
            <Card>
              <CardHeader
                title="Wartet auf deine Entscheidung"
                action={
                  company.pendingForMe.length > 0 && (
                    <Link href="/app/genehmigungen" className="text-sm font-medium text-accent-text hover:underline">
                      Alle anzeigen
                    </Link>
                  )
                }
              />
              {company.pendingForMe.length === 0 ? (
                <EmptyState icon={<Inbox className="size-5" />} title="Alles entschieden" description="Neue Anträge erscheinen hier, sobald sie eingereicht werden." />
              ) : (
                <ul className="divide-y divide-line">
                  {company.pendingForMe.map((r) => (
                    <li key={r.id}>
                      <Link href={`/app/genehmigungen/${r.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">
                            {r.firstName} {r.lastName}
                          </p>
                          <p className="truncate text-sm text-muted">
                            {r.typeName} · {formatRange(r.startDate, r.endDate)} · {formatDays(r.workingDays)}
                          </p>
                        </div>
                        <span className="text-sm font-medium text-accent-text">Entscheiden</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {company && (
            <Card>
              <CardHeader title="Abwesenheiten in den nächsten 14 Tagen" description="Genehmigte Abwesenheiten, die noch beginnen." />
              {company.upcoming.length === 0 ? (
                <EmptyState title="Keine bevorstehenden Abwesenheiten" />
              ) : (
                <ul className="divide-y divide-line">
                  {company.upcoming.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                      <span className="min-w-0 truncate">
                        <span className="font-medium">
                          {a.firstName} {a.lastName}
                        </span>
                        {a.teamName && <span className="text-muted"> · {a.teamName}</span>}
                      </span>
                      <span className="shrink-0 text-muted tabular">{formatRange(a.startDate, a.endDate)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {!company && (
            <Card>
              <CardHeader title="Deine nächsten Abwesenheiten" />
              {personal.upcoming.length === 0 ? (
                <EmptyState
                  icon={<Plane className="size-5" />}
                  title="Noch nichts geplant"
                  description="Stelle einen Antrag – du siehst hier sofort den Status."
                  action={<ButtonLink href="/app/antraege/neu">Urlaub beantragen</ButtonLink>}
                />
              ) : (
                <UpcomingList items={personal.upcoming} />
              )}
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-base font-semibold">Dein Urlaub {personal.year}</h2>
            <BalanceSummary balance={personal.balance} className="mt-4" />
            <Link href="/app/antraege" className="mt-4 inline-block text-sm font-medium text-accent-text hover:underline">
              Meine Anträge ansehen
            </Link>
          </Card>

          {company && personal.upcoming.length > 0 && (
            <Card>
              <CardHeader title="Deine nächsten Abwesenheiten" />
              <UpcomingList items={personal.upcoming} />
            </Card>
          )}

          {company && company.teams.length > 0 && (
            <Card>
              <CardHeader title="Heute nach Team" />
              <ul className="divide-y divide-line">
                {company.teams.map((t) => (
                  <li key={t.teamId} className="flex items-center justify-between px-5 py-2.5 text-sm">
                    <Link href={`/app/kalender?team=${t.teamId}`} className="truncate hover:underline">
                      {t.teamName}
                    </Link>
                    <span className="text-muted tabular">
                      {t.absent > 0 ? <span className="font-medium text-warn">{t.absent} abwesend</span> : "alle da"} · {t.total}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function UpcomingList({
  items,
}: {
  items: { id: string; startDate: string; endDate: string; status: string; typeName: string; workingDays: number }[];
}) {
  return (
    <ul className="divide-y divide-line">
      {items.map((r) => (
        <li key={r.id}>
          <Link href={`/app/antraege/${r.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-2">
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{formatRange(r.startDate, r.endDate)}</span>
              <span className="block text-xs text-muted">
                {r.typeName} · {formatDays(r.workingDays)}
              </span>
            </span>
            <LeaveStatusBadge status={r.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SetupChecklist({ data }: { data: Awaited<ReturnType<typeof getCompanyDashboard>> }) {
  const steps = [
    { done: data.teamCount > 0, label: "Teams und Standorte anlegen", href: "/app/organisation" },
    { done: data.activeEmployees > 1, label: "Lade deine ersten Mitarbeiter ein", href: "/app/mitarbeiter/neu" },
    {
      done: data.missingEntitlements === 0,
      label:
        data.missingEntitlements > 0
          ? `Urlaubsanspruch für ${data.missingEntitlements} ${data.missingEntitlements === 1 ? "Person" : "Personen"} hinterlegen`
          : "Urlaubsansprüche hinterlegen",
      href: "/app/mitarbeiter",
    },
  ];
  if (steps.every((s) => s.done)) return null;
  return (
    <Card className="mb-6 p-5">
      <div className="flex items-start gap-3">
        <Users className="mt-0.5 size-5 text-accent-text" aria-hidden />
        <div className="flex-1">
          <h2 className="font-semibold">Einrichtung abschließen</h2>
          <p className="mt-0.5 text-sm text-muted">Drei Schritte, dann können alle Anträge digital laufen.</p>
          <ol className="mt-4 grid gap-2 sm:grid-cols-3">
            {steps.map((s) => (
              <li key={s.label}>
                <Link
                  href={s.href}
                  className="flex h-full items-start gap-2 rounded-xl border border-line px-3 py-2.5 text-sm hover:bg-surface-2"
                >
                  {s.done ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" aria-label="Erledigt" />
                  ) : (
                    <Circle className="mt-0.5 size-4 shrink-0 text-subtle" aria-label="Offen" />
                  )}
                  <span className={s.done ? "text-muted line-through" : "font-medium"}>{s.label}</span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </div>
      {data.openInvites > 0 && (
        <p className="mt-4 text-xs text-muted">
          {data.openInvites} offene {data.openInvites === 1 ? "Einladung" : "Einladungen"}, noch nicht angenommen
        </p>
      )}
    </Card>
  );
}
