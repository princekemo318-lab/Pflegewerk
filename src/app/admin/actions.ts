"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/server/auth/current";
import {
  assignCompanyAdmin,
  createCompany,
  inviteCompanyAdmin,
  setCompanyStatus,
} from "@/server/services/platform";
import {
  addContactNote,
  assignContactRequest,
  deleteContactRequest,
  updateContactStatus,
  type ContactStatus,
} from "@/server/services/contact";
import { flash, runAction, str, type ActionState } from "@/server/actions";

export async function createCompanyAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requirePlatformAdmin();
  let result: Awaited<ReturnType<typeof createCompany>> | null = null;
  const state = await runAction(async () => {
    result = await createCompany(ctx, {
      name: str(form, "name"),
      slug: str(form, "slug"),
      defaultState: str(form, "defaultState"),
      ownerFirstName: str(form, "ownerFirstName"),
      ownerLastName: str(form, "ownerLastName"),
      ownerEmail: str(form, "ownerEmail"),
      contactRequestId: str(form, "contactRequestId"),
    });
  });
  if (!state?.ok || !result) return state;
  const r = result as Awaited<ReturnType<typeof createCompany>>;
  if (r.invitation.delivery.status !== "sent") {
    return {
      ok: true,
      message: "Unternehmen angelegt.",
      data: { companyId: r.company.id, inviteUrl: r.invitation.url, delivery: r.invitation.delivery.status },
      at: Date.now(),
    };
  }
  await flash("Unternehmen angelegt und Einladung versendet.");
  redirect(`/admin/unternehmen/${r.company.id}`);
}

export async function setCompanyStatusAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requirePlatformAdmin();
  const id = str(form, "id");
  const status = str(form, "status") === "suspended" ? "suspended" : "active";
  return runAction(
    async () => {
      await setCompanyStatus(ctx, id, status, str(form, "note"));
      revalidatePath(`/admin/unternehmen/${id}`);
    },
    status === "suspended" ? "Unternehmen gesperrt. Es wurden keine Daten gelöscht." : "Unternehmen freigeschaltet.",
  );
}

export async function assignAdminAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requirePlatformAdmin();
  const id = str(form, "id");
  return runAction(async () => {
    await assignCompanyAdmin(ctx, id, str(form, "membershipId"));
    revalidatePath(`/admin/unternehmen/${id}`);
  }, "Administrator zugewiesen.");
}

export async function inviteAdminAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requirePlatformAdmin();
  const id = str(form, "id");
  let url: string | null = null;
  let delivery: string | null = null;
  const state = await runAction(async () => {
    const inv = await inviteCompanyAdmin(ctx, id, {
      firstName: str(form, "firstName"),
      lastName: str(form, "lastName"),
      email: str(form, "email"),
    });
    url = inv.url;
    delivery = inv.delivery.status;
    revalidatePath(`/admin/unternehmen/${id}`);
  });
  if (!state?.ok) return state;
  return {
    ok: true,
    message: delivery === "sent" ? "Einladung versendet." : "Einladung erstellt.",
    data: { inviteUrl: delivery === "sent" ? null : url, delivery },
    at: Date.now(),
  };
}

export async function updateContactStatusAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requirePlatformAdmin();
  const id = str(form, "id");
  return runAction(async () => {
    await updateContactStatus(ctx, id, str(form, "status") as ContactStatus);
    revalidatePath(`/admin/anfragen/${id}`);
  }, "Status gespeichert.");
}

export async function assignContactAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requirePlatformAdmin();
  const id = str(form, "id");
  return runAction(async () => {
    await assignContactRequest(ctx, id, str(form, "userId") || null);
    revalidatePath(`/admin/anfragen/${id}`);
  }, "Zuständigkeit gespeichert.");
}

export async function addContactNoteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requirePlatformAdmin();
  const id = str(form, "id");
  return runAction(async () => {
    await addContactNote(ctx, id, { kind: str(form, "kind"), body: str(form, "body") });
    revalidatePath(`/admin/anfragen/${id}`);
  }, "Eintrag hinzugefügt.");
}

export async function deleteContactAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requirePlatformAdmin();
  const state = await runAction(async () => {
    await deleteContactRequest(ctx, str(form, "id"));
    await flash("Anfrage endgültig gelöscht.");
  });
  if (state?.ok) redirect("/admin/anfragen");
  return state;
}
