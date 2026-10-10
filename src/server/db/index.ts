import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import { env } from "../env";

function createClient(url: string) {
  const client = postgres(url, {
    max: process.env.NODE_ENV === "production" ? 10 : 5,
    // Kompatibel mit Transaktions-Poolern (z. B. PgBouncer/Neon Pooler).
    prepare: false,
    idle_timeout: 20,
    onnotice: () => {},
  });
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createClient>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const globalForDb = globalThis as unknown as { __pflegewerkDb?: Database };

/** Gemeinsame Datenbankverbindung (eine pro Prozess, auch bei Hot Reload). */
export function getDb(): Database {
  if (!globalForDb.__pflegewerkDb) {
    globalForDb.__pflegewerkDb = createClient(env().DATABASE_URL);
  }
  return globalForDb.__pflegewerkDb;
}

export { schema };
