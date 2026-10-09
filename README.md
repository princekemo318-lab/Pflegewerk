# Pflegewerk

Multi-Tenant-SaaS für private Pflege- und Betreuungsunternehmen: **Mitarbeiterverwaltung, Urlaubsanträge, Genehmigungen und Abwesenheitskalender** – plus Plattform-Admin für den Betreiber und eine öffentliche Website mit Anfrageformular.

> Der Produktname ist ein Platzhalter und zentral über `NEXT_PUBLIC_BRAND_NAME` konfigurierbar ([src/config/brand.ts](src/config/brand.ts)). Vor kommerzieller Nutzung Marken- und Domainverfügbarkeit prüfen.

## Funktionsumfang (MVP)

| Bereich | Enthalten |
| --- | --- |
| Mitarbeiter | Urlaub/Abwesenheit beantragen mit Live-Berechnung der Arbeitstage, Status verfolgen, offene Anträge zurückziehen, Resturlaub sehen |
| Genehmigung | Zuständigkeit über Führungskraft → Teamleitung → Rolle mit „alle Anträge“, Genehmigen/Ablehnen (Ablehnung mit Begründung), Stornieren, Verlauf, Team-Überschneidungen |
| Kalender | Monats-/Wochenansicht, Filter Team/Standort, mobile Listenansicht, Gründe für Kollegen verborgen |
| Verwaltung | Mitarbeiter anlegen/einladen/deaktivieren, Teams, Standorte (Bundesland + regionale Feiertage), betriebliche Feiertage, Abwesenheitsarten, Arbeitszeitmodelle, Urlaubsansprüche, Rollen & Rechte |
| Dashboard | Aktive Mitarbeiter, offene Anträge, heute abwesend, Rückkehr, nächste 14 Tage, je Team, Einrichtungs-Checkliste |
| Benachrichtigungen | In-App (dedupliziert) + E-Mail via SMTP, Erinnerungen an offene Anträge (Cron) |
| Protokoll | Unveränderliches Audit-Log (DB-Trigger + entzogene Rechte), Aufbewahrungsfrist |
| Plattform-Admin | Kennzahlen aus echten Daten, Unternehmen anlegen/sperren/freischalten, Admins zuweisen/einladen, Anfragen mit Status, Zuständigkeit, Kontaktverlauf, Löschung |
| Website | Landingpage, Funktionen, Zielgruppe, Ablauf, Sicherheit, FAQ, Anfrageformular mit Spam-Schutz |

Bewusst **nicht** enthalten: Billing/Checkout/Preise, Dienstplanung, Lohnabrechnung, Pflegedokumentation, Patientendaten.

## Schnellstart (lokal)

Voraussetzungen: Node.js 24, Docker.

```bash
npm install
cp .env.example .env.local   # APP_SECRET und CRON_SECRET setzen (siehe Kommentare)
npm run db:up                # PostgreSQL 17 auf Port 5434
npm run db:migrate           # Schema, RLS-Policies, Rechte der App-Rolle
npm run db:seed-demo         # optional: klar gekennzeichnetes Demo-Unternehmen
npm run dev                  # http://localhost:3000
```

Demo-Zugänge (nur lokal, angelegt durch `db:seed-demo`, Passwort steht in [scripts/seed-demo.ts](scripts/seed-demo.ts)):
`geschaeftsfuehrung@`, `jonas@` (PDL), `aylin@` (Personalverwaltung), `marta@` (Teamleitung), `felix@` (Mitarbeiter), `plattform@` (Plattform-Admin) – jeweils `…@demo.pflegewerk.test`.

Ersten echten Plattform-Admin anlegen:

```bash
npm run platform:create-admin -- --email admin@example.com --name "Vorname Nachname"
```

## Skripte

| Befehl | Zweck |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` / `lint` | TypeScript / ESLint |
| `npm test` | Unit- und Integrationstests (Testdatenbank wird bei jedem Lauf neu aufgebaut) |
| `npm run test:e2e` | Browser-Tests mit Playwright gegen einen Produktionsbuild (nutzt installiertes Google Chrome, Datenbank `pflegewerk_e2e`) |
| `npm run db:generate` | Neue Migration aus [schema.ts](src/server/db/schema.ts) erzeugen |
| `npm run db:migrate` | Migrationen + Rechtevergabe an die App-Rolle |

## Dokumentation

- [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md) – Stack, Mandantentrennung, Schichten, Datenmodell
- [docs/SICHERHEIT.md](docs/SICHERHEIT.md) – Schutzmaßnahmen und Sicherheitstests
- [docs/URLAUBSBERECHNUNG.md](docs/URLAUBSBERECHNUNG.md) – Regeln und nicht unterstützte Sonderfälle
- [docs/BETRIEB.md](docs/BETRIEB.md) – Umgebungsvariablen, Produktivbetrieb, Cron, E-Mail
- [docs/DATENSCHUTZ.md](docs/DATENSCHUTZ.md) – Datenschutzkonzept (Entwurf), Fristen, Betroffenenrechte
- [docs/PRUEFBERICHT.md](docs/PRUEFBERICHT.md) – Prüfung Produktionsreife, Datenschutz, E2E-Tests
- [docs/PHASENBERICHT.md](docs/PHASENBERICHT.md) – Umsetzungsstand je Phase und offene Punkte
