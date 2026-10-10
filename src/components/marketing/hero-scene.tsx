/**
 * Hero-Szene: eine einzige, ruhige Motion-Sequenz, die den Kernablauf zeigt –
 * Tage zählen → Antrag einreichen → genehmigt. Reines CSS (GPU-Eigenschaften),
 * kein JavaScript. Fiktive Namen, als Beispieldarstellung gekennzeichnet.
 * Bei „Bewegung reduzieren“ wird der Endzustand statisch gezeigt.
 */
import { Check } from "lucide-react";
import "./hero.css";

const DAYS = [
  { d: "Mo", kind: "count" },
  { d: "Di", kind: "count" },
  { d: "Mi", kind: "count" },
  { d: "Do", kind: "count" },
  { d: "Fr", kind: "holiday" },
  { d: "Sa", kind: "off" },
  { d: "So", kind: "off" },
] as const;

const TEAM = [
  { name: "A. Becker", bar: [0, 1] as const, color: "teal" },
  { name: "E. Ebert", bar: [0, 3] as const, color: "teal", live: true },
  { name: "K. Haas", bar: [2, 2] as const, color: "blue" },
  { name: "J. Yilmaz", bar: null, color: "teal" },
  { name: "S. Krause", bar: [1, 1] as const, color: "violet" },
];

