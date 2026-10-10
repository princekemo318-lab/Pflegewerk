/**
 * Großer Satz, dessen Wörter beim Scrollen nacheinander aufleuchten.
 * Reines CSS über eine benannte View-Timeline; ohne Unterstützung voll sichtbar.
 */
export function LitStatement({ text, accentFrom }: { text: string; accentFrom: number }) {
  const words = text.split(" ");
  const span = 46; // Prozent des Scrollbereichs, über den das Aufleuchten verteilt wird
  return (
    <p className="lit-statement mx-auto max-w-4xl text-center font-display text-[1.9rem] leading-[1.15] font-semibold tracking-[-0.025em] text-balance sm:text-5xl">
      {words.map((w, i) => {
        const start = 8 + (i / words.length) * span;
        return (
          <span key={i}>
            <span
              className={`lit-word ${i >= accentFrom ? "lit-accent" : ""}`}
              style={{ ["--s" as string]: `${start.toFixed(1)}%`, ["--e" as string]: `${(start + 7).toFixed(1)}%` }}
            >
              {w}
            </span>{" "}
          </span>
        );
      })}
    </p>
  );
}
