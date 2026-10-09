"use client";

import Link from "next/link";
import { useState } from "react";
import { ActionForm, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { ConfirmAction } from "@/components/ui/dialog";
import { buttonClasses } from "@/components/ui/primitives";
import { InviteLinkNotice } from "@/components/employees/employee-form";
import {
  addContactNoteAction,
  assignAdminAction,
  assignContactAction,
  createCompanyAction,
  deleteContactAction,
  inviteAdminAction,
  setCompanyStatusAction,
  updateContactStatusAction,
} from "./actions";
import { STATES, type StateCode } from "@/lib/holidays";

export function CreateCompanyForm({
  requests,
  preselect,
}: {
  requests: { id: string; companyName: string; name: string }[];
  preselect?: { id: string; companyName: string; name: string; email: string } | null;
}) {
  const [created, setCreated] = useState<{ url: string; delivery: string; companyId: string } | null>(null);
  if (created) {
    return (
      <div className="space-y-4">
        <InviteLinkNotice url={created.url} delivery={created.delivery} />
        <Link href={`/admin/unternehmen/${created.companyId}`} className={buttonClasses("primary")}>
          Zum Unternehmen
        </Link>
      </div>
    );
  }
  const [first, ...rest] = (preselect?.name ?? "").split(" ");
  return (
    <ActionForm
      action={createCompanyAction}
      className="space-y-6"
      onSuccess={(s) => s.data?.inviteUrl && setCreated({ url: String(s.data.inviteUrl), delivery: String(s.data.delivery), companyId: String(s.data.companyId) })}
    >
      <section className="grid gap-4 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Unternehmen</h2>
        <Field label="Name" name="name">
          {(p) => <Input {...p} defaultValue={preselect?.companyName} required maxLength={120} />}
        </Field>
        <Field label="Kurzbezeichnung" name="slug" optional hint="Wird sonst aus dem Namen erzeugt.">
          {(p) => <Input {...p} maxLength={48} pattern="[a-z0-9\-]+" placeholder="z. B. pflegedienst-sonnenhof" />}
        </Field>
        <Field label="Bundesland (Standard)" name="defaultState">
          {(p) => (
            <Select {...p} defaultValue="NW">
              {(Object.keys(STATES) as StateCode[]).map((s) => (
                <option key={s} value={s}>
                  {STATES[s]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Zugehörige Anfrage" name="contactRequestId" optional>
          {(p) => (
            <Select {...p} defaultValue={preselect?.id ?? ""}>
              <option value="">Keine</option>
              {requests.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.companyName} ({r.name})
                </option>
              ))}
            </Select>
          )}
        </Field>
      </section>
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h2 className="font-semibold">Verantwortliche Person</h2>
          <p className="mt-0.5 text-sm text-muted">Erhält die Inhaberrolle und eine Einladung, um das Konto einzurichten.</p>
        </div>
        <Field label="Vorname" name="ownerFirstName">
          {(p) => <Input {...p} defaultValue={first} required maxLength={80} />}
        </Field>
        <Field label="Nachname" name="ownerLastName">
          {(p) => <Input {...p} defaultValue={rest.join(" ")} required maxLength={80} />}
        </Field>
        <Field label="Geschäftliche E-Mail-Adresse" name="ownerEmail" className="sm:col-span-2">
          {(p) => <Input {...p} type="email" defaultValue={preselect?.email} required />}
        </Field>
      </section>
      <SubmitButton pendingLabel="Wird angelegt …">Unternehmen anlegen und einladen</SubmitButton>
    </ActionForm>
  );
}

export function CompanyStatusControl({ id, status, name }: { id: string; status: "active" | "suspended"; name: string }) {
  return status === "active" ? (
    <ConfirmAction
      action={setCompanyStatusAction}
      hidden={{ id, status: "suspended" }}
      trigger="Unternehmen sperren"
      title={`${name} sperren?`}
      description="Alle Nutzer verlieren sofort den Zugriff. Es werden keine Daten gelöscht; die Sperre kann jederzeit aufgehoben werden."
      confirmLabel="Sperren"
      reason={{ label: "Grund (intern)", placeholder: "z. B. Vertrag beendet" }}
    />
  ) : (
    <ConfirmAction
      action={setCompanyStatusAction}
      hidden={{ id, status: "active" }}
      trigger="Unternehmen freischalten"
      tone="primary"
      title={`${name} freischalten?`}
      description="Mitglieder können sich wieder anmelden."
      confirmLabel="Freischalten"
    />
  );
}

export function AssignAdminForm({ id, members }: { id: string; members: { membershipId: string; label: string }[] }) {
  if (members.length === 0) return <p className="text-sm text-muted">Keine weiteren Mitglieder vorhanden.</p>;
  return (
    <ActionForm action={assignAdminAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <Field label="Mitglied zur Inhaberrolle machen" name="membershipId" className="min-w-56 flex-1">
        {(p) => (
          <Select {...p}>
            {members.map((m) => (
              <option key={m.membershipId} value={m.membershipId}>
                {m.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <SubmitButton variant="secondary" pendingLabel="…">
        Zuweisen
      </SubmitButton>
    </ActionForm>
  );
}

export function InviteAdminForm({ id }: { id: string }) {
  const [link, setLink] = useState<{ url: string; delivery: string } | null>(null);
  if (link) return <InviteLinkNotice url={link.url} delivery={link.delivery} />;
  return (
    <ActionForm
      action={inviteAdminAction}
      className="grid gap-3 sm:grid-cols-3 sm:items-end"
      onSuccess={(s) => s.data?.inviteUrl && setLink({ url: String(s.data.inviteUrl), delivery: String(s.data.delivery) })}
    >
      <input type="hidden" name="id" value={id} />
      <Field label="Vorname" name="firstName">
        {(p) => <Input {...p} required maxLength={80} />}
      </Field>
      <Field label="Nachname" name="lastName">
        {(p) => <Input {...p} required maxLength={80} />}
      </Field>
      <Field label="E-Mail" name="email">
        {(p) => <Input {...p} type="email" required />}
      </Field>
      <div className="sm:col-span-3">
        <SubmitButton variant="secondary" pendingLabel="…">
          Administrator einladen
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

export function ContactStatusForm({ id, status, options }: { id: string; status: string; options: [string, string][] }) {
  return (
    <ActionForm action={updateContactStatusAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <Field label="Status" name="status" className="min-w-48 flex-1">
        {(p) => (
          <Select {...p} defaultValue={status}>
            {options.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <SubmitButton variant="secondary" pendingLabel="…">
        Speichern
      </SubmitButton>
    </ActionForm>
  );
}

export function ContactAssignForm({ id, assigned, admins }: { id: string; assigned: string | null; admins: { id: string; name: string }[] }) {
  return (
    <ActionForm action={assignContactAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <Field label="Zuständig" name="userId" className="min-w-48 flex-1">
        {(p) => (
          <Select {...p} defaultValue={assigned ?? ""}>
            <option value="">Niemand</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <SubmitButton variant="secondary" pendingLabel="…">
        Speichern
      </SubmitButton>
    </ActionForm>
  );
}

export function ContactNoteForm({ id }: { id: string }) {
  return (
    <ActionForm action={addContactNoteAction} resetOnSuccess className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <Field label="Art" name="kind">
          {(p) => (
            <Select {...p} defaultValue="note">
              <option value="note">Notiz</option>
              <option value="call">Telefonat</option>
              <option value="email">E-Mail</option>
              <option value="meeting">Termin</option>
            </Select>
          )}
        </Field>
        <Field label="Inhalt" name="body">
          {(p) => <Textarea {...p} rows={2} required maxLength={3000} />}
        </Field>
      </div>
      <SubmitButton variant="secondary" pendingLabel="…">
        Eintrag hinzufügen
      </SubmitButton>
    </ActionForm>
  );
}

export function DeleteContact({ id }: { id: string }) {
  return (
    <ConfirmAction
      action={deleteContactAction}
      hidden={{ id }}
      trigger="Anfrage löschen"
      triggerSize="sm"
      title="Anfrage endgültig löschen?"
      description="Kontaktdaten und Verlauf werden unwiderruflich entfernt (z. B. auf Wunsch der anfragenden Person). Im Protokoll bleibt nur vermerkt, dass gelöscht wurde."
      confirmLabel="Endgültig löschen"
    />
  );
}
