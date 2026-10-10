/**
 * Bereitet eine frische PostgreSQL-Instanz (z. B. in GitHub Actions) wie docker/postgres/init.sql vor:
 * eingeschränkte Anwendungsrolle ohne SUPERUSER/BYPASSRLS und die Testdatenbank.
 *
 *   CI_DATABASE_ADMIN_URL=postgres://owner:pw@localhost:5432/postgres npx tsx scripts/ci-setup-db.ts
 */
import postgres from "postgres";

async function main() {
  const url = process.env.CI_DATABASE_ADMIN_URL;
  const role = process.env.DATABASE_APP_ROLE ?? "pflegewerk_app";
  const password = process.env.CI_APP_ROLE_PASSWORD;
  if (!url || !password) throw new Error("CI_DATABASE_ADMIN_URL und CI_APP_ROLE_PASSWORD sind erforderlich.");
  if (!/^[a-z_][a-z0-9_]*$/.test(role)) throw new Error("Ungültiger Rollenname");

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const [exists] = await sql`select 1 from pg_roles where rolname = ${role}`;
    if (!exists) {
      await sql.unsafe(
        `CREATE ROLE ${role} LOGIN PASSWORD '${password.replaceAll("'", "''")}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`,
      );
    }
    for (const db of ["pflegewerk_test", "pflegewerk_e2e"]) {
      const [dbExists] = await sql`select 1 from pg_database where datname = ${db}`;
      if (!dbExists) await sql.unsafe(`CREATE DATABASE ${db}`);
    }
    console.log("CI-Datenbank vorbereitet.");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
