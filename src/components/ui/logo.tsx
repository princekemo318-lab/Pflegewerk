import { brand } from "@/config/brand";
import clsx from "clsx";

/** Wortmarke mit Signet: zwei überlappende Wochenbalken. */
export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={clsx("inline-flex items-center gap-2 font-display font-semibold tracking-tight text-fg", className)}>
      <svg viewBox="0 0 28 28" className="size-7 shrink-0" aria-hidden>
        <rect width="28" height="28" rx="8" fill="var(--primary)" />
        <rect x="6" y="8" width="11" height="4.5" rx="2.25" fill="var(--accent)" />
        <rect x="11" y="15.5" width="11" height="4.5" rx="2.25" fill="var(--primary-fg)" opacity="0.92" />
      </svg>
      {!compact && <span className="text-[1.05rem]">{brand.name}</span>}
    </span>
  );
}
