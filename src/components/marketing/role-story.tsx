"use client";

/**
 * Scroll-Story „Ein Antrag, drei Rollen“: links laufen die Kapitel, rechts bleibt
 * ein Smartphone stehen und wechselt den Bildschirm passend zum aktiven Kapitel.
 * Fiktive Inhalte, als Beispieldarstellung gekennzeichnet.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { Check, X } from "lucide-react";

type Step = { role: string; title: string; text: string; screen: ReactNode };

const STEPS: Step[] = [
  {
    role: "Mitarbeiterin",
    title: "Antrag stellen – direkt vom Handy.",
    text: "Zeitraum wählen, Arbeitstage und Resturlaub sehen, einreichen. Feiertage und freie Tage rechnet die Plattform selbst heraus.",
    screen: <ScreenRequest />,
  },
  {
    role: "Teamleitung",
    title: "Entscheiden mit dem ganzen Bild.",
    text: "Vor der Entscheidung ist sichtbar, wer aus dem Team im selben Zeitraum fehlt. Genehmigen oder mit Begründung ablehnen – die Mitarbeiterin wird sofort benachrichtigt.",
    screen: <ScreenDecision />,
  },
  {
    role: "Verwaltung",
    title: "Überblick, ohne nachzufragen.",
    text: "Offene Anträge, heutige Abwesenheiten und Rückkehrtermine auf einen Blick – für alle Teams und Standorte.",
    screen: <ScreenOverview />,
  },
];

export function RoleStory() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-16">
      <div>
        {STEPS.map((s, i) => (
          <div
            key={s.role}
            ref={(el) => {
              refs.current[i] = el;
            }}
            data-index={i}
            className="flex min-h-0 flex-col justify-center py-8 lg:min-h-[78vh] lg:py-0"
          >
            <div className={clsx("story-step transition-[opacity,transform] duration-500", i === active ? "lg:opacity-100" : "lg:opacity-35")}>
              <p className="flex items-center gap-3 text-sm font-medium text-accent-text">
                <span className="grid size-7 place-items-center rounded-full bg-accent-soft font-display text-xs tabular">{i + 1}</span>
                {s.role}
              </p>
              <h3 className="mt-3 max-w-md text-2xl font-semibold tracking-tight sm:text-3xl">{s.title}</h3>
              <p className="mt-3 max-w-md text-muted">{s.text}</p>
            </div>
            {/* Auf kleinen Bildschirmen: Bildschirm direkt unter dem Text */}
            <div className="mt-6 lg:hidden">
              <Phone>{s.screen}</Phone>
            </div>
          </div>
        ))}
      </div>

      <div className="relative hidden lg:block">
        <div className="sticky top-[calc(50vh-17rem)]">
          <div className="absolute -left-8 top-6 bottom-6 w-1 overflow-hidden rounded-full bg-sunken" aria-hidden>
            <span
              className="block w-full rounded-full bg-gradient-to-b from-accent to-info transition-[height] duration-700 ease-out"
              style={{ height: `${((active + 1) / STEPS.length) * 100}%` }}
            />
          </div>
          <Phone>
            <div className="relative h-full">
              {STEPS.map((s, i) => (
                <div
                  key={s.role}
                  aria-hidden={i !== active}
                  className={clsx(
                    "story-screen absolute inset-0 transition-[opacity,transform,filter] duration-700",
                    i === active ? "opacity-100" : i < active ? "-translate-y-6 opacity-0 blur-[2px]" : "translate-y-6 opacity-0 blur-[2px]",
                  )}
                >
                  {s.screen}
                </div>
              ))}
            </div>
          </Phone>
        </div>
      </div>
    </div>
  );
}

