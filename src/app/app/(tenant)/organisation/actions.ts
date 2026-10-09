"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/server/auth/current";
import {
  archiveLocation,
  archiveTeam,
  createCompanyHoliday,
  createLocation,
  createTeam,
  deleteCompanyHoliday,
  updateCompanySettings,
  updateLocation,
  updateTeam,
  upsertAbsenceType,
} from "@/server/services/organization";
import { createRole, deleteRole, updateRole } from "@/server/services/roles";
import { bool, list, runAction, str, weekdayMask, type ActionState } from "@/server/actions";

const done = (path = "/app/organisation") => revalidatePath(path);

export async function saveTeamAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requireTenant();
  const id = str(form, "id");
  const input = { name: str(form, "name"), locationId: str(form, "locationId"), leadEmployeeId: str(form, "leadEmployeeId") };
  return runAction(async () => {
    if (id) await updateTeam(ctx, id, input);
    else await createTeam(ctx, input);
    done();
  }, id ? "Team gespeichert." : "Team angelegt.");
}

export async function archiveTeamAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requireTenant();
  return runAction(async () => {
    await archiveTeam(ctx, str(form, "id"));
    done();
  }, "Team archiviert.");
}

export async function saveLocationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requireTenant();
  const id = str(form, "id");
  const input = { name: str(form, "name"), city: str(form, "city"), state: str(form, "state"), optionalHolidays: list(form, "optionalHolidays") };
  return runAction(async () => {
    if (id) await updateLocation(ctx, id, input);
    else await createLocation(ctx, input);
    done();
  }, id ? "Standort gespeichert." : "Standort angelegt.");
}

export async function archiveLocationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requireTenant();
  return runAction(async () => {
    await archiveLocation(ctx, str(form, "id"));
    done();
  }, "Standort archiviert.");
}

export async function addHolidayAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requireTenant();
  return runAction(async () => {
    await createCompanyHoliday(ctx, { date: str(form, "date"), name: str(form, "name"), locationId: str(form, "locationId") });
    done("/app/einstellungen");
  }, "Feiertag hinzugefügt.");
}

export async function deleteHolidayAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requireTenant();
  return runAction(async () => {
    await deleteCompanyHoliday(ctx, str(form, "id"));
    done("/app/einstellungen");
  }, "Feiertag entfernt.");
}

export async function saveAbsenceTypeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requireTenant();
  const id = str(form, "id") || null;
  return runAction(async () => {
    await upsertAbsenceType(ctx, id, {
      name: str(form, "name"),
      color: str(form, "color"),
      deductsLeave: bool(form, "deductsLeave"),
      requiresApproval: bool(form, "requiresApproval"),
      employeeCanRequest: bool(form, "employeeCanRequest"),
      isSensitive: bool(form, "isSensitive"),
      archived: bool(form, "archived"),
    });
    done("/app/einstellungen");
  }, "Abwesenheitsart gespeichert.");
}

export async function saveSettingsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requireTenant();
  return runAction(async () => {
    await updateCompanySettings(ctx, {
      name: str(form, "name"),
      defaultState: str(form, "defaultState"),
      defaultWorkWeek: weekdayMask(form),
      defaultAnnualLeaveDays: str(form, "defaultAnnualLeaveDays").replace(",", "."),
      employeeCalendarScope: str(form, "employeeCalendarScope"),
      allowNegativeBalance: bool(form, "allowNegativeBalance"),
      reminderAfterDays: str(form, "reminderAfterDays"),
    });
    revalidatePath("/app", "layout");
  }, "Einstellungen gespeichert.");
}

export async function saveRoleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requireTenant();
  const id = str(form, "id");
  const input = { name: str(form, "name"), description: str(form, "description"), permissions: list(form, "permissions") };
  return runAction(async () => {
    if (id) await updateRole(ctx, id, input);
    else await createRole(ctx, input);
    revalidatePath("/app/rollen");
  }, id ? "Rolle gespeichert." : "Rolle angelegt.");
}

export async function deleteRoleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requireTenant();
  return runAction(async () => {
    await deleteRole(ctx, str(form, "id"));
    revalidatePath("/app/rollen");
  }, "Rolle gelöscht.");
}
