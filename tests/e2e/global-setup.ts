/**
 * Baut die E2E-Datenbank neu auf und legt die Testdaten an.
 * Der Seed läuft über die echten Services in einem eigenen Prozess (React-Server-Bedingung).
 */
import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { runMigrations } from "../../scripts/migrate";
import { E2E_DATABASE_OWNER_URL, E2E_DATABASE_URL } from "../../playwright.config";

export default async function globalSetup() {
  if (!E2E_DATABASE_OWNER_URL.includes("pflegewerk_e2e")) {
    throw new Error("TEST_DATABASE_OWNER_URL fehlt in .env.local");
  }
  // Datenbank bei Bedarf anlegen
  const admin = postgres(E2E_DATABASE_OWNER_URL.replace("/pflegewerk_e2e", "/postgres"), { max: 1, onnotice: () => {} });
  const [exists] = await admin`select 1 from pg_database where datname = 'pflegewerk_e2e'`;
  if (!exists) await admin.unsafe("CREATE DATABASE pflegewerk_e2e");
  await admin.end();

  await runMigrations({
    ownerUrl: E2E_DATABASE_OWNER_URL,
    appRole: process.env.DATABASE_APP_ROLE ?? "pflegewerk_app",
    reset: true,
  });

  execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "--conditions=react-server", "tests/e2e/seed.ts"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL, NODE_ENV: "test", APP_URL: "http://localhost:3200" },
  });
}
