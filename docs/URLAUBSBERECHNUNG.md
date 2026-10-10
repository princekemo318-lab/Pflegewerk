# Urlaubsberechnung

Implementierung: [src/lib/leave-calc.ts](../src/lib/leave-calc.ts), [src/lib/holidays.ts](../src/lib/holidays.ts); Tests: [tests/unit](../tests/unit).

## Regeln

Ein Kalendertag im Antragszeitraum zählt als **1 Urlaubstag**, wenn

1. er nach dem **an diesem Tag gültigen Arbeitszeitmodell** des Mitarbeiters ein Arbeitstag ist (Wochentage als Bitmaske, mit Gültigkeitsdatum; ohne Modell gilt der Unternehmensstandard), und
2. er **kein Feiertag** ist: gesetzliche Feiertage des Bundeslandes am Standort (ohne Standort: Standard-Bundesland des Unternehmens), aktivierte regionale Feiertage des Standorts sowie betriebliche freie Tage (unternehmensweit oder je Standort).

Weitere Regeln:

- Anträge ohne gezählte Tage werden abgelehnt, ebenso Zeiträume > 366 Tage und Enddatum vor Startdatum.
- Überschneidungen mit eingereichten oder genehmigten Anträgen werden abgelehnt (auch bei parallelen Requests, per DB-Index).
- Die gezählten Tage werden **bei Einreichung festgeschrieben**. Spätere Änderungen an Feiertagen oder Arbeitszeitmodellen verändern bestehende Anträge nicht still.
- Über den Jahreswechsel werden Tage dem jeweiligen Kalenderjahr zugeordnet.
- Saldo je Jahr: *Anspruch + Übertrag − genehmigt*; „verfügbar“ zieht zusätzlich beantragte Tage ab. Nur Abwesenheitsarten mit „zählt als Urlaub“ werden abgezogen.
- Standardmäßig blockiert das System Anträge und Genehmigungen, die das Konto überziehen würden (einstellbar). Ist für ein Jahr kein Anspruch hinterlegt, wird das deutlich angezeigt und nicht blockiert.

## Feiertage

Alle 16 Bundesländer, Regeln ab 2018 (Reformationstag in HB/HH/NI/SH ab 2018, Frauentag BE ab 2019 und MV ab 2023, Weltkindertag TH ab 2019, Tag der Befreiung BE 2020/2025, Oster-/Pfingstsonntag BB und HE). Regionale Feiertage als Option je Standort: Mariä Himmelfahrt (BY), Augsburger Friedensfest, Fronleichnam in Teilen von SN und TH. Jahre außerhalb 2018–2100 werden mit Fehlermeldung abgelehnt statt still falsch berechnet.

## Nicht unterstützte Sonderfälle (bewusst dokumentiert)

| Fall | Stand |
| --- | --- |
| Halbe Urlaubstage | nicht unterstützt (Ansprüche können halbe Tage enthalten, Anträge zählen ganze Tage) |
| Rollierende Schicht-/Dienstpläne, wechselnde Wochen | nicht abgebildet – nur feste Wochentagsmuster mit Gültigkeitsdatum |
| Stundenbasierte Urlaubskonten | nicht unterstützt |
| Anteiliger Anspruch bei Ein-/Austritt, Verfall von Resturlaub (z. B. 31.03.) | nicht automatisiert – Anspruch und Übertrag pflegt die Verwaltung je Jahr |
| Krankheit während des Urlaubs | manuell: genehmigten Urlaub stornieren und Arbeitsunfähigkeit erfassen |
| Feiertage auf Wochenenden mit Dienst | korrekt, wenn der Tag im Arbeitszeitmodell als Arbeitstag hinterlegt ist |
| Gesetzesänderungen nach Release | erfordern ein Software-Update von [holidays.ts](../src/lib/holidays.ts) |

**Rechtlicher Hinweis:** Urlaubsansprüche müssen vom Unternehmen nach Arbeitsvertrag, Tarif und Gesetz festgelegt und fachlich geprüft werden. Die Software stellt keine Rechtsberatung dar.
