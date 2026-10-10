"use client";

import { Check, X } from "lucide-react";
import { ActionForm, Field, SubmitButton, Textarea } from "@/components/ui/form";
import { ConfirmAction } from "@/components/ui/dialog";
import { cancelLeaveAction, decideLeaveAction, withdrawLeaveAction } from "@/app/app/(tenant)/antraege/actions";

export function DecisionForm({ id }: { id: string }) {
  return (
    <ActionForm action={decideLeaveAction} className="w-full space-y-4">
      <input type="hidden" name="id" value={id} />
      <Field label="Begründung" name="note" hint="Bei einer Ablehnung erforderlich. Die Person sieht diesen Text.">
        {(p) => <Textarea {...p} rows={2} maxLength={1000} placeholder="z. B. Vertretung ist sichergestellt." />}
      </Field>
      <div className="flex flex-col gap-2 sm:flex-row">
        <SubmitButton name="decision" value="approve" variant="accent" pendingLabel="Wird gespeichert …">
          <Check className="size-4" aria-hidden />
          Genehmigen
        </SubmitButton>
        <SubmitButton name="decision" value="reject" variant="secondary" pendingLabel="Wird gespeichert …">
          <X className="size-4" aria-hidden />
          Ablehnen
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

export function WithdrawButton({ id }: { id: string }) {
  return (
    <ConfirmAction
      action={withdrawLeaveAction}
      hidden={{ id }}
      trigger="Antrag zurückziehen"
      title="Antrag zurückziehen?"
      description="Der Antrag wird nicht mehr entschieden. Du kannst jederzeit einen neuen stellen."
      confirmLabel="Zurückziehen"
    />
  );
}

export function CancelButton({ id }: { id: string }) {
  return (
    <ConfirmAction
      action={cancelLeaveAction}
      hidden={{ id }}
      trigger="Genehmigung stornieren"
      title="Genehmigte Abwesenheit stornieren?"
      description="Die Tage werden wieder freigegeben und die Person wird benachrichtigt."
      confirmLabel="Stornieren"
      reason={{ label: "Begründung", required: true, placeholder: "z. B. auf Wunsch der Mitarbeiterin" }}
    />
  );
}
