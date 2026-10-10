import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Search, UserPlus, Users } from "lucide-react";
import { requireTenant } from "@/server/auth/current";
import { can, canAny } from "@/server/authz";
import { listEmployees } from "@/server/services/employees";
import { getCalendarFilters } from "@/server/services/calendar";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, Table, Td, Th, buttonClasses } from "@/components/ui/primitives";
import { AutoSubmitSelect } from "@/components/ui/auto-submit-select";
import { formatNumber } from "@/lib/dates";

export const metadata: Metadata = { title: "Mitarbeiter" };

const ACCOUNT_BADGE = {
  active: { label: "Zugang aktiv", tone: "success" },
  deactivated: { label: "Zugang deaktiviert", tone: "neutral" },
  invited: { label: "Eingeladen", tone: "info" },
  none: { label: "Kein Zugang", tone: "neutral" },
} as const;

const UUID = /^[0-9a-f-]{36}$/;

export default async function EmployeesPage({ searchParams }: PageProps<"/app/mitarbeiter">) {
  const { ctx } = await requireTenant();
  if (!canAny(ctx, "employees.view", "employees.manage", "leave.approve_team")) notFound();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const teamId = typeof sp.team === "string" && UUID.test(sp.team) ? sp.team : undefined;
  const locationId = typeof sp.standort === "string" && UUID.test(sp.standort) ? sp.standort : undefined;
  const status = sp.status === "inactive" || sp.status === "all" ? sp.status : "active";
  const page = Math.max(1, Number(sp.seite) || 1);

  const [list, filters] = await Promise.all([
    listEmployees(ctx, { q, teamId, locationId, status, page }),
    getCalendarFilters(ctx),
  ]);
  const canManage = can(ctx, "employees.manage");
  const showBalances = canAny(ctx, "employees.view", "employees.manage");
  const qs = (over: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q, team: teamId, standort: locationId, status, seite: page, ...over };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "status" && v === "active") && !(k === "seite" && v === 1)) p.set(k, String(v));
    return `/app/mitarbeiter?${p}`;
  };
  const filtered = Boolean(q || teamId || locationId || status !== "active");

  return (
    <>
      <PageHeader
        title="Mitarbeiter"
        description={showBalances ? `${list.total} ${status === "inactive" ? "ausgeschiedene" : status === "all" ? "" : "aktive"} Mitarbeiter · Urlaubssaldo ${list.year}` : "Mitarbeiter, für die du zuständig bist"}
        actions={
          canManage && (
            <ButtonLink href="/app/mitarbeiter/neu">
              <UserPlus className="size-4" aria-hidden />
              Mitarbeiter hinzufügen
            </ButtonLink>
          )
        }
      />
      <Card>
        <form action="/app/mitarbeiter" className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <label className="relative min-w-48 flex-1">
            <span className="sr-only">Suchen</span>
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" aria-hidden />
            <input
              name="q"
              defaultValue={q}
              placeholder="Name oder Personalnummer"
              className="h-8 w-full rounded-lg border border-line-strong bg-surface pr-3 pl-8 text-sm placeholder:text-subtle"
            />
          </label>
          {filters.teams.length > 0 && (
            <AutoSubmitSelect name="team" defaultValue={teamId ?? ""} aria-label="Team">
              <option value="">Alle Teams</option>
              {filters.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </AutoSubmitSelect>
          )}
          {filters.locations.length > 0 && (
            <AutoSubmitSelect name="standort" defaultValue={locationId ?? ""} aria-label="Standort">
              <option value="">Alle Standorte</option>
              {filters.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </AutoSubmitSelect>
          )}
          <AutoSubmitSelect name="status" defaultValue={status} aria-label="Beschäftigungsstatus">
            <option value="active">Aktiv</option>
            <option value="inactive">Ausgeschieden</option>
            <option value="all">Alle</option>
          </AutoSubmitSelect>
          <button className={buttonClasses("secondary", "sm")}>Suchen</button>
        </form>

        {list.rows.length === 0 ? (
          filtered ? (
            <EmptyState title="Keine Treffer" description="Passe Suche oder Filter an." action={<ButtonLink href="/app/mitarbeiter" variant="secondary">Filter zurücksetzen</ButtonLink>} />
          ) : (
            <EmptyState
              icon={<Users className="size-5" />}
              title="Noch keine Mitarbeiter"
              description="Lade deine ersten Mitarbeiter ein. Sie können danach selbst Urlaub beantragen."
              action={canManage && <ButtonLink href="/app/mitarbeiter/neu">Mitarbeiter hinzufügen</ButtonLink>}
            />
          )
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th className="hidden md:table-cell">Team · Standort</Th>
                <Th className="hidden lg:table-cell">Führungskraft</Th>
                <Th className="hidden sm:table-cell">Rolle</Th>
                {showBalances && <Th className="text-right">Resturlaub</Th>}
              </tr>
            </thead>
            <tbody>
              {list.rows.map((e) => {
                const badge = ACCOUNT_BADGE[e.accountStatus];
                return (
                  <tr key={e.id} className="hover:bg-surface-2">
                    <Td>
                      <Link href={`/app/mitarbeiter/${e.id}`} className="font-medium hover:underline">
                        {e.lastName}, {e.firstName}
                      </Link>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        {e.jobTitle && <span>{e.jobTitle}</span>}
                        {e.status === "inactive" && <Badge>Ausgeschieden</Badge>}
                        {e.accountStatus !== "active" && e.status === "active" && <Badge tone={badge.tone}>{badge.label}</Badge>}
                      </span>
                    </Td>
                    <Td className="hidden text-muted md:table-cell">
                      {[e.teamName, e.locationName].filter(Boolean).join(" · ") || "–"}
                    </Td>
                    <Td className="hidden text-muted lg:table-cell">
                      {e.managerFirstName ? `${e.managerFirstName} ${e.managerLastName}` : "–"}
                    </Td>
                    <Td className="hidden text-muted sm:table-cell">{e.roleName ?? "–"}</Td>
                    {showBalances && (
                      <Td className="text-right tabular">
                        {e.balance?.configured ? (
                          <span className={e.balance.available < 0 ? "font-medium text-danger" : undefined}>
                            {formatNumber(e.balance.available)}
                            <span className="text-subtle"> / {formatNumber(e.balance.entitlement + e.balance.carryover)}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-warn">nicht hinterlegt</span>
                        )}
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {(list.page > 1 || list.hasMore) && (
          <div className="flex items-center justify-between border-t border-line px-5 py-3 text-sm">
            {list.page > 1 ? <Link href={qs({ seite: list.page - 1 })} className="hover:underline">← Zurück</Link> : <span />}
            <span className="text-muted">Seite {list.page}</span>
            {list.hasMore ? <Link href={qs({ seite: list.page + 1 })} className="hover:underline">Weiter →</Link> : <span />}
          </div>
        )}
      </Card>
    </>
  );
}
