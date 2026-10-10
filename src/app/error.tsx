"use client";

import Link from "next/link";
import { Button, Notice, buttonClasses } from "@/components/ui/primitives";

/** Fehlerseite für Website, Anmeldung und Plattform-Admin. Zeigt keine technischen Details. */
export default function RootError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <Notice tone="danger" title="Diese Seite konnte nicht geladen werden">
        Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es in einem Moment erneut.
      </Notice>
      <div className="mt-4 flex gap-2">
        <Button variant="secondary" onClick={() => reset()}>
          Erneut versuchen
        </Button>
        <Link href="/" className={buttonClasses("ghost")}>
          Zur Startseite
        </Link>
      </div>
    </main>
  );
}
