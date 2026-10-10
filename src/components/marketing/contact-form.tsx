"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { ActionForm, Checkbox, Field, FormError, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { contactAction } from "@/app/(marketing)/actions";

export function ContactForm({
  employeeRanges,
  locationCounts,
  interests,
}: {
  employeeRanges: readonly string[];
  locationCounts: readonly string[];
  interests: Record<string, string>;
}) {
  const [sent, setSent] = useState(false);
  // Zeitpunkt der Anzeige (Spam-Schutz: zu schnelle Übermittlungen werden verworfen)
  const renderedAt = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (renderedAt.current) renderedAt.current.value = String(Date.now());
  }, [sent]);

  if (sent) {
    return (
      <div role="status" className="flex flex-col items-start gap-3 rounded-2xl border border-accent/30 bg-accent-soft p-6">
        <CheckCircle2 className="size-6 text-accent-text" aria-hidden />
        <p className="font-display text-xl font-semibold">Danke, deine Anfrage ist angekommen.</p>
        <p className="text-sm text-muted">
          Wir melden uns per E-Mail, um einen Termin für eine Demo zu vereinbaren. Deine Angaben verwenden wir ausschließlich für die
          Bearbeitung dieser Anfrage.
        </p>
      </div>
    );
  }

  return (
    <ActionForm action={contactAction} className="space-y-5" toastOnSuccess={false} onSuccess={() => setSent(true)}>
      {/* Spam-Schutz: für Menschen unsichtbar */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <input ref={renderedAt} type="hidden" name="renderedAt" defaultValue="" />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" name="name">
          {(p) => <Input {...p} autoComplete="name" required maxLength={120} />}
        </Field>
        <Field label="Geschäftliche E-Mail-Adresse" name="email">
          {(p) => <Input {...p} type="email" autoComplete="email" required maxLength={254} />}
        </Field>
        <Field label="Unternehmen" name="companyName" className="sm:col-span-2">
          {(p) => <Input {...p} autoComplete="organization" required maxLength={160} />}
        </Field>
        <Field label="Anzahl Mitarbeiter" name="employeeRange" optional>
          {(p) => (
            <Select {...p} defaultValue="">
              <option value="">Bitte wählen</option>
              {employeeRanges.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Anzahl Standorte" name="locationCount" optional>
          {(p) => (
            <Select {...p} defaultValue="">
              <option value="">Bitte wählen</option>
              {locationCounts.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">
          Was interessiert dich? <span className="text-xs font-normal text-subtle">optional</span>
        </legend>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {Object.entries(interests).map(([value, label]) => (
            <Checkbox key={value} name="interests" value={value} label={label} />
          ))}
        </div>
      </fieldset>
      <Field label="Deine Anforderungen" name="message" optional>
        {(p) => <Textarea {...p} rows={4} maxLength={3000} placeholder="z. B. Wie läuft heute die Urlaubsplanung bei euch?" />}
      </Field>
      <div>
        <Checkbox
          name="privacy"
          required
          label="Ich habe die Datenschutzhinweise gelesen."
          description={
            <>
              Wir speichern deine Angaben, um deine Anfrage zu bearbeiten und dich zu kontaktieren. Details in den{" "}
              <Link href="/datenschutz" className="underline" target="_blank">
                Datenschutzhinweisen
              </Link>
              .
            </>
          }
        />
        <FormError name="privacy" />
      </div>
      <SubmitButton size="lg" pendingLabel="Wird gesendet …">
        Demo anfragen
      </SubmitButton>
    </ActionForm>
  );
}
