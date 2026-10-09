/**
 * Einladungen. Ein Einladungslink beweist den Besitz der E-Mail-Adresse; daher
 * wird die Adresse beim Annehmen als verifiziert markiert.
 */
import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { schema, type Tx } from "../db";
import { withSystem, type TxHooks } from "../db/tenant";
import { AppError, conflict, invalid, isUniqueViolation } from "../errors";
import { generateToken, hashPassword, hashToken } from "../auth/crypto";
import { passwordSchema } from "../auth/accounts";
import { createSession } from "../auth/sessions";
import { absoluteUrl, sendEmail, templates } from "../email";
import { audit } from "./audit";

export const INVITATION_TTL_DAYS = 7;

export async function createInvitationTx(
  tx: Tx,
  hooks: TxHooks,
  input: {
    companyId: string;
    companyName: string;
    email: string;
    roleId: string;
    employeeId: string;
    invitedByUserId: string | null;
    inviterName: string | null;
  },
) {
  // Offene Einladungen für denselben Mitarbeiter werden ersetzt.
  await tx
    .update(schema.invitations)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(schema.invitations.companyId, input.companyId),
        eq(schema.invitations.employeeId, input.employeeId),
        isNull(schema.invitations.acceptedAt),
        isNull(schema.invitations.revokedAt),
      ),
    );
  const token = generateToken();
  const [invitation] = await tx
    .insert(schema.invitations)
    .values({
      companyId: input.companyId,
      email: input.email.toLowerCase(),
      roleId: input.roleId,
      employeeId: input.employeeId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000),
      invitedByUserId: input.invitedByUserId,
    })
    .returning({ id: schema.invitations.id });
  await audit(tx, {
    companyId: input.companyId,
    actorUserId: input.invitedByUserId,
    action: "invitation.created",
    entityType: "invitation",
    entityId: invitation.id,
    metadata: { employeeId: input.employeeId, roleId: input.roleId },
  });

  const url = absoluteUrl(`/einladung/${token}`);
  const message = templates.invitation({
    companyName: input.companyName,
    inviterName: input.inviterName,
    url,
    expiresInDays: INVITATION_TTL_DAYS,
  });
  const result: { status: "sent" | "failed" | "not_configured" | "pending" } = { status: "pending" };
  hooks.afterCommit(async () => {
    const r = await sendEmail({ to: input.email, companyId: input.companyId, ...message });
    result.status = r.status;
  });
  // Der Link wird einmalig an den Einladenden zurückgegeben (z. B. zum manuellen
  // Weitergeben, falls kein E-Mail-Versand eingerichtet ist). Er wird nicht gespeichert.
  return { invitationId: invitation.id, url, delivery: result };
}

export type InvitationInfo = {
  companyName: string;
  email: string;
  firstName: string;
  userExists: boolean;
  state: "valid" | "expired" | "used" | "revoked" | "company_suspended";
};

export async function getInvitation(token: string): Promise<InvitationInfo | null> {
  if (!token || token.length > 200) return null;
  return withSystem(async (tx) => {
    const [row] = await tx
      .select({
        email: schema.invitations.email,
        expiresAt: schema.invitations.expiresAt,
        acceptedAt: schema.invitations.acceptedAt,
        revokedAt: schema.invitations.revokedAt,
        companyName: schema.companies.name,
        companyStatus: schema.companies.status,
        firstName: schema.employees.firstName,
      })
      .from(schema.invitations)
      .innerJoin(schema.companies, eq(schema.companies.id, schema.invitations.companyId))
      .innerJoin(schema.employees, eq(schema.employees.id, schema.invitations.employeeId))
      .where(eq(schema.invitations.tokenHash, hashToken(token)))
      .limit(1);
    if (!row) return null;
    const [user] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, row.email))
      .limit(1);
    const state: InvitationInfo["state"] = row.acceptedAt
      ? "used"
      : row.revokedAt
        ? "revoked"
        : row.companyStatus !== "active"
          ? "company_suspended"
          : row.expiresAt.getTime() < Date.now()
            ? "expired"
            : "valid";
    return {
      companyName: row.companyName,
      email: row.email,
      firstName: row.firstName,
      userExists: Boolean(user),
      state,
    };
  });
}

