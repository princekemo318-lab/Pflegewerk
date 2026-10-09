/**
 * Führt Migrationen mit der Owner-Rolle aus und vergibt anschließend die
 * minimal notwendigen Rechte an die Anwendungsrolle.
 *
 *   npm run db:migrate            -> DATABASE_OWNER_URL
 *   npm run db:migrate -- --test  -> TEST_DATABASE_OWNER_URL (Schema wird vorher geleert!)
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

try {
  process.loadEnvFile(".env.local");
} catch {}

export async function runMigrations(opts: { ownerUrl: string; appRole: string; reset?: boolean }) {
  const sql = postgres(opts.ownerUrl, { max: 1, onnotice: () => {} });
  try {
    if (opts.reset) {
      await sql.unsafe(`
        DROP SCHEMA IF EXISTS public CASCADE;
        DROP SCHEMA IF EXISTS app CASCADE;
        DROP SCHEMA IF EXISTS drizzle CASCADE;
        CREATE SCHEMA public;
      `);
    }
    // Verhindert parallele Migrationsläufe (z. B. mehrere Deployments gleichzeitig).
    await sql`select pg_advisory_lock(hashtextextended('pflegewerk:migrations', 0))`;
    try {
      await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
    } finally {
      await sql`select pg_advisory_unlock(hashtextextended('pflegewerk:migrations', 0))`;
    }

    if (!/^[a-z_][a-z0-9_]*$/.test(opts.appRole)) {
      throw new Error("Ungültiger Rollenname in DATABASE_APP_ROLE");
    }
    const role = opts.appRole;
    await sql.unsafe(`
      GRANT USAGE ON SCHEMA public TO ${role};
      GRANT USAGE ON SCHEMA app TO ${role};
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role};
      -- Protokolle sind für die Anwendung nur anhängbar.
      REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM ${role};
      REVOKE UPDATE, DELETE, TRUNCATE ON leave_request_events FROM ${role};
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role};
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO ${role};
    `);

    const [check] = await sql<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      select rolsuper, rolbypassrls from pg_roles where rolname = ${role}`;
    if (!check) throw new Error(`Rolle ${role} existiert nicht`);
    if (check.rolsuper || check.rolbypassrls) {
      console.warn(
        `WARNUNG: Rolle ${role} umgeht Row-Level Security (SUPERUSER/BYPASSRLS). Für den Betrieb unbedingt ändern.`,
      );
    }
  } finally {
    await sql.end();
  }
}

const isMain = process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/migrate.ts");
if (isMain) {
  const test = process.argv.includes("--test");
  const ownerUrl = test ? process.env.TEST_DATABASE_OWNER_URL : process.env.DATABASE_OWNER_URL;
  const appRole = process.env.DATABASE_APP_ROLE ?? "pflegewerk_app";
  if (!ownerUrl) {
    console.error(test ? "TEST_DATABASE_OWNER_URL fehlt" : "DATABASE_OWNER_URL fehlt");
    process.exit(1);
  }
  runMigrations({ ownerUrl, appRole, reset: test })
    .then(() => console.log("Migrationen abgeschlossen."))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
