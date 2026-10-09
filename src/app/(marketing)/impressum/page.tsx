import type { Metadata } from "next";
import { Notice } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Impressum", robots: { index: false } };

export default function ImprintPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-title font-semibold">Impressum</h1>
      <Notice tone="warn" className="mt-6" title="Vom Betreiber vor Veröffentlichung zu ergänzen">
        Die Pflichtangaben nach § 5 DDG (Name bzw. Firma, Anschrift, Vertretungsberechtigte, Kontakt, Registereintrag,
        Umsatzsteuer-ID, ggf. Aufsichtsbehörde) hängen vom tatsächlichen Betreiber ab und sind hier bewusst nicht vorausgefüllt.
        Die Inhalte sollten rechtlich geprüft werden.
      </Notice>
    </main>
  );
}
