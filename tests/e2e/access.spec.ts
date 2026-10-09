/**
 * Mandantentrennung und Berechtigungen im Browser.
 */
import { expect, test } from "@playwright/test";
import { as, fixtures, login } from "./helpers";

test("ohne Anmeldung leitet die App zur Anmeldung um", async ({ page }) => {
  await page.goto("/app/genehmigungen");
  await expect(page).toHaveURL(/\/login\?next=%2Fapp/);
});

test("falsches Passwort zeigt eine neutrale Fehlermeldung", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-Mail-Adresse").fill("a-emp@e2e.test");
  await page.getByLabel("Passwort", { exact: true }).fill("falsches-passwort");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByText("E-Mail-Adresse oder Passwort ist nicht korrekt.")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("Mitarbeiter eines anderen Unternehmens kann einen fremden Antrag nicht öffnen", async ({ browser }) => {
  const { companyARequestId } = fixtures();
  const b = await as(browser, "b-emp@e2e.test");
  for (const path of [`/app/antraege/${companyARequestId}`, `/app/genehmigungen/${companyARequestId}`]) {
    await b.page.goto(path);
    await expect(b.page.getByRole("heading", { name: "Diese Seite gibt es nicht" })).toBeVisible();
    await expect(b.page.getByText("Bestehender Antrag für Mandantentest")).toHaveCount(0);
    await expect(b.page.getByText("Emma")).toHaveCount(0);
  }
  await b.close();
});

test("Inhaber eines anderen Unternehmens sieht keine fremden Mitarbeiter oder Kalendereinträge", async ({ browser }) => {
  const { companyAName, nextYear } = fixtures();
  const b = await as(browser, "b-owner@e2e.test");
  await b.page.goto("/app/mitarbeiter?status=all");
  await expect(b.page.getByText("Bauer, Bruno")).toBeVisible();
  await expect(b.page.getByText("Ebert")).toHaveCount(0);
  await expect(b.page.getByText("Leitung")).toHaveCount(0);
  await b.page.goto(`/app/kalender?datum=${nextYear}-06-07`);
  await expect(b.page.getByText("Emma Ebert")).toHaveCount(0);
  await expect(b.page.getByText(companyAName)).toHaveCount(0);
  await b.close();
});

test("normale Mitarbeiter erreichen weder Verwaltung noch Plattform-Admin", async ({ page }) => {
  await login(page, "a-emp@e2e.test");
  for (const path of ["/app/mitarbeiter", "/app/rollen", "/app/einstellungen", "/app/protokoll", "/admin"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Diese Seite gibt es nicht" })).toBeVisible();
  }
  // Navigation zeigt nur erlaubte Bereiche
  await page.goto("/app");
  await expect(page.getByRole("link", { name: "Rollen & Rechte" })).toHaveCount(0);
});

test("Teamleitung kann eigene Rolle nicht ändern und keine Rollen verwalten", async ({ page }) => {
  await login(page, "a-lead@e2e.test");
  await page.goto("/app/rollen");
  await expect(page.getByRole("heading", { name: "Diese Seite gibt es nicht" })).toBeVisible();
});

test("Plattform-Admin ist für Unternehmensinhaber nicht erreichbar", async ({ page }) => {
  await login(page, "a-owner@e2e.test");
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Diese Seite gibt es nicht" })).toBeVisible();
});
