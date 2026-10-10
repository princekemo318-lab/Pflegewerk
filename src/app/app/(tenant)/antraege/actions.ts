"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/server/auth/current";
import {
  cancelLeaveRequest,
  decideLeaveRequest,
  previewLeave,
  recordAbsence,
  submitLeaveRequest,
  withdrawLeaveRequest,
  type LeavePreview,
} from "@/server/services/leave";
import { flash, runAction, str, type ActionState } from "@/server/actions";
import { logError } from "@/server/log";
import { isAppError } from "@/server/errors";

export async function submitLeaveAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requireTenant();
  let id: string | null = null;
  const state = await runAction(async () => {
    const r = await submitLeaveRequest(ctx, {
      startDate: str(form, "startDate"),
      endDate: str(form, "endDate"),
      absenceTypeId: str(form, "absenceTypeId"),
      note: str(form, "note"),
    });
    id = r.id;
    await flash(r.status === "approved" ? "Abwesenheit eingetragen." : "Antrag eingereicht. Du wirst benachrichtigt, sobald entschieden ist.");
  });
  if (state?.ok && id) redirect(`/app/antraege/${id}`);
  return state;
}

export async function recordAbsenceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requireTenant();
  const employeeId = str(form, "employeeId");
  const state = await runAction(async () => {
    await recordAbsence(ctx, employeeId, {
      startDate: str(form, "startDate"),
      endDate: str(form, "endDate"),
      absenceTypeId: str(form, "absenceTypeId"),
      note: str(form, "note"),
    });
    await flash("Abwesenheit eingetragen.");
  });
  if (state?.ok) redirect(`/app/mitarbeiter/${employeeId}`);
  return state;
}

export type PreviewResult = { ok: true; preview: LeavePreview } | { ok: false; message: string };

export async function previewLeaveAction(input: {
  startDate: string;
  endDate: string;
  absenceTypeId: string;
  employeeId?: string;
}): Promise<PreviewResult> {
  const { ctx } = await requireTenant();
  try {
    return { ok: true, preview: await previewLeave(ctx, input) };
  } catch (error) {
    if (isAppError(error)) return { ok: false, message: error.message };
    logError("preview", error);
    return { ok: false, message: "Die Vorschau konnte nicht berechnet werden." };
  }
}

export async function withdrawLeaveAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requireTenant();
  const id = str(form, "id");
  return runAction(async () => {
    await withdrawLeaveRequest(ctx, id);
    revalidatePath(`/app/antraege/${id}`);
  }, "Antrag zurückgezogen.");
}

export async function decideLeaveAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requireTenant();
  const id = str(form, "id");
  const decision = str(form, "decision");
  const state = await runAction(async () => {
    await decideLeaveRequest(ctx, id, { decision, note: str(form, "note") });
    await flash(decision === "approve" ? "Antrag genehmigt." : "Antrag abgelehnt.");
  });
  if (state?.ok) redirect("/app/genehmigungen");
  return state;
}

export async function cancelLeaveAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requireTenant();
  const id = str(form, "id");
  return runAction(async () => {
    await cancelLeaveRequest(ctx, id, str(form, "note"));
    revalidatePath(`/app/genehmigungen/${id}`);
    revalidatePath(`/app/antraege/${id}`);
  }, "Abwesenheit storniert.");
}
