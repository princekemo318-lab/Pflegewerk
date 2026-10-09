/**
 * Produktvorschau im Hero: eine Wochentafel im Stil des echten Kalenders.
 * Ausdrücklich als Beispieldarstellung gekennzeichnet – fiktive Namen, keine echten Daten.
 * Einmalige Animation: ein beantragter Urlaub wird genehmigt (der Kernablauf des Produkts).
 */
import clsx from "clsx";

const DAYS = ["Mo 12", "Di 13", "Mi 14", "Do 15", "Fr 16", "Sa 17", "So 18"];

type Bar = { from: number; to: number; color: string; label: string; animate?: boolean; pending?: boolean };
const ROWS: { name: string; team: string; bar?: Bar }[] = [
  { name: "A. Becker", team: "Ambulant", bar: { from: 0, to: 2, color: "teal", label: "Urlaub" } },
  { name: "J. Yilmaz", team: "Ambulant" },
  { name: "M. Wolff", team: "Ambulant", bar: { from: 2, to: 4, color: "teal", label: "Urlaub", animate: true } },
  { name: "K. Haas", team: "Tagespflege", bar: { from: 3, to: 3, color: "blue", label: "Fortbildung" } },
  { name: "S. Krause", team: "Tagespflege", bar: { from: 4, to: 6, color: "teal", label: "Urlaub", pending: true } },
];

export function WeekBoardPreview() {
  return (
    <figure className="relative">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="font-display text-sm font-semibold">Kalender · KW 42</p>
          <span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] font-medium text-muted">Beispieldarstellung</span>
        </div>
        <div className="grid grid-cols-[6.5rem_repeat(7,minmax(0,1fr))] text-[11px] sm:grid-cols-[8rem_repeat(7,minmax(0,1fr))]">
          <div className="border-b border-line" />
          {DAYS.map((d, i) => (
            <div key={d} className={clsx("border-b border-l border-line py-1.5 text-center text-muted tabular", i > 4 && "bg-sunken")}>
              {d}
            </div>
          ))}
          {ROWS.map((r) => (
            <Row key={r.name} {...r} />
          ))}
        </div>
      </div>

      {/* Entscheidungskarte – zeigt denselben Antrag, der in der Tafel genehmigt wird */}
      <div className="wb-card absolute -bottom-10 left-3 w-[17.5rem] rounded-xl border border-line bg-surface p-4 shadow-card sm:left-auto sm:right-3 xl:-right-6">
        <p className="text-xs text-muted">Antrag von M. Wolff</p>
        <p className="mt-0.5 font-display font-semibold tabular">Mi 14. – Fr 16. Okt.</p>
        <p className="text-xs text-muted">Urlaub · 3 Arbeitstage · Rest danach 19</p>
        <div className="mt-3 flex items-center gap-2">
          <span className="wb-approve inline-flex h-7 items-center rounded-md bg-accent px-2.5 text-xs font-medium text-accent-fg">Genehmigen</span>
          <span className="inline-flex h-7 items-center rounded-md border border-line-strong px-2.5 text-xs text-muted">Ablehnen</span>
          <span className="wb-done ml-auto text-xs font-medium whitespace-nowrap text-accent-text">✓ Genehmigt</span>
        </div>
      </div>
      <figcaption className="sr-only">
        Beispieldarstellung des Abwesenheitskalenders mit fiktiven Namen: Ein beantragter Urlaub wird genehmigt.
      </figcaption>
      <style>{`
        @keyframes wb-settle { 0%, 55% { background-image: repeating-linear-gradient(-45deg, transparent 0 5px, color-mix(in srgb, currentColor 16%, transparent) 5px 7px); outline: 1.5px dashed color-mix(in srgb, currentColor 55%, transparent); outline-offset: -1.5px; } 60%, 100% { background-image: none; outline-color: transparent; } }
        @keyframes wb-press { 0%, 48% { transform: scale(1); } 52% { transform: scale(0.94); } 58%, 100% { transform: scale(1); opacity: 1; } }
        @keyframes wb-show { 0%, 58% { opacity: 0; transform: translateY(2px); } 66%, 100% { opacity: 1; transform: none; } }
        .wb-animate { animation: wb-settle 3.2s ease-out 0.4s both; }
        .wb-approve { animation: wb-press 3.2s ease-out 0.4s both; }
        .wb-done { animation: wb-show 3.2s ease-out 0.4s both; }
        @media (prefers-reduced-motion: reduce) { .wb-animate, .wb-approve, .wb-done { animation: none; } }
      `}</style>
    </figure>
  );
}

function Row({ name, team, bar }: { name: string; team: string; bar?: Bar }) {
  return (
    <>
      <div className="flex flex-col justify-center border-b border-line px-3 py-2 last:border-b-0">
        <span className="truncate font-medium text-fg">{name}</span>
        <span className="truncate text-subtle">{team}</span>
      </div>
      <div className="relative col-span-7 grid h-11 grid-cols-7 border-b border-line">
        {DAYS.map((d, i) => (
          <span key={d} className={clsx("border-l border-line", i > 4 && "bg-sunken")} />
        ))}
        {bar && (
          <span
            className={clsx(
              "absolute inset-y-2 flex items-center overflow-hidden rounded-md px-2 font-medium whitespace-nowrap",
              `abs-${bar.color}`,
              bar.pending && "abs-pending",
              bar.animate && "wb-animate",
            )}
            style={{ left: `calc(${(bar.from / 7) * 100}% + 3px)`, width: `calc(${((bar.to - bar.from + 1) / 7) * 100}% - 6px)` }}
          >
            {bar.label}
          </span>
        )}
      </div>
    </>
  );
}
