import type { Metadata } from "next";
import { requireTenant } from "@/server/auth/current";
import { Card, CardHeader, PageHeader, buttonClasses } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { PasswordForm, ProfileForm } from "./forms";

export const metadata: Metadata = { title: "Profil" };

export default async function ProfilePage() {
  const { ctx, session } = await requireTenant();
  return (
    <>
      <PageHeader title="Profil" description={`${session.user.email} · ${ctx.roleName} bei ${ctx.companyName}`} />
      <div className="grid max-w-3xl gap-6">
        <Card>
          <CardHeader title="Anzeigename" />
          <div className="p-5">
            <ProfileForm name={session.user.name} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Passwort ändern" description="Andere angemeldete Geräte werden danach abgemeldet." />
          <div className="p-5">
            <PasswordForm />
          </div>
        </Card>
        <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="font-semibold">Meine Daten</h2>
            <p className="text-sm text-muted">
              Lade alle Daten herunter, die {ctx.companyName} hier über dich speichert (JSON). Für Berichtigung oder Löschung wende dich an deine Personalverwaltung.
            </p>
          </div>
          <a href="/app/profil/datenexport" download className={buttonClasses("secondary")}>
            Daten herunterladen
          </a>
        </Card>
        <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="font-semibold">Erscheinungsbild</h2>
            <p className="text-sm text-muted">Hell, dunkel oder wie dein Gerät eingestellt ist.</p>
          </div>
          <ThemeToggle />
        </Card>
      </div>
    </>
  );
}
