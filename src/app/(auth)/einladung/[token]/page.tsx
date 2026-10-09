import type { Metadata } from "next";
import Link from "next/link";
import { getInvitation } from "@/server/services/invitations";
import { getSession } from "@/server/auth/current";
import { Notice, buttonClasses } from "@/components/ui/primitives";
import { AcceptInvitationForm } from "./accept-form";
import { logoutAction } from "../../actions";

export const metadata: Metadata = { title: "Einladung", referrer: "no-referrer" };

const STATE_TEXT = {
  expired: ["Diese Einladung ist abgelaufen", "Einladungen sind 7 Tage gültig. Bitte deine Verwaltung um eine neue Einladung."],
  used: ["Diese Einladung wurde bereits angenommen", "Du kannst dich direkt anmelden."],
  revoked: ["Diese Einladung wurde zurückgezogen", "Bitte wende dich an deine Verwaltung."],
  company_suspended: ["Zugang derzeit nicht möglich", "Der Zugang zu diesem Unternehmen ist vorübergehend gesperrt."],
} as const;

export default async function InvitationPage({ params }: PageProps<"/einladung/[token]">) {
  const { token } = await params;
  const [invitation, session] = await Promise.all([getInvitation(token), getSession()]);

  if (!invitation) {
    return (
      <Notice tone="warn" title="Einladung nicht gefunden">
        Der Link ist unvollständig oder ungültig. Prüfe, ob du ihn vollständig kopiert hast.
      </Notice>
    );
  }
  if (invitation.state !== "valid") {
    const [title, text] = STATE_TEXT[invitation.state];
    return (
      <div className="space-y-4">
        <Notice tone="warn" title={title}>
          {text}
        </Notice>
        <Link href="/login" className={buttonClasses("secondary")}>
          Zur Anmeldung
        </Link>
      </div>
    );
  }

  const signedInAsInvitee = session?.user.email === invitation.email;
  const signedInAsOther = session && !signedInAsInvitee;

  return (
    <>
      <p className="text-sm font-medium text-accent-text">Einladung</p>
      <h1 className="mt-1 text-title font-semibold">Willkommen bei {invitation.companyName}</h1>
      <p className="mt-1.5 mb-8 text-sm text-muted">
        Hallo {invitation.firstName}, richte deinen Zugang für <span className="font-medium text-fg">{invitation.email}</span> ein.
      </p>

      {signedInAsOther ? (
        <div className="space-y-4">
          <Notice tone="warn" title="Du bist mit einem anderen Konto angemeldet">
            Melde dich ab und öffne den Link erneut, um die Einladung für {invitation.email} anzunehmen.
          </Notice>
          <form action={logoutAction}>
            <button className={buttonClasses("secondary")}>Abmelden</button>
          </form>
        </div>
      ) : invitation.userExists && !signedInAsInvitee ? (
        <div className="space-y-4">
          <Notice tone="info" title="Du hast bereits ein Konto">
            Melde dich an, um {invitation.companyName} zu deinem Konto hinzuzufügen.
          </Notice>
          <Link href={`/login?next=${encodeURIComponent(`/einladung/${token}`)}`} className={buttonClasses("primary", "md", "w-full")}>
            Anmelden und fortfahren
          </Link>
        </div>
      ) : (
        <AcceptInvitationForm token={token} existingAccount={signedInAsInvitee} />
      )}
    </>
  );
}
