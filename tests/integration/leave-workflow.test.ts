import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { schema } from "@/server/db";
import { withSystem } from "@/server/db/tenant";
import {
  cancelLeaveRequest,
  decideLeaveRequest,
  getBalance,
  getLeaveRequest,
  listPendingApprovals,
  previewLeave,
  recordAbsence,
  sendPendingReminders,
  submitLeaveRequest,
  withdrawLeaveRequest,
} from "@/server/services/leave";
import { createLocation, createTeam, createCompanyHoliday } from "@/server/services/organization";
import { setEntitlement, setWorkSchedule, updateEmployee } from "@/server/services/employees";
import { getCalendar } from "@/server/services/calendar";
import { listNotifications } from "@/server/services/notifications";
import { absenceTypeId, addMember, setupCompany } from "../helpers/factory";
import { weekdaysToMask } from "@/lib/dates";

let co: Awaited<ReturnType<typeof setupCompany>>;
let lead: Awaited<ReturnType<typeof addMember>>;
let nurse: Awaited<ReturnType<typeof addMember>>;
let colleague: Awaited<ReturnType<typeof addMember>>;
let otherTeamNurse: Awaited<ReturnType<typeof addMember>>;
let hr: Awaited<ReturnType<typeof addMember>>;
let vacation: string;
let sick: string;

beforeAll(async () => {
  co = await setupCompany({ name: "Pflege Sonnenschein", state: "NW" });
  vacation = await absenceTypeId(co.company.id, "vacation");
  sick = await absenceTypeId(co.company.id, "sick");
  const location = await createLocation(co.owner, { name: "Köln", state: "NW" });
  const team = await createTeam(co.owner, { name: "Station 1", locationId: location.id });
  const team2 = await createTeam(co.owner, { name: "Station 2", locationId: location.id });
  lead = await addMember(co.owner, { firstName: "Lena", role: "Teamleitung", teamId: team.id, locationId: location.id });
  const { updateTeam } = await import("@/server/services/organization");
  await updateTeam(co.owner, team.id, { name: "Station 1", locationId: location.id, leadEmployeeId: lead.employee.id });
  nurse = await addMember(co.owner, { firstName: "Nina", teamId: team.id, locationId: location.id, annualLeaveDays: 10 });
  colleague = await addMember(co.owner, { firstName: "Carl", teamId: team.id, locationId: location.id });
  otherTeamNurse = await addMember(co.owner, { firstName: "Otto", teamId: team2.id, locationId: location.id });
  hr = await addMember(co.owner, { firstName: "Hanna", role: "Personalverwaltung" });
});

