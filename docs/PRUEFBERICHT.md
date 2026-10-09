# Prüfbericht: Produktionsreife, Datenschutz, E2E-Tests

Stand: 09.10.2026. Ergebnis einer gezielten Prüfung nach dem ersten Umsetzungsstand. **Lokal geprüft – nicht produktiv erprobt.** Hosting, SMTP, Domain, Betreiberangaben und ein unabhängiges Sicherheitsreview stehen aus.

## 1. Produktionsreife

| Bereich | Befund | Maßnahme |
| --- | --- | --- |
| Fehlerprotokoll | Unerwartete Fehler wurden vollständig geloggt; Datenbankfehler enthalten Abfrageparameter (z. B. E-Mail, Passwort-Hash) | `logError()` protokolliert nur Typ, Postgres-Code, Constraint und Meldung ohne Parameter ([log.ts](../src/server/log.ts)); Test vorhanden |
| Rechteprüfung | Mehrere Lesefunktionen (Organisation, Rollen, Einstellungen, Formularoptionen) prüften Rechte nur auf Seitenebene | Prüfung direkt in den Services ergänzt; Test vorhanden |
| Nebenläufigkeit Rollen | Zwei Inhaber konnten sich gleichzeitig gegenseitig herabstufen → kein Inhaber | Advisory Lock pro Unternehmen für Rollen-/Zugangsänderungen; Test mit parallelen Requests |
| Nebenläufigkeit Salden | Parallele Genehmigungen zweier Anträge konnten das Konto überziehen | einheitliche Sperrreihenfolge Mitarbeiter → Antrag; Test |
| Einladungen | parallele Annahme konnte mit 500 (Unique-Verletzung) enden | sauberer Konflikt-Fehler; Test |
| Kontoaufzählung | Antwortzeit beim Passwort-Reset unterschied sich durch synchronen E-Mail-Versand | Versand nach der Antwort (`after`) |
| Session-Cookie | ohne Präfix | in Produktion `__Host-pw_session` (nur HTTPS, keine Subdomains) |
| Ungültige IDs | Nicht-UUIDs in URLs erzeugten Datenbankfehler | zentrale ID-Prüfung → „nicht gefunden“; Test |
| Migrationen | keine Sperre gegen parallele Läufe | Advisory Lock im Migrationsskript; Migrationen sind additiv und wurden auf der bestehenden Entwicklungsdatenbank ohne Datenverlust und wiederholt ausgeführt |
| Fehlerseiten | nur für den App-Bereich | `error.tsx` und `global-error.tsx` für alle Bereiche |
| Sitzungsprüfung | `Date.now()` beim Vorab-Rendern (Next.js-Warnung) | Sitzung explizit zur Request-Zeit (`connection()`) |
| **Gefunden durch E2E** | Erfolgsmeldungen nach Weiterleitungen doppelt URL-kodiert („Antrag%20eingereicht“) | Kodierung korrigiert |
| **Gefunden durch E2E** | Bestätigung fehlte, wenn die Aktion ihr eigenes Bedienelement entfernt (Stornieren, Zurückziehen) | Meldung wird direkt nach der Server-Antwort angezeigt |

Unverändert gut bewertet: Row-Level Security mit eingeschränkter DB-Rolle, gehashte Tokens, bedingte Statuswechsel gegen Doppelentscheidungen, DB-Unique-Index gegen Doppelbuchungen, CSRF-Schutz über Server Actions.

**Verbleibende Risiken:** kein Lasttest; E-Mail-Versand ohne Wiederholversuche (Fehler werden protokolliert und im Admin angezeigt); Rate Limiting hinter Proxy erfordert korrektes `TRUST_PROXY`; keine Mehr-Faktor-Anmeldung; keine automatische Erkennung kompromittierter Passwörter.

## 2. Datenschutz

Details: [DATENSCHUTZ.md](DATENSCHUTZ.md). Umgesetzt in dieser Runde:

- **Gesundheitsdaten:** Abwesenheitsarten mit Kennzeichen „sensibel“ (Standard: Arbeitsunfähigkeit). Art nur für Betroffene und Personalverwaltung sichtbar – in Kalender, Antragsdetail, Mitarbeiterprofil und Entscheidungsverlauf. Sensible Arten können nur von der Verwaltung erfasst werden (DB-Constraint).
- **Audit-Log** speichert keine Abwesenheitsart mehr.
- **Aufbewahrungsfristen** für Anfragen, E-Mail-Protokoll, Benachrichtigungen, erledigte Einladungen (konfigurierbar, per Cron).
- **Endgültige Löschung** ausgeschiedener Mitarbeiter inkl. verwaister Konten.
- **Datenexport** (Art. 15/20) für Betroffene und für die Personalverwaltung, protokolliert.

Nicht durch Software lösbar und weiterhin offen: AV-Verträge, Verarbeitungsverzeichnis, ggf. DSFA, Betriebsrat, Rechtsgrundlagen, Fristen-Festlegung, Betreiberangaben.

## 3. Tests (tatsächlich ausgeführt)

| Suite | Ergebnis |
| --- | --- |
| Unit + Integration (Vitest, PostgreSQL 17) | 8 Dateien, 112 Tests bestanden |
| End-to-End (Playwright, Google Chrome, gegen Produktionsbuild) | 19 Tests bestanden (Desktop + Mobil) |
| Typecheck, Lint, Produktionsbuild | ohne Fehler |

E2E-Abdeckung: Antrag → Genehmigung → Benachrichtigung; Ablehnung mit Pflichtbegründung; Stornierung durch Personalverwaltung inkl. Freigabe der Tage; Zurückziehen; Überschneidungsschutz; Mandantentrennung (fremder Antrag per URL, fremde Mitarbeiter/Kalender); Berechtigungen (Verwaltung, Rollen, Plattform-Admin); Login-Fehler; Gesundheitsdaten-Maskierung; Datenexport; Anfrageformular; Security-Header; mobile Darstellung ohne horizontales Scrollen.

```bash
npm test          # Unit + Integration
npm run test:e2e  # Browser-Tests (baut die App, nutzt Datenbank pflegewerk_e2e)
```
