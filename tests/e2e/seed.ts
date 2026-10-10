/**
 * Testdaten für die E2E-Tests: zwei getrennte Unternehmen mit festen Testkonten.
 * Läuft nur gegen die E2E-Datenbank (siehe global-setup.ts).
 */
import { writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";

export const E2E_PASSWORD = "e2e-passwort-2026";

async function main() {
  if (!process.env.DATABASE_URL?.includes("pflegewerk_e2e")) throw new Error("Seed nur gegen pflegewerk_e2e");
  const { schema } = await import("../../src/server/db");
  const { withSystem } = await import("../../src/server/db/tenant");
  const { hashPassword } = await import("../../src/server/auth/crypto");
  const { resolveTenantContext } = await import("../../src/server/authz");
  const { createCompany } = await import("../../src/server/services/platform");
  const { acceptInvitation } = await import("../../src/server/services/invitations");
  const { createEmployee, setEntitlement } = await import("../../src/server/services/employees");
  const { createTeam, updateTeam } = await import("../../src/server/services/organization");
  const { submitLeaveRequest } = await import("../../src/server/services/leave");
  const { todayIso } = await import("../../src/lib/dates");

  const nextYear = Number(todayIso().slice(0, 4)) + 1;
  const [admin] = await withSystem((tx) =>
    tx
      .insert(schema.users)
      .values({ email: "plattform@e2e.test", name: "E2E Plattform" })
      .returning(),
  );
  await withSystem((tx) => tx.insert(schema.platformAdmins).values({ userId: admin.id }));
  await hashPassword("warmup");

  async function company(name: string, prefix: string) {
    const ownerEmail = `${prefix}-owner@e2e.test`;
    const { company, invitation } = await createCompany(
      { userId: admin.id },
      { name, defaultState: "NW", ownerFirstName: "Olivia", ownerLastName: `Owner ${prefix.toUpperCase()}`, ownerEmail },
    );
    await acceptInvitation({ token: invitation.url.split("/").pop()!, currentUserId: null, name: `Olivia ${prefix.toUpperCase()}`, password: E2E_PASSWORD });
    const [u] = await withSystem((tx) => tx.select().from(schema.users).where(eq(schema.users.email, ownerEmail)));
    const owner = (await resolveTenantContext(u.id, company.id))!;
    const roles = await withSystem((tx) => tx.select().from(schema.roles).where(eq(schema.roles.companyId, company.id)));
    const role = (n: string) => roles.find((r) => r.name === n)!.id;
    return { company, owner, role };
  }

  async function member(
    c: Awaited<ReturnType<typeof company>>,
    p: { email: string; first: string; last: string; role: string; teamId?: string },
  ) {
    const { employee, invitation } = await createEmployee(c.owner, {
      firstName: p.first,
      lastName: p.last,
      email: p.email,
      teamId: p.teamId ?? "",
      weekdays: 31,
      annualLeaveDays: 30,
      invite: true,
      roleId: c.role(p.role),
    });
    // Anspruch auch für das Folgejahr – die Tests planen dort, damit sie unabhängig vom Datum laufen.
    await setEntitlement(c.owner, employee.id, { year: nextYear, days: 30 });
    await acceptInvitation({ token: invitation!.url.split("/").pop()!, currentUserId: null, name: `${p.first} ${p.last}`, password: E2E_PASSWORD });
    const [u] = await withSystem((tx) => tx.select().from(schema.users).where(eq(schema.users.email, p.email)));
    return { employeeId: employee.id, ctx: (await resolveTenantContext(u.id, c.company.id))! };
  }

  const a = await company("E2E Pflege Nord", "a");
  const team = await createTeam(a.owner, { name: "Station Nord" });
  const lead = await member(a, { email: "a-lead@e2e.test", first: "Lars", last: "Leitung", role: "Teamleitung", teamId: team.id });
  await updateTeam(a.owner, team.id, { name: "Station Nord", leadEmployeeId: lead.employeeId });
  const emp = await member(a, { email: "a-emp@e2e.test", first: "Emma", last: "Ebert", role: "Mitarbeiter", teamId: team.id });
  await member(a, { email: "a-hr@e2e.test", first: "Hanna", last: "Huber", role: "Personalverwaltung" });

  const b = await company("E2E Pflege Süd", "b");
  await member(b, { email: "b-emp@e2e.test", first: "Bruno", last: "Bauer", role: "Mitarbeiter" });

  const types = await withSystem((tx) => tx.select().from(schema.absenceTypes).where(eq(schema.absenceTypes.companyId, a.company.id)));
  const vacation = types.find((t) => t.key === "vacation")!.id;
  const existing = await submitLeaveRequest(emp.ctx, {
    startDate: `${nextYear}-06-07`,
    endDate: `${nextYear}-06-09`,
    absenceTypeId: vacation,
    note: "Bestehender Antrag für Mandantentest",
  });

  writeFileSync(
    "tests/e2e/.fixtures.json",
    JSON.stringify({ password: E2E_PASSWORD, nextYear, companyARequestId: existing.id, companyAName: a.company.name, companyBName: b.company.name }, null, 2),
  );
  console.log("E2E-Testdaten angelegt.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