function Phone({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[22rem] rounded-[2.6rem] border border-line-strong bg-[#0b1424] p-2.5 shadow-[0_40px_80px_-30px_rgb(15_31_56/0.5)]">
      <div className="relative h-[34rem] overflow-hidden rounded-[2.1rem] bg-bg">
        <div className="flex items-center justify-between px-6 pt-3 pb-1 text-[11px] font-medium text-muted">
          <span className="tabular">9:41</span>
          <span className="h-5 w-20 rounded-full bg-[#0b1424]" aria-hidden />
          <span className="rounded-full bg-sunken px-1.5 py-0.5 text-[9px]">Beispiel</span>
        </div>
        <div className="h-[calc(100%-2.25rem)] px-4 pt-2 pb-4">{children}</div>
      </div>
    </div>
  );
}

function ScreenRequest() {
  return (
    <div className="flex h-full flex-col gap-3">
      <p className="text-xs text-subtle">Hallo Emma</p>
      <p className="font-display text-lg font-semibold">Neuer Antrag</p>
      <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-soft">
        <p className="text-[11px] text-subtle">Zeitraum</p>
        <p className="mt-0.5 font-semibold tabular">Mo 08.02. – Fr 12.02.</p>
        <div className="mt-3 grid grid-cols-7 gap-1">
          {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d, i) => (
            <span key={d} className={clsx("grid h-8 place-items-center rounded-lg text-[10px]", i < 5 ? "bg-accent font-semibold text-accent-fg" : "bg-sunken text-subtle")}>
              {d}
            </span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-line bg-surface p-3.5">
          <p className="font-display text-3xl font-semibold tabular">5</p>
          <p className="text-[11px] text-muted">Arbeitstage</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-3.5">
          <p className="font-display text-3xl font-semibold tabular">25</p>
          <p className="text-[11px] text-muted">danach verfügbar</p>
        </div>
      </div>
      <div className="rounded-2xl border border-line bg-surface p-3.5 text-xs text-muted">„Vertretung ist mit Felix abgesprochen.“</div>
      <span className="mt-auto flex h-11 items-center justify-center rounded-xl bg-primary text-sm font-medium text-primary-fg">Antrag einreichen</span>
    </div>
  );
}

function ScreenDecision() {
  return (
    <div className="flex h-full flex-col gap-3">
      <p className="text-xs text-subtle">Genehmigungen · 1 offen</p>
      <p className="font-display text-lg font-semibold">Antrag von Emma Ebert</p>
      <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-soft">
        <div className="flex items-center justify-between">
          <p className="font-semibold tabular">08.02. – 12.02.</p>
          <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[10px] font-semibold text-warn">Eingereicht</span>
        </div>
        <p className="mt-1 text-[11px] text-muted">Urlaub · 5 Arbeitstage · Rest danach 25</p>
      </div>
      <div className="rounded-2xl border border-line bg-surface p-3.5">
        <p className="text-[11px] font-medium text-subtle">Im Team gleichzeitig abwesend</p>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span>K. Haas · Mi 10.02.</span>
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent-text">Genehmigt</span>
        </div>
      </div>
      <div className="rounded-2xl border border-dashed border-line-strong p-3.5 text-xs text-subtle">Begründung (optional bei Genehmigung)</div>
      <div className="mt-auto grid grid-cols-2 gap-2">
        <span className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-line-strong bg-surface text-sm">
          <X className="size-4" aria-hidden /> Ablehnen
        </span>
        <span className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-accent text-sm font-medium text-accent-fg">
          <Check className="size-4" aria-hidden /> Genehmigen
        </span>
      </div>
    </div>
  );
}

function ScreenOverview() {
  return (
    <div className="flex h-full flex-col gap-3">
      <p className="text-xs text-subtle">Pflegedienst Beispiel</p>
      <p className="font-display text-lg font-semibold">Übersicht</p>
      <div className="grid grid-cols-2 gap-3">
        {[
          ["Offene Anträge", "2", "text-warn"],
          ["Heute abwesend", "3", ""],
          ["Rückkehr in 7 Tagen", "1", ""],
          ["Aktive Mitarbeiter", "24", ""],
        ].map(([label, value, tone]) => (
          <div key={label} className="rounded-2xl border border-line bg-surface p-3.5">
            <p className={clsx("font-display text-2xl font-semibold tabular", tone)}>{value}</p>
            <p className="text-[11px] text-muted">{label}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-line bg-surface p-3.5">
        <p className="text-[11px] font-medium text-subtle">Heute nach Team</p>
        {[
          ["Ambulante Pflege", 2],
          ["Tagespflege", 1],
          ["Betreuung", 0],
        ].map(([team, n]) => (
          <div key={team} className="mt-2 flex items-center gap-2 text-xs">
            <span className="flex-1">{team}</span>
            <span className="h-1.5 w-20 overflow-hidden rounded-full bg-sunken">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${(Number(n) / 3) * 100}%` }} />
            </span>
            <span className="w-14 text-right text-muted tabular">{n ? `${n} abwesend` : "alle da"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Button, der sich leicht zum Mauszeiger hin bewegt (nur Maus, nicht bei reduzierter Bewegung). */
export function Magnetic({ children, strength = 0.28 }: { children: ReactNode; strength?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!matchMedia("(pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      el.style.transform = `translate3d(${(dx * strength).toFixed(1)}px, ${(dy * strength * 1.2).toFixed(1)}px, 0)`;
    };
    const onLeave = () => {
      el.style.transform = "";
    };
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave, { passive: true });
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [strength]);
  return (
    <span ref={ref} className="inline-flex transition-transform duration-300 ease-out will-change-transform">
      {children}
    </span>
  );
}
