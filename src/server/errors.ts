/**
 * Fachliche Fehler mit verständlichen Meldungen für die Oberfläche.
 * Unerwartete Fehler werden nie mit Details an den Client gegeben.
 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "forbidden" | "invalid" | "conflict" | "rate_limited" | "unauthenticated",
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "Eintrag") => new AppError(`${what} wurde nicht gefunden.`, "not_found");
export const forbidden = (msg = "Dafür fehlt dir die Berechtigung.") => new AppError(msg, "forbidden");
export const invalid = (msg: string, fieldErrors?: Record<string, string>) =>
  new AppError(msg, "invalid", fieldErrors);
export const conflict = (msg: string) => new AppError(msg, "conflict");

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Postgres-Fehlercode für Unique-Verletzungen. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const e = findPgError(error);
  return !!e && e.code === "23505" && (!constraint || e.constraint_name === constraint);
}

function findPgError(error: unknown): { code?: string; constraint_name?: string } | null {
  let current: unknown = error;
  for (let i = 0; i < 4 && current; i++) {
    if (typeof current === "object" && current !== null && "code" in current) {
      return current as { code?: string; constraint_name?: string };
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ungültige IDs (z. B. manipulierte URLs) werden wie unbekannte Einträge behandelt. */
export function assertId(id: unknown, what = "Eintrag"): asserts id is string {
  if (typeof id !== "string" || !UUID_RE.test(id)) throw notFound(what);
}
