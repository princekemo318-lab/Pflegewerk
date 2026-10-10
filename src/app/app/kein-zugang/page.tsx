import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTenant, requireSession } from "@/server/auth/current";
import { isPlatformAdmin, listMemberships } from "@/server/authz";
import { Logo } from "@/components/ui/logo";
import { Notice, buttonClasses } from "@/components/ui/primitives";
import { logoutAction } from "@/app/(auth)/actions";

export const metadata: Metadata = { title: "Kein Zugang" };
export const instant = false;

export default async function NoAccessPage() {
  const session = await requireSession("/app");
  if (await getTenant()) redirect("/app");
  const [memberships, platformAdmin] = await Promise.all([listMemberships(session.user.id), isPlatformAdmin(session.user.id)]);
  const suspended = memberships.some((m) => m.companyStatus === "suspended");
  const deactivated = memberships.some((m) => m.membershipStatus === "deactivated");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <Logo className="mb-8" />
      <h1 className="text-title font-semibold">Kein aktiver Unternehmenszugang</h1>
      <div className="mt-4 space-y-4">
        {suspended && (
          <Notice tone="warn" title="Der Zugang zu deinem Unternehmen ist gesperrt">
            Deine Daten bleiben erhalten. Bitte wende dich an deine Geschäftsführung.
          </Notice>
        )}
        {deactivated && (
          <Notice tone="warn" title="Dein Zugang wurde deaktiviert">
            Bitte wende dich an deine Verwaltung, wenn das ein Versehen ist.
          </Notice>
        )}
        {!suspended && !deactivated && (
          <p className="text-sm text-muted">
            Du bist mit {session.user.email} angemeldet, gehörst aber noch keinem Unternehmen an. Bitte nutze den Einladungslink aus
            deiner E-Mail.
          </p>
        )}
      </div>
      <div className="mt-8 flex flex-wrap gap-2">
        {platformAdmin && (
          <Link href="/admin" className={buttonClasses("primary")}>
            Zum Plattform-Admin
          </Link>
        )}
        <form action={logoutAction}>
          <button className={buttonClasses("secondary")}>Abmelden</button>
        </form>
      </div>
    </main>
  );
}
