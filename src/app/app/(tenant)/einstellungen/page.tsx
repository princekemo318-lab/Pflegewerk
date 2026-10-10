import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth/current";
import { can } from "@/server/authz";
import { getCompanySettings, getOrganization, listAbsenceTypes, listCompanyHolidays } from "@/server/services/organization";
import { Badge, Card, CardHeader, Notice, PageHeader, TypeDot } from "@/components/ui/primitives";
import { AbsenceTypeDialog, DeleteHoliday, HolidayForm, SettingsForm } from "@/components/organization/forms";
import { formatDateLong, todayIso, yearOf } from "@/lib/dates";
import { getHolidays, isStateCode, STATES } from "@/lib/holidays";

export const metadata: Metadata = { title: "Einstellungen" };

export default async function SettingsPage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "organization.manage")) notFound();
  const year = yearOf(todayIso());
  const [company, holidays, types, { locations }] = await Promise.all([
    getCompanySettings(ctx),
    listCompanyHolidays(ctx, year),
    listAbsenceTypes(ctx),
    getOrganization(ctx),
  ]);
  const statutory = isStateCode(company.defaultState) ? getHolidays(year, company.defaultState) : [];

  return (
    <>
      <PageHeader title="Einstellungen" description="Grundeinstellungen für Urlaubsberechnung, Kalender und Benachrichtigungen." />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Allgemein" />
          <div className="p-5">
            <SettingsForm company={company} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Abwesenheitsarten" action={<AbsenceTypeDialog />} />
          <ul className="divide-y divide-line">
            {types.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium">
                    <TypeDot color={t.color} />
                    {t.name}
                    {t.isSensitive && <Badge tone="warn">Sensibel</Badge>}
                    {t.archivedAt && <Badge>Archiviert</Badge>}
                  </p>
                  <p className="mt-0.5 text-sm text-muted">
                    {[
                      t.deductsLeave ? "zählt als Urlaub" : "zählt nicht als Urlaub",
                      t.requiresApproval ? "mit Genehmigung" : "ohne Genehmigung",
                      t.employeeCanRequest ? "von Mitarbeitern beantragbar" : "nur durch Verwaltung",
                    ].join(" · ")}
                  </p>
                </div>
                <AbsenceTypeDialog type={t} />
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title={`Feiertage ${year}`}
            description="Gesetzliche Feiertage werden automatisch je Standort berücksichtigt. Betriebliche freie Tage kannst du ergänzen."
          />
          <div className="space-y-5 p-5">
            <HolidayForm locations={locations.map((l) => ({ id: l.id, name: l.name }))} />
            {holidays.length > 0 && (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {holidays.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                    <span>
                      <span className="font-medium">{h.name}</span>
                      <span className="text-muted"> · {formatDateLong(h.date)} · {h.locationName ?? "alle Standorte"}</span>
                    </span>
                    <DeleteHoliday id={h.id} name={h.name} />
                  </li>
                ))}
              </ul>
            )}
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">
                Gesetzliche Feiertage {isStateCode(company.defaultState) ? STATES[company.defaultState] : ""} ({statutory.length})
              </summary>
              <ul className="mt-2 grid gap-1 text-muted sm:grid-cols-2">
                {statutory.map((h) => (
                  <li key={h.date}>
                    {formatDateLong(h.date)} – {h.name}
                  </li>
                ))}
              </ul>
            </details>
            <Notice tone="info">
              Die Feiertage werden nach den Feiertagsgesetzen der Länder berechnet. Bitte prüfe sie für deine Standorte –
              besonders regional geltende Feiertage. Die Software ersetzt keine rechtliche Prüfung.
            </Notice>
          </div>
        </Card>
      </div>
    </>
  );
}
