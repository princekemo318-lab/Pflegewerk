# Sicherheit und Datenschutz

Diese Übersicht beschreibt umgesetzte Maßnahmen. Sie ist **keine** Zertifizierung oder Rechtskonformitätsaussage; eine unabhängige Prüfung (Penetrationstest, Datenschutz-Folgenabschätzung, AV-Verträge) steht vor Produktivbetrieb aus.

## Authentifizierung

- Keine offene Registrierung. Konten entstehen über Einladungen (Token 32 Byte, nur Hash gespeichert, 7 Tage, einmalig, beim Annehmen atomar verbraucht) oder per CLI für Plattform-Admins.
- Passwörter: Argon2id (m=19 MiB, t=2, p=1), Länge 10–128.
- Sitzungen: zufälliges Token im `httpOnly`/`SameSite=Lax`-Cookie, in Produktion als `__Host-pw_session` (`Secure`, ohne Domain), DB speichert nur SHA-256-Hash, 30 Tage gleitend, Widerruf bei Abmeldung, Passwortreset (alle) und Passwortänderung (andere Geräte).
- Brute-Force-Schutz: DB-basiertes Rate Limiting (5 Versuche/15 min pro Konto, 30 pro IP), Konstantzeit-Verhalten bei unbekannten E-Mails, einheitliche Fehlermeldung (keine Kontoaufzählung). IPs nur als HMAC.
- Passwort-Reset: 60 min gültig, einmalig, identische Antwort für existierende/unbekannte Adressen.
- Server Actions: Origin-Prüfung durch Next.js; Open-Redirect-Schutz beim `next`-Parameter.

## Autorisierung & Mandantentrennung

Siehe [ARCHITEKTUR.md](ARCHITEKTUR.md#mandantentrennung-defense-in-depth). Zusätzlich: Ungültige IDs werden wie unbekannte Datensätze behandelt; fremde oder nicht sichtbare Anträge liefern „nicht gefunden“ statt „verboten“, um Existenz nicht preiszugeben. Der Plattform-Admin-Bereich antwortet Nicht-Admins mit 404.

## Datensparsamkeit

- Keine Patientendaten. Keine Diagnosen – nur Art und Zeitraum einer Abwesenheit.
- Kalender: Kollegen sehen nur genehmigte Abwesenheiten als „Abwesend“ (Umfang konfigurierbar: keine/Team/Unternehmen); Art und offene Anträge nur für Zuständige und Verwaltung.
- Gesundheitsbezogene Abwesenheitsarten (`is_sensitive`) sind nur für Betroffene und die Personalverwaltung sichtbar, nicht für Teamleitungen.
- Audit-Metadaten enthalten Feldnamen statt Inhalte und keine Abwesenheitsart.
- Fehlerprotokolle enthalten keine Abfrageparameter (siehe `src/server/log.ts`).
- E-Mail-Protokoll speichert keinen Nachrichtentext (Links mit Tokens!).
- Anfragen können endgültig gelöscht werden; protokolliert wird nur die Löschung.

## Integrität

- Audit-Logs und Antragsverlauf: App-Rolle hat kein UPDATE/DELETE; Trigger blockieren Änderungen auch für Owner. Löschung nur über `app.purge_audit_logs(tage)` (≥ 90 Tage, Standard 730) im Cron.
- Doppelte Übermittlungen: Buttons während der Übermittlung gesperrt; serverseitig Zeilensperren, bedingte Statuswechsel und eindeutige Indizes; Benachrichtigungen mit Dedupe-Schlüssel.
- Security-Header: CSP (keine Fremdquellen), `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy. Token-Seiten mit `referrer: no-referrer`.

## Spam-Schutz Anfrageformular

Honeypot-Feld, Mindestausfüllzeit (3 s), 5 Anfragen/Stunde pro IP, serverseitige Validierung. Für stärkeren Schutz kann später ein CAPTCHA-Dienst ergänzt werden (bewusst nicht ohne Datenschutzprüfung eingebunden).

## Automatisierte Sicherheitstests

[tests/integration/tenant-isolation.test.ts](../tests/integration/tenant-isolation.test.ts), [auth-and-roles.test.ts](../tests/integration/auth-and-roles.test.ts), [leave-workflow.test.ts](../tests/integration/leave-workflow.test.ts):

- App-Rolle ohne SUPERUSER/BYPASSRLS; ohne Kontext keine Daten; fremde Zeilen weder lesbar noch schreibbar; Composite-FKs greifen; Audit-Log unveränderlich
- Manipulierte Ressourcen-IDs (fremde Anträge, Mitarbeiter, Rollen, Teams, Abwesenheitsarten; Nicht-UUIDs)
- Unberechtigte Genehmigungen (Kollegen, fremdes Team, eigener Antrag, Doppelentscheidung parallel)
- Rechteausweitung (eigene Rolle, Inhaberrolle, Rollen mit Mehrrechten, letzter Inhaber)
- Gesperrte Unternehmen, deaktivierte Zugänge, Nicht-Admin-Zugriff auf Plattformfunktionen
- Sensible Abwesenheitsinformationen (maskierter Kalender, kein Detailzugriff per ID)
- Brute-Force-Limit, Einmal-Tokens, Sitzungswiderruf
