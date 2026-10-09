/**
 * Transaktionen mit Mandantenkontext.
 *
 * Jeder Datenbankzugriff läuft in einer Transaktion, in der zuerst der Kontext
 * transaktionslokal gesetzt wird (`set_config(..., true)`). Die RLS-Policies in
 * PostgreSQL lesen diese Werte. Ohne Kontext sind unternehmensbezogene Tabellen leer.
 *
 * - `withTenant`: normaler Zugriff innerhalb genau eines Unternehmens.
 * - `withSystem`: mandantenübergreifend (Anmeldung, Plattform-Admin, Cron).
 *   Nur an klar begrenzten, serverseitigen Stellen verwenden.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { logError } from "../log";
import { getDb, type Tx } from "./index";

export type TxHooks = {
  /** Wird erst nach erfolgreichem Commit ausgeführt (z. B. E-Mail-Versand). */
  afterCommit(fn: () => Promise<unknown> | unknown): void;
};

type Scope = { companyId: string | null; userId: string | null; system: boolean };

async function run<T>(scope: Scope, fn: (tx: Tx, hooks: TxHooks) => Promise<T>) {
  const callbacks: Array<() => Promise<unknown> | unknown> = [];
  const result = await getDb().transaction(async (tx) => {
    await tx.execute(sql`select
      set_config('app.company_id', ${scope.companyId ?? ""}, true),
      set_config('app.user_id', ${scope.userId ?? ""}, true),
      set_config('app.system', ${scope.system ? "on" : ""}, true)`);
    return fn(tx, { afterCommit: (cb) => callbacks.push(cb) });
  });
  for (const cb of callbacks) {
    try {
      await cb();
    } catch (error) {
      logError("afterCommit", error);
    }
  }
  return result;
}

export function withTenant<T>(
  scope: { companyId: string; userId: string },
  fn: (tx: Tx, hooks: TxHooks) => Promise<T>,
) {
  if (!scope.companyId || !scope.userId) {
    throw new Error("withTenant benötigt companyId und userId");
  }
  return run({ companyId: scope.companyId, userId: scope.userId, system: false }, fn);
}

export function withSystem<T>(
  fn: (tx: Tx, hooks: TxHooks) => Promise<T>,
  opts: { userId?: string | null } = {},
) {
  return run({ companyId: null, userId: opts.userId ?? null, system: true }, fn);
}
