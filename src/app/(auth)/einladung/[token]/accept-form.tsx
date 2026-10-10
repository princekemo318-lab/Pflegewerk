"use client";

import { ActionForm, Field, Input, SubmitButton } from "@/components/ui/form";
import { acceptInvitationAction } from "../../actions";

export function AcceptInvitationForm({ token, existingAccount }: { token: string; existingAccount: boolean }) {
  return (
    <ActionForm action={acceptInvitationAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {!existingAccount && (
        <>
          <Field label="Dein Name" name="name" hint="So sehen dich deine Kolleginnen und Kollegen.">
            {(p) => <Input {...p} autoComplete="name" required autoFocus maxLength={120} />}
          </Field>
          <Field label="Passwort festlegen" name="password" hint="Mindestens 10 Zeichen.">
            {(p) => <Input {...p} type="password" autoComplete="new-password" minLength={10} maxLength={128} required />}
          </Field>
        </>
      )}
      <SubmitButton className="w-full" pendingLabel="Wird eingerichtet …">
        {existingAccount ? "Einladung annehmen" : "Zugang einrichten"}
      </SubmitButton>
    </ActionForm>
  );
}
