/**
 * Dashboard: wenige, handlungsrelevante Kennzahlen aus echten Daten.
 */
import "server-only";
import { and, asc, count, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { schema } from "../db";
import { withTenant } from "../db/tenant";
import { can, type TenantContext } from "../authz";
import { addDays, todayIso, yearOf } from "@/lib/dates";
import { balancesForEmployees, listPendingApprovals } from "./leave";

export async function getCompanyDashboard(ctx: TenantContext) {
  const today = todayIso();
  const in14 = addDays(today, 14);
  const in7 = addDays(today, 7);
  const pendingForMe = await listPendingApprovals(ctx, { limit: 5 });

  const data = await withTenant(ctx, async (tx) => {
    const [employees] = await tx
      .select({ n: count() })
      .from(schema.employees)
      .where(and(eq(schema.employees.companyId, ctx.companyId), eq(schema.employees.status, "active")));
    const [pending] = await tx
      .select({ n: count() })
      .from(schema.leaveRequests)
      .where(and(eq(schema.leaveRequests.companyId, ctx.companyId), eq(schema.leaveRequests.status, "submitted")));

    const absenceBase = and(
      eq(schema.leaveRequests.companyId, ctx.companyId),
      eq(schema.leaveRequests.status, "approved"),
      eq(schema.employees.status, "active"),
    );
    const columns = {
      id: schema.leaveRequests.id,
      startDate: schema.leaveRequests.startDate,
      endDate: schema.leaveRequests.endDate,
      firstName: schema.employees.firstName,
      lastName: schema.employees.lastName,
      teamId: schema.employees.teamId,
      teamName: schema.teams.name,
      typeName: schema.absenceTypes.name,
    };
    const absentToday = await tx
      .select(columns)
      .from(schema.leaveRequests)
      .innerJoin(schema.employees, eq(schema.employees.id, schema.leaveRequests.employeeId))
      .innerJoin(schema.absenceTypes, eq(schema.absenceTypes.id, schema.leaveRequests.absenceTypeId))
      .leftJoin(schema.teams, eq(schema.teams.id, schema.employees.teamId))
      .where(and(absenceBase, lte(schema.leaveRequests.startDate, today), gte(schema.leaveRequests.endDate, today)))
      .orderBy(asc(schema.leaveRequests.endDate))
      .limit(50);
    const upcoming = await tx
      .select(columns)
      .from(schema.leaveRequests)
      .innerJoin(schema.employees, eq(schema.employees.id, schema.leaveRequests.employeeId))
      .innerJoin(schema.absenceTypes, eq(schema.absenceTypes.id, schema.leaveRequests.absenceTypeId))
      .leftJoin(schema.teams, eq(schema.teams.id, schema.employees.teamId))
      .where(and(absenceBase, sql`${schema.leaveRequests.startDate} > ${today}`, lte(schema.leaveRequests.startDate, in14)))
      .orderBy(asc(schema.leaveRequests.startDate))
      .limit(10);
    const returning = absentToday.filter((a) => a.endDate <= in7);

    // Abwesenheit heute je Team
    const teamRows = await tx
      .select({
        teamId: schema.teams.id,
        teamName: schema.teams.name,
        total: count(schema.employees.id),
      })
      .from(schema.teams)
      .leftJoin(
        schema.employees,
        and(eq(schema.employees.teamId, schema.teams.id), eq(schema.employees.status, "active")),
      )
      .where(and(eq(schema.teams.companyId, ctx.companyId), isNull(schema.teams.archivedAt)))
      .groupBy(schema.teams.id, schema.teams.name)
      .orderBy(asc(schema.teams.name));
    const absentByTeam = new Map<string, number>();
    for (const a of absentToday) {
      if (a.teamId) absentByTeam.set(a.teamId, (absentByTeam.get(a.teamId) ?? 0) + 1);
    }
    const [openInvites] = await tx
      .select({ n: count() })
      .from(schema.invitations)
      .where(
        and(
          eq(schema.invitations.companyId, ctx.companyId),
          isNull(schema.invitations.acceptedAt),
          isNull(schema.invitations.revokedAt),
          sql`${schema.invitations.expiresAt} > now()`,
        ),
      );
    const [missingEntitlements] = await tx
      .select({ n: count() })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.companyId, ctx.companyId),
          eq(schema.employees.status, "active"),
          sql`not exists (select 1 from ${schema.leaveEntitlements} le where le.employee_id = ${schema.employees.id} and le.year = ${yearOf(today)})`,
        ),
      );
    const [teamCount] = await tx
      .select({ n: count() })
      .from(schema.teams)
      .where(and(eq(schema.teams.companyId, ctx.companyId), isNull(schema.teams.archivedAt)));

    return {
      activeEmployees: employees?.n ?? 0,
      pendingTotal: pending?.n ?? 0,
      absentToday,
      upcoming,
      returning,
      teams: teamRows.map((t) => ({ ...t, absent: absentByTeam.get(t.teamId) ?? 0 })),
      openInvites: openInvites?.n ?? 0,
      missingEntitlements: missingEntitlements?.n ?? 0,
      teamCount: teamCount?.n ?? 0,
    };
  });
  return { ...data, pendingForMe, today };
}

/** Persönliche Übersicht für alle Nutzer. */
export async function getPersonalDashboard(ctx: TenantContext) {
  const today = todayIso();
  const year = yearOf(today);
  return withTenant(ctx, async (tx) => {
    const balance = (await balancesForEmployees(tx, ctx.companyId, [ctx.employeeId], year)).get(ctx.employeeId) ?? null;
    const mine = await tx
      .select({
        id: schema.leaveRequests.id,
        startDate: schema.leaveRequests.startDate,
        endDate: schema.leaveRequests.endDate,
        status: schema.leaveRequests.status,
        workingDays: schema.leaveRequests.workingDays,
        typeName: schema.absenceTypes.name,
      })
      .from(schema.leaveRequests)
      .innerJoin(schema.absenceTypes, eq(schema.absenceTypes.id, schema.leaveRequests.absenceTypeId))
      .where(
        and(
          eq(schema.leaveRequests.companyId, ctx.companyId),
          eq(schema.leaveRequests.employeeId, ctx.employeeId),
          inArray(schema.leaveRequests.status, ["submitted", "approved"]),
          gte(schema.leaveRequests.endDate, today),
        ),
      )
      .orderBy(asc(schema.leaveRequests.startDate))
      .limit(5);
    return { balance, upcoming: mine, year, today, canApprove: can(ctx, "leave.approve_all") || can(ctx, "leave.approve_team") };
  });
}
