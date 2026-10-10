# Phasenbericht

Stand: 09.10.2026. Ausgangslage: Repository enthielt nur eine `README.md` (ein Commit) – neues Projekt.

## Phase A – Analyse & Architektur ✅
Stack-Entscheidung und Begründung: [ARCHITEKTUR.md](ARCHITEKTUR.md).

## Phase B – Datenmodell, Auth, Mandantentrennung ✅
- Schema ([schema.ts](../src/server/db/schema.ts)), Migrationen `0000_init`, `0001_rls` (RLS FORCE, Policies, Composite-FKs, Append-only-Trigger, Purge-Funktion)
- Sitzungen, Argon2id, Rate Limiting, Passwort-Reset, Einladungen, Mandantenkontext, Rechte/Rollen

## Phase C – Mitarbeiter & Urlaubsanträge ✅
- Mitarbeiter anlegen/bearbeiten/einladen/deaktivieren, Arbeitszeitmodelle, Ansprüche
- Anträge mit Live-Vorschau, Feiertage aller Bundesländer, Saldo, Überschneidungsschutz

## Phase D – Genehmigung, Kalender, Benachrichtigungen ✅
- Zuständigkeitslogik, Genehmigen/Ablehnen/Stornieren/Zurückziehen, Verlauf
- Kalender Monat/Woche mit Filtern und datensparsamer Sichtbarkeit
- In-App-Benachrichtigungen, E-Mail-Schnittstelle (SMTP), Erinnerungen per Cron

## Phase E – Dashboard & Plattform-Admin ✅
- Unternehmensdashboard und persönliche Übersicht aus echten Daten
- Plattform-Admin: Kennzahlen, Unternehmen, Sperren/Freischalten, Admins, Anfragen, Protokoll

## Phase F – Website, Anfrageprozess, UI ✅
- Landingpage mit allen geforderten Abschnitten, Anfrageformular mit Spam-Schutz und Rate Limit
- Designsystem (Tokens, Light/Dark, Komponenten, Skeletons, Leerzustände, Toasts, Bestätigungsdialoge)
- Impressum/Datenschutz als klar markierte Entwürfe (Betreiberangaben fehlen bewusst)

## Phase G – Qualität ✅ (mit offenen Punkten unten)
Tatsächlich ausgeführt am 09.10.2026:

| Prüfung | Ergebnis |
| --- | --- |
| `npm run typecheck` | ohne Fehler |
| `npm run lint` | ohne Fehler/Warnungen |
| `npm test` | 6 Testdateien, 98 Tests bestanden (Unit + Integration gegen PostgreSQL 17) |
| `next build` | erfolgreich; Marketingseiten statisch, App dynamisch |
| Manuell im Browser | Login, Dashboard, Antrag mit Vorschau einreichen, Kalender, Admin-Seiten, Anfrageformular; Startseite mobil (375 px) und Light/Dark |

## Offene Punkte / bewusst nicht umgesetzt

- **Mehrstufige Genehmigungen** (z. B. Teamleitung → Personalverwaltung): Datenmodell erlaubt Erweiterung über `leave_request_events`; aktuell einstufig.
- **Halbe Tage, Schichtpläne, Stundenkonten, automatische Anteils-/Verfallsberechnung** – siehe [URLAUBSBERECHNUNG.md](URLAUBSBERECHNUNG.md).
- ~~E2E-Browsertests~~ – ergänzt (Playwright, 19 Tests), siehe [PRUEFBERICHT.md](PRUEFBERICHT.md).
- **E-Mail-Präferenzen** pro Nutzer, E-Mail-Wiederholversuche bei Fehlern (aktuell: Versuch + Protokoll).
- Datenexport und endgültige Löschung ausgeschiedener Mitarbeiter ergänzt; automatische Löschung nach Frist und Backup-Löschkonzept sind noch festzulegen ([DATENSCHUTZ.md](DATENSCHUTZ.md)).
- **CAPTCHA** für das Anfrageformular (optional, nach Datenschutzprüfung).
- Lasttests mit großen Datenmengen (Listen sind paginiert, Kalender auf 500 Mitarbeiter je Ansicht begrenzt).

## Fehlende externe Konfiguration für den Produktivbetrieb
Siehe Checkliste in [BETRIEB.md](BETRIEB.md#produktiv-checkliste-fehlende-externe-konfiguration).
