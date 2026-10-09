"use client";

import { Button, Notice } from "@/components/ui/primitives";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-16">
      <Notice tone="danger" title="Diese Seite konnte nicht geladen werden">
        Ein unerwarteter Fehler ist aufgetreten. Deine Daten sind davon nicht betroffen.
      </Notice>
      <Button variant="secondary" className="mt-4" onClick={() => reset()}>
        Erneut versuchen
      </Button>
    </div>
  );
}
