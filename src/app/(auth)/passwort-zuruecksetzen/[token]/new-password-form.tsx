"use client";

import { ActionForm, Field, Input, SubmitButton } from "@/components/ui/form";
import { resetPasswordAction } from "../../actions";

export function NewPasswordForm({ token }: { token: string }) {
  return (
    <ActionForm action={resetPasswordAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field
        label="Neues Passwort"
        name="password"
        hint="Mindestens 10 Zeichen. Ein Satz aus mehreren Wörtern ist gut merkbar und sicher."
      >
        {(p) => <Input {...p} type="password" autoComplete="new-password" minLength={10} maxLength={128} required autoFocus />}
      </Field>
      <SubmitButton className="w-full" pendingLabel="Wird gespeichert …">
        Passwort speichern
      </SubmitButton>
    </ActionForm>
  );
}
