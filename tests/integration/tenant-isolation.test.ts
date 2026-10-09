/**
 * Sicherheitstests der Mandantentrennung – auf Datenbank- UND Service-Ebene.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { withSystem, withTenant } from "@/server/db/tenant";
import { resolveTenantContext, isPlatformAdmin } from "@/server/authz";
import { getEmployee, listEmployees, updateEmployee, createEmployee, setEntitlement } from "@/server/services/employees";
import { decideLeaveRequest, getLeaveRequest, submitLeaveRequest, withdrawLeaveRequest, recordAbsence } from "@/server/services/leave";
import { changeMemberRole, updateRole } from "@/server/services/roles";
import { createTeam } from "@/server/services/organization";
import { listCompanyAuditLogs } from "@/server/services/audit";
import { setCompanyStatus } from "@/server/services/platform";
import { absenceTypeId, addMember, roleId, setupCompany } from "../helpers/factory";
import { FIVE_DAY_WEEK } from "@/lib/dates";

let A: Awaited<ReturnType<typeof setupCompany>>;
let B: Awaited<ReturnType<typeof setupCompany>>;
let memberB: Awaited<ReturnType<typeof addMember>>;
let requestB: { id: string };
let teamB: { id: string };

beforeAll(async () => {
  A = await setupCompany({ name: "Firma A" });
  B = await setupCompany({ name: "Firma B" });
  teamB = await createTeam(B.owner, { name: "Station B" });
  memberB = await addMember(B.owner, { teamId: teamB.id });
  requestB = await submitLeaveRequest(memberB.ctx, {
    startDate: "2026-11-02",
    endDate: "2026-11-04",
    absenceTypeId: await absenceTypeId(B.company.id, "vacation"),
  });
});

describe("Datenbank: Row-Level Security", () => {
  it("die Anwendungsrolle umgeht RLS nicht", async () => {
    const [role] = await getDb().execute<{ rolsuper: boolean; rolbypassrls: boolean }>(
      sql`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
    );
    expect(role.rolsuper).toBe(false);
    expect(role.rolbypassrls).toBe(false);
  });

  it("ohne Kontext sind unternehmensbezogene Tabellen leer (fail closed)", async () => {
    const rows = await getDb().select().from(schema.employees);
    expect(rows).toHaveLength(0);
    const companies = await getDb().select().from(schema.companies);
    expect(companies).toHaveLength(0);
    const sessions = await getDb().select().from(schema.sessions);
    expect(sessions).toHaveLength(0);
  });

  it("im Kontext von A sind Daten von B unsichtbar – auch bei direkter Abfrage per ID", async () => {
    const rows = await withTenant(A.owner, (tx) =>
      tx.select().from(schema.leaveRequests).where(eq(schema.leaveRequests.id, requestB.id)),
    );
    expect(rows).toHaveLength(0);
    const employees = await withTenant(A.owner, (tx) => tx.select().from(schema.employees));
    expect(employees.every((e) => e.companyId === A.company.id)).toBe(true);
    const users = await withTenant(A.owner, (tx) => tx.select().from(schema.users).where(eq(schema.users.id, memberB.userId)));
    expect(users).toHaveLength(0);
  });

  it("im Kontext von A können keine Zeilen für B geschrieben werden", async () => {
    await expect(
      withTenant(A.owner, (tx) =>
        tx.insert(schema.teams).values({ companyId: B.company.id, name: "Eingeschleust" }),
      ),
    ).rejects.toThrow();
    const updated = await withTenant(A.owner, (tx) =>
      tx.update(schema.leaveRequests).set({ status: "approved" }).where(eq(schema.leaveRequests.id, requestB.id)).returning(),
    );
    expect(updated).toHaveLength(0);
  });

  it("zusammengesetzte Fremdschlüssel verhindern mandantenübergreifende Verweise", async () => {
    await expect(
      withSystem((tx) =>
        tx.update(schema.employees).set({ teamId: teamB.id }).where(eq(schema.employees.id, A.owner.employeeId)),
      ),
    ).rejects.toThrow();
  });

  it("Audit-Logs sind unveränderlich", async () => {
    await expect(
      withSystem((tx) => tx.update(schema.auditLogs).set({ action: "manipuliert" })),
    ).rejects.toThrow();
    await expect(withSystem((tx) => tx.delete(schema.auditLogs))).rejects.toThrow();
    await expect(
      withTenant(A.owner, (tx) => tx.delete(schema.auditLogs).where(eq(schema.auditLogs.companyId, A.company.id))),
    ).rejects.toThrow();
  });
});

describe("Services: manipulierte Ressourcen-IDs", () => {
  it("fremde Anträge sind nicht lesbar oder entscheidbar", async () => {
    await expect(getLeaveRequest(A.owner, requestB.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(decideLeaveRequest(A.owner, requestB.id, { decision: "approve" })).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(withdrawLeaveRequest(A.owner, requestB.id)).rejects.toMatchObject({ code: "not_found" });
    const still = await getLeaveRequest(B.owner, requestB.id);
    expect(still.request.status).toBe("submitted");
  });

  it("fremde Mitarbeiter sind nicht lesbar oder änderbar", async () => {
    await expect(getEmployee(A.owner, memberB.employee.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(
      updateEmployee(A.owner, memberB.employee.id, { firstName: "X", lastName: "Y" }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      setEntitlement(A.owner, memberB.employee.id, { year: 2026, days: 99 }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      recordAbsence(A.owner, memberB.employee.id, {
        startDate: "2026-12-01",
        endDate: "2026-12-01",
        absenceTypeId: await absenceTypeId(A.company.id, "sick"),
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    const list = await listEmployees(A.owner, { status: "all" });
    expect(list.rows.some((r) => r.id === memberB.employee.id)).toBe(false);
  });

  it("fremde Teams, Rollen und Abwesenheitsarten können nicht verwendet werden", async () => {
    await expect(
      createEmployee(A.owner, {
        firstName: "Test",
        lastName: "Fremdteam",
        teamId: teamB.id,
        weekdays: FIVE_DAY_WEEK,
        annualLeaveDays: 30,
      }),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(
      changeMemberRole(A.owner, memberB.employee.id, await roleId(A.company.id, "Teamleitung")),
    ).rejects.toMatchObject({ code: "not_found" });
    const memberA = await addMember(A.owner);
    await expect(
      changeMemberRole(A.owner, memberA.employee.id, await roleId(B.company.id, "Geschäftsführung")),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      updateRole(A.owner, await roleId(B.company.id, "Mitarbeiter"), { name: "Gekapert", permissions: [] }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      submitLeaveRequest(memberA.ctx, {
        startDate: "2026-11-09",
        endDate: "2026-11-10",
        absenceTypeId: await absenceTypeId(B.company.id, "vacation"),
      }),
    ).rejects.toMatchObject({ code: "invalid" });
  });

  it("ungültige oder manipulierte IDs führen zu 'nicht gefunden' statt Datenbankfehlern", async () => {
    for (const bad of ["abc", "1 OR 1=1", "' ; drop table employees; --", ""]) {
      await expect(getLeaveRequest(A.owner, bad)).rejects.toMatchObject({ code: "not_found" });
      await expect(getEmployee(A.owner, bad)).rejects.toMatchObject({ code: "not_found" });
      await expect(decideLeaveRequest(A.owner, bad, { decision: "approve" })).rejects.toMatchObject({ code: "not_found" });
    }
    const still = await withSystem((tx) => tx.select({ id: schema.employees.id }).from(schema.employees).limit(1));
    expect(still).toHaveLength(1);
  });

  it("Audit-Protokoll zeigt nur eigene Einträge", async () => {
    const logs = await listCompanyAuditLogs(A.owner);
    expect(logs.rows.length).toBeGreaterThan(0);
    const b = await withSystem((tx) =>
      tx.select({ id: schema.auditLogs.id }).from(schema.auditLogs).where(eq(schema.auditLogs.companyId, B.company.id)),
    );
    const ids = new Set(logs.rows.map((r) => r.id));
    expect(b.some((r) => ids.has(r.id))).toBe(false);
  });
});

describe("Zugang und Sperren", () => {
  it("ein Nutzer erhält keinen Kontext für ein fremdes Unternehmen", async () => {
    expect(await resolveTenantContext(memberB.userId, A.company.id)).toBeNull();
  });

  it("normale Nutzer sind keine Plattform-Administratoren", async () => {
    expect(await isPlatformAdmin(A.owner.userId)).toBe(false);
    expect(await isPlatformAdmin(A.platformAdmin.userId)).toBe(true);
  });

  it("gesperrte Unternehmen sind nicht zugänglich, Daten bleiben erhalten", async () => {
    const C = await setupCompany({ name: "Firma C" });
    await setCompanyStatus({ userId: C.platformAdmin.userId }, C.company.id, "suspended", "Test");
    expect(await resolveTenantContext(C.owner.userId, C.company.id)).toBeNull();
    const employees = await withSystem((tx) =>
      tx.select().from(schema.employees).where(eq(schema.employees.companyId, C.company.id)),
    );
    expect(employees.length).toBeGreaterThan(0);
    await setCompanyStatus({ userId: C.platformAdmin.userId }, C.company.id, "active");
    expect(await resolveTenantContext(C.owner.userId, C.company.id)).not.toBeNull();
  });
});
