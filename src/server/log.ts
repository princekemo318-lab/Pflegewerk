/**
 * Datensparsames Fehlerprotokoll.
 *
 * Datenbankfehler enthalten in ihrer Meldung die Abfrageparameter (z. B. E-Mail-
 * Adressen oder Passwort-Hashes). Protokolliert werden deshalb nur Fehlertyp,
 * Postgres-Code, betroffene Constraint und die Meldung OHNE Parameter.
 */
type PgLike = { code?: string; constraint_name?: string; table_name?: string };

export function describeError(error: unknown): Record<string, string | undefined> {
  const e = error as Error & { cause?: unknown };
  let pg: PgLike | undefined;
  let current: unknown = error;
  for (let i = 0; i < 4 && current; i++) {
    if (typeof current === "object" && current !== null && "code" in current) {
      pg = current as PgLike;
      break;
    }
    current = (current as { cause?: unknown }).cause;
  }
  const message = typeof e?.message === "string" ? e.message.split(/\nparams:/)[0].slice(0, 500) : String(error).slice(0, 200);
  return {
    name: e?.name,
    message,
    code: pg?.code,
    constraint: pg?.constraint_name,
    table: pg?.table_name,
  };
}

export function logError(scope: string, error: unknown) {
  console.error(`[${scope}]`, JSON.stringify(describeError(error)));
}