const newAccountSchema = z.object({
  name: z.string().trim().min(2, "Bitte gib deinen Namen an.").max(120, "Der Name ist zu lang."),
  password: passwordSchema,
});

/**
 * Nimmt eine Einladung an.
 * - Existiert bereits ein Konto zur E-Mail, muss genau dieser Nutzer angemeldet sein.
 * - Andernfalls wird ein neues Konto mit Name und Passwort angelegt.
 */
export async function acceptInvitation(input: {
  token: string;
  currentUserId: string | null;
  name?: string;
  password?: string;
}): Promise<{ companyId: string; session: { token: string; expiresAt: Date } | null }> {
  const tokenHash = hashToken(input.token);
  let passwordHash: string | null = null;
  let name: string | null = null;

  const preview = await getInvitation(input.token);
  if (!preview) throw invalid("Diese Einladung ist ungültig.");
  if (preview.state !== "valid") {
    throw invalid(
      {
        expired: "Diese Einladung ist abgelaufen. Bitte lass dir eine neue senden.",
        used: "Diese Einladung wurde bereits verwendet.",
        revoked: "Diese Einladung wurde widerrufen.",
        company_suspended: "Der Zugang zu diesem Unternehmen ist derzeit gesperrt.",
        valid: "",
      }[preview.state],
    );
  }
  if (!preview.userExists) {
    const parsed = newAccountSchema.safeParse({ name: input.name, password: input.password });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
      throw invalid(parsed.error.issues[0].message, fieldErrors);
    }
    passwordHash = await hashPassword(parsed.data.password);
    name = parsed.data.name;
  }

  const result = await withSystem(async (tx) => {
    // Einladung atomar verbrauchen
    const [inv] = await tx
      .update(schema.invitations)
      .set({ acceptedAt: new Date() })
      .where(
        and(
          eq(schema.invitations.tokenHash, tokenHash),
          isNull(schema.invitations.acceptedAt),
          isNull(schema.invitations.revokedAt),
          gt(schema.invitations.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!inv) throw invalid("Diese Einladung ist nicht mehr gültig.");

    let [user] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, inv.email))
      .limit(1);
    let createdUser = false;
    if (user) {
      if (input.currentUserId !== user.id) {
        throw new AppError(
          "Für diese E-Mail-Adresse existiert bereits ein Konto. Bitte melde dich zuerst an.",
          "unauthenticated",
        );
      }
    } else {
      if (!passwordHash || !name) throw invalid("Bitte Name und Passwort angeben.");
      [user] = await tx
        .insert(schema.users)
        .values({ email: inv.email, name, passwordHash, emailVerifiedAt: new Date() })
        .returning({ id: schema.users.id });
      createdUser = true;
    }

    const [existing] = await tx
      .select({ id: schema.memberships.id })
      .from(schema.memberships)
      .where(and(eq(schema.memberships.companyId, inv.companyId), eq(schema.memberships.userId, user.id)))
      .limit(1);
    if (existing) throw conflict("Du bist bereits Mitglied dieses Unternehmens.");

    await tx.insert(schema.memberships).values({
      companyId: inv.companyId,
      userId: user.id,
      employeeId: inv.employeeId,
      roleId: inv.roleId,
    });
    await tx
      .update(schema.employees)
      .set({ email: inv.email, updatedAt: new Date() })
      .where(and(eq(schema.employees.id, inv.employeeId), eq(schema.employees.companyId, inv.companyId)));
    await audit(tx, {
      companyId: inv.companyId,
      actorUserId: user.id,
      action: "invitation.accepted",
      entityType: "invitation",
      entityId: inv.id,
      metadata: { employeeId: inv.employeeId },
    });
    return { companyId: inv.companyId, userId: user.id, createdUser };
  }).catch((error) => {
    // Parallele Annahme derselben Einladung bzw. gleichzeitige Kontoerstellung
    if (isUniqueViolation(error)) {
      throw conflict("Diese Einladung wurde gerade bereits verwendet. Bitte melde dich an.");
    }
    throw error;
  });

  const session = result.createdUser ? await createSession(result.userId, result.companyId) : null;
  return { companyId: result.companyId, session };
}
