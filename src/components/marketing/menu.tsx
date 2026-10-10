"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { buttonClasses } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export function MarketingMenu({ items }: { items: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lg:hidden" ref={ref}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="marketing-menu"
        onClick={() => setOpen((v) => !v)}
        className="grid size-10 place-items-center rounded-lg text-fg hover:bg-sunken"
        aria-label={open ? "Menü schließen" : "Menü öffnen"}
      >
        {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
      </button>
      {open && (
        <div id="marketing-menu" className="absolute inset-x-0 top-16 border-b border-line bg-surface px-4 pt-2 pb-5 shadow-card">
          <nav aria-label="Menü" className="flex flex-col">
            {items.map((i) => (
              <Link key={i.href} href={i.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-base hover:bg-sunken">
                {i.label}
              </Link>
            ))}
            <Link href="/login" onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-base hover:bg-sunken">
              Login
            </Link>
          </nav>
          <div className="mt-3 flex items-center justify-between gap-3 px-3">
            <Link href="/#kontakt" onClick={() => setOpen(false)} className={buttonClasses("primary")}>
              Demo anfragen
            </Link>
            <ThemeToggle />
          </div>
        </div>
      )}
    </div>
  );
}
