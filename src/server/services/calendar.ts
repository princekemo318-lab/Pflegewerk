/**
 * Abwesenheitskalender mit datensparsamer Sichtbarkeit:
 * - Eigene Abwesenheiten: vollständig.
 * - Zuständige Entscheider und Verwaltung: Art und offene Anträge sichtbar.
 * - Kollegen: nur genehmigte Abwesenheiten als "Abwesend" – ohne Grund – und nur
 *   im Umfang der Unternehmenseinstellung (keine / Team / ganzes Unternehmen).
 */
import "server-only";
import { and, asc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { schema } from "../db";
import { withTenant } from "../db/tenant";
import { can, type TenantContext } from "../authz";
import { canSeeSensitive, managedEmployeeIds } from "./scope";
import { holidayMapForRange, isStateCode, STATES, type StateCode } from "@/lib/holidays";
import { diffDays, isIsoDate, type IsoDate } from "@/lib/dates";
import { invalid } from "../errors";

export type CalendarEntry = {
  id: string;
  employeeId: string;
  startDate: IsoDate;
  endDate: IsoDate;
  status: "submitted" | "approved";
  label: string;
  color: string;
  /** true = Grund wird nicht angezeigt */
  masked: boolean;
  /** Link zur Detailansicht, falls der Betrachter sie sehen darf */
  href: string | null;
};

const MAX_EMPLOYEES = 500;

export async function getCalendar(
  ctx: TenantContext,
  input: { start: IsoDate; end: IsoDate; teamId?: string | null; locationId?: string | null },
) {
  if (!isIsoDate(input.start) || !isIsoDate(input.end) || input.end < input.start) throw invalid("Ungültiger Zeitraum.");
  if (diffDays(input.start, input.end) > 62) throw invalid("Der Zeitraum ist zu groß.");

  return withTenant(ctx, async (tx) => {
    const [company] = await tx
      .select({ scope: schema.companies.employeeCalendarScope, defaultState: schema.companies.defaultState })
      .from(schema.companies)
      .where(eq(schema.companies.id, ctx.companyId));
    const full = can(ctx, "leave.view_all") || can(ctx, "leave.approve_all");
    const managed = can(ctx, "leave.approve_team") ? await managedEmployeeIds(tx, ctx) : new Set<string>();

    const [me] = await tx
      .select({ teamId: schema.employees.teamId })
      .from(schema.employees)
      .where(eq(schema.employees.id, ctx.employeeId));

    // Welche Mitarbeiter darf der Betrachter überhaupt sehen?
    const visibility = full
      ? undefined
      : or(
          eq(schema.employees.id, ctx.employeeId),
          managed.size ? inArray(schema.employees.id, [...managed]) : undefined,
          company.scope === "company"
            ? eq(schema.employees.companyId, ctx.companyId)
            : company.scope === "team" && me?.teamId
              ? eq(schema.employees.teamId, me.teamId)
              : undefined,
        );

    const employees = await tx
      .select({
        id: schema.employees.id,
        firstName: schema.employees.firstName,
        lastName: schema.employees.lastName,
        teamName: schema.teams.name,
      })
      .from(schema.employees)
      .leftJoin(schema.teams, eq(schema.teams.id, schema.employees.teamId))
      .where(
        and(
          eq(schema.employees.companyId, ctx.companyId),
          eq(schema.employees.status, "active"),
          input.teamId ? eq(schema.employees.teamId, input.teamId) : undefined,
          input.locationId ? eq(schema.employees.locationId, input.locationId) : undefined,
          visibility,
        ),
      )
      .orderBy(asc(schema.teams.name), asc(schema.employees.lastName), asc(schema.employees.firstName))
      .limit(MAX_EMPLOYEES + 1);

    const visibleIds = employees.slice(0, MAX_EMPLOYEES).map((e) => e.id);
    const sensitiveAllowed = canSeeSensitive(ctx);
    const detailed = (employeeId: string) => full || employeeId === ctx.employeeId || managed.has(employeeId);

    const rows = visibleIds.length
      ? await tx
          .select({
            id: schema.leaveRequests.id,
            employeeId: schema.leaveRequests.employeeId,
            startDate: schema.leaveRequests.startDate,
            endDate: schema.leaveRequests.endDate,
            status: schema.leaveRequests.status,
            typeName: schema.absenceTypes.name,
            color: schema.absenceTypes.color,
            isSensitive: schema.absenceTypes.isSensitive,
          })
          .from(schema.leaveRequests)
          .innerJoin(schema.absenceTypes, eq(schema.absenceTypes.id, schema.leaveRequests.absenceTypeId))
          .where(
            and(
              eq(schema.leaveRequests.companyId, ctx.companyId),
              inArray(schema.leaveRequests.employeeId, visibleIds),
              inArray(schema.leaveRequests.status, ["submitted", "approved"]),
              lte(schema.leaveRequests.startDate, input.end),
              gte(schema.leaveRequests.endDate, input.start),
            ),
          )
          .orderBy(asc(schema.leaveRequests.startDate))
      : [];

    const entries: CalendarEntry[] = rows
      .filter((r) => r.status === "approved" || detailed(r.employeeId))
      .map((r) => {
        const own = r.employeeId === ctx.employeeId;
        const show = own || (detailed(r.employeeId) && (!r.isSensitive || sensitiveAllowed));
        return {
          id: r.id,
          employeeId: r.employeeId,
          startDate: r.startDate,
          endDate: r.endDate,
          status: r.status as "submitted" | "approved",
          label: show ? r.typeName : "Abwesend",
          color: show ? r.color : "slate",
          masked: !show,
          href: show ? (own ? `/app/antraege/${r.id}` : `/app/genehmigungen/${r.id}`) : null,
        };
      });

    // Feiertage zur Orientierung
    let state: StateCode = isStateCode(company.defaultState) ? company.defaultState : "NW";
    let optional: string[] = [];
    let locationName: string | null = null;
    if (input.locationId) {
      const [loc] = await tx
        .select()
        .from(schema.locations)
        .where(and(eq(schema.locations.id, input.locationId), eq(schema.locations.companyId, ctx.companyId)));
      if (loc && isStateCode(loc.state)) {
        state = loc.state;
        optional = loc.optionalHolidays;
        locationName = loc.name;
      }
    }
    const custom = await tx
      .select({ date: schema.companyHolidays.date, name: schema.companyHolidays.name })
      .from(schema.companyHolidays)
      .where(
        and(
          eq(schema.companyHolidays.companyId, ctx.companyId),
          gte(schema.companyHolidays.date, input.start),
          lte(schema.companyHolidays.date, input.end),
          input.locationId
            ? or(isNull(schema.companyHolidays.locationId), eq(schema.companyHolidays.locationId, input.locationId))
            : isNull(schema.companyHolidays.locationId),
        ),
      );
    let holidays: { date: IsoDate; name: string }[] = [];
    try {
      holidays = [...holidayMapForRange(input.start, input.end, state, optional, custom)].map(([date, name]) => ({ date, name }));
    } catch {
      holidays = [];
    }

    return {
      employees: employees.slice(0, MAX_EMPLOYEES),
      truncated: employees.length > MAX_EMPLOYEES,
      entries,
      holidays,
      holidayRegion: locationName ? `${locationName} (${STATES[state]})` : STATES[state],
      scope: full ? "full" : company.scope,
    };
  });
}

export async function getCalendarFilters(ctx: TenantContext) {
  return withTenant(ctx, async (tx) => {
    const teams = await tx
      .select({ id: schema.teams.id, name: schema.teams.name })
      .from(schema.teams)
      .where(and(eq(schema.teams.companyId, ctx.companyId), isNull(schema.teams.archivedAt)))
      .orderBy(asc(schema.teams.name));
    const locations = await tx
      .select({ id: schema.locations.id, name: schema.locations.name })
      .from(schema.locations)
      .where(and(eq(schema.locations.companyId, ctx.companyId), isNull(schema.locations.archivedAt)))
      .orderBy(asc(schema.locations.name));
    return { teams, locations };
  });
}
