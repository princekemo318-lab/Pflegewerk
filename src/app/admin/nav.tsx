"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const ITEMS = [
  { href: "/admin", label: "Übersicht", exact: true },
  { href: "/admin/unternehmen", label: "Unternehmen" },
  { href: "/admin/anfragen", label: "Anfragen" },
  { href: "/admin/protokoll", label: "Protokoll" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Plattform" className="-mb-px flex gap-1 overflow-x-auto">
      {ITEMS.map((i) => {
        const active = i.exact ? pathname === i.href : pathname.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "border-b-2 px-3 py-2.5 text-sm whitespace-nowrap",
              active ? "border-accent font-medium text-fg" : "border-transparent text-muted hover:text-fg",
            )}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
