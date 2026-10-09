"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { ActionForm, Checkbox, Field, Input, Select, SubmitButton, WeekdayPicker } from "@/components/ui/form";
import { ConfirmAction, Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/primitives";
import {
  addHolidayAction,
  archiveLocationAction,
  archiveTeamAction,
  deleteHolidayAction,
  deleteRoleAction,
  saveAbsenceTypeAction,
  saveLocationAction,
  saveRoleAction,
  saveSettingsAction,
  saveTeamAction,
} from "@/app/app/(tenant)/organisation/actions";
import { OPTIONAL_HOLIDAYS, STATES, type StateCode } from "@/lib/holidays";
import { PERMISSIONS, type Permission } from "@/lib/permissions";

type Option = { id: string; name: string };

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

export function TeamDialog({
  team,
  locations,
  employees,
}: {
  team?: { id: string; name: string; locationId: string | null; leadEmployeeId: string | null };
  locations: Option[];
  employees: { id: string; firstName: string; lastName: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={team ? "Team bearbeiten" : "Team anlegen"}
      description="Die Teamleitung entscheidet über Anträge der Teammitglieder, sofern ihre Rolle das erlaubt."
      trigger={team ? <><Pencil className="size-3.5" aria-hidden /> Bearbeiten</> : <><Plus className="size-4" aria-hidden /> Team anlegen</>}
      triggerVariant={team ? "ghost" : "primary"}
      triggerSize={team ? "sm" : "md"}
    >
      <ActionForm action={saveTeamAction} className="space-y-4" onSuccess={() => setOpen(false)}>
        {team && <input type="hidden" name="id" value={team.id} />}
        <Field label="Name" name="name">
          {(p) => <Input {...p} defaultValue={team?.name} required maxLength={80} placeholder="z. B. Ambulante Pflege" />}
        </Field>
        <Field label="Standort" name="locationId" optional>
          {(p) => (
            <Select {...p} defaultValue={team?.locationId ?? ""}>
              <option value="">Kein Standort</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Teamleitung" name="leadEmployeeId" optional>
          {(p) => (
            <Select {...p} defaultValue={team?.leadEmployeeId ?? ""}>
              <option value="">Keine</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.lastName}, {e.firstName}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="flex justify-end">
          <SubmitButton pendingLabel="Wird gespeichert …">{team ? "Speichern" : "Team anlegen"}</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  );
}

export function ArchiveTeam({ id, name }: { id: string; name: string }) {
  return (
    <ConfirmAction
      action={archiveTeamAction}
      hidden={{ id }}
      trigger="Archivieren"
      triggerVariant="ghost"
      triggerSize="sm"
      title={`Team „${name}“ archivieren?`}
      description="Mitglieder bleiben erhalten und verlieren nur die Teamzuordnung."
      confirmLabel="Archivieren"
    />
  );
}

// ---------------------------------------------------------------------------
// Standorte
// ---------------------------------------------------------------------------

export function LocationDialog({
  location,
}: {
  location?: { id: string; name: string; city: string | null; state: string; optionalHolidays: string[] };
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<string>(location?.state ?? "NW");
  const optional = (Object.keys(OPTIONAL_HOLIDAYS) as (keyof typeof OPTIONAL_HOLIDAYS)[]).filter((k) => OPTIONAL_HOLIDAYS[k].state === state);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={location ? "Standort bearbeiten" : "Standort anlegen"}
      description="Das Bundesland bestimmt die gesetzlichen Feiertage für Mitarbeiter dieses Standorts."
      trigger={location ? <><Pencil className="size-3.5" aria-hidden /> Bearbeiten</> : <><Plus className="size-4" aria-hidden /> Standort anlegen</>}
      triggerVariant={location ? "ghost" : "secondary"}
      triggerSize={location ? "sm" : "md"}
    >
      <ActionForm action={saveLocationAction} className="space-y-4" onSuccess={() => setOpen(false)}>
        {location && <input type="hidden" name="id" value={location.id} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" name="name">
            {(p) => <Input {...p} defaultValue={location?.name} required maxLength={80} />}
          </Field>
          <Field label="Ort" name="city" optional>
            {(p) => <Input {...p} defaultValue={location?.city ?? ""} maxLength={80} />}
          </Field>
        </div>
        <Field label="Bundesland" name="state">
          {(p) => (
            <Select {...p} value={state} onChange={(e) => setState(e.target.value)}>
              {(Object.keys(STATES) as StateCode[]).map((s) => (
                <option key={s} value={s}>
                  {STATES[s]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {optional.length > 0 && (
          <fieldset className="space-y-3 rounded-xl border border-line p-3">
            <legend className="px-1 text-sm font-medium">Regionale Feiertage</legend>
            {optional.map((k) => (
              <Checkbox
                key={k}
                name="optionalHolidays"
                value={k}
                defaultChecked={location?.optionalHolidays.includes(k)}
                label={OPTIONAL_HOLIDAYS[k].name}
                description={OPTIONAL_HOLIDAYS[k].hint}
              />
            ))}
          </fieldset>
        )}
        <div className="flex justify-end">
          <SubmitButton pendingLabel="Wird gespeichert …">{location ? "Speichern" : "Standort anlegen"}</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  );
}

export function ArchiveLocation({ id, name }: { id: string; name: string }) {
  return (
    <ConfirmAction
      action={archiveLocationAction}
      hidden={{ id }}
      trigger="Archivieren"
      triggerVariant="ghost"
      triggerSize="sm"
      title={`Standort „${name}“ archivieren?`}
      description="Mitarbeiter und Teams verlieren die Zuordnung. Für sie gelten danach die Feiertage des Unternehmensstandards."
      confirmLabel="Archivieren"
    />
  );
}

// ---------------------------------------------------------------------------
// Feiertage, Abwesenheitsarten, Einstellungen
// ---------------------------------------------------------------------------

export function HolidayForm({ locations }: { locations: Option[] }) {
  return (
    <ActionForm action={addHolidayAction} resetOnSuccess className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)_12rem_auto] sm:items-end">
      <Field label="Datum" name="date">
        {(p) => <Input {...p} type="date" required />}
      </Field>
      <Field label="Bezeichnung" name="name">
        {(p) => <Input {...p} required maxLength={80} placeholder="z. B. Betriebsausflug" />}
      </Field>
      <Field label="Gilt für" name="locationId">
        {(p) => (
          <Select {...p} defaultValue="">
            <option value="">Alle Standorte</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <SubmitButton variant="secondary" pendingLabel="…">
        Hinzufügen
      </SubmitButton>
    </ActionForm>
  );
}

export function DeleteHoliday({ id, name }: { id: string; name: string }) {
  return (
    <ConfirmAction
      action={deleteHolidayAction}
      hidden={{ id }}
      trigger="Entfernen"
      triggerVariant="ghost"
      triggerSize="sm"
      title={`„${name}“ entfernen?`}
      description="Bereits eingereichte Anträge behalten ihre berechneten Tage."
      confirmLabel="Entfernen"
    />
  );
}

const COLORS = [
  ["teal", "Türkis"],
  ["blue", "Blau"],
  ["violet", "Violett"],
  ["amber", "Bernstein"],
  ["rose", "Rosé"],
  ["slate", "Grau"],
] as const;

export function AbsenceTypeDialog({
  type,
}: {
  type?: {
    id: string;
    name: string;
    color: string;
    deductsLeave: boolean;
    requiresApproval: boolean;
    employeeCanRequest: boolean;
    isSensitive: boolean;
    archivedAt: Date | null;
  };
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={type ? "Abwesenheitsart bearbeiten" : "Abwesenheitsart anlegen"}
      trigger={type ? <><Pencil className="size-3.5" aria-hidden /> Bearbeiten</> : <><Plus className="size-4" aria-hidden /> Art anlegen</>}
      triggerVariant={type ? "ghost" : "secondary"}
      triggerSize="sm"
    >
      <ActionForm action={saveAbsenceTypeAction} className="space-y-4" onSuccess={() => setOpen(false)}>
        {type && <input type="hidden" name="id" value={type.id} />}
        <Field label="Name" name="name">
          {(p) => <Input {...p} defaultValue={type?.name} required maxLength={60} />}
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Farbe</legend>
          <div className="flex flex-wrap gap-2">
            {COLORS.map(([value, label]) => (
              <label key={value} className="cursor-pointer">
                <input type="radio" name="color" value={value} defaultChecked={(type?.color ?? "teal") === value} className="peer sr-only" />
                <span className={`abs-${value} inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium ring-offset-2 ring-offset-surface peer-checked:ring-2 peer-checked:ring-focus`}>
                  {label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="space-y-3">
          <Checkbox name="deductsLeave" defaultChecked={type?.deductsLeave} label="Wird vom Urlaubskonto abgezogen" />
          <Checkbox name="requiresApproval" defaultChecked={type?.requiresApproval ?? true} label="Muss genehmigt werden" />
          <Checkbox
            name="employeeCanRequest"
            defaultChecked={type?.employeeCanRequest ?? true}
            label="Mitarbeiter dürfen selbst beantragen"
            description="Sonst nur durch die Verwaltung erfassbar (z. B. Arbeitsunfähigkeit)."
          />
          <Checkbox
            name="isSensitive"
            defaultChecked={type?.isSensitive}
            label="Sensibel (z. B. Gesundheitsdaten)"
            description="Die Art sehen nur die betroffene Person und die Personalverwaltung. Wird nur durch die Verwaltung erfasst – Teamleitungen und Kollegen sehen „Abwesend“."
          />
          {type && <Checkbox name="archived" defaultChecked={Boolean(type.archivedAt)} label="Archiviert (nicht mehr auswählbar)" />}
        </div>
        <div className="flex justify-end">
          <SubmitButton pendingLabel="Wird gespeichert …">Speichern</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  );
}

export function SettingsForm({
  company,
}: {
  company: {
    name: string;
    defaultState: string;
    defaultWorkWeek: number;
    defaultAnnualLeaveDays: number;
    employeeCalendarScope: string;
    allowNegativeBalance: boolean;
    reminderAfterDays: number;
  };
}) {
  return (
    <ActionForm action={saveSettingsAction} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name des Unternehmens" name="name">
          {(p) => <Input {...p} defaultValue={company.name} required maxLength={120} />}
        </Field>
        <Field label="Standard-Bundesland" name="defaultState" hint="Für Mitarbeiter ohne Standort.">
          {(p) => (
            <Select {...p} defaultValue={company.defaultState}>
              {(Object.keys(STATES) as StateCode[]).map((s) => (
                <option key={s} value={s}>
                  {STATES[s]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <WeekdayPicker mask={company.defaultWorkWeek} label="Standard-Arbeitstage" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Standard-Urlaubsanspruch (Tage)" name="defaultAnnualLeaveDays" hint="Vorschlag für neue Mitarbeiter.">
          {(p) => <Input {...p} type="number" step="0.5" min={0} max={366} defaultValue={company.defaultAnnualLeaveDays} required />}
        </Field>
        <Field label="Erinnerung an offene Anträge nach" name="reminderAfterDays" hint="In Tagen. 0 = keine Erinnerungen.">
          {(p) => <Input {...p} type="number" min={0} max={30} defaultValue={company.reminderAfterDays} required />}
        </Field>
      </div>
      <Field label="Kalender für Mitarbeiter" name="employeeCalendarScope" hint="Gründe werden Kolleginnen und Kollegen nie angezeigt – nur „Abwesend“.">
        {(p) => (
          <Select {...p} defaultValue={company.employeeCalendarScope} className="max-w-md">
            <option value="team">Abwesenheiten im eigenen Team sehen</option>
            <option value="company">Abwesenheiten im ganzen Unternehmen sehen</option>
            <option value="none">Nur eigene Abwesenheiten sehen</option>
          </Select>
        )}
      </Field>
      <Checkbox
        name="allowNegativeBalance"
        defaultChecked={company.allowNegativeBalance}
        label="Anträge über den verfügbaren Urlaub hinaus erlauben"
        description="Standardmäßig werden Anträge abgelehnt, die das Urlaubskonto überziehen würden."
      />
      <SubmitButton pendingLabel="Wird gespeichert …">Einstellungen speichern</SubmitButton>
    </ActionForm>
  );
}

// ---------------------------------------------------------------------------
// Rollen
// ---------------------------------------------------------------------------

export function RoleDialog({
  role,
  grantable,
}: {
  role?: { id: string; name: string; description: string | null; permissions: string[]; isOwner: boolean };
  grantable: Permission[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={role ? `Rolle „${role.name}“ bearbeiten` : "Rolle anlegen"}
      description={role?.isOwner ? "Die Inhaberrolle hat immer alle Rechte." : "Du kannst nur Rechte vergeben, die du selbst besitzt."}
      trigger={role ? <><Pencil className="size-3.5" aria-hidden /> Bearbeiten</> : <><Plus className="size-4" aria-hidden /> Rolle anlegen</>}
      triggerVariant={role ? "ghost" : "primary"}
      triggerSize={role ? "sm" : "md"}
    >
      <ActionForm action={saveRoleAction} className="space-y-4" onSuccess={() => setOpen(false)}>
        {role && <input type="hidden" name="id" value={role.id} />}
        <Field label="Name" name="name">
          {(p) => <Input {...p} defaultValue={role?.name} required maxLength={60} />}
        </Field>
        <Field label="Beschreibung" name="description" optional>
          {(p) => <Input {...p} defaultValue={role?.description ?? ""} maxLength={200} />}
        </Field>
        {!role?.isOwner && (
          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-medium">Rechte</legend>
            {(Object.keys(PERMISSIONS) as Permission[]).map((p) => (
              <Checkbox
                key={p}
                name="permissions"
                value={p}
                defaultChecked={role?.permissions.includes(p)}
                disabled={!grantable.includes(p)}
                label={PERMISSIONS[p]}
                description={!grantable.includes(p) ? "Nicht vergebbar – du besitzt dieses Recht nicht." : undefined}
              />
            ))}
          </fieldset>
        )}
        <div className="flex justify-end">
          <SubmitButton pendingLabel="Wird gespeichert …">{role ? "Speichern" : "Rolle anlegen"}</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  );
}

export function DeleteRole({ id, name }: { id: string; name: string }) {
  return (
    <ConfirmAction
      action={deleteRoleAction}
      hidden={{ id }}
      trigger="Löschen"
      triggerVariant="ghost"
      triggerSize="sm"
      title={`Rolle „${name}“ löschen?`}
      description="Nur möglich, wenn die Rolle niemandem mehr zugewiesen ist."
      confirmLabel="Löschen"
    />
  );
}

export function PermissionBadges({ permissions, isOwner }: { permissions: string[]; isOwner: boolean }) {
  if (isOwner) return <Badge tone="primary">Alle Rechte</Badge>;
  if (permissions.length === 0) return <span className="text-sm text-muted">Eigene Anträge und Teamkalender</span>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {permissions.map((p) => (
        <li key={p}>
          <Badge>{PERMISSIONS[p as Permission] ?? p}</Badge>
        </li>
      ))}
    </ul>
  );
}
