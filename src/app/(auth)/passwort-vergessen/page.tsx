import type { Metadata } from "next";
import Link from "next/link";
import { ResetRequestForm } from "./reset-request-form";

export const metadata: Metadata = { title: "Passwort vergessen" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-title font-semibold">Passwort vergessen</h1>
      <p className="mt-1.5 mb-8 text-sm text-muted">
        Gib deine E-Mail-Adresse ein. Wir schicken dir einen Link, mit dem du ein neues Passwort festlegst.
      </p>
      <ResetRequestForm />
      <Link href="/login" className="mt-8 inline-block text-sm text-muted hover:text-fg">
        ← Zurück zur Anmeldung
      </Link>
    </>
  );
}
