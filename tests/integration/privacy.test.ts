import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { schema } from "@/server/db";
import { withSystem } from "@/server/db/tenant";
import { createTeam, updateTeam } from "@/server/services/organization";
import { getEmployee, setEmployeeStatus, updateEmployee } from "@/server/services/employees";
import { getLeaveRequest, listDecidedRequests, recordAbsence, submitLeaveRequest } from "@/server/services/leave";
import { getCalendar } from "@/server/services/calendar";
import { applyRetention, deleteEmployeePermanently, exportEmployeeData, exportOwnData } from "@/server/services/privacy";
import { login } from "@/server/auth/accounts";
import { validateSessionToken } from "@/server/auth/sessions";
import { absenceTypeId, addMember, PASSWORD, setupCompany, uniq } from "../helpers/factory";

let co: Awaited<ReturnType<typeof setupCompany>>;
let lead: Awaited<ReturnType<typeof addMember>>;
let nurse: Awaited<ReturnType<typeof addMember>>;
let hr: Awaited<ReturnType<typeof addMember>>;
let sickRequestId: string;

beforeAll(async () => {
  co = await setupCompany();
  const team = await createTeam(co.owner, { name: "Station P" });
  lead = await addMember(co.owner, { firstName: "Lia", role: "Teamleitung", teamId: team.id });
  await updateTeam(co.owner, team.id, { name: "Station P", leadEmployeeId: lead.employee.id });
  nurse = await addMember(co.owner, { firstName: "Nora", teamId: team.id });
  hr = await addMember(co.owner, { firstName: "Hedda", role: "Personalverwaltung" });
  const r = await recordAbsence(hr.ctx, nurse.employee.id, {
    startDate: "2027-05-03",
    endDate: "2027-05-04",
    absenceTypeId: await absenceTypeId(co.company.id, "sick"),
  });
  sickRequestId = r.id;
});

describe("Sensible Abwesenheitsarten (Gesundheitsdaten)", () => {
  it("Teamleitung sieht nur 'Abwesend', Personalverwaltung und Betroffene sehen die Art", async () => {
    const leadCal = await getCalendar(lead.ctx, { start: "2027-05-01", end: "2027-05-31" });
    const entry = leadCal.entries.find((e) => e.id === sickRequestId)!;
    expect(entry).toMatchObject({ masked: true, label: "Abwesend", href: null });

    const hrCal = await getCalendar(hr.ctx, { start: "2027-05-01", end: "2027-05-31" });
    expect(hrCal.entries.find((e) => e.id === sickRequestId)?.label).toBe("Arbeitsunfähigkeit");

    const ownCal = await getCalendar(nurse.ctx, { start: "2027-05-01", end: "2027-05-31" });
    expect(ownCal.entries.find((e) => e.id === sickRequestId)?.label).toBe("Arbeitsunfähigkeit");
  });

  it("Teamleitung kann Details nicht abrufen und sieht die Art auch nicht im Profil oder Verlauf", async () => {
    await expect(getLeaveRequest(lead.ctx, sickRequestId)).rejects.toMatchObject({ code: "not_found" });
    const profile = await getEmployee(lead.ctx, nurse.employee.id);
    expect(profile.requests.find((r) => r.id === sickRequestId)?.typeName).toBe("Abwesenheit");
    const decided = await listDecidedRequests(lead.ctx);
    expect(decided.some((r) => r.id === sickRequestId)).toBe(false);
    expect((await getLeaveRequest(hr.ctx, sickRequestId)).request.typeName).toBe("Arbeitsunfähigkeit");
    expect((await getLeaveRequest(nurse.ctx, sickRequestId)).request.typeName).toBe("Arbeitsunfähigkeit");
  });

  it("sensible Arten können nicht selbst beantragt werden", async () => {
    await expect(
      submitLeaveRequest(nurse.ctx, {
        startDate: "2027-05-10",
        endDate: "2027-05-10",
        absenceTypeId: await absenceTypeId(co.company.id, "sick"),
      }),
    ).rejects.toMatchObject({ code: "invalid" });
  });

  it("das Audit-Log enthält keine Abwesenheitsart", async () => {
    const [log] = await withSystem((tx) =>
      tx
        .select()
        .from(schema.auditLogs)
        .where(and(eq(schema.auditLogs.action, "leave.recorded"), eq(schema.auditLogs.entityId, sickRequestId))),
    );
    expect(JSON.stringify(log.metadata)).not.toContain("Arbeitsunf");
  });
});

