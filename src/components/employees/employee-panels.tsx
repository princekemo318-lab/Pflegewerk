"use client";

import { useState } from "react";
import { ActionForm, Field, Input, Select, SubmitButton, WeekdayPicker } from "@/components/ui/form";
import { ConfirmAction } from "@/components/ui/dialog";
import { EmployeeFields, InviteLinkNotice } from "./employee-form";
import {
  changeRoleAction,
  inviteEmployeeAction,
  revokeInvitationAction,
  setAccessAction,
  deleteEmployeeAction,
  setEmployeeStatusAction,
  setEntitlementAction,
  setScheduleAction,
  updateEmployeeAction,
} from "@/app/app/(tenant)/mitarbeiter/actions";

type Option = { id: string; name: string };

export function EditEmployeeForm(props: {
  employee: Parameters<typeof EmployeeFields>[0]["employee"] & { id: string };
  teams: Option[];
  locations: Option[];
  managers: { id: string; firstName: string; lastName: string }[];
}) {
  return (
    <ActionForm action={updateEmployeeAction} className="space-y-5">
      <input type="hidden" name="id" value={props.employee.id} />
      <EmployeeFields {...props} />
      <SubmitButton pendingLabel="Wird gespeichert …">Änderungen speichern</SubmitButton>
    </ActionForm>
  );
}

export function InviteForm({ id, email, roles }: { id: string; email: string | null; roles: { id: string; name: string; isDefault: boolean }[] }) {
  const [link, setLink] = useState<{ url: string; delivery: string } | null>(null);
  if (link) return <InviteLinkNotice url={link.url} delivery={link.delivery} />;
  return (
    <ActionForm
      action={inviteEmployeeAction}
      className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end"
      onSuccess={(s) => s.data?.inviteUrl && setLink({ url: String(s.data.inviteUrl), delivery: String(s.data.delivery) })}
    >
      <input type="hidden" name="id" value={id} />
      <Field label="E-Mail-Adresse" name="email">
        {(p) => <Input {...p} type="email" defaultValue={email ?? ""} required />}
      </Field>
      <Field label="Rolle" name="roleId">
        {(p) => (
          <Select {...p} defaultValue={roles.find((r) => r.isDefault)?.id}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <SubmitButton pendingLabel="Wird gesendet …">Einladen</SubmitButton>
    </ActionForm>
  );
}

export function RevokeInvitation({ id, invitationId }: { id: string; invitationId: string }) {
  return (
    <ConfirmAction
      action={revokeInvitationAction}
      hidden={{ id, invitationId }}
      trigger="Einladung widerrufen"
      triggerSize="sm"
      title="Einladung widerrufen?"
      description="Der Link wird sofort ungültig. Du kannst jederzeit eine neue Einladung senden."
      confirmLabel="Widerrufen"
    />
  );
}

export function RoleForm({ id, roleId, roles }: { id: string; roleId: string; roles: { id: string; name: string }[] }) {
  return (
    <ActionForm action={changeRoleAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <Field label="Rolle" name="roleId" className="min-w-48 flex-1">
        {(p) => (
          <Select {...p} defaultValue={roleId}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <SubmitButton variant="secondary" pendingLabel="…">
        Rolle ändern
      </SubmitButton>
    </ActionForm>
  );
}

export function AccessToggle({ id, active, name }: { id: string; active: boolean; name: string }) {
  return active ? (
    <ConfirmAction
      action={setAccessAction}
      hidden={{ id, status: "deactivated" }}
      trigger="Zugang deaktivieren"
      triggerSize="sm"
      title={`Zugang für ${name} deaktivieren?`}
      description="Die Person kann sich nicht mehr für dieses Unternehmen anmelden. Alle Daten und Anträge bleiben erhalten."
      confirmLabel="Deaktivieren"
    />
  ) : (
    <ConfirmAction
      action={setAccessAction}
      hidden={{ id, status: "active" }}
      trigger="Zugang reaktivieren"
      triggerSize="sm"
      tone="primary"
      title={`Zugang für ${name} reaktivieren?`}
      confirmLabel="Reaktivieren"
    />
  );
}

export function EmploymentStatusToggle({ id, active, name }: { id: string; active: boolean; name: string }) {
  return active ? (
    <ConfirmAction
      action={setEmployeeStatusAction}
      hidden={{ id, status: "inactive" }}
      trigger="Als ausgeschieden markieren"
      triggerSize="sm"
      title={`${name} als ausgeschieden markieren?`}
      description="Der Zugang wird deaktiviert und offene Einladungen werden widerrufen. Historische Daten bleiben erhalten."
      confirmLabel="Als ausgeschieden markieren"
    />
  ) : (
    <ConfirmAction
      action={setEmployeeStatusAction}
      hidden={{ id, status: "active" }}
      trigger="Wieder als aktiv markieren"
      triggerSize="sm"
      tone="primary"
      title={`${name} wieder als aktiv markieren?`}
      description="Ein Zugang muss bei Bedarf separat reaktiviert werden."
      confirmLabel="Als aktiv markieren"
    />
  );
}

export function ScheduleForm({ id, mask, today }: { id: string; mask: number; today: string }) {
  return (
    <ActionForm action={setScheduleAction} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <WeekdayPicker mask={mask} label="Neue Arbeitstage" />
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Gültig ab" name="validFrom">
          {(p) => <Input {...p} type="date" defaultValue={today} required />}
        </Field>
        <SubmitButton variant="secondary" pendingLabel="…">
          Modell speichern
        </SubmitButton>
      </div>
      <p className="text-xs text-muted">
        Bereits eingereichte oder genehmigte Anträge behalten ihre berechneten Tage. Neue Anträge nutzen das am jeweiligen Tag gültige Modell.
      </p>
    </ActionForm>
  );
}

export function EntitlementForm({ id, year, days, carryover }: { id: string; year: number; days?: number; carryover?: number }) {
  return (
    <ActionForm action={setEntitlementAction} className="grid gap-3 sm:grid-cols-[6rem_1fr_1fr_auto] sm:items-end">
      <input type="hidden" name="id" value={id} />
      <Field label="Jahr" name="year">
        {(p) => <Input {...p} type="number" min={2018} max={2100} defaultValue={year} required />}
      </Field>
      <Field label="Anspruch (Tage)" name="days">
        {(p) => <Input {...p} type="number" inputMode="decimal" step="0.5" min={0} max={366} defaultValue={days} required />}
      </Field>
      <Field label="Übertrag (Tage)" name="carryoverDays">
        {(p) => <Input {...p} type="number" inputMode="decimal" step="0.5" min={0} max={366} defaultValue={carryover ?? 0} />}
      </Field>
      <SubmitButton variant="secondary" pendingLabel="…">
        Speichern
      </SubmitButton>
    </ActionForm>
  );
}

export function DeleteEmployee({ id, name }: { id: string; name: string }) {
  return (
    <ConfirmAction
      action={deleteEmployeeAction}
      hidden={{ id }}
      trigger="Endgültig löschen"
      triggerSize="sm"
      title={`${name} endgültig löschen?`}
      description="Profil, Zugang, Anträge, Abwesenheiten, Ansprüche und Arbeitszeitmodelle werden unwiderruflich gelöscht – das Nutzerkonto ebenfalls, wenn es keinem anderen Unternehmen angehört. Prüfe vorher gesetzliche Aufbewahrungspflichten und exportiere bei Bedarf die Daten."
      confirmLabel="Endgültig löschen"
    />
  );
}
