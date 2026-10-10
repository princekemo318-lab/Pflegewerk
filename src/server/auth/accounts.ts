/**
 * Anmeldung, Passwort-Reset und Passwortänderung.
 * Es gibt bewusst keine offene Selbstregistrierung: Konten entstehen nur über
 * Einladungen (siehe services/invitations.ts) oder durch Plattform-Administratoren.
 */
import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { schema } from "../db";
import { withSystem } from "../db/tenant";
import { AppError, invalid } from "../errors";
import {
  generateToken,
  hashPassword,
  hashToken,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  verifyDummyPassword,
  verifyPassword,
} from "./crypto";
import { assertNotLimited, RATE_LIMITS, resetLimit } from "./rate-limit";
import { createSession, invalidateUserSessions } from "./sessions";
import { absoluteUrl, sendEmail, templates } from "../email";

const RESET_TTL_MS = 60 * 60 * 1000;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "E-Mail-Adresse ist zu lang.")
  .email("Bitte eine gültige E-Mail-Adresse angeben.");

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Das Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein.`)
  .max(PASSWORD_MAX_LENGTH, `Das Passwort darf höchstens ${PASSWORD_MAX_LENGTH} Zeichen lang sein.`);

const GENERIC_LOGIN_ERROR = "E-Mail-Adresse oder Passwort ist nicht korrekt.";

export async function login(input: { email: string; password: string; ip: string }) {
  const email = emailSchema.safeParse(input.email);
  if (!email.success || typeof input.password !== "string" || input.password.length === 0) {
    throw invalid(GENERIC_LOGIN_ERROR);
  }
  const password = input.password.slice(0, PASSWORD_MAX_LENGTH);

  await assertNotLimited(RATE_LIMITS.loginByIp, input.ip);
  await assertNotLimited(RATE_LIMITS.loginByAccount, email.data);

  const user = await withSystem(async (tx) => {
    const [row] = await tx
      .select({
        id: schema.users.id,
        passwordHash: schema.users.passwordHash,
        disabledAt: schema.users.disabledAt,
      })
      .from(schema.users)
      .where(eq(schema.users.email, email.data))
      .limit(1);
    return row;
  });

  if (!user?.passwordHash) {
    await verifyDummyPassword(password);
    throw invalid(GENERIC_LOGIN_ERROR);
  }
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) throw invalid(GENERIC_LOGIN_ERROR);
  if (user.disabledAt) {
    throw new AppError("Dieses Konto ist gesperrt. Bitte wende dich an deine Verwaltung.", "forbidden");
  }

  await resetLimit(RATE_LIMITS.loginByAccount, email.data);
  return { ...(await createSession(user.id)), userId: user.id };
}

/**
 * Fordert einen Reset-Link an. Die Antwort ist für existierende und nicht
 * existierende Konten identisch (keine Kontoaufzählung möglich).
 */
/**
 * @param input.defer Optional: führt den E-Mail-Versand nach dem Senden der Antwort aus
 *   (z. B. Next.js `after`), damit die Antwortzeit nicht verrät, ob ein Konto existiert.
 */
export async function requestPasswordReset(input: { email: string; ip: string; defer?: (task: () => Promise<unknown>) => void }) {
  const email = emailSchema.safeParse(input.email);
  if (!email.success) throw invalid("Bitte eine gültige E-Mail-Adresse angeben.");
  await assertNotLimited(RATE_LIMITS.passwordResetByIp, input.ip);
  await assertNotLimited(RATE_LIMITS.passwordResetByAccount, email.data);

  const token = generateToken();
  const userId = await withSystem(async (tx) => {
    const [user] = await tx
      .select({ id: schema.users.id, disabledAt: schema.users.disabledAt })
      .from(schema.users)
      .where(eq(schema.users.email, email.data))
      .limit(1);
    if (!user || user.disabledAt) return null;
    await tx.insert(schema.passwordResetTokens).values({
      id: hashToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    });
    return user.id;
  });

  if (userId) {
    const send = () =>
      sendEmail({
        to: email.data,
        ...templates.passwordReset({ url: absoluteUrl(`/passwort-zuruecksetzen/${token}`) }),
      });
    if (input.defer) input.defer(send);
    else await send();
  }
}

/** Erstellt einen Link zum erstmaligen Setzen des Passworts (z. B. für Plattform-Admins). */
export async function createPasswordSetupLink(userId: string, ttlMs = 24 * RESET_TTL_MS) {
  const token = generateToken();
  await withSystem((tx) =>
    tx.insert(schema.passwordResetTokens).values({
      id: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + ttlMs),
    }),
  );
  return absoluteUrl(`/passwort-zuruecksetzen/${token}`);
}

export async function isResetTokenValid(token: string) {
  const id = hashToken(token);
  return withSystem(async (tx) => {
    const [row] = await tx
      .select({ id: schema.passwordResetTokens.id })
      .from(schema.passwordResetTokens)
      .where(
        and(
          eq(schema.passwordResetTokens.id, id),
          isNull(schema.passwordResetTokens.usedAt),
          gt(schema.passwordResetTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);
    return Boolean(row);
  });
}

export async function resetPassword(input: { token: string; password: string }) {
  const password = passwordSchema.safeParse(input.password);
  if (!password.success) {
    throw invalid(password.error.issues[0].message, { password: password.error.issues[0].message });
  }
  const passwordHash = await hashPassword(password.data);
  const id = hashToken(input.token);

  const userId = await withSystem(async (tx) => {
    // Token atomar entwerten: nur eine Anfrage kann es verwenden.
    const [used] = await tx
      .update(schema.passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(schema.passwordResetTokens.id, id),
          isNull(schema.passwordResetTokens.usedAt),
          gt(schema.passwordResetTokens.expiresAt, new Date()),
        ),
      )
      .returning({ userId: schema.passwordResetTokens.userId });
    if (!used) return null;
    await tx
      .update(schema.users)
      .set({ passwordHash, emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.users.id, used.userId));
    await tx.insert(schema.auditLogs).values({
      companyId: null,
      actorUserId: used.userId,
      action: "user.password_reset",
      entityType: "user",
      entityId: used.userId,
    });
    return used.userId;
  });

  if (!userId) throw invalid("Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.");
  // Alle bestehenden Sitzungen beenden und eine neue starten.
  await invalidateUserSessions(userId);
  return createSession(userId);
}

export async function changePassword(input: {
  userId: string;
  sessionId: string;
  currentPassword: string;
  newPassword: string;
}) {
  const next = passwordSchema.safeParse(input.newPassword);
  if (!next.success) {
    throw invalid(next.error.issues[0].message, { newPassword: next.error.issues[0].message });
  }
  await assertNotLimited(RATE_LIMITS.loginByAccount, `change:${input.userId}`);
  const [user] = await withSystem((tx) =>
    tx
      .select({ passwordHash: schema.users.passwordHash })
      .from(schema.users)
      .where(eq(schema.users.id, input.userId))
      .limit(1),
  );
  if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw invalid("Das aktuelle Passwort ist nicht korrekt.", {
      currentPassword: "Das aktuelle Passwort ist nicht korrekt.",
    });
  }
  const passwordHash = await hashPassword(next.data);
  await withSystem(async (tx) => {
    await tx
      .update(schema.users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(schema.users.id, input.userId));
    await tx.insert(schema.auditLogs).values({
      companyId: null,
      actorUserId: input.userId,
      action: "user.password_changed",
      entityType: "user",
      entityId: input.userId,
    });
  });
  // Andere Geräte abmelden
  await invalidateUserSessions(input.userId, input.sessionId);
}
