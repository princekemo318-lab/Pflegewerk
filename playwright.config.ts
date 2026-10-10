/**
 * End-to-End-Tests im echten Browser gegen einen Produktionsbuild.
 *
 *   npm run test:e2e
 *
 * - Eigene Datenbank `pflegewerk_e2e` (wird bei jedem Lauf neu aufgebaut und befüllt)
 * - Nutzt das lokal installierte Google Chrome (kein zusätzlicher Browser-Download)
 */
import { defineConfig, devices } from "@playwright/test";

try {
  process.loadEnvFile(".env.local");
} catch {}

const PORT = 3200;
const owner = process.env.TEST_DATABASE_OWNER_URL ?? "";
const app = process.env.TEST_DATABASE_URL ?? "";
export const E2E_DATABASE_OWNER_URL = owner.replace(/\/[^/?]+(\?|$)/, "/pflegewerk_e2e$1");
export const E2E_DATABASE_URL = app.replace(/\/[^/?]+(\?|$)/, "/pflegewerk_e2e$1");

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "chrome",
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chrome" }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobil", use: { ...devices["Pixel 7"], channel: "chrome" }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: `npx next build && npx next start --port ${PORT}`,
    // Statische Seite: Die E2E-Datenbank entsteht erst im globalSetup (läuft nach dem Serverstart).
    url: `http://localhost:${PORT}/impressum`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      APP_URL: `http://localhost:${PORT}`,
      APP_SECRET: process.env.APP_SECRET ?? "",
      TRUST_PROXY: "false",
      SMTP_HOST: "",
    },
  },
});
