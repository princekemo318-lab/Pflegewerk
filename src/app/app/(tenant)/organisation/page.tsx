import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Building2, MapPin } from "lucide-react";
import { requireTenant } from "@/server/auth/current";
import { can } from "@/server/authz";
import { getOrganization } from "@/server/services/organization";
import { getEmployeeFormOptions } from "@/server/services/employees";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { ArchiveLocation, ArchiveTeam, LocationDialog, TeamDialog } from "@/components/organization/forms";
import { STATES, OPTIONAL_HOLIDAYS, isStateCode, isOptionalHolidayKey } from "@/lib/holidays";

export const metadata: Metadata = { title: "Teams & Standorte" };

export default async function OrganizationPage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "organization.manage")) notFound();
  const [{ teams, locations }, options] = await Promise.all([getOrganization(ctx), getEmployeeFormOptions(ctx)]);
  const locationOptions = locations.map((l) => ({ id: l.id, name: l.name }));

  return (
    <>
      <PageHeader
        title="Teams & Standorte"
        description="Teams bestimmen, wer Anträge entscheidet. Standorte bestimmen die Feiertage."
        actions={<TeamDialog locations={locationOptions} employees={options.managers} />}
      />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Teams" />
          {teams.length === 0 ? (
            <EmptyState
              icon={<Building2 className="size-5" />}
              title="Noch keine Teams"
              description="Lege Teams an, z. B. „Ambulante Pflege“ oder „Tagespflege“, und bestimme eine Teamleitung."
            />
          ) : (
            <ul className="divide-y divide-line">
              {teams.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{t.name}</p>
                    <p className="text-sm text-muted">
                      {t.memberCount} {t.memberCount === 1 ? "Mitglied" : "Mitglieder"}
                      {t.locationName && ` · ${t.locationName}`}
                      {" · "}
                      {t.leadFirstName ? `Leitung: ${t.leadFirstName} ${t.leadLastName}` : <span className="text-warn">keine Teamleitung</span>}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <TeamDialog team={t} locations={locationOptions} employees={options.managers} />
                    <ArchiveTeam id={t.id} name={t.name} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Standorte" action={<LocationDialog />} />
          {locations.length === 0 ? (
            <EmptyState
              icon={<MapPin className="size-5" />}
              title="Noch keine Standorte"
              description="Ohne Standort gelten die Feiertage des Standard-Bundeslandes aus den Einstellungen."
            />
          ) : (
            <ul className="divide-y divide-line">
              {locations.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{l.name}</p>
                    <p className="text-sm text-muted">
                      {[l.city, isStateCode(l.state) ? STATES[l.state] : l.state].filter(Boolean).join(" · ")}
                      {l.optionalHolidays.length > 0 &&
                        ` · zusätzlich: ${l.optionalHolidays.filter(isOptionalHolidayKey).map((k) => OPTIONAL_HOLIDAYS[k].name).join(", ")}`}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <LocationDialog location={l} />
                    <ArchiveLocation id={l.id} name={l.name} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
