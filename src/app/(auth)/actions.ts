"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { login, requestPasswordReset, resetPassword } from "@/server/auth/accounts";
import { invalidateSession, setActiveCompany } from "@/server/auth/sessions";
import { clearSessionCookie, clientIp, getSession, getSessionToken, setSessionCookie } from "@/server/auth/current";
import { acceptInvitation } from "@/server/services/invitations";
import { flash, runAction, str, type ActionState } from "@/server/actions";
import { isPlatformAdmin, listMemberships } from "@/server/authz";

/** Nur interne Pfade als Weiterleitungsziel zulassen (kein Open Redirect). */
function safeNext(value: string): string | null {
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  return value;
}

export async function loginAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let target = "/app";
  const ip = await clientIp();
  const state = await runAction(async () => {
    const session = await login({ email: str(form, "email"), password: str(form, "password"), ip });
    await setSessionCookie(session.token, session.expiresAt);
    const next = safeNext(str(form, "next"));
    if (next) {
      target = next;
    } else if ((await listMemberships(session.userId)).length === 0 && (await isPlatformAdmin(session.userId))) {
      target = "/admin";
    }
  });
  if (state?.ok) redirect(target);
  return state;
}

export async function logoutAction() {
  const token = await getSessionToken();
  if (token) await invalidateSession(token);
  await clearSessionCookie();
  redirect("/login");
}

export async function requestResetAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ip = await clientIp();
  return runAction(
    () => requestPasswordReset({ email: str(form, "email"), ip, defer: (task) => after(task) }),
    "Falls ein Konto mit dieser Adresse existiert, haben wir dir einen Link geschickt.",
  );
}

export async function resetPasswordAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const state = await runAction(async () => {
    const session = await resetPassword({ token: str(form, "token"), password: str(form, "password") });
    await setSessionCookie(session.token, session.expiresAt);
    await flash("Dein Passwort wurde gespeichert.");
  });
  if (state?.ok) redirect("/app");
  return state;
}

export async function acceptInvitationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const state = await runAction(async () => {
    const current = await getSession();
    const result = await acceptInvitation({
      token: str(form, "token"),
      currentUserId: current?.user.id ?? null,
      name: str(form, "name"),
      password: str(form, "password"),
    });
    if (result.session) {
      await setSessionCookie(result.session.token, result.session.expiresAt);
    } else if (current) {
      await setActiveCompany(current.id, current.user.id, result.companyId);
    }
    await flash("Willkommen! Dein Zugang ist eingerichtet.");
  });
  if (state?.ok) redirect("/app");
  return state;
}
