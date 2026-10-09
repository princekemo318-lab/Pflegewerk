# Datenschutzkonzept (Entwurf)

> **Kein Rechtsrat.** Diese Unterlage beschreibt, was die Software technisch tut, und soll Verantwortlichen und Datenschutzbeauftragten die Prüfung erleichtern. Ob die Verarbeitung im konkreten Unternehmen DSGVO-konform ist, hängt von Vertrag, Konfiguration und Organisation ab und muss fachlich/rechtlich geprüft werden.

## Rollenverteilung

| Rolle | Wer | Folge |
| --- | --- | --- |
| Verantwortlicher (Art. 4 Nr. 7) | das jeweilige Pflegeunternehmen für die Daten seiner Mitarbeitenden | legt Zwecke, Rechtsgrundlagen, Fristen fest; informiert Mitarbeitende (Art. 13) |
| Auftragsverarbeiter (Art. 28) | Plattformbetreiber | AV-Vertrag mit jedem Kunden, TOMs, Liste der Unterauftragsverarbeiter (Hosting, Datenbank, E-Mail) |
| Verantwortlicher | Plattformbetreiber für Website-Anfragen und Plattform-Admin-Konten | eigene Datenschutzhinweise ([/datenschutz](../src/app/(marketing)/datenschutz/page.tsx)) |

**Betriebsrat:** Die Software erfasst Abwesenheiten und Anmeldezeitpunkte und kann damit zur Verhaltens- oder Leistungskontrolle geeignet sein. Vor Einführung sollte die Mitbestimmung (insb. § 87 Abs. 1 Nr. 6 BetrVG) geprüft werden.

## Datenkategorien und Zweck

| Daten | Tabelle(n) | Zweck | Sichtbar für |
| --- | --- | --- | --- |
| Konto: Name, E-Mail, Passwort-Hash, letzter Login | `users`, `sessions` | Anmeldung | Person selbst; Name/E-Mail für Kolleg:innen mit Mitarbeiterrecht |
| Mitarbeiterprofil: Name, E-Mail, Personalnr., Funktion, Team, Standort, Führungskraft, Ein-/Austritt | `employees` | Personalverwaltung | Rollen mit `employees.view/manage`, zuständige Führungskraft |
| Arbeitszeitmodell, Urlaubsanspruch | `work_schedules`, `leave_entitlements` | korrekte Urlaubsberechnung | Person, Verwaltung, Zuständige |
| Abwesenheiten mit Art, Zeitraum, Notizen, Verlauf | `leave_requests`, `leave_request_days`, `leave_request_events` | Antrag, Genehmigung, Planung | siehe unten |
| **Gesundheitsbezogene Abwesenheit** (Art. 9) | Abwesenheitsart mit `is_sensitive` (Standard: „Arbeitsunfähigkeit“) | Dokumentation durch Personalverwaltung | **nur** Person selbst und Rollen mit `leave.view_all`/`leave.manage`; Teamleitungen und Kolleg:innen sehen „Abwesend“ |
| Benachrichtigungen | `notifications` | Information über Vorgänge | Empfänger:in |
| Audit-Protokoll: Aktion, pseudonyme IDs, Feldnamen | `audit_logs` | Nachvollziehbarkeit, Sicherheit | Rollen mit `audit.view` |
| E-Mail-Versandprotokoll: Empfänger, Betreff, Status (kein Inhalt) | `email_deliveries` | Fehlersuche Zustellung | Plattform-Admins |
| Website-Anfragen | `contact_requests`, `contact_request_notes` | Vertriebsanfrage bearbeiten | Plattform-Admins |
| IP-Adressen | nur als HMAC in `rate_limits`, max. 1 Tag | Missbrauchsschutz | niemand (pseudonym) |

Diagnosen werden nicht erfasst – nur Art und Zeitraum einer Abwesenheit. Patientendaten werden nicht verarbeitet.

## Aufbewahrung und Löschung

Automatisch per `/api/cron` (Werte in Tagen, konfigurierbar, **vom Verantwortlichen festzulegen**):

