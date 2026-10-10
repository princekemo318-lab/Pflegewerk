"use client";

/** Letzte Rückfallebene, falls selbst das Root-Layout nicht gerendert werden kann. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="de">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "3rem 1rem", maxWidth: 480, margin: "0 auto", color: "#0f1f38" }}>
        <h1 style={{ fontSize: "1.5rem" }}>Ein Fehler ist aufgetreten</h1>
        <p>Die Anwendung konnte nicht geladen werden. Bitte versuche es in einem Moment erneut.</p>
        <button type="button" onClick={() => reset()} style={{ marginTop: "1rem", padding: "0.5rem 1rem" }}>
          Erneut versuchen
        </button>
      </body>
    </html>
  );
}
