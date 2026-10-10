"use client";

/**
 * Interaktiver Urlaubsrechner für die Website. Rechnet mit genau derselben Logik
 * wie die Plattform (src/lib/leave-calc.ts, src/lib/holidays.ts) – im Browser,
 * ohne Daten zu senden oder zu speichern.
 */
import { useMemo, useState, useSyncExternalStore } from "react";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { calculateLeave } from "@/lib/leave-calc";
import { holidayMapForRange, STATES, type StateCode } from "@/lib/holidays";
import {
  addDays,
  addMonths,
  eachDay,
  endOfMonth,
  formatDate,
  FIVE_DAY_WEEK,
  maskHasWeekday,
  MONTH_NAMES,
  startOfMonth,
  startOfWeek,
  todayIso,
  WEEKDAY_SHORT,
  weekdayIndex,
  type IsoDate,
} from "@/lib/dates";

const noop = () => () => {};

export function LeaveCalculatorDemo() {
  // Heutiges Datum erst im Browser (statische Seite → keine Abweichung beim Hydrieren)
  const today = useSyncExternalStore(noop, () => todayIso(), () => null);
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState<StateCode>("NW");
  const [mask, setMask] = useState(FIVE_DAY_WEEK);
  const [start, setStart] = useState<IsoDate | null>(null);
  const [end, setEnd] = useState<IsoDate | null>(null);
  const [hover, setHover] = useState<IsoDate | null>(null);

  const month = today ? addMonths(startOfMonth(today), offset) : null;
  const gridDays = useMemo(() => {
    if (!month) return [];
    const first = startOfWeek(month);
    const last = addDays(startOfWeek(endOfMonth(month)), 6);
    return eachDay(first, last);
  }, [month]);
  const holidays = useMemo(
    () => {
      try {
        return gridDays.length ? holidayMapForRange(gridDays[0], gridDays[gridDays.length - 1], state) : new Map<string, string>();
      } catch {
        // Jahre außerhalb des unterstützten Bereichs
        return new Map<string, string>();
      }
    },
    [gridDays, state],
  );

  const rangeEnd = end ?? (start && hover && hover >= start ? hover : start);
  const result = useMemo(() => {
    if (!start || !rangeEnd) return null;
    try {
      const calc = calculateLeave({
        startDate: start,
        endDate: rangeEnd,
        defaultWeekdays: mask,
        holidays: holidayMapForRange(start, rangeEnd, state),
      });
      return calc;
    } catch {
      return null;
    }
  }, [start, rangeEnd, mask, state]);

  const pick = (d: IsoDate) => {
    if (!start || end) {
      setStart(d);
      setEnd(null);
    } else if (d < start) {
      setStart(d);
    } else {
      setEnd(d);
    }
  };
  const reset = () => {
    setStart(null);
    setEnd(null);
  };

  const counted = result?.days.filter((d) => d.status === "counted").length ?? 0;
  const free = result?.days.filter((d) => d.status === "non_working").length ?? 0;
  const hol = result?.days.filter((d) => d.status === "holiday") ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="rounded-2xl border border-line bg-surface p-4 shadow-soft sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setOffset((o) => o - 1)} className="grid size-8 place-items-center rounded-lg hover:bg-sunken" aria-label="Vorheriger Monat">
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <button type="button" onClick={() => setOffset((o) => o + 1)} className="grid size-8 place-items-center rounded-lg hover:bg-sunken" aria-label="Nächster Monat">
              <ChevronRight className="size-4" aria-hidden />
            </button>
            <p className="ml-1 min-w-36 font-display font-semibold tabular" aria-live="polite">
              {month ? `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}` : " "}
            </p>
          </div>
          <label className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-muted">Bundesland</span>
            <select
              value={state}
              onChange={(e) => setState(e.target.value as StateCode)}
              className="h-9 rounded-lg border border-line-strong bg-surface px-2 pr-7 text-sm"
            >
              {(Object.keys(STATES) as StateCode[]).map((s) => (
                <option key={s} value={s}>
                  {STATES[s]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-subtle">
          {WEEKDAY_SHORT.map((d) => (
            <span key={d} className="pb-1">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1" onMouseLeave={() => setHover(null)}>
          {!month &&
            Array.from({ length: 35 }).map((_, i) => <span key={i} className="pw-shimmer h-10 rounded-lg sm:h-12" />)}
          {gridDays.map((d) => {
            const inMonth = month !== null && d.slice(0, 7) === month.slice(0, 7);
            const holiday = holidays.get(d);
            const working = maskHasWeekday(mask, weekdayIndex(d));
            const inRange = start && rangeEnd && d >= start && d <= rangeEnd;
            const counts = inRange && working && !holiday;
            const edge = d === start || d === rangeEnd;
            return (
              <button
                key={d}
                type="button"
                onClick={() => pick(d)}
                onMouseEnter={() => setHover(d)}
                title={holiday ?? formatDate(d)}
                aria-label={`${formatDate(d)}${holiday ? `, ${holiday}` : ""}${counts ? ", zählt" : ""}`}
                aria-pressed={Boolean(inRange)}
                className={clsx(
                  "relative h-10 rounded-lg text-sm transition-[background-color,color,transform] duration-200 active:scale-95 sm:h-12",
                  !inMonth && !inRange && "opacity-35",
                  counts && "bg-accent font-semibold text-accent-fg",
                  inRange && !counts && "bg-accent-soft text-accent-text",
                  !inRange && holiday && "calc-holiday text-muted",
                  !inRange && !holiday && !working && "bg-sunken/70 text-subtle",
                  !inRange && !holiday && working && "hover:bg-sunken",
                  edge && "ring-2 ring-accent ring-offset-2 ring-offset-surface",
                  d === today && !inRange && "font-semibold text-accent-text",
                )}
              >
                <span className="tabular">{Number(d.slice(8))}</span>
                {holiday && <span aria-hidden className="absolute top-1 right-1 size-1.5 rounded-full bg-info" />}
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <span className="text-sm text-muted">Arbeitstage</span>
          <div className="flex gap-1">
            {WEEKDAY_SHORT.map((d, i) => {
              const on = maskHasWeekday(mask, i);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    const next = mask ^ (1 << i);
                    if (next) setMask(next);
                  }}
                  className={clsx(
                    "h-8 w-9 rounded-lg border text-xs transition-colors",
                    on ? "border-primary bg-primary text-primary-fg" : "border-line-strong text-muted hover:text-fg",
                  )}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <span className="text-xs text-subtle">z. B. Teilzeit oder Wochenenddienst</span>
        </div>
      </div>

      <aside aria-live="polite" className="flex flex-col rounded-2xl border border-line bg-surface p-6 shadow-soft">
        <p className="text-sm text-muted">{start ? (end ? "Dein Zeitraum" : "Wähle den letzten Tag") : "Wähle den ersten Tag im Kalender"}</p>
        <p className="mt-2 flex items-baseline gap-2">
          <span key={counted} className="calc-pop font-display text-6xl font-semibold tabular">
            {counted}
          </span>
          <span className="text-muted">{counted === 1 ? "Urlaubstag" : "Urlaubstage"}</span>
        </p>
        {start && rangeEnd && <p className="mt-1 text-sm text-muted tabular">{formatDate(start)} – {formatDate(rangeEnd)}</p>}
        <dl className="mt-6 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Kalendertage</dt>
            <dd className="tabular">{result?.days.length ?? 0}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Freie Tage laut Arbeitszeit</dt>
            <dd className="tabular">{free}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Feiertage</dt>
            <dd className="tabular">{hol.length}</dd>
          </div>
        </dl>
        {hol.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-muted">
            {hol.map((h) => (
              <li key={h.date} className="flex items-center gap-2">
                <span aria-hidden className="size-1.5 rounded-full bg-info" />
                {formatDate(h.date)} · {h.holidayName}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto pt-6">
          {start && (
            <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
              <RotateCcw className="size-3.5" aria-hidden /> Neu wählen
            </button>
          )}
          <p className="mt-3 text-xs text-subtle">
            Rechnet mit derselben Logik wie die Plattform – direkt in deinem Browser, ohne dass Daten gesendet werden.
          </p>
        </div>
      </aside>
    </div>
  );
}