| Daten | Variable | Standard | Bezug |
| --- | --- | --- | --- |
| Audit-Protokoll | `AUDIT_RETENTION_DAYS` | 730 (min. 90) | ab Eintrag |
| Website-Anfragen inkl. Verlauf | `CONTACT_RETENTION_DAYS` | 365 | ab letzter Bearbeitung |
| E-Mail-Versandprotokoll | `EMAIL_LOG_RETENTION_DAYS` | 90 | ab Versand |
| Benachrichtigungen | `NOTIFICATION_RETENTION_DAYS` | 365 | ab Erstellung |
| Erledigte Einladungen | `INVITATION_RETENTION_DAYS` | 30 | ab Annahme/Widerruf/Ablauf |
| Sitzungen, Reset-Tokens, Rate-Limits | – | bei Ablauf bzw. 1 Tag | – |

Manuell:

- **Mitarbeiter endgültig löschen** (Profil → „Beschäftigung & Datenschutz“): nur für ausgeschiedene Personen. Löscht Profil, Zugang, Anträge inkl. Verlauf, Ansprüche, Arbeitszeitmodelle, Einladungen, Benachrichtigungen und das Nutzerkonto, sofern es keinem anderen Unternehmen angehört. Im Audit-Log bleibt die pseudonyme ID mit dem Vermerk der Löschung. **Vorher gesetzliche Aufbewahrungspflichten prüfen** (z. B. arbeits-, steuer- oder sozialversicherungsrechtliche Nachweise) – die Software kennt diese nicht.
- **Anfragen löschen** im Plattform-Admin.
- Bestandsdaten vor Version mit DSGVO-Migration: Audit-Einträge zu erfassten Abwesenheiten können noch den Namen der Abwesenheitsart enthalten; sie laufen mit der Aufbewahrungsfrist aus (Audit-Logs sind bewusst unveränderlich).

**Offen / Entscheidung des Verantwortlichen:** automatische Löschung ausgeschiedener Mitarbeiter nach Frist (derzeit manuell), Löschkonzept für Backups beim Hosting-Anbieter.

## Betroffenenrechte

| Recht | Umsetzung |
| --- | --- |
| Auskunft / Datenübertragbarkeit (Art. 15, 20) | Profil → „Daten herunterladen“ (JSON); Personalverwaltung kann für Auskunftsersuchen pro Person exportieren. Exporte werden protokolliert. |
| Berichtigung (Art. 16) | Name selbst im Profil; übrige Stammdaten durch Personalverwaltung |
| Löschung (Art. 17) | endgültige Löschung (s. o.); Anfragen im Plattform-Admin |
| Einschränkung / Widerspruch | organisatorisch über den Verantwortlichen; Zugang kann deaktiviert werden, ohne Daten zu löschen |

## Einladungen

Einladungslinks enthalten ein zufälliges Token (nur gehasht gespeichert), sind 7 Tage gültig und einmalig nutzbar. Ohne konfiguriertes SMTP wird der Link einmalig der einladenden Person angezeigt und **nicht** gespeichert. Erledigte Einladungen werden nach Frist gelöscht.

## Technische und organisatorische Maßnahmen (Auszug)

Siehe [SICHERHEIT.md](SICHERHEIT.md): Mandantentrennung mit Row-Level Security, Argon2id, serverseitige Sitzungen mit `__Host-`-Cookie, Rechteprüfung pro Aktion, unveränderliches Audit-Log, keine Fremdskripte/-schriften, keine personenbezogenen Daten in Fehlerprotokollen, Security-Header. Noch durch den Betreiber festzulegen: Hosting in der EU, Verschlüsselung at rest beim Anbieter, Backup- und Wiederherstellungskonzept, Zugriffsregelung für Plattform-Admins, Incident-Prozess (Art. 33/34).

## Vor Produktivbetrieb erforderlich

- [ ] AV-Vertrag (Art. 28) und TOM-Dokumentation für Kunden
- [ ] Verzeichnis von Verarbeitungstätigkeiten (Betreiber und Kunden)
- [ ] Prüfung, ob eine Datenschutz-Folgenabschätzung (Art. 35) nötig ist – naheliegend wegen Gesundheitsdaten von Beschäftigten
- [ ] Rechtsgrundlagen durch Verantwortliche festlegen (Beschäftigtendaten, Art. 9 Abs. 2 lit. b für Arbeitsunfähigkeit)
- [ ] Datenschutzinformationen für Mitarbeitende (Art. 13) durch Kunden
- [ ] Impressum/Datenschutzhinweise der Website vervollständigen
- [ ] Fristen in der Konfiguration bewusst festlegen
