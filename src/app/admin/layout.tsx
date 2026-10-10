import Link from "next/link";
import { requirePlatformAdmin } from "@/server/auth/current";
import { listMemberships } from "@/server/authz";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AdminNav } from "./nav";
import { logoutAction } from "@/app/(auth)/actions";

export const instant = false;

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { session } = await requirePlatformAdmin();
  const memberships = await listMemberships(session.user.id);
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href="/admin" className="flex items-center gap-2">
            <Logo />
            <span className="rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-primary-fg uppercase">Plattform</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            {memberships.length > 0 && (
              <Link href="/app" className="hidden text-sm text-muted hover:text-fg sm:inline">
                Zur App
              </Link>
            )}
            <ThemeToggle />
            <form action={logoutAction}>
              <button className="rounded-md px-2 py-1 text-sm text-muted hover:bg-sunken hover:text-fg">Abmelden</button>
            </form>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-2 sm:px-4">
          <AdminNav />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
