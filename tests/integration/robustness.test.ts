/**
 * Robustheit bei Nebenläufigkeit und Fehlern.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@/server/db";
import { withSystem } from "@/server/db/tenant";
import { changeMemberRole, countActiveOwners } from "@/server/services/roles";
import { decideLeaveRequest, getBalance, submitLeaveRequest } from "@/server/services/leave";
import { acceptInvitation } from "@/server/services/invitations";
import { createEmployee } from "@/server/services/employees";
import { getOrganization, getCompanySettings } from "@/server/services/organization";
import { listRoles } from "@/server/services/roles";
import { describeError } from "@/server/log";
import { absenceTypeId, addMember, PASSWORD, roleId, setupCompany, tokenFromUrl, uniq } from "../helpers/factory";

describe("Nebenläufigkeit", () => {
  it("zwei Inhaber können sich nicht gleichzeitig gegenseitig herabstufen", async () => {
    const co = await setupCompany();
    const second = await addMember(co.owner, { role: "Geschäftsführung" });
    const employeeRole = await roleId(co.company.id, "Mitarbeiter");
    const results = await Promise.allSettled([
      changeMemberRole(co.owner, second.employee.id, employeeRole),
      changeMemberRole(second.ctx, co.owner.employeeId, employeeRole),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const owners = await withSystem((tx) => countActiveOwners(tx, co.company.id));
    expect(owners).toBe(1);
  });

  it("parallele Genehmigungen überziehen das Urlaubskonto nicht", async () => {
    const co = await setupCompany();
    const approver = await addMember(co.owner, { role: "Personalverwaltung" });
    const emp = await addMember(co.owner, { annualLeaveDays: 4 });
    const vacation = await absenceTypeId(co.company.id, "vacation");
    // Vorübergehend Überziehen zulassen, um zwei Anträge anzulegen
    await withSystem((tx) => tx.update(schema.companies).set({ allowNegativeBalance: true }).where(eq(schema.companies.id, co.company.id)));
    const a = await submitLeaveRequest(emp.ctx, { startDate: "2026-11-16", endDate: "2026-11-18", absenceTypeId: vacation });
    const b = await submitLeaveRequest(emp.ctx, { startDate: "2026-11-23", endDate: "2026-11-25", absenceTypeId: vacation });
    await withSystem((tx) => tx.update(schema.companies).set({ allowNegativeBalance: false }).where(eq(schema.companies.id, co.company.id)));

    const results = await Promise.allSettled([
      decideLeaveRequest(approver.ctx, a.id, { decision: "approve" }),
      decideLeaveRequest(co.owner, b.id, { decision: "approve" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const balance = await getBalance(emp.ctx, emp.employee.id, 2026);
    expect(balance).toMatchObject({ configured: true, approved: 3, remaining: 1 });
  });

  it("parallele Annahme derselben Einladung erzeugt genau ein Konto", async () => {
    const co = await setupCompany();
    const { invitation } = await createEmployee(co.owner, {
      firstName: "Doppel",
      lastName: "Klick",
      email: `${uniq()}@example.test`,
      weekdays: 31,
      annualLeaveDays: 30,
      invite: true,
      roleId: await roleId(co.company.id, "Mitarbeiter"),
    });
    const token = tokenFromUrl(invitation!.url);
    const results = await Promise.allSettled([
      acceptInvitation({ token, currentUserId: null, name: "Doppel Klick", password: PASSWORD }),
      acceptInvitation({ token, currentUserId: null, name: "Doppel Klick", password: PASSWORD }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toHaveProperty("code");
  });
});

describe("Rechteprüfung in Lesefunktionen", () => {
  it("Organisations-, Rollen- und Einstellungsdaten nur mit passendem Recht", async () => {
    const co = await setupCompany();
    const m = await addMember(co.owner);
    await expect(getOrganization(m.ctx)).rejects.toMatchObject({ code: "forbidden" });
    await expect(getCompanySettings(m.ctx)).rejects.toMatchObject({ code: "forbidden" });
    await expect(listRoles(m.ctx)).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("Fehlerprotokoll", () => {
  it("entfernt Abfrageparameter aus Datenbankfehlern", () => {
    const err = Object.assign(new Error('Failed query: insert into "users" ("email") values ($1)\nparams: geheim@example.test,$argon2id$...'), {
      cause: { code: "23505", constraint_name: "users_email_key" },
    });
    const d = describeError(err);
    expect(JSON.stringify(d)).not.toContain("geheim@example.test");
    expect(JSON.stringify(d)).not.toContain("argon2");
    expect(d).toMatchObject({ code: "23505", constraint: "users_email_key" });
  });
});
