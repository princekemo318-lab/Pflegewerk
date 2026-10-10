/**
 * Mobile Darstellung (Pixel 7): kein horizontales Scrollen, Navigation über das Menü.
 */
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

async function expectNoHorizontalScroll(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test("Startseite ist mobil ohne horizontales Scrollen nutzbar", async ({ page }) => {
  await page.goto("/");
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: "Menü öffnen" }).click();
  await page.locator("#marketing-menu").getByRole("link", { name: "FAQ" }).click();
  await expect(page.locator("#faq")).toBeInViewport();
});

test("App ist mobil nutzbar: Menü, Antragsliste und Kalender", async ({ page }) => {
  await login(page, "a-emp@e2e.test");
  for (const path of ["/app", "/app/antraege", "/app/antraege/neu", "/app/kalender"]) {
    await page.goto(path);
    await expectNoHorizontalScroll(page);
  }
  await page.getByRole("button", { name: "Menü öffnen" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Meine Anträge" }).click();
  await expect(page).toHaveURL(/\/app\/antraege$/);
  await expect(page.getByRole("dialog")).toBeHidden();
});
