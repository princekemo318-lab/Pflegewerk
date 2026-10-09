import { runMigrations } from "../../scripts/migrate";

/** Baut die Testdatenbank bei jedem Lauf vollständig neu auf. */
export default async function setup() {
  const ownerUrl = process.env.TEST_DATABASE_OWNER_URL;
  if (!ownerUrl) {
    throw new Error(
      "TEST_DATABASE_OWNER_URL fehlt. Starte die Datenbank mit `npm run db:up` und prüfe .env.local.",
    );
  }
  await runMigrations({
    ownerUrl,
    appRole: process.env.DATABASE_APP_ROLE ?? "pflegewerk_app",
    reset: true,
  });
}
