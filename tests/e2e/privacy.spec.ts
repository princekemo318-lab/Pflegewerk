/**
 * Datenschutz im Browser: Gesundheitsdaten sind für Teamleitungen verborgen,
 * Betroffene können ihre Daten exportieren.
 */
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { addDays, as, fixtures, mondayOfWeek } from "./helpers";

test.describe.configure({ mode: "serial" });

test("Arbeitsunfähigkeit: Personalverwaltung trägt ein, Teamleitung sieht nur 'Abwesend'", async ({ browser }) => {
  const start = addDays(mondayOfWeek(fixtures().nextYear, 20), 1);
  const end = addDays(start, 1);

  const hr = await as(browser, "a-hr@e2e.test");
  await hr.page.goto("/app/mitarbeiter");
  await hr.page.getByRole("link", { name: "Ebert, Emma" }).click();
  await hr.page.getByRole("link", { name: "Abwesenheit eintragen" }).click();
  await expect(hr.page.locator("[data-ready=true]")).toBeVisible();
  await hr.page.getByLabel("Art der Abwesenheit").selectOption({ label: "Arbeitsunfähigkeit" });
  await hr.page.getByLabel("Erster Tag").fill(start);
  await hr.page.getByLabel("Letzter Tag").fill(end);
  const submit = hr.page.getByRole("button", { name: "Abwesenheit eintragen" });
  await expect(submit).toBeEnabled();
  await submit.click();
  await hr.page.waitForURL(/\/app\/mitarbeiter\/[0-9a-f-]{36}$/);
  await expect(hr.page.getByText("Arbeitsunfähigkeit").first()).toBeVisible();
  await hr.close();

  const lead = await as(browser, "a-lead@e2e.test");
  await lead.page.goto(`/app/kalender?datum=${start}`);
  const grid = lead.page.locator("main");
  await expect(grid.getByText("Abwesend").first()).toBeVisible();
  await expect(grid.getByText("Arbeitsunfähigkeit")).toHaveCount(0);
  await lead.close();

  const emp = await as(browser, "a-emp@e2e.test");
  await emp.page.goto(`/app/kalender?datum=${start}`);
  await expect(emp.page.locator("main").getByText("Arbeitsunfähigkeit").first()).toBeVisible();
  await emp.close();
});

test("Mitarbeiterin lädt ihre Daten als JSON herunter", async ({ browser }) => {
  const emp = await as(browser, "a-emp@e2e.test");
  await emp.page.goto("/app/profil");
  const [download] = await Promise.all([
    emp.page.waitForEvent("download"),
    emp.page.getByRole("link", { name: "Daten herunterladen" }).click(),
  ]);
  const data = JSON.parse(readFileSync((await download.path())!, "utf8"));
  expect(data.format).toBe("pflegewerk-datenexport/1");
  expect(data.employee.lastName).toBe("Ebert");
  expect(data.account.email).toBe("a-emp@e2e.test");
  expect(data.leaveRequests.length).toBeGreaterThan(0);
  expect(JSON.stringify(data)).not.toContain("a-lead@e2e.test");
  await emp.close();
});
