"use client";

import { useState } from "react";
import { ActionForm, Field, Input, SubmitButton } from "@/components/ui/form";
import { Notice } from "@/components/ui/primitives";
import { requestResetAction } from "../actions";

export function ResetRequestForm() {
  const [sent, setSent] = useState(false);
  if (sent) {
    return (
      <Notice tone="success" title="Bitte prüfe dein Postfach">
        Falls ein Konto mit dieser Adresse existiert, ist ein Link unterwegs. Er ist 60 Minuten gültig.
      </Notice>
    );
  }
  return (
    <ActionForm action={requestResetAction} className="space-y-4" toastOnSuccess={false} onSuccess={() => setSent(true)}>
      <Field label="E-Mail-Adresse" name="email">
        {(p) => <Input {...p} type="email" autoComplete="email" required autoFocus />}
      </Field>
      <SubmitButton className="w-full" pendingLabel="Wird gesendet …">
        Link senden
      </SubmitButton>
    </ActionForm>
  );
}
