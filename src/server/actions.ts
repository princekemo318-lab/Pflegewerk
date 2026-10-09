/**
 * Einheitliche Fehlerbehandlung für Server Actions.
 * Fachliche Fehler werden als verständliche Meldung zurückgegeben; unerwartete
 * Fehler werden protokolliert und nur generisch angezeigt.
 */
import "server-only";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { logError } from "./log";
import { isAppError } from "./errors";

export type ActionState = {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Optionale Zusatzdaten für die Oberfläche (z. B. ein einmalig angezeigter Einladungslink). */
  data?: Record<string, string | number | boolean | null>;
  /** Wechselt bei jedem Aufruf, damit die Oberfläche gleiche Meldungen erneut anzeigt. */
  at?: number;
} | null;

export async function runAction(
  fn: () => Promise<ActionState | void>,
  successMessage?: string,
): Promise<ActionState> {
  try {
    const result = await fn();
    return { ok: true, message: successMessage, ...(result ?? {}), at: Date.now() };
  } catch (error) {
    unstable_rethrow(error);
    if (isAppError(error)) {
      return { ok: false, message: error.message, fieldErrors: error.fieldErrors, at: Date.now() };
    }
    logError("action", error);
    return {
      ok: false,
      message: "Das hat nicht geklappt. Bitte versuche es erneut oder lade die Seite neu.",
      at: Date.now(),
    };
  }
}

/** Kurzlebige Erfolgsmeldung über einen Redirect hinweg (wird im Client als Toast angezeigt). */
export async function flash(message: string) {
  // Next.js kodiert den Cookie-Wert selbst; der Client dekodiert genau einmal.
  (await cookies()).set("pw_flash", message.slice(0, 200), {
    path: "/",
    maxAge: 30,
    sameSite: "lax",
    httpOnly: false,
  });
}

// --- FormData-Helfer --------------------------------------------------------

export function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

export function bool(form: FormData, key: string): boolean {
  const v = form.get(key);
  return v === "on" || v === "true" || v === "1";
}

export function list(form: FormData, key: string): string[] {
  return form.getAll(key).filter((v): v is string => typeof v === "string");
}

/** Wochentage aus Checkboxen "weekday" (Werte 0–6) als Bitmaske. */
export function weekdayMask(form: FormData, key = "weekday"): number {
  return list(form, key)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    .reduce((m, d) => m | (1 << d), 0);
}