export function HeroScene() {
  return (
    <figure className="hs-stage" aria-label="Beispieldarstellung: Ein Urlaubsantrag wird eingereicht und genehmigt.">
      <div className="hs-glow" aria-hidden />
      <div className="hs-frame" aria-hidden>
        <span className="hs-beam" />
        <span className="hs-spot" />
        {/* Fensterleiste */}
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <span className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
          </span>
          <span className="ml-2 truncate text-xs text-subtle">pflegewerk · Station Nord</span>
          <span className="ml-auto rounded-full bg-sunken px-2 py-0.5 text-[10px] font-medium text-muted">Beispieldarstellung</span>
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-[15rem_minmax(0,1fr)] sm:p-5">
          {/* Antragskarte */}
          <div className="hs-card rounded-xl border border-line bg-surface p-4 shadow-soft">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] text-subtle">Neuer Antrag</p>
                <p className="text-sm font-semibold">Urlaub · KW 40</p>
              </div>
              <span className="relative h-5 w-[5.6rem]">
                <span className="hs-pill hs-pill-submitted">Eingereicht</span>
                <span className="hs-pill hs-pill-approved">
                  <Check className="size-3" strokeWidth={3} /> Genehmigt
                </span>
              </span>
            </div>

            <div className="mt-4 grid grid-cols-7 gap-1">
              {DAYS.map((day, i) => (
                <div key={day.d} className="text-center">
                  <span className="block text-[10px] text-subtle">{day.d}</span>
                  <span
                    className={`hs-day mt-1 block h-7 rounded-md ${day.kind === "off" ? "bg-sunken/70" : "hs-day-slot"} ${
                      day.kind === "count" ? `hs-day-count hs-day-${i}` : day.kind === "holiday" ? "hs-day-holiday" : ""
                    }`}
                  />
                </div>
              ))}
            </div>
            <p className="hs-holiday-note mt-1.5 text-right text-[10px] text-subtle">Fr: Feiertag – zählt nicht</p>

            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="hs-counter font-display text-3xl font-semibold tabular" />
              <span className="text-xs text-muted">Arbeitstage</span>
            </div>
            <span className="relative mt-3 block">
              <span className="hs-button flex h-9 items-center justify-center rounded-lg bg-primary text-xs font-medium text-primary-fg">
                Antrag einreichen
              </span>
              {/* Animierter Zeiger: fährt zum Button und klickt */}
              <span className="hs-cursor">
                <span className="hs-ripple" />
                <svg viewBox="0 0 24 24" className="relative size-5" fill="var(--fg)" stroke="var(--surface)" strokeWidth="1.5" strokeLinejoin="round">
                  <path d="M4 3l15 8.5-6.5 1.6L9.2 19z" />
                </svg>
              </span>
            </span>
          </div>

          {/* Teamkalender */}
          <div className="rounded-xl border border-line bg-surface p-3 shadow-soft">
            <div className="grid grid-cols-[4.5rem_repeat(7,minmax(0,1fr))] text-[10px] text-subtle">
              <span />
              {DAYS.map((day) => (
                <span key={day.d} className="pb-1.5 text-center">
                  {day.d}
                </span>
              ))}
            </div>
            <div className="space-y-1.5">
              {TEAM.map((m) => (
                <div key={m.name} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center">
                  <span className="truncate pr-2 text-[11px] font-medium">{m.name}</span>
                  <div className="relative grid h-8 grid-cols-7 overflow-hidden rounded-md bg-sunken/60">
                    {DAYS.map((day, i) => (
                      <span key={day.d} className={`border-l border-line/60 first:border-l-0 ${i === 4 ? "hs-cal-holiday" : i > 4 ? "bg-sunken" : ""}`} />
                    ))}
                    {m.bar && (
                      <span
                        className={`absolute inset-y-1 rounded abs-${m.color} ${m.live ? "hs-bar-live" : ""}`}
                        style={{
                          left: `calc(${(m.bar[0] / 7) * 100}% + 2px)`,
                          width: `calc(${((m.bar[1] - m.bar[0] + 1) / 7) * 100}% - 4px)`,
                        }}
                      >
                        {m.live && <span className="hs-bar-hatch abs-pending" />}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bestätigung */}
      {/* Schwebende Ebenen (nur große Bildschirme) – liegen räumlich vor der Szene */}
      <div className="hs-float hs-float-left" aria-hidden>
        <div className="hs-bob flex items-center gap-3 rounded-2xl border border-line bg-surface/90 p-3 pr-4 shadow-card backdrop-blur">
          <svg viewBox="0 0 44 44" className="size-12 -rotate-90">
            <circle cx="22" cy="22" r="18" fill="none" stroke="var(--sunken)" strokeWidth="5" />
            <circle className="hs-ring" cx="22" cy="22" r="18" fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" pathLength="30" />
          </svg>
          <span>
            <span className="block text-[11px] text-subtle">Resturlaub</span>
            <span className="block font-display text-lg font-semibold tabular">
              <span className="hs-balance" /> <span className="text-xs font-normal text-muted">von 30</span>
            </span>
          </span>
        </div>
      </div>
      <div className="hs-float hs-float-right" aria-hidden>
        <div className="hs-bob hs-bob-late flex items-center gap-2.5 rounded-2xl border border-line bg-surface/90 px-3.5 py-2.5 shadow-card backdrop-blur">
          <span className="grid size-8 place-items-center rounded-xl bg-info-soft text-info">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4.5" width="18" height="16" rx="3" />
              <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
            </svg>
          </span>
          <span>
            <span className="block text-xs font-semibold">Feiertage automatisch</span>
            <span className="block text-[11px] text-muted">je Bundesland und Standort</span>
          </span>
        </div>
      </div>

      <div className="hs-toast" aria-hidden>
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-text">
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path className="hs-check" d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-semibold">Urlaub genehmigt</span>
          <span className="block truncate text-[11px] text-muted">Lars L. · „Gute Erholung!“</span>
        </span>
      </div>
    </figure>
  );
}

/** Überschrift mit wortweisem Einblenden. */
export function RevealHeading({ lines, accentFrom }: { lines: string[]; accentFrom: number }) {
  let index = 0;
  return (
    <>
      {lines.map((line, li) => (
        <span key={li} className="block">
          {line.split(" ").map((word) => {
            const i = index++;
            return (
              <span key={i}>
                <span className={`hs-word ${i >= accentFrom ? "text-accent-text" : ""}`} style={{ ["--i" as string]: i }}>
                  {i >= accentFrom ? <span className="hs-sheen">{word}</span> : word}
                </span>{" "}
              </span>
            );
          })}
        </span>
      ))}
    </>
  );
}
