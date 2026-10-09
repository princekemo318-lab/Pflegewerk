/**
 * Kernprozesse im Browser: Antrag → Genehmigung, Ablehnung, Stornierung, Zurückziehen.
 * Die Tests bauen aufeinander auf und laufen deshalb seriell.
 */
import { expect, test } from "@playwright/test";
import { addDays, as, de, fixtures, mondayOfWeek, submitVacation } from "./helpers";

test.describe.configure({ mode: "serial" });

const f = () => fixtures();
let approvedPath = "";

test("Mitarbeiterin beantragt Urlaub, Teamleitung genehmigt, Mitarbeiterin sieht das Ergebnis", async ({ browser }) => {
  const start = mondayOfWeek(f().nextYear, 6);
  const end = addDays(start, 4);

  const emp = await as(browser, "a-emp@e2e.test");
  // Live-Berechnung: Mo–Fr ohne Feiertag = 5 Arbeitstage
  await emp.page.goto("/app/antraege/neu");
  await emp.page.getByLabel("Erster Tag").fill(start);
  await emp.page.getByLabel("Letzter Tag").fill(end);
  await expect(emp.page.locator("aside").getByText("5", { exact: true })).toBeVisible();
  approvedPath = await submitVacation(emp.page, start, end, "Skiurlaub");
  const requestId = approvedPath.split("/").pop()!;

  const lead = await as(browser, "a-lead@e2e.test");
  await lead.page.goto("/app/genehmigungen");
  await lead.page.locator(`a[href="/app/genehmigungen/${requestId}"]`).click();
  await expect(lead.page.getByRole("heading", { name: "Antrag von Emma Ebert" })).toBeVisible();
  await expect(lead.page.getByText("Skiurlaub")).toBeVisible();
  await lead.page.getByLabel("Begründung").fill("Gute Erholung!");
  await lead.page.getByRole("button", { name: "Genehmigen" }).click();
  await lead.page.waitForURL("**/app/genehmigungen");
  await expect(lead.page.getByText("Antrag genehmigt.")).toBeVisible();
  await lead.close();

  await emp.page.goto(approvedPath);
  await expect(emp.page.getByText("Genehmigt").first()).toBeVisible();
  await expect(emp.page.getByText("Gute Erholung!").first()).toBeVisible();
  await emp.page.goto("/app/benachrichtigungen");
  await expect(emp.page.getByText("Dein Antrag wurde genehmigt")).toBeVisible();
  await emp.close();
});

test("Ablehnung erfordert eine Begründung und wird der Mitarbeiterin angezeigt", async ({ browser }) => {
  const start = mondayOfWeek(f().nextYear, 10);
  const emp = await as(browser, "a-emp@e2e.test");
  const path = await submitVacation(emp.page, start, addDays(start, 1));

  const lead = await as(browser, "a-lead@e2e.test");
  await lead.page.goto(path.replace("/app/antraege/", "/app/genehmigungen/"));
  await lead.page.getByRole("button", { name: "Ablehnen" }).click();
  await expect(lead.page.getByText("Bitte eine kurze Begründung angeben.").first()).toBeVisible();
  await lead.page.getByLabel("Begründung").fill("In dieser Woche ist das Team unterbesetzt.");
  await lead.page.getByRole("button", { name: "Ablehnen" }).click();
  await lead.page.waitForURL("**/app/genehmigungen");
  await lead.close();

  await emp.page.goto(path);
  await expect(emp.page.getByText("Abgelehnt").first()).toBeVisible();
  await expect(emp.page.getByText("In dieser Woche ist das Team unterbesetzt.").first()).toBeVisible();
  await expect(emp.page.getByRole("button", { name: "Antrag zurückziehen" })).toHaveCount(0);
  await emp.close();
});

test("Personalverwaltung storniert eine genehmigte Abwesenheit", async ({ browser }) => {
  const hr = await as(browser, "a-hr@e2e.test");
  await hr.page.goto(approvedPath.replace("/app/antraege/", "/app/genehmigungen/"));
  await hr.page.getByRole("button", { name: "Genehmigung stornieren" }).click();
  const dialog = hr.page.getByRole("dialog");
  await dialog.getByLabel("Begründung").fill("Auf Wunsch der Mitarbeiterin storniert");
  await dialog.getByRole("button", { name: "Stornieren" }).click();
  await expect(hr.page.getByText("Abwesenheit storniert.")).toBeVisible();
  await hr.close();

  const emp = await as(browser, "a-emp@e2e.test");
  await emp.page.goto(approvedPath);
  await expect(emp.page.getByText("Storniert").first()).toBeVisible();
  // Tage sind wieder frei: derselbe Zeitraum kann erneut beantragt werden
  const start = mondayOfWeek(f().nextYear, 6);
  await submitVacation(emp.page, start, addDays(start, 4));
  await emp.close();
});

test("Mitarbeiterin zieht einen offenen Antrag zurück", async ({ browser }) => {
  const start = mondayOfWeek(f().nextYear, 14);
  const emp = await as(browser, "a-emp@e2e.test");
  const path = await submitVacation(emp.page, start, addDays(start, 2));
  await emp.page.getByRole("button", { name: "Antrag zurückziehen" }).click();
  await emp.page.getByRole("dialog").getByRole("button", { name: "Zurückziehen" }).click();
  await expect(emp.page.getByText("Antrag zurückgezogen.")).toBeVisible();
  await emp.page.reload();
  await expect(emp.page.getByText("Zurückgezogen").first()).toBeVisible();
  await emp.page.goto("/app/antraege?jahr=" + f().nextYear);
  await expect(emp.page.locator(`a[href="${path}"]`)).toContainText(de(start));
  await emp.close();
});

test("Überschneidende Anträge werden verhindert", async ({ browser }) => {
  const start = mondayOfWeek(f().nextYear, 6);
  const emp = await as(browser, "a-emp@e2e.test");
  await emp.page.goto("/app/antraege/neu");
  await emp.page.getByLabel("Erster Tag").fill(addDays(start, 2));
  await emp.page.getByLabel("Letzter Tag").fill(addDays(start, 3));
  await expect(emp.page.getByText(/Überschneidet sich mit einem bestehenden Antrag/)).toBeVisible();
  await expect(emp.page.getByRole("button", { name: "Antrag einreichen" })).toBeDisabled();
  await emp.close();
});
