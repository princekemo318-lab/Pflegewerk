import Link from "next/link";
import { Bell } from "lucide-react";
import { requireTenant } from "@/server/auth/current";
import { can, canAny, isPlatformAdmin, listMemberships } from "@/server/authz";
import { countUnread } from "@/server/services/notifications";
import { countPendingApprovals } from "@/server/services/leave";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { MobileNav, NavLinks, type NavItem } from "@/components/app-shell/nav";
import { CompanySwitcher } from "@/components/app-shell/company-switcher";
import { logoutAction } from "@/app/(auth)/actions";

export const instant = false;

export default async function TenantLayout({ children }: LayoutProps<"/app">) {
  const { ctx, session } = await requireTenant();
  const [memberships, unread, pending, platformAdmin] = await Promise.all([
    listMemberships(session.user.id),
    countUnread(ctx),
    countPendingApprovals(ctx),
    isPlatformAdmin(session.user.id),
  ]);

  const main: NavItem[] = [
    { href: "/app", label: "Übersicht", icon: "dashboard", exact: true },
    { href: "/app/antraege", label: "Meine Anträge", icon: "requests" },
    ...(canAny(ctx, "leave.approve_team", "leave.approve_all", "leave.view_all")
      ? [{ href: "/app/genehmigungen", label: "Genehmigungen", icon: "approvals" as const, badge: pending }]
      : []),
    { href: "/app/kalender", label: "Kalender", icon: "calendar" },
    ...(canAny(ctx, "employees.view", "employees.manage", "leave.approve_team")
      ? [{ href: "/app/mitarbeiter", label: "Mitarbeiter", icon: "employees" as const }]
      : []),
  ];
  const admin: NavItem[] = [
    ...(can(ctx, "organization.manage") ? [{ href: "/app/organisation", label: "Teams & Standorte", icon: "organization" as const }] : []),
    ...(can(ctx, "roles.manage") ? [{ href: "/app/rollen", label: "Rollen & Rechte", icon: "roles" as const }] : []),
    ...(can(ctx, "organization.manage") ? [{ href: "/app/einstellungen", label: "Einstellungen", icon: "settings" as const }] : []),
    ...(can(ctx, "audit.view") ? [{ href: "/app/protokoll", label: "Protokoll", icon: "audit" as const }] : []),
  ];
  const activeCompanies = memberships.filter((m) => m.companyStatus === "active" && m.membershipStatus === "active");
  const initials = session.user.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const navContent = (
    <>
      <div className="mb-4 px-2">
        <CompanySwitcher current={ctx.companyId} companies={activeCompanies.map((m) => ({ id: m.companyId, name: m.companyName }))} />
      </div>
      <nav aria-label="Hauptnavigation" className="flex-1 space-y-6 overflow-y-auto px-1">
        <NavLinks items={main} />
        {admin.length > 0 && (
          <div>
            <p className="mb-1.5 px-3 text-xs font-medium tracking-wide text-subtle uppercase">Verwaltung</p>
            <NavLinks items={admin} />
          </div>
        )}
        {platformAdmin && (
          <NavLinks items={[{ href: "/admin", label: "Plattform-Admin", icon: "platform" }]} />
        )}
      </nav>
      <div className="mt-4 border-t border-line px-2 pt-4">
        <Link href="/app/profil" className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-sunken">
          <span className="grid size-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-fg">{initials}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{session.user.name}</span>
            <span className="block truncate text-xs text-muted">{ctx.roleName}</span>
          </span>
        </Link>
        <div className="mt-3 flex items-center justify-between">
          <ThemeToggle />
          <form action={logoutAction}>
            <button className="rounded-md px-2 py-1 text-sm text-muted hover:bg-sunken hover:text-fg">Abmelden</button>
          </form>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface p-3 lg:flex">
        <Link href="/app" className="mb-5 px-3 pt-2">
          <Logo />
        </Link>
        {navContent}
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface/90 px-4 backdrop-blur sm:px-6 lg:justify-end">
          <MobileNav>{navContent}</MobileNav>
          <Link href="/app" className="lg:hidden">
            <Logo />
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <Link
              href="/app/benachrichtigungen"
              className="relative grid size-9 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-fg"
              aria-label={unread ? `Benachrichtigungen, ${unread} ungelesen` : "Benachrichtigungen"}
            >
              <Bell className="size-5" aria-hidden />
              {unread > 0 && (
                <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-fg tabular">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
          </div>
        </header>
        <main className="pw-page mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
