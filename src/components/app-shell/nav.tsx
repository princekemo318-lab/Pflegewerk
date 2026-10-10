"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  Bell,
  CalendarDays,
  ClipboardCheck,
  FileClock,
  Building2,
  LayoutDashboard,
  Menu,
  Plane,
  Settings,
  ShieldCheck,
  Users,
  X,
  KeyRound,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  badge?: number;
  exact?: boolean;
};

const ICONS = {
  dashboard: LayoutDashboard,
  requests: Plane,
  approvals: ClipboardCheck,
  calendar: CalendarDays,
  employees: Users,
  organization: Building2,
  roles: KeyRound,
  settings: Settings,
  audit: FileClock,
  notifications: Bell,
  platform: ShieldCheck,
};

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(pathname, item);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "group flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                active ? "bg-primary-soft font-medium text-fg" : "text-muted hover:bg-sunken hover:text-fg",
              )}
            >
              <Icon className={clsx("size-4 shrink-0", active ? "text-accent-text" : "text-subtle group-hover:text-muted")} aria-hidden />
              <span className="flex-1 truncate">{item.label}</span>
              {item.badge ? (
                <span className="min-w-5 rounded-full bg-warn-soft px-1.5 text-center text-xs font-semibold text-warn tabular">
                  {item.badge > 99 ? "99+" : item.badge}
                  <span className="sr-only"> offen</span>
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Navigation als ausklappbares Menü auf kleinen Bildschirmen. */
export function MobileNav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Das Menü gilt nur für den Pfad, auf dem es geöffnet wurde – nach einer Navigation ist es zu.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;
  const setOpen = (v: boolean) => setOpenedOn(v ? pathname : null);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="grid size-9 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-fg lg:hidden"
        aria-label="Menü öffnen"
      >
        <Menu className="size-5" aria-hidden />
      </button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === ref.current && setOpen(false)}
        className="m-0 h-dvh max-h-dvh w-[min(20rem,85vw)] max-w-none border-r border-line bg-surface p-0 text-fg backdrop:bg-[#0a1322]/50"
      >
        <div className="flex h-full flex-col p-3">
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid size-9 place-items-center rounded-lg text-muted hover:bg-sunken"
              aria-label="Menü schließen"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          {children}
        </div>
      </dialog>
    </>
  );
}
