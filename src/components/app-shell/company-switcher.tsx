"use client";

import { useRef } from "react";
import { Building2 } from "lucide-react";
import { switchCompanyAction } from "@/app/app/shell-actions";

export function CompanySwitcher({ current, companies }: { current: string; companies: { id: string; name: string }[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const currentName = companies.find((c) => c.id === current)?.name ?? "";
  if (companies.length <= 1) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">
        <Building2 className="size-4 shrink-0 text-subtle" aria-hidden />
        <span className="truncate font-medium">{currentName}</span>
      </div>
    );
  }
  return (
    <form ref={formRef} action={switchCompanyAction}>
      <label className="sr-only" htmlFor="company-switcher">
        Unternehmen wechseln
      </label>
      <div className="relative">
        <Building2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
        <select
          id="company-switcher"
          name="companyId"
          defaultValue={current}
          onChange={() => formRef.current?.requestSubmit()}
          className="h-10 w-full truncate rounded-lg border border-line bg-surface-2 pr-8 pl-9 text-sm font-medium text-fg"
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <noscript>
        <button className="mt-2 text-sm underline">Wechseln</button>
      </noscript>
    </form>
  );
}
