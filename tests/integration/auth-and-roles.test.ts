import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@/server/db";
import { withSystem } from "@/server/db/tenant";
import { changePassword, createPasswordSetupLink, login, requestPasswordReset, resetPassword } from "@/server/auth/accounts";
import { validateSessionToken } from "@/server/auth/sessions";
import { acceptInvitation, getInvitation } from "@/server/services/invitations";
import { changeMemberRole, createRole, deleteRole, setMembershipStatus, updateRole } from "@/server/services/roles";
import { createEmployee, inviteEmployee, listEmployees } from "@/server/services/employees";
import { createTeam } from "@/server/services/organization";
import { addMember, PASSWORD, roleId, setupCompany, tokenFromUrl, uniq } from "../helpers/factory";
import { FIVE_DAY_WEEK } from "@/lib/dates";

let co: Awaited<ReturnType<typeof setupCompany>>;

beforeAll(async () => {
  co = await setupCompany();
});

describe("Anmeldung", () => {
  it("meldet mit korrektem Passwort an und lehnt falsche ab", async () => {
    const ip = uniq("ip");
    const session = await login({ email: co.ownerEmail.toUpperCase(), password: PASSWORD, ip });
    const valid = await validateSessionToken(session.token);
    expect(valid?.user.email).toBe(co.ownerEmail);
    await expect(login({ email: co.ownerEmail, password: "falsch-falsch", ip })).rejects.toThrow(
      "E-Mail-Adresse oder Passwort ist nicht korrekt.",
    );
    // Unbekannte E-Mail: identische Meldung (keine Kontoaufzählung)
    await expect(login({ email: "niemand@example.test", password: "egal-egal-1", ip })).rejects.toThrow(
      "E-Mail-Adresse oder Passwort ist nicht korrekt.",
    );
  });

  it("bremst Brute-Force-Versuche pro Konto", async () => {
    const m = await addMember(co.owner);
    for (let i = 0; i < 5; i++) {
      await expect(login({ email: m.email, password: "falsch-falsch", ip: uniq("ip") })).rejects.toMatchObject({ code: "invalid" });
    }
    await expect(login({ email: m.email, password: PASSWORD, ip: uniq("ip") })).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("speichert nur gehashte Session-Tokens", async () => {
    const session = await login({ email: co.ownerEmail, password: PASSWORD, ip: uniq("ip") });
    const rows = await withSystem((tx) => tx.select().from(schema.sessions));
    expect(rows.some((r) => r.id === session.token)).toBe(false);
    expect(await validateSessionToken("ungueltig")).toBeNull();
  });
});

describe("Passwort zurücksetzen", () => {
  it("setzt das Passwort, beendet alte Sitzungen und ist nur einmal nutzbar", async () => {
    const m = await addMember(co.owner);
    const old = await login({ email: m.email, password: PASSWORD, ip: uniq("ip") });
    const url = await createPasswordSetupLink(m.userId);
    const token = tokenFromUrl(url);
    await expect(resetPassword({ token, password: "kurz" })).rejects.toMatchObject({ code: "invalid" });
    await resetPassword({ token, password: "ein-neues-passwort-42" });
    expect(await validateSessionToken(old.token)).toBeNull();
    await expect(resetPassword({ token, password: "noch-ein-passwort-42" })).rejects.toMatchObject({ code: "invalid" });
    await login({ email: m.email, password: "ein-neues-passwort-42", ip: uniq("ip") });
  });

  it("antwortet für unbekannte Adressen ohne Fehler", async () => {
    await expect(requestPasswordReset({ email: "unbekannt@example.test", ip: uniq("ip") })).resolves.toBeUndefined();
  });

  it("Passwortänderung erfordert das aktuelle Passwort", async () => {
    const m = await addMember(co.owner);
    const s = await login({ email: m.email, password: PASSWORD, ip: uniq("ip") });
    const session = await validateSessionToken(s.token);
    await expect(
      changePassword({ userId: m.userId, sessionId: session!.id, currentPassword: "falsch-falsch", newPassword: "neues-passwort-99" }),
    ).rejects.toMatchObject({ code: "invalid" });
    await changePassword({ userId: m.userId, sessionId: session!.id, currentPassword: PASSWORD, newPassword: "neues-passwort-99" });
    expect(await validateSessionToken(s.token)).not.toBeNull();
  });
});

describe("Einladungen", () => {
  it("bestehende Konten müssen angemeldet sein, um eine Einladung anzunehmen", async () => {
    const other = await setupCompany();
    const { employee } = await createEmployee(other.owner, {
      firstName: "Doppel",
      lastName: "Mitglied",
      weekdays: FIVE_DAY_WEEK,
      annualLeaveDays: 30,
    });
    const inv = await inviteEmployee(other.owner, employee.id, {
      email: co.ownerEmail,
      roleId: await roleId(other.company.id, "Mitarbeiter"),
    });
    const token = tokenFromUrl(inv.url);
    expect((await getInvitation(token))?.userExists).toBe(true);
    await expect(acceptInvitation({ token, currentUserId: null })).rejects.toMatchObject({ code: "unauthenticated" });
    // Fehlversuch hat die Einladung nicht verbraucht
    expect((await getInvitation(token))?.state).toBe("valid");
    const result = await acceptInvitation({ token, currentUserId: co.owner.userId });
    expect(result.companyId).toBe(other.company.id);
    expect((await getInvitation(token))?.state).toBe("used");
  });

  it("widerrufene und unbekannte Einladungen sind ungültig", async () => {
    const { employee } = await createEmployee(co.owner, { firstName: "W", lastName: "Iderruf", weekdays: 31, annualLeaveDays: 30 });
    const first = await inviteEmployee(co.owner, employee.id, { email: `${uniq()}@example.test`, roleId: await roleId(co.company.id, "Mitarbeiter") });
    // Eine neue Einladung ersetzt die alte
    await inviteEmployee(co.owner, employee.id, { email: `${uniq()}@example.test`, roleId: await roleId(co.company.id, "Mitarbeiter") });
    expect((await getInvitation(tokenFromUrl(first.url)))?.state).toBe("revoked");
    expect(await getInvitation("gibt-es-nicht")).toBeNull();
  });
});

describe("Rollen und Rechteausweitung", () => {
  it("Personalverwaltung kann keine höher berechtigte Rolle vergeben", async () => {
    const hr = await addMember(co.owner, { role: "Personalverwaltung" });
    // ohne roles.manage nur die Standardrolle
    await expect(
      createEmployee(hr.ctx, {
        firstName: "X",
        lastName: "Y",
        email: `${uniq()}@example.test`,
        weekdays: 31,
        annualLeaveDays: 30,
        invite: true,
        roleId: await roleId(co.company.id, "Geschäftsführung"),
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const ok = await createEmployee(hr.ctx, {
      firstName: "X",
      lastName: "Standard",
      email: `${uniq()}@example.test`,
      weekdays: 31,
      annualLeaveDays: 30,
      invite: true,
      roleId: await roleId(co.company.id, "Mitarbeiter"),
    });
    expect(ok.invitation).not.toBeNull();
  });

  it("Teamleitung kann weder Rollen erstellen noch Mitarbeiter anlegen", async () => {
    const lead = await addMember(co.owner, { role: "Teamleitung" });
    await expect(createRole(lead.ctx, { name: "Hack", permissions: ["roles.manage"] })).rejects.toMatchObject({ code: "forbidden" });
    await expect(createEmployee(lead.ctx, { firstName: "A", lastName: "B", weekdays: 31, annualLeaveDays: 1 })).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(createTeam(lead.ctx, { name: "Neues Team" })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("Rollenverwalter ohne Inhaberrechte können sich nicht hochstufen", async () => {
    const managerRole = await createRole(co.owner, {
      name: uniq("Rollenverwaltung"),
      permissions: ["roles.manage", "employees.view"],
    });
    const rm = await addMember(co.owner);
    await changeMemberRole(co.owner, rm.employee.id, managerRole.id);
    const { ctxFor } = await import("../helpers/factory");
    const ctx = await ctxFor(rm.userId, co.company.id);

    // eigene Rolle ändern
    await expect(changeMemberRole(ctx, rm.employee.id, await roleId(co.company.id, "Geschäftsführung"))).rejects.toMatchObject({
      code: "forbidden",
    });
    // eigene Rolle bearbeiten
    await expect(
      updateRole(ctx, managerRole.id, { name: managerRole.name, permissions: ["roles.manage", "employees.view", "audit.view"] }),
    ).rejects.toMatchObject({ code: "forbidden" });
    // neue Rolle mit mehr Rechten
    await expect(createRole(ctx, { name: uniq("Mehr"), permissions: ["leave.approve_all"] })).rejects.toMatchObject({ code: "forbidden" });
    // anderen die Inhaberrolle geben
    const victim = await addMember(co.owner);
    await expect(changeMemberRole(ctx, victim.employee.id, await roleId(co.company.id, "Geschäftsführung"))).rejects.toMatchObject({
      code: "forbidden",
    });
    // Inhaber herabstufen
    await expect(changeMemberRole(ctx, co.owner.employeeId, await roleId(co.company.id, "Mitarbeiter"))).rejects.toMatchObject({
      code: "forbidden",
    });
    // erlaubt: Standardrolle → Rolle mit Teilmenge eigener Rechte
    const subset = await createRole(ctx, { name: uniq("Leser"), permissions: ["employees.view"] });
    await changeMemberRole(ctx, victim.employee.id, subset.id);
  });

  it("der letzte Inhaber bleibt erhalten", async () => {
    const solo = await setupCompany();
    const second = await addMember(solo.owner, { role: "Geschäftsführung" });
    // zweiter Inhaber stuft ersten herab – erlaubt, da noch ein Inhaber bleibt
    await changeMemberRole(second.ctx, solo.owner.employeeId, await roleId(solo.company.id, "Mitarbeiter"));
    const { ctxFor } = await import("../helpers/factory");
    const firstNow = await ctxFor(solo.owner.userId, solo.company.id);
    expect(firstNow.isOwner).toBe(false);
    // ohne roles.manage kann der Herabgestufte nichts mehr ändern
    await expect(changeMemberRole(firstNow, second.employee.id, await roleId(solo.company.id, "Mitarbeiter"))).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(setMembershipStatus(second.ctx, second.employee.id, "deactivated")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("Standard- und Inhaberrolle können nicht gelöscht werden", async () => {
    await expect(deleteRole(co.owner, await roleId(co.company.id, "Geschäftsführung"))).rejects.toMatchObject({ code: "conflict" });
    await expect(deleteRole(co.owner, await roleId(co.company.id, "Mitarbeiter"))).rejects.toMatchObject({ code: "conflict" });
  });

  it("deaktivierter Zugang verliert den Unternehmenskontext", async () => {
    const m = await addMember(co.owner);
    await setMembershipStatus(co.owner, m.employee.id, "deactivated");
    const { resolveTenantContext } = await import("@/server/authz");
    expect(await resolveTenantContext(m.userId, co.company.id)).toBeNull();
    await setMembershipStatus(co.owner, m.employee.id, "active");
    expect(await resolveTenantContext(m.userId, co.company.id)).not.toBeNull();
  });

  it("normale Mitarbeiter sehen keine Mitarbeiterliste", async () => {
    const m = await addMember(co.owner);
    await expect(listEmployees(m.ctx)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("Rollenwechsel wird im Audit-Log protokolliert", async () => {
    const m = await addMember(co.owner);
    await changeMemberRole(co.owner, m.employee.id, await roleId(co.company.id, "Teamleitung"));
    const logs = await withSystem((tx) =>
      tx.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, "membership.role_changed")),
    );
    expect(logs.some((l) => (l.metadata as { employeeId?: string })?.employeeId === m.employee.id)).toBe(true);
  });
});
