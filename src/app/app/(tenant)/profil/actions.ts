"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireTenant } from "@/server/auth/current";
import { changePassword } from "@/server/auth/accounts";
import { withTenant } from "@/server/db/tenant";
import { schema } from "@/server/db";
import { invalid } from "@/server/errors";
import { runAction, str, type ActionState } from "@/server/actions";

export async function updateNameAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requireTenant();
  return runAction(async () => {
    const name = z.string().trim().min(2, "Bitte gib deinen Namen an.").max(120).safeParse(str(form, "name"));
    if (!name.success) throw invalid(name.error.issues[0].message, { name: name.error.issues[0].message });
    // RLS erlaubt im Mandantenkontext nur Änderungen am eigenen Konto.
    await withTenant(ctx, (tx) =>
      tx.update(schema.users).set({ name: name.data, updatedAt: new Date() }).where(eq(schema.users.id, ctx.userId)),
    );
    revalidatePath("/app", "layout");
  }, "Name gespeichert.");
}

export async function changePasswordAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { session } = await requireTenant();
  return runAction(
    () =>
      changePassword({
        userId: session.user.id,
        sessionId: session.id,
        currentPassword: str(form, "currentPassword"),
        newPassword: str(form, "newPassword"),
      }),
    "Passwort geändert. Andere Geräte wurden abgemeldet.",
  );
}
