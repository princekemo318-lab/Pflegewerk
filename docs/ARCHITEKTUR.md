# Architektur

## Stack und Begründung

| Baustein | Wahl | Warum |
| --- | --- | --- |
| Framework | Next.js 16.4 (App Router, Server Components, Server Actions, Cache Components) | Ein TypeScript-Codebase für Website, App und Admin; serverseitige Autorisierung nah an den Daten; statische Marketingseiten |
| Datenbank | PostgreSQL 17 | Relationale Integrität, Transaktionen, **Row-Level Security** für Mandantentrennung |
| ORM | Drizzle ORM + postgres.js | SQL-nah, typisiert, schlanke Migrationen; RLS per eigener SQL-Migration |
| Auth | Eigene Sitzungen nach etabliertem Muster (zufälliges Token im Cookie, SHA-256-Hash in DB) + Argon2id (`@node-rs/argon2`) | Volle Kontrolle über Einladungs-only-Registrierung, Mandantenwechsel und Sitzungswiderruf; keine selbst erfundene Kryptografie |
| Validierung | Zod 4 | Alle Eingaben werden serverseitig validiert |
| UI | Tailwind CSS 4, eigene Komponenten, lucide-react | Design-Tokens als CSS-Variablen, Light/Dark ohne Doppelpflege, minimales Client-JS |
| Tests | Vitest gegen echte Postgres-Testdatenbank | Sicherheitstests prüfen RLS wirklich, nicht gemockt |

## Schichten

```
src/app/…                 Seiten (Server Components) + Server Actions (dünn: parsen → Service → revalidate)
src/components/…          UI (Client-Komponenten nur wo Interaktion nötig)
src/server/auth/…         Sitzungen, Passwörter, Rate Limiting, Next.js-Glue (Cookies/Redirects)
src/server/authz.ts       Mandantenkontext + Berechtigungsprüfung
src/server/services/…     Fachlogik inkl. Autorisierung – frei von Next.js-APIs, direkt testbar
src/server/db/…           Schema, Client, withTenant/withSystem
src/lib/…                 Reine Funktionen (Datum, Feiertage, Urlaubsberechnung, Rechte) – auch im Client nutzbar
drizzle/                  Migrationen (0001_rls.sql: Policies, Trigger, Composite-FKs)
```

## Mandantentrennung (Defense in Depth)

1. **Kontext pro Request:** `requireTenant()` liest die Sitzung, prüft die *aktive* Mitgliedschaft im *aktiven* Unternehmen und baut den `TenantContext` (inkl. Rechte). IDs aus dem Frontend gelten nie als Beleg.
2. **Explizite Filter:** Jede Abfrage filtert zusätzlich auf `company_id = ctx.companyId`.
3. **Row-Level Security (FORCE):** `withTenant` setzt `app.company_id`/`app.user_id` transaktionslokal; Policies lassen nur passende Zeilen zu. Ohne Kontext liefern Mandantentabellen **keine** Zeilen („fail closed“). Mandantenübergreifende Vorgänge (Login, Plattform-Admin, Cron) laufen explizit über `withSystem`.
4. **Eingeschränkte DB-Rolle:** Die App verbindet sich als `pflegewerk_app` (kein SUPERUSER, kein BYPASSRLS). Migrationen laufen mit der Owner-Rolle. Der Plattform-Admin warnt, falls die Rolle RLS umgehen könnte.
5. **Zusammengesetzte Fremdschlüssel** `(company_id, x_id)` verhindern Verweise auf Datensätze fremder Unternehmen selbst bei Programmierfehlern.

## Rollen und Rechte

Feste Rechte ([src/lib/permissions.ts](../src/lib/permissions.ts)), frei kombinierbar zu Rollen je Unternehmen. Standardrollen: Geschäftsführung (Inhaber, alle Rechte), Pflegedienstleitung, Personalverwaltung, Teamleitung, Mitarbeiter. Schutz vor Rechteausweitung: keine Änderung der eigenen Rolle, nur Vergabe von Rollen ⊆ eigener Rechte, Inhaberrolle nur durch Inhaber, mindestens ein aktiver Inhaber.

**Zuständigkeit für Anträge:** direkte Führungskraft → Teamleitung (jeweils mit Recht `leave.approve_team`) → alle mit `leave.approve_all`. Niemand entscheidet eigene Anträge. Mehrstufige Genehmigungen sind bewusst noch nicht umgesetzt (siehe Phasenbericht).

## Datenmodell (Kurzfassung)

Plattform: `users`, `sessions`, `password_reset_tokens`, `rate_limits`, `platform_admins`, `contact_requests`, `contact_request_notes`, `email_deliveries`.
Mandant: `companies`, `locations`, `teams`, `roles`, `employees`, `memberships`, `invitations`, `work_schedules`, `company_holidays`, `leave_entitlements`, `absence_types`, `leave_requests`, `leave_request_days`, `leave_request_events`, `notifications`, `audit_logs`.

- *Mitarbeiterprofil* (`employees`) und *Zugang* (`memberships`) sind getrennt: Mitarbeiter können ohne Login verwaltet werden.
- *Abwesenheiten* sind `leave_requests` mit einer `absence_type` (Urlaub, Sonderurlaub, Fortbildung, Überstundenausgleich, Arbeitsunfähigkeit, eigene). Von der Verwaltung erfasste Abwesenheiten gelten sofort als genehmigt.
- *Genehmigungsentscheidungen* stehen im unveränderlichen Verlauf `leave_request_events`.
- `leave_request_days` speichert jeden gezählten Tag aktiver Anträge; ein eindeutiger Index `(employee_id, date)` verhindert Doppelbuchungen auch bei parallelen Requests.

## Next.js-spezifisch

- `cacheComponents` ist aktiv. App-/Admin-Layouts nutzen `instant = false` (blockierendes Server-Rendering pro Request). Mandantendaten werden **nicht** gecacht.
- Geschützte Seiten rufen `notFound()` auf; wegen Streaming kann der HTTP-Status dabei 200 sein, ausgeliefert wird aber nur die 404-Ansicht (mit `noindex`).
- `src/proxy.ts` verlängert nur das Cookie-Ablaufdatum, autorisiert nichts.
