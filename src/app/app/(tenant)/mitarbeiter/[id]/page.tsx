import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { requireTenant } from "@/server/auth/current";
import { can } from "@/server/authz";
import { getEmployee, getEmployeeFormOptions } from "@/server/services/employees";
import { isAppError } from "@/server/errors";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, LeaveStatusBadge, Notice, PageHeader, buttonClasses } from "@/components/ui/primitives";
import { BalanceSummary } from "@/components/leave/balance";
import {
  AccessToggle,
  DeleteEmployee,
  EditEmployeeForm,
  EmploymentStatusToggle,
  EntitlementForm,
  InviteForm,
  RevokeInvitation,
  RoleForm,
  ScheduleForm,
} from "@/components/employees/employee-panels";
import { describeWorkWeek, formatDate, formatDateTime, formatDays, formatNumber, formatRange, todayIso } from "@/lib/dates";

export const metadata: Metadata = { title: "Mitarbeiter" };

export default async function EmployeePage({ params }: PageProps<"/app/mitarbeiter/[id]">) {
  const { id } = await params;
  const { ctx } = await requireTenant();
  const data = await getEmployee(ctx, id).catch((e) => {
    if (isAppError(e)) notFound();
    throw e;
  });
  const { employee: e, schedules, entitlements, invitation, requests, balance, year } = data;
  const manage = can(ctx, "employees.manage");
  const options = manage || can(ctx, "roles.manage") ? await getEmployeeFormOptions(ctx) : null;
  const name = `${e.firstName} ${e.lastName}`;
  const isSelf = e.id === ctx.employeeId;
  const currentSchedule = schedules.find((s) => s.validFrom <= todayIso()) ?? null;
  const defaultWeek = options?.company.defaultWorkWeek ?? 31;
  const currentEntitlement = entitlements.find((x) => x.year === year);

  return (
    <>
      <PageHeader
        title={name}
        description={[e.jobTitle, e.teamName, e.locationName].filter(Boolean).join(" · ") || undefined}
        back={{ href: "/app/mitarbeiter", label: "Mitarbeiter" }}
        actions={
          can(ctx, "leave.manage") &&
          e.status === "active" && (
            <ButtonLink href={`/app/mitarbeiter/${e.id}/abwesenheit`} variant="secondary">
              <CalendarPlus className="size-4" aria-hidden />
              Abwesenheit eintragen
            </ButtonLink>
          )
        }
      />
      {e.status === "inactive" && (
        <Notice tone="warn" className="mb-6" title="Ausgeschieden">
          Diese Person ist als ausgeschieden markiert. Ihre Daten bleiben für die Dokumentation erhalten.
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Stammdaten" />
            <div className="p-5">
              {manage && options ? (
                <EditEmployeeForm employee={e} teams={options.teams} locations={options.locations} managers={options.managers} />
              ) : (
                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                  {[
                    ["E-Mail", e.email],
                    ["Team", e.teamName],
                    ["Standort", e.locationName],
                    ["Führungskraft", e.managerName],
                    ["Personalnummer", e.personnelNumber],
                    ["Eintritt", e.entryDate ? formatDate(e.entryDate) : null],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs text-subtle">{k}</dt>
                      <dd className="mt-0.5">{v || "–"}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Zugang zur Plattform" />
            <div className="space-y-4 p-5 text-sm">
              {e.membershipId ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={e.membershipStatus === "active" ? "success" : "neutral"}>
                      {e.membershipStatus === "active" ? "Zugang aktiv" : "Zugang deaktiviert"}
                    </Badge>
                    <span className="text-muted">{e.accountEmail}</span>
                    {e.lastLoginAt && <span className="text-xs text-subtle">· zuletzt angemeldet {formatDateTime(e.lastLoginAt)}</span>}
                  </div>
                  {can(ctx, "roles.manage") && options && !isSelf ? (
                    <RoleForm id={e.id} roleId={e.roleId!} roles={options.assignableRoles.some((r) => r.id === e.roleId) ? options.assignableRoles : options.roles} />
                  ) : (
                    <p>
                      Rolle: <span className="font-medium">{e.roleName}</span>
                      {isSelf && <span className="text-muted"> (die eigene Rolle kann nicht selbst geändert werden)</span>}
                    </p>
                  )}
                  {manage && !isSelf && (
                    <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                      <AccessToggle id={e.id} active={e.membershipStatus === "active"} name={name} />
                    </div>
                  )}
                </>
              ) : invitation ? (
                <div className="space-y-3">
                  <p>
                    <Badge tone="info">Eingeladen</Badge>{" "}
                    <span className="text-muted">
                      {invitation.email} · gültig bis {formatDateTime(invitation.expiresAt)}
                    </span>
                  </p>
                  {manage && (
                    <div className="flex flex-wrap gap-2">
                      <RevokeInvitation id={e.id} invitationId={invitation.id} />
                    </div>
                  )}
                  {manage && options && e.status === "active" && (
                    <details className="rounded-lg border border-line p-3">
                      <summary className="cursor-pointer text-sm font-medium">Neue Einladung senden</summary>
                      <div className="mt-3">
                        <InviteForm id={e.id} email={invitation.email} roles={can(ctx, "roles.manage") ? options.assignableRoles : options.assignableRoles.filter((r) => r.isDefault)} />
                      </div>
                    </details>
                  )}
                </div>
              ) : manage && options && e.status === "active" ? (
                <>
                  <p className="text-muted">Diese Person hat noch keinen Zugang. Mit einer Einladung kann sie selbst Anträge stellen.</p>
                  <InviteForm id={e.id} email={e.email} roles={can(ctx, "roles.manage") ? options.assignableRoles : options.assignableRoles.filter((r) => r.isDefault)} />
                </>
              ) : (
                <p className="text-muted">Kein Zugang.</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Arbeitszeitmodell" description={`Aktuell: ${describeWorkWeek(currentSchedule?.weekdays ?? defaultWeek)}${currentSchedule ? "" : " (Unternehmensstandard)"}`} />
            <div className="space-y-5 p-5">
              {schedules.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {schedules.map((s) => (
                    <li key={s.id} className="flex justify-between gap-4">
                      <span className="text-muted">ab {formatDate(s.validFrom)}</span>
                      <span className="font-medium">{describeWorkWeek(s.weekdays)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {manage && <ScheduleForm id={e.id} mask={currentSchedule?.weekdays ?? defaultWeek} today={todayIso()} />}
            </div>
          </Card>

          <Card>
            <CardHeader title="Anträge und Abwesenheiten" />
            {requests.length === 0 ? (
              <EmptyState title="Noch keine Anträge" />
            ) : (
              <ul className="divide-y divide-line">
                {requests.map((r) => (
                  <li key={r.id}>
                    <Link href={r.id ? `/app/genehmigungen/${r.id}` : "#"} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-surface-2">
                      <span>
                        <span className="font-medium tabular">{formatRange(r.startDate, r.endDate)}</span>
                        <span className="block text-xs text-muted">
                          {r.typeName} · {formatDays(r.workingDays)}
                        </span>
                      </span>
                      <LeaveStatusBadge status={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-semibold">Urlaubskonto {year}</h2>
            <BalanceSummary balance={balance} className="mt-4" />
          </Card>
          <Card>
            <CardHeader title="Urlaubsansprüche" />
            <div className="space-y-4 p-5">
              {entitlements.length > 0 ? (
                <ul className="space-y-1 text-sm">
                  {entitlements.map((x) => (
                    <li key={x.id} className="flex justify-between">
                      <span className="text-muted">{x.year}</span>
                      <span className="tabular">
                        {formatNumber(x.days)} Tage{x.carryoverDays ? ` + ${formatNumber(x.carryoverDays)} Übertrag` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-warn">Noch kein Anspruch hinterlegt.</p>
              )}
              {can(ctx, "leave.manage") && (
                <EntitlementForm id={e.id} year={year} days={currentEntitlement?.days ?? options?.company.defaultAnnualLeaveDays} carryover={currentEntitlement?.carryoverDays} />
              )}
              <p className="text-xs text-muted">
                Der Anspruch muss nach Arbeitsvertrag und geltendem Recht vom Unternehmen festgelegt werden. Anteilige Ansprüche bei Ein- oder Austritt werden nicht automatisch berechnet.
              </p>
            </div>
          </Card>
          {manage && !isSelf && (
            <Card className="p-5">
              <h2 className="mb-3 font-semibold">Beschäftigung & Datenschutz</h2>
              <div className="flex flex-wrap gap-2">
                <EmploymentStatusToggle id={e.id} active={e.status === "active"} name={name} />
                <a href={`/app/mitarbeiter/${e.id}/datenexport`} className={buttonClasses("secondary", "sm")} download>
                  Daten exportieren
                </a>
                {e.status === "inactive" && <DeleteEmployee id={e.id} name={name} />}
              </div>
              <p className="mt-3 text-xs text-muted">
                Export für Auskunftsersuchen (Art. 15 DSGVO). Endgültiges Löschen ist nur für ausgeschiedene Mitarbeiter möglich.
              </p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
