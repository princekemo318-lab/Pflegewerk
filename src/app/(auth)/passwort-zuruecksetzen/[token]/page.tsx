import type { Metadata } from "next";
import Link from "next/link";
import { isResetTokenValid } from "@/server/auth/accounts";
import { Notice } from "@/components/ui/primitives";
import { NewPasswordForm } from "./new-password-form";

export const metadata: Metadata = { title: "Neues Passwort", referrer: "no-referrer" };

export default async function ResetPasswordPage({ params }: PageProps<"/passwort-zuruecksetzen/[token]">) {
  const { token } = await params;
  const valid = await isResetTokenValid(token);
  return (
    <>
      <h1 className="text-title font-semibold">Neues Passwort festlegen</h1>
      {valid ? (
        <>
          <p className="mt-1.5 mb-8 text-sm text-muted">Danach bist du automatisch angemeldet. Andere Geräte werden abgemeldet.</p>
          <NewPasswordForm token={token} />
        </>
      ) : (
        <div className="mt-6 space-y-4">
          <Notice tone="warn" title="Dieser Link ist nicht mehr gültig">
            Links zum Zurücksetzen sind 60 Minuten gültig und können nur einmal verwendet werden.
          </Notice>
          <Link href="/passwort-vergessen" className="inline-block text-sm font-medium underline underline-offset-4">
            Neuen Link anfordern
          </Link>
        </div>
      )}
    </>
  );
}
