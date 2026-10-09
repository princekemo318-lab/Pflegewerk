/**
 * Serverseitige Sitzungen. Das Cookie enthält nur ein zufälliges Token; in der
 * Datenbank liegt ausschließlich dessen SHA-256-Hash. Sitzungen verlängern sich
 * bei Nutzung (gleitendes Ablaufdatum) und können jederzeit widerrufen werden.
 */
import "server-only";
import { and, eq, gt, lt, ne } from "drizzle-orm";
import { schema } from "../db";
import { withSystem } from "../db/tenant";
import { generateToken, hashToken } from "./crypto";

export { SESSION_COOKIE } from "@/lib/session-cookie";
export const SESSION_TTL_DAYS = 30;
const RENEW_WHEN_LESS_THAN_DAYS = 15;
const DAY_MS = 86_400_000;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

export type ValidSession = {
  id: string;
  activeCompanyId: string | null;
  expiresAt: Date;
  renewed: boolean;
  user: SessionUser;
};

export async function createSession(userId: string, activeCompanyId: string | null = null) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * DAY_MS);
  await withSystem(async (tx) => {
    await tx.insert(schema.sessions).values({
      id: hashToken(token),
      userId,
      activeCompanyId,
      expiresAt,
    });
    await tx
      .update(schema.users)
      .set({ lastLoginAt: new Date() })
      .where(eq(schema.users.id, userId));
  });
  return { token, expiresAt };
}

export async function validateSessionToken(token: string): Promise<ValidSession | null> {
  if (!token || token.length > 200) return null;
  const id = hashToken(token);
  return withSystem(async (tx) => {
    const [row] = await tx
      .select({
        id: schema.sessions.id,
        activeCompanyId: schema.sessions.activeCompanyId,
        expiresAt: schema.sessions.expiresAt,
        userId: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        disabledAt: schema.users.disabledAt,
      })
      .from(schema.sessions)
      .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
      .where(eq(schema.sessions.id, id))
      .limit(1);
    if (!row) return null;
    if (row.expiresAt.getTime() <= Date.now() || row.disabledAt) {
      await tx.delete(schema.sessions).where(eq(schema.sessions.id, id));
      return null;
    }
    let expiresAt = row.expiresAt;
    let renewed = false;
    if (expiresAt.getTime() - Date.now() < RENEW_WHEN_LESS_THAN_DAYS * DAY_MS) {
      expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * DAY_MS);
      renewed = true;
      await tx
        .update(schema.sessions)
        .set({ expiresAt, lastUsedAt: new Date() })
        .where(eq(schema.sessions.id, id));
    }
    return {
      id: row.id,
      activeCompanyId: row.activeCompanyId,
      expiresAt,
      renewed,
      user: { id: row.userId, email: row.email, name: row.name },
    };
  });
}

export async function invalidateSession(token: string) {
  const id = hashToken(token);
  await withSystem((tx) => tx.delete(schema.sessions).where(eq(schema.sessions.id, id)));
}

/** Beendet alle Sitzungen eines Nutzers, optional außer der aktuellen. */
export async function invalidateUserSessions(userId: string, exceptSessionId?: string) {
  await withSystem((tx) =>
    tx
      .delete(schema.sessions)
      .where(
        exceptSessionId
          ? and(eq(schema.sessions.userId, userId), ne(schema.sessions.id, exceptSessionId))
          : eq(schema.sessions.userId, userId),
      ),
  );
}

export async function setActiveCompany(sessionId: string, userId: string, companyId: string | null) {
  await withSystem((tx) =>
    tx
      .update(schema.sessions)
      .set({ activeCompanyId: companyId })
      .where(and(eq(schema.sessions.id, sessionId), eq(schema.sessions.userId, userId))),
  );
}

export async function purgeExpiredSessions() {
  await withSystem(async (tx) => {
    await tx.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
    await tx
      .delete(schema.passwordResetTokens)
      .where(lt(schema.passwordResetTokens.expiresAt, new Date(Date.now() - DAY_MS)));
  });
}

export async function countActiveSessions(userId: string) {
  return withSystem(async (tx) => {
    const rows = await tx
      .select({ id: schema.sessions.id })
      .from(schema.sessions)
      .where(and(eq(schema.sessions.userId, userId), gt(schema.sessions.expiresAt, new Date())));
    return rows.length;
  });
}
