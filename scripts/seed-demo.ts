/**
 * Legt ein klar gekennzeichnetes DEMO-Unternehmen mit Beispieldaten an.
 * Nur für lokale Entwicklung und Vorführungen – niemals in Produktion ausführen.
 *
 *   npm run db:seed-demo
 *
 * Alle Demo-Konten verwenden die Domain demo.pflegewerk.test (reservierte TLD)
 * und das Passwort aus DEMO_PASSWORD unten.
 */
import { eq } from "drizzle-orm";

try {
  process.loadEnvFile(".env.local");
} catch {}

export const DEMO_PASSWORD = "demo-passwort-2026";
const DOMAIN = "demo.pflegewerk.test";
const SLUG = "demo-sonnenhof";

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("Abbruch: Demo-Daten dürfen nicht in Produktion angelegt werden.");
    process.exit(1);
  }
  const { schema } = await import("../src/server/db");
  const { withSystem } = await import("../src/server/db/tenant");
  const { hashPassword } = await import("../src/server/auth/crypto");
  const { resolveTenantContext } = await import("../src/server/authz");
  const { createCompany } = await import("../src/server/services/platform");
  const { acceptInvitation } = await import("../src/server/services/invitations");
  const { createEmployee, updateEmployee } = await import("../src/server/services/employees");
  const { createLocation, createTeam, updateTeam, createCompanyHoliday } = await import("../src/server/services/organization");
  const { submitLeaveRequest, decideLeaveRequest, recordAbsence } = await import("../src/server/services/leave");
  const { submitContactRequest } = await import("../src/server/services/contact");
  const { addDays, todayIso, weekdayIndex, startOfWeek, weekdaysToMask } = await import("../src/lib/dates");

  const [existing] = await withSystem((tx) => tx.select().from(schema.companies).where(eq(schema.companies.slug, SLUG)));
  if (existing) {
    console.log("Demo-Unternehmen existiert bereits – nichts zu tun.");
    process.exit(0);
  }

  // Plattform-Admin für die Demo
  const adminEmail = `plattform@${DOMAIN}`;
  const adminId = await withSystem(async (tx) => {
    let [u] = await tx.select().from(schema.users).where(eq(schema.users.email, adminEmail));
    if (!u) {
      [u] = await tx
        .insert(schema.users)
        .values({ email: adminEmail, name: "Plattform Demo-Admin", passwordHash: await hashPassword(DEMO_PASSWORD), emailVerifiedAt: new Date() })
        .returning();
    }
    await tx.insert(schema.platformAdmins).values({ userId: u.id }).onConflictDoNothing();
    return u.id;
  });

  const ownerEmail = `geschaeftsfuehrung@${DOMAIN}`;
  const { company, invitation } = await createCompany(
    { userId: adminId },
    {
      name: "Demo · Pflegedienst Sonnenhof",
      slug: SLUG,
      defaultState: "NW",
      ownerFirstName: "Sabine",
      ownerLastName: "Keller",
      ownerEmail,
    },
  );
  await acceptInvitation({ token: invitation.url.split("/").pop()!, currentUserId: null, name: "Sabine Keller", password: DEMO_PASSWORD });
  const ownerUser = (await withSystem((tx) => tx.select().from(schema.users).where(eq(schema.users.email, ownerEmail))))[0];
  const owner = (await resolveTenantContext(ownerUser.id, company.id))!;

  const koeln = await createLocation(owner, { name: "Köln-Ehrenfeld", city: "Köln", state: "NW" });
  const bonn = await createLocation(owner, { name: "Bonn", city: "Bonn", state: "NW" });
  const ambulant = await createTeam(owner, { name: "Ambulante Pflege", locationId: koeln.id });
  const tagespflege = await createTeam(owner, { name: "Tagespflege", locationId: bonn.id });
  const betreuung = await createTeam(owner, { name: "Betreuung & Alltagshilfe", locationId: koeln.id });

  const roles = await withSystem((tx) => tx.select().from(schema.roles).where(eq(schema.roles.companyId, company.id)));
  const role = (n: string) => roles.find((r) => r.name === n)!.id;

  type Person = { first: string; last: string; role: string; team?: string; location: string; weekdays?: number; days?: number; job: string };
  const people: Person[] = [
    { first: "Jonas", last: "Wagner", role: "Pflegedienstleitung", location: koeln.id, job: "Pflegedienstleitung" },
    { first: "Aylin", last: "Demir", role: "Personalverwaltung", location: koeln.id, job: "Personalverwaltung", weekdays: weekdaysToMask([0, 1, 2, 3]), days: 24 },
    { first: "Marta", last: "Nowak", role: "Teamleitung", team: ambulant.id, location: koeln.id, job: "Teamleitung Ambulant" },
    { first: "Felix", last: "Brandt", role: "Mitarbeiter", team: ambulant.id, location: koeln.id, job: "Pflegefachkraft" },
    { first: "Lea", last: "Schubert", role: "Mitarbeiter", team: ambulant.id, location: koeln.id, job: "Pflegefachkraft" },
    { first: "Tobias", last: "Krüger", role: "Mitarbeiter", team: ambulant.id, location: koeln.id, job: "Pflegehelfer", weekdays: weekdaysToMask([0, 1, 2]), days: 18 },
    { first: "Nadine", last: "Hoffmann", role: "Teamleitung", team: tagespflege.id, location: bonn.id, job: "Teamleitung Tagespflege" },
    { first: "Emre", last: "Yıldız", role: "Mitarbeiter", team: tagespflege.id, location: bonn.id, job: "Pflegefachkraft" },
    { first: "Clara", last: "Fischer", role: "Mitarbeiter", team: tagespflege.id, location: bonn.id, job: "Betreuungskraft" },
    { first: "Paul", last: "Richter", role: "Mitarbeiter", team: betreuung.id, location: koeln.id, job: "Alltagsbegleiter" },
    { first: "Sofia", last: "Lang", role: "Mitarbeiter", team: betreuung.id, location: koeln.id, job: "Alltagsbegleiterin" },
  ];

  const ctxs: Record<string, Awaited<ReturnType<typeof resolveTenantContext>>> = {};
  const employeeIds: Record<string, string> = {};
  for (const p of people) {
    const email = `${p.first.toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "")}@${DOMAIN}`;
    const { employee, invitation: inv } = await createEmployee(owner, {
      firstName: p.first,
      lastName: p.last,
      email,
      jobTitle: p.job,
      teamId: p.team ?? "",
      locationId: p.location,
      weekdays: p.weekdays ?? 31,
      annualLeaveDays: p.days ?? 30,
      invite: true,
      roleId: role(p.role),
    });
    await acceptInvitation({ token: inv!.url.split("/").pop()!, currentUserId: null, name: `${p.first} ${p.last}`, password: DEMO_PASSWORD });
    const user = (await withSystem((tx) => tx.select().from(schema.users).where(eq(schema.users.email, email))))[0];
    ctxs[p.first] = await resolveTenantContext(user.id, company.id);
    employeeIds[p.first] = employee.id;
  }
  await updateTeam(owner, ambulant.id, { name: "Ambulante Pflege", locationId: koeln.id, leadEmployeeId: employeeIds.Marta });
  await updateTeam(owner, tagespflege.id, { name: "Tagespflege", locationId: bonn.id, leadEmployeeId: employeeIds.Nadine });
  await updateTeam(owner, betreuung.id, { name: "Betreuung & Alltagshilfe", locationId: koeln.id, leadEmployeeId: employeeIds.Marta });
  await updateEmployee(owner, employeeIds.Marta, { firstName: "Marta", lastName: "Nowak", jobTitle: "Teamleitung Ambulant", teamId: ambulant.id, locationId: koeln.id, managerId: employeeIds.Jonas });

  const year = Number(todayIso().slice(0, 4));
  await createCompanyHoliday(owner, { date: `${year}-12-24`, name: "Heiligabend (betriebsfrei)" });
  await createCompanyHoliday(owner, { date: `${year}-12-31`, name: "Silvester (betriebsfrei)" });

  const types = await withSystem((tx) => tx.select().from(schema.absenceTypes).where(eq(schema.absenceTypes.companyId, company.id)));
  const type = (k: string) => types.find((t) => t.key === k)!.id;

  // Wochenbezogene Termine relativ zu heute
  const monday = (weeks: number) => addDays(startOfWeek(todayIso()), weeks * 7);
  const workday = (d: string) => (weekdayIndex(d) > 4 ? addDays(d, 7 - weekdayIndex(d)) : d);
  const req = async (who: string, start: string, end: string, kind = "vacation", note?: string) =>
    submitLeaveRequest(ctxs[who]!, { startDate: workday(start), endDate: end, absenceTypeId: type(kind), note });

  const r1 = await req("Felix", monday(0), addDays(monday(0), 4), "vacation", "Familienbesuch");
  await decideLeaveRequest(ctxs.Marta!, r1.id, { decision: "approve", note: "Gute Erholung!" });
  const r2 = await req("Clara", monday(1), addDays(monday(1), 2));
  await decideLeaveRequest(ctxs.Nadine!, r2.id, { decision: "approve" });
  await req("Lea", monday(2), addDays(monday(2), 4), "vacation", "Vertretung mit Felix abgesprochen");
  await req("Emre", addDays(monday(3), 1), addDays(monday(3), 3));
  await req("Paul", monday(1), addDays(monday(1), 1), "training", "Fortbildung Demenzbegleitung");
  const r6 = await req("Sofia", monday(4), addDays(monday(4), 4));
  await decideLeaveRequest(ctxs.Marta!, r6.id, { decision: "reject", note: "In dieser Woche sind bereits zwei Kolleginnen im Urlaub. Bitte eine Woche später versuchen." });
  await recordAbsence(ctxs.Aylin!, employeeIds.Tobias, {
    startDate: workday(addDays(monday(0), 1)),
    endDate: addDays(monday(0), 2),
    absenceTypeId: type("sick"),
  });

  await submitContactRequest({
    fields: {
      name: "Beispiel Interessent (Demo)",
      email: `interessent@${DOMAIN}`,
      companyName: "Demo · Ambulanter Dienst Rheinblick",
      employeeRange: "26–50",
      locationCount: "2–3",
      interests: ["leave", "calendar"],
      message: "Beispielanfrage aus den Demo-Daten.",
      privacy: true,
    },
    honeypot: "",
    renderedAt: Date.now() - 60_000,
    ip: `seed-${Date.now()}`,
  });

  console.log(`
Demo-Daten angelegt (alle Konten: Passwort "${DEMO_PASSWORD}")
  Plattform-Admin:     ${adminEmail}
  Geschäftsführung:    ${ownerEmail}
  Pflegedienstleitung: jonas@${DOMAIN}
  Personalverwaltung:  aylin@${DOMAIN}
  Teamleitung:         marta@${DOMAIN}
  Mitarbeiter:         felix@${DOMAIN}, lea@${DOMAIN}, …
`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
