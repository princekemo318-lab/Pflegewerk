import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@/server/db";
import { withSystem } from "@/server/db/tenant";
import {
  addContactNote,
  deleteContactRequest,
  getContactRequest,
  listContactRequests,
  submitContactRequest,
  updateContactStatus,
} from "@/server/services/contact";
import { createCompany, getCompanyDetail, getPlatformStats, inviteCompanyAdmin, listCompanies } from "@/server/services/platform";
import { createPlatformAdmin, uniq } from "../helpers/factory";

const valid = (overrides: Record<string, unknown> = {}) => ({
  name: "Petra Pflege",
  email: `${uniq("lead")}@example.test`,
  companyName: uniq("Ambulanter Dienst"),
  employeeRange: "26–50",
  locationCount: "2–3",
  interests: ["leave", "calendar", "unbekannt"],
  message: "Wir suchen eine Lösung für Urlaubsanträge.",
  privacy: true,
  ...overrides,
});

describe("Anfrageformular", () => {
  it("speichert gültige Anfragen und filtert unbekannte Interessen", async () => {
    const fields = valid();
    const r = await submitContactRequest({ fields, honeypot: "", renderedAt: Date.now() - 10_000, ip: uniq("ip") });
    expect(r.stored).toBe(true);
    const [row] = await withSystem((tx) => tx.select().from(schema.contactRequests).where(eq(schema.contactRequests.email, fields.email)));
    expect(row.interests).toEqual(["leave", "calendar"]);
    expect(row.status).toBe("new");
  });

  it("validiert Pflichtfelder und Datenschutzbestätigung", async () => {
    await expect(
      submitContactRequest({ fields: valid({ email: "kaputt" }), honeypot: "", renderedAt: Date.now() - 10_000, ip: uniq("ip") }),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(
      submitContactRequest({ fields: valid({ privacy: false }), honeypot: "", renderedAt: Date.now() - 10_000, ip: uniq("ip") }),
    ).rejects.toMatchObject({ code: "invalid" });
  });

  it("verwirft Honeypot- und Sofort-Übermittlungen still", async () => {
    const a = valid();
    expect((await submitContactRequest({ fields: a, honeypot: "http://spam", renderedAt: Date.now() - 10_000, ip: uniq("ip") })).stored).toBe(false);
    const b = valid();
    expect((await submitContactRequest({ fields: b, honeypot: "", renderedAt: Date.now(), ip: uniq("ip") })).stored).toBe(false);
    const rows = await withSystem((tx) => tx.select().from(schema.contactRequests));
    expect(rows.some((r) => r.email === a.email || r.email === b.email)).toBe(false);
  });

  it("begrenzt Anfragen pro IP", async () => {
    const ip = uniq("ip");
    for (let i = 0; i < 5; i++) {
      await submitContactRequest({ fields: valid(), honeypot: "", renderedAt: Date.now() - 10_000, ip });
    }
    await expect(
      submitContactRequest({ fields: valid(), honeypot: "", renderedAt: Date.now() - 10_000, ip }),
    ).rejects.toMatchObject({ code: "rate_limited" });
  });
});

describe("Plattform-Administration", () => {
  it("verwaltet Anfragen mit Verlauf und löscht sie endgültig", async () => {
    const admin = await createPlatformAdmin();
    const fields = valid();
    await submitContactRequest({ fields, honeypot: "", renderedAt: Date.now() - 10_000, ip: uniq("ip") });
    const list = await listContactRequests(admin, { q: fields.companyName });
    expect(list.rows).toHaveLength(1);
    const id = list.rows[0].id;
    await updateContactStatus(admin, id, "contacted");
    await addContactNote(admin, id, { kind: "call", body: "Rückruf vereinbart" });
    const detail = await getContactRequest(admin, id);
    expect(detail.request.status).toBe("contacted");
    expect(detail.notes.map((n) => n.kind).sort()).toEqual(["call", "status_change"]);
    await deleteContactRequest(admin, id);
    await expect(getContactRequest(admin, id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("legt Unternehmen mit Standardrollen an und berechnet Kennzahlen aus echten Daten", async () => {
    const admin = await createPlatformAdmin();
    const before = await getPlatformStats(admin);
    const { company, invitation } = await createCompany(admin, {
      name: "Betreuung Nord",
      defaultState: "HH",
      ownerFirstName: "Nora",
      ownerLastName: "Nord",
      ownerEmail: `${uniq("nora")}@example.test`,
    });
    expect(invitation.url).toContain("/einladung/");
    expect(invitation.delivery.status).toBe("not_configured");
    const after = await getPlatformStats(admin);
    expect(after.companies.total).toBe(before.companies.total + 1);
    const detail = await getCompanyDetail(admin, company.id);
    expect(detail.roles.map((r) => r.name).sort()).toEqual(
      ["Geschäftsführung", "Mitarbeiter", "Personalverwaltung", "Pflegedienstleitung", "Teamleitung"].sort(),
    );
    expect(detail.invitations).toHaveLength(1);
    const search = await listCompanies(admin, { q: "Betreuung Nord" });
    expect(search.rows.some((r) => r.id === company.id)).toBe(true);

    await expect(
      createCompany(admin, {
        name: "Betreuung Nord",
        defaultState: "HH",
        ownerFirstName: "A",
        ownerLastName: "B",
        ownerEmail: `${uniq()}@example.test`,
      }),
    ).rejects.toMatchObject({ code: "invalid" });

    const second = await inviteCompanyAdmin(admin, company.id, { firstName: "Zweite", lastName: "Leitung", email: `${uniq()}@example.test` });
    expect(second.url).toContain("/einladung/");
  });
});
