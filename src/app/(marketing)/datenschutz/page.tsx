import type { Metadata } from "next";
import { Notice } from "@/components/ui/primitives";
import { brand } from "@/config/brand";

export const metadata: Metadata = { title: "Datenschutzhinweise" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-title font-semibold">Datenschutzhinweise</h1>
      <p className="mt-2 text-sm text-muted">Fassung {brand.privacyNoticeVersion}</p>
      <Notice tone="warn" className="mt-6" title="Entwurf – vom Betreiber zu vervollständigen und rechtlich zu prüfen">
        Verantwortliche Stelle, Kontaktdaten, ggf. Datenschutzbeauftragte, Hosting-Dienstleister und Rechtsgrundlagen hängen vom
        tatsächlichen Betrieb ab und sind hier nicht vorausgefüllt. Die folgenden Abschnitte beschreiben, welche Daten die Software
        technisch verarbeitet.
      </Notice>

      <div className="mt-10 space-y-8 text-[0.95rem] leading-relaxed [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_p]:text-muted [&_li]:text-muted">
        <section>
          <h2>Verantwortliche Stelle</h2>
          <p>[Name, Anschrift und Kontakt des Betreibers – vom Betreiber einzutragen]</p>
        </section>

        <section>
          <h2>Anfrageformular auf dieser Website</h2>
          <p>Wenn du eine Demo anfragst, speichern wir folgende Angaben:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Name, geschäftliche E-Mail-Adresse und Unternehmen (Pflichtangaben)</li>
            <li>optional: Mitarbeiter- und Standortanzahl als Größenbereich, gewünschte Funktionen, Freitext</li>
            <li>Zeitpunkt und Fassung der bestätigten Datenschutzhinweise</li>
          </ul>
          <p className="mt-2">
            Zweck ist ausschließlich die Bearbeitung deiner Anfrage und die Kontaktaufnahme. Die Daten sind nur für berechtigte
            Mitarbeitende des Betreibers zugänglich. Zum Schutz vor Missbrauch wird deine IP-Adresse kurzfristig in pseudonymisierter Form
            (als Hash) für eine Begrenzung der Anfragen pro Stunde verwendet; sie wird nicht mit der Anfrage gespeichert. Auf Wunsch
            löschen wir deine Anfrage vollständig.
          </p>
          <p className="mt-2">[Rechtsgrundlage, Speicherdauer und Empfänger – vom Betreiber zu ergänzen]</p>
        </section>

        <section>
          <h2>Nutzung der Plattform</h2>
          <p>
            Innerhalb der Plattform verarbeitet das jeweilige Unternehmen als Arbeitgeber Daten seiner Mitarbeitenden: Name, dienstliche
            E-Mail-Adresse, Team, Standort, Funktion, Arbeitszeitmodell, Urlaubsansprüche sowie Anträge und Abwesenheiten mit Verlauf.
            Patientendaten werden nicht verarbeitet. Abwesenheitsgründe sind für Kolleginnen und Kollegen nicht sichtbar.
          </p>
          <p className="mt-2">
            Sicherheitsrelevante Änderungen werden in einem Protokoll festgehalten, das nur berechtigte Personen einsehen können und das
            nach Ablauf der eingestellten Aufbewahrungsfrist automatisch gelöscht wird.
          </p>
        </section>

        <section>
          <h2>Cookies und lokale Speicherung</h2>
          <p>
            Es wird ausschließlich ein technisch notwendiges Sitzungs-Cookie für die Anmeldung gesetzt sowie kurzzeitig ein Cookie für
            Bestätigungsmeldungen. Die Wahl zwischen hellem und dunklem Erscheinungsbild wird im Browser (localStorage) gespeichert. Es
            werden keine Analyse- oder Werbe-Cookies und keine externen Schriften oder Skripte von Drittanbietern geladen.
          </p>
        </section>

        <section>
          <h2>Deine Rechte</h2>
          <p>
            Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch
            sowie das Recht auf Beschwerde bei einer Aufsichtsbehörde. [Kontaktweg – vom Betreiber zu ergänzen]
          </p>
        </section>
      </div>
    </main>
  );
}
