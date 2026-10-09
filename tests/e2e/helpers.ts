import { readFileSync } from "node:fs";
import { expect, type Browser, type Page } from "@playwright/test";

export type Fixtures = {
  password: string;
  nextYear: number;
  companyARequestId: string;
  companyAName: string;
  companyBName: string;
};

export function fixtures(): Fixtures {
  return JSON.parse(readFileSync("tests/e2e/.fixtures.json", "utf8"));
}

export async function login(page: Page, email: string, password = fixtures().password) {
  await page.goto("/login");
  await page.getByLabel("E-Mail-Adresse").fill(email);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL(/\/app(\/|$)/);
}

/** Eigener Browser-Kontext pro Person (getrennte Cookies). */
export async function as(browser: Browser, email: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, email);
  return { page, close: () => context.close() };
}

/** Montag der KW `week` im Folgejahr, als ISO-Datum – unabhängig vom aktuellen Datum. */
export function mondayOfWeek(year: number, week: number) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (week - 1) * 7);
  return monday.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function de(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** Stellt einen Urlaubsantrag über die Oberfläche und gibt die Antrags-URL zurück. */
export async function submitVacation(page: Page, start: string, end: string, note?: string) {
  await page.goto("/app/antraege/neu");
  await page.getByLabel("Erster Tag").fill(start);
  await page.getByLabel("Letzter Tag").fill(end);
  if (note) await page.getByRole("textbox", { name: /^Nachricht/ }).fill(note);
  await expect(page.getByText(/Arbeitstage?$/).first()).toBeVisible();
  const submit = page.getByRole("button", { name: "Antrag einreichen" });
  await expect(submit).toBeEnabled();
  await submit.click();
  await page.waitForURL(/\/app\/antraege\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Eingereicht").first()).toBeVisible();
  return new URL(page.url()).pathname;
}
