/**
 * Verbindung zwischen Next.js (Cookies, Header, Redirects) und den Services.
 * Jede Seite und jede Server Action ermittelt Nutzer und Mandantenkontext hier
 * neu – serverseitig, pro Request.
 */
import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { env } from "../env";
import { SESSION_COOKIE, SESSION_TTL_DAYS, validateSessionToken, type ValidSession } from "./sessions";
import { listMemberships, resolvePlatformContext, resolveTenantContext, type TenantContext } from "../authz";

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Aktuelle Sitzung (pro Request zwischengespeichert). */
export const getSession = cache(async (): Promise<ValidSession | null> => {
  // Sitzungen werden immer zur Request-Zeit geprüft, nie vorab gerendert.
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSessionToken(token);
});

export async function getSessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export async function requireSession(next?: string): Promise<ValidSession> {
  const session = await getSession();
  if (!session) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return session;
}

export type TenantRequest = { session: ValidSession; ctx: TenantContext };

/**
 * Mandantenkontext der aktuellen Anfrage. Das aktive Unternehmen stammt aus der
 * Sitzung (serverseitig gespeichert) und wird gegen die Mitgliedschaft geprüft.
 */
export const getTenant = cache(async (): Promise<TenantRequest | null> => {
  const session = await getSession();
  if (!session) return null;
  if (session.activeCompanyId) {
    const ctx = await resolveTenantContext(session.user.id, session.activeCompanyId);
    if (ctx) return { session, ctx };
  }
  const memberships = await listMemberships(session.user.id);
  for (const m of memberships) {
    if (m.companyStatus !== "active" || m.membershipStatus !== "active") continue;
    const ctx = await resolveTenantContext(session.user.id, m.companyId);
    if (ctx) return { session, ctx };
  }
  return null;
});

export async function requireTenant(): Promise<TenantRequest> {
  const session = await requireSession("/app");
  const tenant = await getTenant();
  if (!tenant) redirect("/app/kein-zugang");
  return { ...tenant, session };
}

/** Plattform-Admin-Bereich: Nicht-Admins erhalten 404, um den Bereich nicht preiszugeben. */
export async function requirePlatformAdmin() {
  const session = await requireSession("/admin");
  const ctx = await resolvePlatformContext(session.user.id);
  if (!ctx) notFound();
  return { session, ctx };
}

/** Client-Kennung für Rate Limiting. Siehe TRUST_PROXY in .env.example. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  if (env().TRUST_PROXY === "true") {
    const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
    const real = h.get("x-real-ip");
    if (real) return real;
  }
  return "direct";
}

export { SESSION_COOKIE, SESSION_TTL_DAYS };
