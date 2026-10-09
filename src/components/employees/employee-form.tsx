"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy } from "lucide-react";
import { ActionForm, Checkbox, Field, Input, Select, SubmitButton, WeekdayPicker } from "@/components/ui/form";
import { Notice, buttonClasses } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toaster";
import type { ActionState } from "@/server/actions";

type Option = { id: string; name: string };
type Employee = {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  personnelNumber?: string | null;
  jobTitle?: string | null;
  teamId?: string | null;
  locationId?: string | null;
  managerId?: string | null;
  entryDate?: string | null;
  exitDate?: string | null;
};

export function EmployeeFields({
  employee,
  teams,
  locations,
  managers,
}: {
  employee?: Employee;
  teams: Option[];
  locations: Option[];
  managers: { id: string; firstName: string; lastName: string }[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Vorname" name="firstName">
        {(p) => <Input {...p} defaultValue={employee?.firstName} required maxLength={80} autoComplete="off" />}
      </Field>
      <Field label="Nachname" name="lastName">
        {(p) => <Input {...p} defaultValue={employee?.lastName} required maxLength={80} autoComplete="off" />}
      </Field>
      <Field label="E-Mail-Adresse" name="email" optional hint="Wird für die Einladung und Benachrichtigungen verwendet.">
        {(p) => <Input {...p} type="email" defaultValue={employee?.email ?? ""} maxLength={254} autoComplete="off" />}
      </Field>
      <Field label="Funktion" name="jobTitle" optional>
        {(p) => <Input {...p} defaultValue={employee?.jobTitle ?? ""} maxLength={80} placeholder="z. B. Pflegefachkraft" />}
      </Field>
      <Field label="Team" name="teamId" optional>
        {(p) => (
          <Select {...p} defaultValue={employee?.teamId ?? ""}>
            <option value="">Kein Team</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Standort" name="locationId" optional hint="Bestimmt die Feiertage für die Urlaubsberechnung.">
        {(p) => (
          <Select {...p} defaultValue={employee?.locationId ?? ""}>
            <option value="">Unternehmensstandard</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Führungskraft" name="managerId" optional hint="Entscheidet vorrangig über Anträge (sofern berechtigt).">
        {(p) => (
          <Select {...p} defaultValue={employee?.managerId ?? ""}>
            <option value="">Keine</option>
            {managers
              .filter((m) => m.id !== employee?.id)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.lastName}, {m.firstName}
                </option>
              ))}
          </Select>
        )}
      </Field>
      <Field label="Personalnummer" name="personnelNumber" optional>
        {(p) => <Input {...p} defaultValue={employee?.personnelNumber ?? ""} maxLength={40} />}
      </Field>
      <Field label="Eintritt" name="entryDate" optional>
        {(p) => <Input {...p} type="date" defaultValue={employee?.entryDate ?? ""} />}
      </Field>
      <Field label="Austritt" name="exitDate" optional>
        {(p) => <Input {...p} type="date" defaultValue={employee?.exitDate ?? ""} />}
      </Field>
    </div>
  );
}

export function InviteLinkNotice({ url, delivery }: { url: string; delivery: string }) {
  return (
    <Notice tone={delivery === "failed" ? "warn" : "info"} title={delivery === "failed" ? "E-Mail konnte nicht versendet werden" : "E-Mail-Versand ist nicht eingerichtet"}>
      <p>Gib diesen persönlichen Einladungslink sicher weiter. Er ist 7 Tage gültig und wird nicht erneut angezeigt.</p>
      <div className="mt-2 flex gap-2">
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-2 font-mono text-xs text-fg" aria-label="Einladungslink" />
        <button
          type="button"
          className={buttonClasses("secondary", "sm", "h-9")}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              toast("Link kopiert.");
            } catch {
              toast("Kopieren nicht möglich – bitte manuell markieren.", "error");
            }
          }}
        >
          <Copy className="size-4" aria-hidden /> Kopieren
        </button>
      </div>
    </Notice>
  );
}

export function CreateEmployeeForm({
  action,
  teams,
  locations,
  managers,
  roles,
  defaults,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  teams: Option[];
  locations: Option[];
  managers: { id: string; firstName: string; lastName: string }[];
  roles: { id: string; name: string; isDefault: boolean }[];
  defaults: { weekdays: number; annualLeaveDays: number; year: number };
}) {
  const [invite, setInvite] = useState(true);
  const [created, setCreated] = useState<{ url: string; delivery: string; employeeId: string } | null>(null);

  if (created) {
    return (
      <div className="space-y-4">
        <InviteLinkNotice url={created.url} delivery={created.delivery} />
        <div className="flex gap-2">
          <Link href={`/app/mitarbeiter/${created.employeeId}`} className={buttonClasses("primary")}>
            Zum Mitarbeiterprofil
          </Link>
          <button type="button" onClick={() => setCreated(null)} className={buttonClasses("secondary")}>
            Weitere Person hinzufügen
          </button>
        </div>
      </div>
    );
  }

  return (
    <ActionForm
      action={action}
      className="space-y-8"
      onSuccess={(s) => {
        if (s.data?.inviteUrl) setCreated({ url: String(s.data.inviteUrl), delivery: String(s.data.delivery), employeeId: String(s.data.employeeId) });
      }}
    >
      <section>
        <h2 className="mb-4 font-semibold">Stammdaten</h2>
        <EmployeeFields teams={teams} locations={locations} managers={managers} />
      </section>
      <section className="grid gap-4 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Arbeitszeit & Urlaub</h2>
        <WeekdayPicker mask={defaults.weekdays} />
        <Field label={`Urlaubsanspruch ${defaults.year}`} name="annualLeaveDays" hint="In Arbeitstagen nach dem gewählten Modell.">
          {(p) => <Input {...p} type="number" inputMode="decimal" step="0.5" min={0} max={366} defaultValue={defaults.annualLeaveDays} required />}
        </Field>
      </section>
      <section className="space-y-4">
        <h2 className="font-semibold">Zugang</h2>
        <Checkbox
          name="invite"
          checked={invite}
          onChange={(e) => setInvite(e.target.checked)}
          label="Zur Plattform einladen"
          description="Die Person erhält einen Link, richtet ein Passwort ein und kann selbst Anträge stellen."
        />
        {invite && (
          <Field label="Rolle" name="roleId" className="max-w-sm">
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
        )}
      </section>
      <SubmitButton pendingLabel="Wird gespeichert …">{invite ? "Anlegen und einladen" : "Mitarbeiter anlegen"}</SubmitButton>
    </ActionForm>
  );
}
