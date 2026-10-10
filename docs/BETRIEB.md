# Betrieb

## Umgebungsvariablen

Vollständige Liste mit Erläuterung: [.env.example](../.env.example). Pflicht im Betrieb:

| Variable | Hinweis |
| --- | --- |
| `DATABASE_URL` | Verbindung der **eingeschränkten** App-Rolle (kein SUPERUSER/BYPASSRLS). Bei Transaktions-Poolern funktioniert das, da der Kontext transaktionslokal gesetzt wird. |
| `DATABASE_OWNER_URL` | Nur für Migrationen (CI/Deployment-Schritt), nicht in der Laufzeitumgebung nötig |
| `DATABASE_APP_ROLE` | Name der App-Rolle, der `db:migrate` Rechte erteilt |
| `APP_URL` | Öffentliche Basis-URL für Links in E-Mails |
| `APP_SECRET` | ≥ 32 zufällige Zeichen (HMAC für Rate-Limit-Schlüssel) |
| `CRON_SECRET` | ≥ 32 Zeichen, schützt `/api/cron` |
| `TRUST_PROXY` | `true` hinter einem vertrauenswürdigen Proxy/Load Balancer, sonst teilen sich alle Clients ein IP-Rate-Limit |
| `SMTP_*` | Ohne SMTP werden **keine** E-Mails versendet; der Status wird als „nicht konfiguriert“ protokolliert und Einladungslinks werden einmalig in der Oberfläche angezeigt |
| `AUDIT_RETENTION_DAYS` | Standard 730, Minimum 90 |
| `CONTACT_RETENTION_DAYS`, `EMAIL_LOG_RETENTION_DAYS`, `NOTIFICATION_RETENTION_DAYS`, `INVITATION_RETENTION_DAYS` | Aufbewahrungsfristen, siehe [DATENSCHUTZ.md](DATENSCHUTZ.md#aufbewahrung-und-löschung) |

## Datenbank einrichten (Produktiv)

```sql
-- als Owner/Admin der Datenbank
CREATE ROLE pflegewerk_app LOGIN PASSWORD '<sicher>' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
```

Danach `npm run db:migrate` mit `DATABASE_OWNER_URL`. Das Skript erteilt der App-Rolle nur DML-Rechte, entzieht UPDATE/DELETE auf Protokolltabellen und warnt, falls die Rolle RLS umgehen könnte. Migrationen sind additiv; bestehende Daten bleiben erhalten.

## Geplante Aufgaben

`GET /api/cron` mit `Authorization: Bearer $CRON_SECRET`, empfohlen stündlich (z. B. Vercel Cron, GitHub Actions, systemd-Timer). Versendet Erinnerungen (max. eine pro Antrag und Tag), wendet die Aufbewahrungsfristen an, entfernt abgelaufene Sitzungen/Tokens/Rate-Limits und löscht Audit-Einträge nach Ablauf der Frist.

`GET /api/health` prüft die Datenbankverbindung.

## Produktiv-Checkliste (fehlende externe Konfiguration)

- [ ] Hosting (Node.js-Laufzeit) und verwaltete PostgreSQL-Instanz in der EU auswählen, Backups und Point-in-Time-Recovery aktivieren
- [ ] App-Rolle anlegen, Secrets im Hosting hinterlegen, `TRUST_PROXY` passend setzen
- [ ] SMTP-Anbieter (mit AV-Vertrag) einrichten, SPF/DKIM/DMARC für die Absenderdomain
- [ ] Cron-Aufruf einrichten
- [ ] Ersten Plattform-Admin per `npm run platform:create-admin` anlegen
- [ ] Impressum und Datenschutzhinweise mit Betreiberangaben vervollständigen und rechtlich prüfen lassen; bei Textänderung `privacyNoticeVersion` in [brand.ts](../src/config/brand.ts) erhöhen
- [ ] Produktname/Marke festlegen (`NEXT_PUBLIC_BRAND_NAME`), Domain, TLS
- [ ] Monitoring/Fehlertracking (ohne personenbezogene Daten in Logs) und Log-Aufbewahrung festlegen
- [ ] Penetrationstest bzw. Sicherheitsreview, AV-Vertrag mit Kunden, TOMs dokumentieren
