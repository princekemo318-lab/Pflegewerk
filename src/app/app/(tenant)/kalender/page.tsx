import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireTenant } from "@/server/auth/current";
import { getCalendar, getCalendarFilters, type CalendarEntry } from "@/server/services/calendar";
import { Card, EmptyState, PageHeader, buttonClasses } from "@/components/ui/primitives";
import { AutoSubmitSelect } from "@/components/ui/auto-submit-select";
import {
  addDays,
  addMonths,
  eachDay,
  endOfMonth,
  formatDate,
  formatDateLong,
  isIsoDate,
  MONTH_NAMES,
  startOfMonth,
  startOfWeek,
  todayIso,
  weekdayIndex,
  WEEKDAY_SHORT,
  type IsoDate,
} from "@/lib/dates";

export const metadata: Metadata = { title: "Kalender" };

type View = "monat" | "woche";

export default async function CalendarPage({ searchParams }: PageProps<"/app/kalender">) {
  const { ctx } = await requireTenant();
  const sp = await searchParams;
  const today = todayIso();
  const view: View = sp.ansicht === "woche" ? "woche" : "monat";
  const anchor = typeof sp.datum === "string" && isIsoDate(sp.datum) ? sp.datum : today;
  const teamId = typeof sp.team === "string" && /^[0-9a-f-]{36}$/.test(sp.team) ? sp.team : null;
  const locationId = typeof sp.standort === "string" && /^[0-9a-f-]{36}$/.test(sp.standort) ? sp.standort : null;

  const start = view === "monat" ? startOfMonth(anchor) : startOfWeek(anchor);
  const end = view === "monat" ? endOfMonth(anchor) : addDays(start, 6);
  const prev = view === "monat" ? addMonths(start, -1) : addDays(start, -7);
  const next = view === "monat" ? addMonths(start, 1) : addDays(start, 7);

  const [data, filters] = await Promise.all([getCalendar(ctx, { start, end, teamId, locationId }), getCalendarFilters(ctx)]);
  const days = eachDay(start, end);
  const holidays = new Map(data.holidays.map((h) => [h.date, h.name]));

  const link = (over: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const merged = { ansicht: view, datum: anchor, team: teamId, standort: locationId, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/app/kalender?${p.toString()}`;
  };

  const title =
    view === "monat"
      ? `${MONTH_NAMES[Number(start.slice(5, 7)) - 1]} ${start.slice(0, 4)}`
      : `${formatDate(start)} – ${formatDate(end)}`;

  const byEmployee = new Map<string, CalendarEntry[]>();
  for (const e of data.entries) byEmployee.set(e.employeeId, [...(byEmployee.get(e.employeeId) ?? []), e]);

  return (
    <>
      <PageHeader
        title="Kalender"
        description={
          data.scope === "full"
            ? "Alle Abwesenheiten im Unternehmen. Schraffierte Einträge sind noch nicht entschieden."
            : "Genehmigte Abwesenheiten deiner Kolleginnen und Kollegen – ohne Angabe von Gründen."
        }
      />

      <Card className="mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="flex items-center gap-1">
          <Link href={link({ datum: prev })} className={buttonClasses("ghost", "sm")} aria-label="Zurück">
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
          <Link href={link({ datum: next })} className={buttonClasses("ghost", "sm")} aria-label="Weiter">
            <ChevronRight className="size-4" aria-hidden />
          </Link>
          <h2 className="ml-1 font-semibold tabular">{title}</h2>
        </div>
        <Link href={link({ datum: today })} className={buttonClasses("secondary", "sm")}>
          Heute
        </Link>
        <div className="inline-flex rounded-lg border border-line bg-sunken p-0.5 text-sm" role="group" aria-label="Ansicht">
          {(["monat", "woche"] as const).map((v) => (
            <Link
              key={v}
              href={link({ ansicht: v })}
              aria-current={v === view ? "page" : undefined}
              className={clsx("rounded-md px-3 py-1", v === view ? "bg-surface font-medium shadow-soft" : "text-muted hover:text-fg")}
            >
              {v === "monat" ? "Monat" : "Woche"}
            </Link>
          ))}
        </div>
        <form className="flex flex-wrap gap-2 sm:ml-auto" action="/app/kalender">
          <input type="hidden" name="ansicht" value={view} />
          <input type="hidden" name="datum" value={anchor} />
          {filters.teams.length > 0 && (
            <AutoSubmitSelect name="team" defaultValue={teamId ?? ""} aria-label="Team filtern">
              <option value="">Alle Teams</option>
              {filters.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </AutoSubmitSelect>
          )}
          {filters.locations.length > 0 && (
            <AutoSubmitSelect name="standort" defaultValue={locationId ?? ""} aria-label="Standort filtern">
              <option value="">Alle Standorte</option>
              {filters.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </AutoSubmitSelect>
          )}
        </form>
      </Card>

      {data.employees.length === 0 ? (
        <Card>
          <EmptyState title="Keine Mitarbeiter in dieser Auswahl" description="Passe die Filter an oder lege Mitarbeiter an." />
        </Card>
      ) : (
        <>
          {/* Raster ab mittlerer Breite */}
          <Card className="hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <div className="min-w-[44rem]" style={{ display: "grid", gridTemplateColumns: `13rem repeat(${days.length}, minmax(1.6rem, 1fr))` }}>
                <div className="sticky left-0 z-10 border-b border-line bg-surface px-4 py-2 text-xs font-medium text-subtle">Mitarbeiter</div>
                {days.map((d) => {
                  const wd = weekdayIndex(d);
                  return (
                    <div
                      key={d}
                      title={holidays.get(d) ?? formatDateLong(d)}
                      className={clsx(
                        "border-b border-l border-line py-1.5 text-center text-[11px] leading-tight tabular",
                        wd > 4 || holidays.has(d) ? "bg-sunken text-subtle" : "text-muted",
                        d === today && "bg-accent-soft font-semibold text-accent-text",
                      )}
                    >
                      <span className="block">{WEEKDAY_SHORT[wd]}</span>
                      <span className="block">{Number(d.slice(8))}</span>
                    </div>
                  );
                })}
                {data.employees.map((emp) => (
                  <Row key={emp.id} emp={emp} days={days} entries={byEmployee.get(emp.id) ?? []} holidays={holidays} today={today} start={start} end={end} />
                ))}
              </div>
            </div>
            <Legend region={data.holidayRegion} />
          </Card>

          {/* Liste auf kleinen Bildschirmen */}
          <div className="md:hidden">
            <AgendaList days={days} entries={data.entries} employees={data.employees} holidays={holidays} today={today} />
            <p className="mt-3 text-xs text-muted">Feiertage: {data.holidayRegion}</p>
          </div>
        </>
      )}
      {data.truncated && <p className="mt-3 text-sm text-muted">Es werden die ersten 500 Mitarbeiter angezeigt. Nutze die Filter.</p>}
    </>
  );
}

function Row({
  emp,
  days,
  entries,
  holidays,
  today,
  start,
  end,
}: {
  emp: { id: string; firstName: string; lastName: string; teamName: string | null };
  days: IsoDate[];
  entries: CalendarEntry[];
  holidays: Map<string, string>;
  today: IsoDate;
  start: IsoDate;
  end: IsoDate;
}) {
  const col = (d: IsoDate) => days.indexOf(d) + 2;
  return (
    <>
      <div className="sticky left-0 z-10 flex min-w-0 flex-col justify-center border-b border-line bg-surface px-4 py-2">
        <span className="truncate text-sm font-medium">
          {emp.firstName} {emp.lastName}
        </span>
        {emp.teamName && <span className="truncate text-xs text-subtle">{emp.teamName}</span>}
      </div>
      <div className="relative border-b border-line" style={{ gridColumn: `2 / span ${days.length}`, display: "grid", gridTemplateColumns: `repeat(${days.length}, minmax(1.6rem, 1fr))` }}>
        {days.map((d) => (
          <span
            key={d}
            aria-hidden
            className={clsx("border-l border-line", (weekdayIndex(d) > 4 || holidays.has(d)) && "bg-sunken", d === today && "bg-accent-soft/60")}
          />
        ))}
        {entries.map((e) => {
          const s = e.startDate < start ? start : e.startDate;
          const en = e.endDate > end ? end : e.endDate;
          const label = `${e.label}${e.status === "submitted" ? " (beantragt)" : ""}: ${formatDate(e.startDate)} – ${formatDate(e.endDate)}`;
          const cls = clsx(
            "absolute inset-y-1.5 z-[1] flex items-center overflow-hidden rounded-md px-1.5 text-[11px] font-medium whitespace-nowrap",
            `abs-${e.color}`,
            e.status === "submitted" && "abs-pending",
          );
          const style = {
            left: `calc(${((col(s) - 2) / days.length) * 100}% + 2px)`,
            width: `calc(${((col(en) - col(s) + 1) / days.length) * 100}% - 4px)`,
          };
          return e.href ? (
            <Link key={e.id} href={e.href} className={clsx(cls, "hover:brightness-95")} style={style} title={label} aria-label={label}>
              <span className="truncate">{e.label}</span>
            </Link>
          ) : (
            <span key={e.id} className={cls} style={style} title={label} aria-label={label}>
              <span className="truncate">{e.label}</span>
            </span>
          );
        })}
      </div>
    </>
  );
}

function AgendaList({
  days,
  entries,
  employees,
  holidays,
  today,
}: {
  days: IsoDate[];
  entries: CalendarEntry[];
  employees: { id: string; firstName: string; lastName: string }[];
  holidays: Map<string, string>;
  today: IsoDate;
}) {
  const names = new Map(employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));
  const rows = days
    .map((d) => ({ d, items: entries.filter((e) => e.startDate <= d && e.endDate >= d), holiday: holidays.get(d) }))
    .filter((r) => r.items.length > 0 || r.holiday);
  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState title="Keine Abwesenheiten in diesem Zeitraum" />
      </Card>
    );
  }
  return (
    <Card>
      <ul className="divide-y divide-line">
        {rows.map(({ d, items, holiday }) => (
          <li key={d} className="px-4 py-3">
            <p className={clsx("text-sm font-semibold", d === today && "text-accent-text")}>
              {formatDateLong(d)}
              {holiday && <span className="ml-2 font-normal text-muted">· {holiday}</span>}
            </p>
            {items.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {items.map((e) => (
                  <li key={e.id} className={clsx("rounded-md px-2 py-1 text-xs font-medium", `abs-${e.color}`, e.status === "submitted" && "abs-pending")}>
                    {names.get(e.employeeId)} · {e.label}
                    {e.status === "submitted" && " (beantragt)"}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Legend({ region }: { region: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line px-4 py-3 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <span className="abs-teal h-3 w-5 rounded" aria-hidden /> Genehmigt
      </span>
      <span className="flex items-center gap-1.5">
        <span className="abs-teal abs-pending h-3 w-5 rounded" aria-hidden /> Beantragt
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-5 rounded bg-sunken ring-1 ring-line" aria-hidden /> Wochenende / Feiertag
      </span>
      <span className="ml-auto">Feiertage: {region}</span>
    </div>
  );
}
