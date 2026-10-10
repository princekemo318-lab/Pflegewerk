"use client";

import Link from "next/link";
import { ActionForm, Field, Input, SubmitButton } from "@/components/ui/form";
import { loginAction } from "../actions";

export function LoginForm({ next }: { next?: string }) {
  return (
    <ActionForm action={loginAction} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="E-Mail-Adresse" name="email">
        {(p) => <Input {...p} type="email" autoComplete="email" required autoFocus />}
      </Field>
      <Field label="Passwort" name="password">
        {(p) => <Input {...p} type="password" autoComplete="current-password" required />}
      </Field>
      <div className="flex justify-end">
        <Link href="/passwort-vergessen" className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline">
          Passwort vergessen?
        </Link>
      </div>
      <SubmitButton className="w-full" pendingLabel="Anmelden …">
        Anmelden
      </SubmitButton>
    </ActionForm>
  );
}