describe("Antrag stellen", () => {
  it("berechnet Arbeitstage inkl. Feiertag am Standort (Allerheiligen NRW fällt 2027 auf Montag)", async () => {
    const preview = await previewLeave(nurse.ctx, { startDate: "2027-11-01", endDate: "2027-11-05", absenceTypeId: vacation });
    expect(preview.total).toBe(4);
    expect(preview.days.find((d) => d.date === "2027-11-01")?.holidayName).toBe("Allerheiligen");
  });

  it("berücksichtigt betriebliche Feiertage", async () => {
    await createCompanyHoliday(co.owner, { date: "2026-12-24", name: "Heiligabend" });
    const preview = await previewLeave(nurse.ctx, { startDate: "2026-12-21", endDate: "2026-12-24", absenceTypeId: vacation });
    expect(preview.total).toBe(3);
  });

  it("reicht ein, benachrichtigt die Teamleitung und verhindert Überschneidungen", async () => {
    const r = await submitLeaveRequest(nurse.ctx, { startDate: "2026-11-09", endDate: "2026-11-13", absenceTypeId: vacation, note: "Familienbesuch" });
    expect(r.status).toBe("submitted");
    expect(r.workingDays).toBe(5);

    const notes = await listNotifications(lead.ctx);
    expect(notes.some((n) => n.link === `/app/genehmigungen/${r.id}`)).toBe(true);

    await expect(
      submitLeaveRequest(nurse.ctx, { startDate: "2026-11-12", endDate: "2026-11-16", absenceTypeId: vacation }),
    ).rejects.toMatchObject({ code: "conflict" });

    const balance = await getBalance(nurse.ctx, nurse.employee.id, 2026);
    expect(balance).toMatchObject({ entitlement: 10, approved: 0, pending: 5, available: 5 });
  });

  it("verhindert parallele Doppelanträge (Doppelklick)", async () => {
    const input = { startDate: "2026-11-23", endDate: "2026-11-24", absenceTypeId: vacation };
    const results = await Promise.allSettled([submitLeaveRequest(colleague.ctx, input), submitLeaveRequest(colleague.ctx, input)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });

  it("lehnt Zeiträume ohne Arbeitstage und mehr als den Resturlaub ab", async () => {
    await expect(
      submitLeaveRequest(nurse.ctx, { startDate: "2026-11-21", endDate: "2026-11-22", absenceTypeId: vacation }),
    ).rejects.toMatchObject({ code: "invalid" });
    // 5 beantragt + 6 neu > 10
    await expect(
      submitLeaveRequest(nurse.ctx, { startDate: "2026-11-30", endDate: "2026-12-07", absenceTypeId: vacation }),
    ).rejects.toThrow(/stehen nur noch/);
  });

  it("Mitarbeiter können Arbeitsunfähigkeit nicht selbst beantragen", async () => {
    await expect(
      submitLeaveRequest(nurse.ctx, { startDate: "2026-12-01", endDate: "2026-12-01", absenceTypeId: sick }),
    ).rejects.toMatchObject({ code: "invalid" });
  });

  it("validiert Eingaben serverseitig", async () => {
    await expect(
      submitLeaveRequest(nurse.ctx, { startDate: "2026-12-10", endDate: "2026-12-01", absenceTypeId: vacation }),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(
      submitLeaveRequest(nurse.ctx, { startDate: "kaputt", endDate: "2026-12-01", absenceTypeId: vacation }),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(
      submitLeaveRequest(nurse.ctx, { startDate: "2026-12-01", endDate: "2026-12-01", absenceTypeId: "nicht-uuid" }),
    ).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("Genehmigen und Ablehnen", () => {
  it("Teamleitung sieht nur Anträge des eigenen Teams", async () => {
    const other = await submitLeaveRequest(otherTeamNurse.ctx, { startDate: "2026-11-16", endDate: "2026-11-16", absenceTypeId: vacation });
    const pending = await listPendingApprovals(lead.ctx);
    expect(pending.some((p) => p.employeeId === nurse.employee.id)).toBe(true);
    expect(pending.some((p) => p.id === other.id)).toBe(false);
    await expect(decideLeaveRequest(lead.ctx, other.id, { decision: "approve" })).rejects.toMatchObject({ code: "forbidden" });
    // Personalverwaltung (approve_all) darf
    await decideLeaveRequest(hr.ctx, other.id, { decision: "approve" });
  });

  it("normale Mitarbeiter dürfen nicht genehmigen", async () => {
    const [req] = await listPendingApprovals(lead.ctx);
    await expect(decideLeaveRequest(colleague.ctx, req.id, { decision: "approve" })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("eigene Anträge können nicht selbst genehmigt werden – auch nicht vom Inhaber", async () => {
    const own = await submitLeaveRequest(co.owner, { startDate: "2026-11-17", endDate: "2026-11-17", absenceTypeId: vacation });
    await expect(decideLeaveRequest(co.owner, own.id, { decision: "approve" })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("Ablehnung erfordert eine Begründung", async () => {
    const [req] = (await listPendingApprovals(lead.ctx)).filter((p) => p.employeeId === nurse.employee.id);
    await expect(decideLeaveRequest(lead.ctx, req.id, { decision: "reject", note: "" })).rejects.toMatchObject({ code: "invalid" });
  });

  it("genehmigt genau einmal, aktualisiert Saldo, Verlauf und benachrichtigt", async () => {
    const [req] = (await listPendingApprovals(lead.ctx)).filter((p) => p.employeeId === nurse.employee.id);
    const results = await Promise.allSettled([
      decideLeaveRequest(lead.ctx, req.id, { decision: "approve", note: "Viel Spaß" }),
      decideLeaveRequest(hr.ctx, req.id, { decision: "reject", note: "Engpass" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);

    const detail = await getLeaveRequest(nurse.ctx, req.id);
    expect(["approved", "rejected"]).toContain(detail.request.status);
    expect(detail.events.map((e) => e.type)).toEqual(["submitted", detail.request.status]);
    const notes = await listNotifications(nurse.ctx);
    expect(notes.filter((n) => n.link === `/app/antraege/${req.id}`)).toHaveLength(1);
    if (detail.request.status === "approved") {
      const balance = await getBalance(nurse.ctx, nurse.employee.id, 2026);
      expect(balance).toMatchObject({ approved: 5, pending: 0, remaining: 5 });
    }
  });

  it("Zurückziehen nur bei offenen eigenen Anträgen", async () => {
    const r = await submitLeaveRequest(colleague.ctx, { startDate: "2026-12-14", endDate: "2026-12-15", absenceTypeId: vacation });
    await expect(withdrawLeaveRequest(nurse.ctx, r.id)).rejects.toMatchObject({ code: "forbidden" });
    await withdrawLeaveRequest(colleague.ctx, r.id);
    await expect(withdrawLeaveRequest(colleague.ctx, r.id)).rejects.toMatchObject({ code: "conflict" });
    // Tage sind wieder frei
    const again = await submitLeaveRequest(colleague.ctx, { startDate: "2026-12-14", endDate: "2026-12-15", absenceTypeId: vacation });
    expect(again.status).toBe("submitted");
  });

  it("Stornierung genehmigter Abwesenheiten gibt Tage frei", async () => {
    const r = await submitLeaveRequest(colleague.ctx, { startDate: "2027-02-01", endDate: "2027-02-05", absenceTypeId: vacation });
    await decideLeaveRequest(lead.ctx, r.id, { decision: "approve" });
    await expect(cancelLeaveRequest(colleague.ctx, r.id, "Doch nicht")).rejects.toMatchObject({ code: "forbidden" });
    await cancelLeaveRequest(hr.ctx, r.id, "Auf Wunsch storniert");
    const days = await withSystem((tx) =>
      tx.select().from(schema.leaveRequestDays).where(eq(schema.leaveRequestDays.requestId, r.id)),
    );
    expect(days).toHaveLength(0);
  });
});

describe("Verwaltung erfasst Abwesenheiten", () => {
  it("Personalverwaltung erfasst Arbeitsunfähigkeit, Mitarbeiter nicht", async () => {
    const r = await recordAbsence(hr.ctx, nurse.employee.id, { startDate: "2026-12-02", endDate: "2026-12-03", absenceTypeId: sick });
    expect(r.status).toBe("approved");
    await expect(
      recordAbsence(colleague.ctx, nurse.employee.id, { startDate: "2026-12-08", endDate: "2026-12-08", absenceTypeId: sick }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("Kalender und Datensparsamkeit", () => {
  it("Kollegen sehen nur 'Abwesend' ohne Grund und keine offenen Anträge", async () => {
    const cal = await getCalendar(colleague.ctx, { start: "2026-12-01", end: "2026-12-31" });
    const nurseEntries = cal.entries.filter((e) => e.employeeId === nurse.employee.id);
    expect(nurseEntries.length).toBeGreaterThan(0);
    expect(nurseEntries.every((e) => e.masked && e.label === "Abwesend" && e.href === null)).toBe(true);
    expect(nurseEntries.every((e) => e.status === "approved")).toBe(true);
    // Mitarbeiter anderer Teams sind bei Scope "team" nicht sichtbar
    expect(cal.employees.some((e) => e.id === otherTeamNurse.employee.id)).toBe(false);
  });

  it("Teamleitung sieht offene Anträge, aber keine Gesundheitsdaten; Verwaltung sieht die Art", async () => {
    const cal = await getCalendar(lead.ctx, { start: "2026-12-01", end: "2026-12-31" });
    const sickEntry = cal.entries.find((e) => e.employeeId === nurse.employee.id && e.startDate === "2026-12-02");
    expect(sickEntry?.masked).toBe(true);
    expect(sickEntry?.label).toBe("Abwesend");
    expect(cal.entries.some((e) => e.status === "submitted" && !e.masked)).toBe(true);
    const hrSick = (await getCalendar(hr.ctx, { start: "2026-12-01", end: "2026-12-31" })).entries.find(
      (e) => e.employeeId === nurse.employee.id && e.startDate === "2026-12-02",
    );
    expect(hrSick?.label).toBe("Arbeitsunfähigkeit");
    const hrCal = await getCalendar(hr.ctx, { start: "2026-12-01", end: "2026-12-31" });
    expect(hrCal.entries.some((e) => e.status === "submitted")).toBe(true);
  });

  it("Kollegen können Antragsdetails nicht über die ID abrufen", async () => {
    const cal = await getCalendar(lead.ctx, { start: "2026-12-01", end: "2026-12-31" });
    const entry = cal.entries.find((e) => e.employeeId === nurse.employee.id)!;
    await expect(getLeaveRequest(colleague.ctx, entry.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("Arbeitszeitmodelle und Ansprüche", () => {
  it("Teilzeitmodell wirkt ab Gültigkeitsdatum", async () => {
    const part = await addMember(co.owner, { firstName: "Paula", weekdays: weekdaysToMask([0, 1, 2]) });
    const p1 = await previewLeave(part.ctx, { startDate: "2027-03-01", endDate: "2027-03-07", absenceTypeId: vacation });
    expect(p1.total).toBe(3);
    await setWorkSchedule(co.owner, part.employee.id, { validFrom: "2027-03-04", weekdays: 31 });
    const p2 = await previewLeave(part.ctx, { startDate: "2027-03-01", endDate: "2027-03-07", absenceTypeId: vacation });
    // Mo–Mi (3) + Do, Fr (2)
    expect(p2.total).toBe(5);
  });

  it("Anspruch ohne Konfiguration wird gekennzeichnet", async () => {
    const b = await getBalance(nurse.ctx, nurse.employee.id, 2030);
    expect(b.configured).toBe(false);
    await setEntitlement(co.owner, nurse.employee.id, { year: 2030, days: 28, carryoverDays: 2 });
    expect((await getBalance(nurse.ctx, nurse.employee.id, 2030)).remaining).toBe(30);
  });

  it("Kollegen sehen fremde Salden nicht", async () => {
    await expect(getBalance(colleague.ctx, nurse.employee.id, 2026)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("Ausgeschiedene können keine Anträge stellen", async () => {
    const leaver = await addMember(co.owner, { firstName: "Lars" });
    const { setEmployeeStatus } = await import("@/server/services/employees");
    await setEmployeeStatus(co.owner, leaver.employee.id, "inactive");
    const { resolveTenantContext } = await import("@/server/authz");
    expect(await resolveTenantContext(leaver.userId, co.company.id)).toBeNull();
  });

  it("Führungskraft wird als zuständig erkannt", async () => {
    const mgr = await addMember(co.owner, { firstName: "Max", role: "Teamleitung" });
    const report = await addMember(co.owner, { firstName: "Rita" });
    await updateEmployee(co.owner, report.employee.id, {
      firstName: "Rita",
      lastName: "Report",
      managerId: mgr.employee.id,
    });
    const r = await submitLeaveRequest(report.ctx, { startDate: "2027-01-11", endDate: "2027-01-11", absenceTypeId: vacation });
    const pending = await listPendingApprovals(mgr.ctx);
    expect(pending.map((p) => p.id)).toContain(r.id);
  });
});

describe("Erinnerungen", () => {
  it("erzeugt höchstens eine Erinnerung pro Antrag und Tag", async () => {
    const r = await submitLeaveRequest(colleague.ctx, { startDate: "2027-04-12", endDate: "2027-04-12", absenceTypeId: vacation });
    await withSystem((tx) =>
      tx
        .update(schema.leaveRequests)
        .set({ createdAt: new Date(Date.now() - 10 * 86_400_000) })
        .where(and(eq(schema.leaveRequests.id, r.id))),
    );
    const run = () => withSystem((tx, hooks) => sendPendingReminders(tx, hooks, "2027-04-01"));
    const first = await run();
    const second = await run();
    expect(first).toBeGreaterThan(0);
    expect(second).toBe(0);
    const reminders = (await listNotifications(lead.ctx)).filter((n) => n.type === "leave.reminder" && n.link?.endsWith(r.id));
    expect(reminders).toHaveLength(1);
  });
});
