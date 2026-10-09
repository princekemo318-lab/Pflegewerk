/**
 * Datenbankgestütztes Rate Limiting (fixes Zeitfenster).
 * Funktioniert auch bei mehreren Server-Instanzen. Schlüssel enthalten nur
 * pseudonymisierte Werte (HMAC), nie Klartext-IP-Adressen oder E-Mails.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { withSystem } from "../db/tenant";
import { env } from "../env";
import { hmac } from "./crypto";
import { AppError } from "../errors";

export type RateLimitRule = { name: string; limit: number; windowSeconds: number };

export const RATE_LIMITS = {
  loginByAccount: { name: "login-account", limit: 5, windowSeconds: 15 * 60 },
  loginByIp: { name: "login-ip", limit: 30, windowSeconds: 15 * 60 },
  passwordResetByAccount: { name: "reset-account", limit: 3, windowSeconds: 60 * 60 },
  passwordResetByIp: { name: "reset-ip", limit: 10, windowSeconds: 60 * 60 },
  contactByIp: { name: "contact-ip", limit: 5, windowSeconds: 60 * 60 },
  invitationAcceptByIp: { name: "invite-ip", limit: 20, windowSeconds: 15 * 60 },
} satisfies Record<string, RateLimitRule>;

export function rateLimitKey(rule: RateLimitRule, identifier: string) {
  return `${rule.name}:${hmac(identifier.toLowerCase(), env().APP_SECRET)}`;
}

/** Zählt einen Versuch und gibt zurück, ob das Limit überschritten ist. */
export async function hit(rule: RateLimitRule, identifier: string): Promise<{ limited: boolean; retryAfterSeconds: number }> {
  const key = rateLimitKey(rule, identifier);
  const rows = await withSystem((tx) =>
    tx.execute<{ count: number; window_start: Date }>(sql`
      insert into rate_limits (key, count, window_start)
      values (${key}, 1, now())
      on conflict (key) do update set
        count = case when rate_limits.window_start < now() - make_interval(secs => ${rule.windowSeconds})
                     then 1 else rate_limits.count + 1 end,
        window_start = case when rate_limits.window_start < now() - make_interval(secs => ${rule.windowSeconds})
                     then now() else rate_limits.window_start end
      returning count, window_start`),
  );
  const row = rows[0];
  const elapsed = (Date.now() - new Date(row.window_start).getTime()) / 1000;
  return {
    limited: Number(row.count) > rule.limit,
    retryAfterSeconds: Math.max(1, Math.ceil(rule.windowSeconds - elapsed)),
  };
}

export async function assertNotLimited(rule: RateLimitRule, identifier: string) {
  const result = await hit(rule, identifier);
  if (result.limited) {
    const minutes = Math.ceil(result.retryAfterSeconds / 60);
    throw new AppError(
      `Zu viele Versuche. Bitte versuche es in ${minutes} ${minutes === 1 ? "Minute" : "Minuten"} erneut.`,
      "rate_limited",
    );
  }
}

/** Setzt einen Zähler zurück (z. B. nach erfolgreicher Anmeldung). */
export async function resetLimit(rule: RateLimitRule, identifier: string) {
  const key = rateLimitKey(rule, identifier);
  await withSystem((tx) => tx.execute(sql`delete from rate_limits where key = ${key}`));
}

export async function purgeExpiredRateLimits() {
  await withSystem((tx) =>
    tx.execute(sql`delete from rate_limits where window_start < now() - interval '1 day'`),
  );
}