describe("Datenexport (Auskunft)", () => {
  it("eigener Export enthält eigene Anträge mit Verlauf, aber keine fremden Personen", async () => {
    const data = await exportOwnData(nurse.ctx);
    expect(data.employee.firstName).toBe("Nora");
    expect(data.account?.email).toBe(nurse.email);
    expect(data.leaveRequests).toHaveLength(1);
    expect(data.leaveRequests[0].history.map((h) => h.type)).toEqual(["recorded"]);
    const text = JSON.stringify(data);
    expect(text).not.toContain(lead.email);
    expect(text).not.toContain("Hedda");
  });

  it("Personalverwaltung darf exportieren, Kollegen und fremde Unternehmen nicht", async () => {
    expect((await exportEmployeeData(hr.ctx, nurse.employee.id)).employee.lastName).toBeTruthy();
    await expect(exportEmployeeData(lead.ctx, nurse.employee.id)).rejects.toMatchObject({ code: "forbidden" });
    const other = await setupCompany();
    await expect(exportEmployeeData(other.owner, nurse.employee.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("Endgültige Löschung", () => {
  it("löscht nur ausgeschiedene Mitarbeiter samt Daten, Zugang und verwaistem Konto", async () => {
    const leaver = await addMember(co.owner, { firstName: "Lotte" });
    await updateEmployee(co.owner, nurse.employee.id, { firstName: "Nora", lastName: "Test", managerId: leaver.employee.id });
    const req = await submitLeaveRequest(leaver.ctx, {
      startDate: "2027-06-07",
      endDate: "2027-06-08",
      absenceTypeId: await absenceTypeId(co.company.id, "vacation"),
    });
    const session = await login({ email: leaver.email, password: PASSWORD, ip: uniq("ip") });

    await expect(deleteEmployeePermanently(co.owner, leaver.employee.id)).rejects.toMatchObject({ code: "conflict" });
    await setEmployeeStatus(co.owner, leaver.employee.id, "inactive");
    await expect(deleteEmployeePermanently(nurse.ctx, leaver.employee.id)).rejects.toMatchObject({ code: "forbidden" });
    await deleteEmployeePermanently(co.owner, leaver.employee.id);

    const rows = await withSystem(async (tx) => ({
      employee: await tx.select().from(schema.employees).where(eq(schema.employees.id, leaver.employee.id)),
      requests: await tx.select().from(schema.leaveRequests).where(eq(schema.leaveRequests.id, req.id)),
      events: await tx.select().from(schema.leaveRequestEvents).where(eq(schema.leaveRequestEvents.requestId, req.id)),
      user: await tx.select().from(schema.users).where(eq(schema.users.id, leaver.userId)),
      managerRef: await tx.select({ m: schema.employees.managerId }).from(schema.employees).where(eq(schema.employees.id, nurse.employee.id)),
      audit: await tx.select().from(schema.auditLogs).where(and(eq(schema.auditLogs.action, "employee.deleted"), eq(schema.auditLogs.entityId, leaver.employee.id))),
    }));
    expect(rows.employee).toHaveLength(0);
    expect(rows.requests).toHaveLength(0);
    expect(rows.events).toHaveLength(0);
    expect(rows.user).toHaveLength(0);
    expect(rows.managerRef[0].m).toBeNull();
    expect(rows.audit).toHaveLength(1);
    expect(JSON.stringify(rows.audit[0].metadata)).not.toContain("Lotte");
    expect(await validateSessionToken(session.token)).toBeNull();
  });

  it("niemand kann sich selbst löschen", async () => {
    await expect(deleteEmployeePermanently(co.owner, co.owner.employeeId)).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("Aufbewahrungsfristen", () => {
  it("löscht abgelaufene Anfragen, E-Mail-Protokolle, Benachrichtigungen und Einladungen – frische bleiben", async () => {
    const old = new Date(Date.now() - 800 * 86_400_000);
    const tag = uniq("ret");
    const ids = await withSystem(async (tx) => {
      const [oldContact] = await tx
        .insert(schema.contactRequests)
        .values({ name: tag, email: `${tag}@example.test`, companyName: "Alt", privacyAcceptedAt: old, privacyNoticeVersion: "t", createdAt: old, updatedAt: old })
        .returning();
      const [newContact] = await tx
        .insert(schema.contactRequests)
        .values({ name: tag, email: `${tag}-neu@example.test`, companyName: "Neu", privacyAcceptedAt: new Date(), privacyNoticeVersion: "t" })
        .returning();
      const [oldMail] = await tx
        .insert(schema.emailDeliveries)
        .values({ toEmail: `${tag}@example.test`, template: "t", subject: "t", status: "sent", createdAt: old })
        .returning();
      const [oldNote] = await tx
        .insert(schema.notifications)
        .values({ companyId: co.company.id, userId: nurse.userId, type: "t", title: "alt", dedupeKey: `${tag}:n`, createdAt: old })
        .returning();
      return { oldContact: oldContact.id, newContact: newContact.id, oldMail: oldMail.id, oldNote: oldNote.id };
    });

    const result = await applyRetention();
    expect(result.contactRequests).toBeGreaterThanOrEqual(1);

    const after = await withSystem(async (tx) => ({
      oldContact: await tx.select().from(schema.contactRequests).where(eq(schema.contactRequests.id, ids.oldContact)),
      newContact: await tx.select().from(schema.contactRequests).where(eq(schema.contactRequests.id, ids.newContact)),
      oldMail: await tx.select().from(schema.emailDeliveries).where(eq(schema.emailDeliveries.id, ids.oldMail)),
      oldNote: await tx.select().from(schema.notifications).where(eq(schema.notifications.id, ids.oldNote)),
      invitations: await tx.select().from(schema.invitations).where(eq(schema.invitations.companyId, co.company.id)),
    }));
    expect(after.oldContact).toHaveLength(0);
    expect(after.newContact).toHaveLength(1);
    expect(after.oldMail).toHaveLength(0);
    expect(after.oldNote).toHaveLength(0);
    // Frisch angenommene Einladungen bleiben bis zum Fristablauf erhalten
    expect(after.invitations.length).toBeGreaterThan(0);
  });
});
