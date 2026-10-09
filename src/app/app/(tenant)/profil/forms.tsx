"use client";

import { ActionForm, Field, Input, SubmitButton } from "@/components/ui/form";
import { changePasswordAction, updateNameAction } from "./actions";

export function ProfileForm({ name }: { name: string }) {
  return (
    <ActionForm action={updateNameAction} className="flex flex-wrap items-end gap-3">
      <Field label="Name" name="name" className="min-w-60 flex-1">
        {(p) => <Input {...p} defaultValue={name} required maxLength={120} autoComplete="name" />}
      </Field>
      <SubmitButton variant="secondary" pendingLabel="…">
        Speichern
      </SubmitButton>
    </ActionForm>
  );
}

export function PasswordForm() {
  return (
    <ActionForm action={changePasswordAction} resetOnSuccess className="grid gap-4 sm:grid-cols-2">
      <Field label="Aktuelles Passwort" name="currentPassword" className="sm:col-span-2 sm:max-w-sm">
        {(p) => <Input {...p} type="password" autoComplete="current-password" required />}
      </Field>
      <Field label="Neues Passwort" name="newPassword" hint="Mindestens 10 Zeichen." className="sm:col-span-2 sm:max-w-sm">
        {(p) => <Input {...p} type="password" autoComplete="new-password" minLength={10} maxLength={128} required />}
      </Field>
      <div className="sm:col-span-2">
        <SubmitButton pendingLabel="Wird gespeichert …">Passwort ändern</SubmitButton>
      </div>
    </ActionForm>
  );
}
