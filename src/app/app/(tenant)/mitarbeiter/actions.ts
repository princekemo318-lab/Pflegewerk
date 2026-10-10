"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/server/auth/current";
import {
  createEmployee,
  inviteEmployee,
  revokeInvitation,
  setEmployeeStatus,
  setEntitlement,
  setWorkSchedule,
  updateEmployee,
} from "@/server/services/employees";
import { changeMemberRole, setMembershipStatus } from "@/server/services/roles";
import { deleteEmployeePermanently } from "@/server/services/privacy";
import { bool, flash, runAction, str, weekdayMask, type ActionState } from "@/server/actions";

function employeeFields(form: FormData) {
  return {
    firstName: str(form, "firstName"),
    lastName: str(form, "lastName"),
    email: str(form, "email"),
    personnelNumber: str(form, "personnelNumber"),
    jobTitle: str(form, "jobTitle"),
    teamId: str(form, "teamId"),
    locationId: str(form, "locationId"),
    managerId: str(form, "managerId"),
    entryDate: str(form, "entryDate"),
    exitDate: str(form, "exitDate"),
  };
}

export async function createEmployeeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requireTenant();
  let id: string | null = null;
  let inviteUrl: string | null = null;
  let delivery: string | null = null;
  const state = await runAction(async () => {
    const result = await createEmployee(ctx, {
      ...employeeFields(form),
      weekdays: weekdayMask(form),
      annualLeaveDays: str(form, "annualLeaveDays"),
      invite: bool(form, "invite"),
      roleId: str(form, "roleId"),
    });
    id = result.employee.id;
    inviteUrl = result.invitation?.url ?? null;
    delivery = result.invitation?.delivery.status ?? null;
  });
  if (!state?.ok || !id) return state;
  // Ohne E-Mail-Versand bleibt der Link auf der Seite, damit er weitergegeben werden kann.
  if (inviteUrl && delivery !== "sent") {
    return { ok: true, message: "Mitarbeiter angelegt.", data: { employeeId: id, inviteUrl, delivery }, at: Date.now() };
  }
  await flash(inviteUrl ? "Mitarbeiter angelegt und eingeladen." : "Mitarbeiter angelegt.");
  redirect(`/app/mitarbeiter/${id}`);
}

export async function updateEmployeeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requireTenant();
  const id = str(form, "id");
  return runAction(async () => {
    await updateEmployee(ctx, id, employeeFields(form));
    revalidatePath(`/app/mitarbeiter/${id}`);
  }, "Änderungen gespeichert.");
}

export async function inviteEmployeeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requireTenant();
  const id = str(form, "id");
  let result: Awaited<ReturnType<typeof inviteEmployee>> | null = null;
  const state = await runAction(async () => {
    result = await inviteEmployee(ctx, id, { email: str(form, "email"), roleId: str(form, "roleId") });
    revalidatePath(`/app/mitarbeiter/${id}`);
  });
  if (!state?.ok || !result) return state;
  const r = result as Awaited<ReturnType<typeof inviteEmployee>>;
  return {
    ok: true,
    message: r.delivery.status === "sent" ? "Einladung versendet." : "Einladung erstellt.",
    data: { inviteUrl: r.delivery.status === "sent" ? null : r.url, delivery: r.delivery.status },
    at: Date.now(),
  };
}

export async function revokeInvitationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requireTenant();
  return runAction(async () => {
    await revokeInvitation(ctx, str(form, "invitationId"));
    revalidatePath(`/app/mitarbeiter/${str(form, "id")}`);
  }, "Einladung widerrufen.");
}

export async function changeRoleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requireTenant();
  const id = str(form, "id");
  return runAction(async () => {
    await changeMemberRole(ctx, id, str(form, "roleId"));
    revalidatePath(`/app/mitarbeiter/${id}`);
  }, "Rolle geändert.");
}

export async function setAccessAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requireTenant();
  const id = str(form, "id");
  const status = str(form, "status") === "active" ? "active" : "deactivated";
  return runAction(
    async () => {
      await setMembershipStatus(ctx, id, status);
      revalidatePath(`/app/mitarbeiter/${id}`);
    },
    status === "active" ? "Zugang reaktiviert." : "Zugang deaktiviert.",
  );
}

export async function setEmployeeStatusAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requireTenant();
  const id = str(form, "id");
  const status = str(form, "status") === "active" ? "active" : "inactive";
  return runAction(
    async () => {
      await setEmployeeStatus(ctx, id, status);
      revalidatePath(`/app/mitarbeiter/${id}`);
    },
    status === "active" ? "Als aktiv markiert." : "Als ausgeschieden markiert. Der Zugang wurde deaktiviert.",
  );
}

export async function setScheduleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requireTenant();
  const id = str(form, "id");
  return runAction(async () => {
    await setWorkSchedule(ctx, id, { validFrom: str(form, "validFrom"), weekdays: weekdayMask(form) });
    revalidatePath(`/app/mitarbeiter/${id}`);
  }, "Arbeitszeitmodell gespeichert.");
}

export async function setEntitlementAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requireTenant();
  const id = str(form, "id");
  return runAction(async () => {
    await setEntitlement(ctx, id, {
      year: str(form, "year"),
      days: str(form, "days").replace(",", "."),
      carryoverDays: (str(form, "carryoverDays") || "0").replace(",", "."),
      note: str(form, "note"),
    });
    revalidatePath(`/app/mitarbeiter/${id}`);
  }, "Urlaubsanspruch gespeichert.");
}

export async function deleteEmployeeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requireTenant();
  const state = await runAction(async () => {
    await deleteEmployeePermanently(ctx, str(form, "id"));
    await flash("Mitarbeiter und zugehörige Daten wurden endgültig gelöscht.");
  });
  if (state?.ok) redirect("/app/mitarbeiter?status=inactive");
  return state;
}
