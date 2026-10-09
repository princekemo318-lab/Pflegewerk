/**
 * Öffentliche Website und Anfrageformular.
 */
import { expect, test } from "@playwright/test";

test("Startseite zeigt Botschaft, Navigation und gekennzeichnete Beispieldarstellung", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Personalverwaltung");
  await expect(page.getByText("Beispieldarstellung").first()).toBeVisible();
  for (const id of ["funktionen", "fuer-wen", "ablauf", "sicherheit", "faq", "kontakt"]) {
    await expect(page.locator(`#${id}`)).toHaveCount(1);
  }
});

test("Anfrageformular validiert Pflichtfelder und bestätigt die Übermittlung", async ({ page }) => {
  await page.goto("/#kontakt");
  const form = page.locator("#kontakt form");
  await form.getByRole("button", { name: "Demo anfragen" }).click();
  await expect(form.getByText("Bitte prüfe die markierten Felder.")).toBeVisible();

  await form.getByLabel("Name", { exact: true }).fill("E2E Interessentin");
  await form.getByLabel("Geschäftliche E-Mail-Adresse").fill("interessentin@e2e.test");
  await form.getByLabel("Unternehmen", { exact: true }).fill("E2E Ambulanter Dienst");
  await form.getByText("Urlaubsanträge & Genehmigungen").click();
  await form.getByText("Ich habe die Datenschutzhinweise gelesen.").click();
  // Spam-Schutz verlangt eine Mindestausfüllzeit
  await page.waitForTimeout(3200);
  await form.getByRole("button", { name: "Demo anfragen" }).click();
  await expect(page.getByText("Danke, deine Anfrage ist angekommen.")).toBeVisible();
});

test("Sicherheits-Header sind gesetzt", async ({ request }) => {
  const res = await request.get("/");
  const h = res.headers();
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-powered-by"]).toBeUndefined();
});
