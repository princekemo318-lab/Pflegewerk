/**
 * Grundbausteine des Designsystems (Server-kompatibel, ohne Client-JavaScript).
 */
import Link from "next/link";
import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";

export { clsx as cn };

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent";
type Size = "sm" | "md" | "lg";

export function buttonClasses(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return clsx(
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors",
    "disabled:pointer-events-none disabled:opacity-55 aria-disabled:pointer-events-none aria-disabled:opacity-55",
    {
      "h-8 px-3 text-sm": size === "sm",
      "h-10 px-4 text-sm": size === "md",
      "h-12 px-5 text-base": size === "lg",
    },
    {
      "bg-primary text-primary-fg hover:bg-primary-hover shadow-soft": variant === "primary",
      "bg-accent text-accent-fg hover:brightness-95 shadow-soft": variant === "accent",
      "border border-line-strong bg-surface text-fg hover:bg-sunken": variant === "secondary",
      "text-fg hover:bg-sunken": variant === "ghost",
      "bg-danger text-white hover:brightness-95 dark:text-[#2a0b10]": variant === "danger",
    },
    extra,
  );
}

export function Button({
  variant,
  size,
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClasses(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}

// ---------------------------------------------------------------------------
// Karten & Layout
// ---------------------------------------------------------------------------

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={clsx("rounded-2xl border border-line bg-surface shadow-soft", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex items-start justify-between gap-4 border-b border-line px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-2 inline-flex text-sm text-muted hover:text-fg">
            ← {back.label}
          </Link>
        )}
        <h1 className="text-title font-semibold text-fg">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex flex-col items-center px-6 py-12 text-center", className)}>
      {icon && <div className="mb-3 grid size-11 place-items-center rounded-xl bg-sunken text-muted">{icon}</div>}
      <p className="font-semibold text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx("animate-pulse rounded-md bg-sunken", className)} />;
}

export function Notice({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "warn" | "danger" | "success";
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className={clsx(
        "rounded-xl border px-4 py-3 text-sm",
        {
          "border-info/25 bg-info-soft text-fg": tone === "info",
          "border-warn/30 bg-warn-soft text-fg": tone === "warn",
          "border-danger/30 bg-danger-soft text-fg": tone === "danger",
          "border-accent/30 bg-accent-soft text-fg": tone === "success",
        },
        className,
      )}
    >
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={clsx(title && "mt-0.5", "text-muted [&_a]:font-medium [&_a]:text-fg [&_a]:underline")}>{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

type BadgeTone = "neutral" | "success" | "warn" | "danger" | "info" | "primary";

export function Badge({ tone = "neutral", children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        {
          "bg-sunken text-muted": tone === "neutral",
          "bg-accent-soft text-accent-text": tone === "success",
          "bg-warn-soft text-warn": tone === "warn",
          "bg-danger-soft text-danger": tone === "danger",
          "bg-info-soft text-info": tone === "info",
          "bg-primary-soft text-primary": tone === "primary",
        },
        className,
      )}
    >
      {children}
    </span>
  );
}

const LEAVE_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  submitted: { label: "Eingereicht", tone: "warn" },
  approved: { label: "Genehmigt", tone: "success" },
  rejected: { label: "Abgelehnt", tone: "danger" },
  withdrawn: { label: "Zurückgezogen", tone: "neutral" },
  cancelled: { label: "Storniert", tone: "neutral" },
};

export function LeaveStatusBadge({ status }: { status: string }) {
  const s = LEAVE_STATUS[status] ?? { label: status, tone: "neutral" as const };
  return (
    <Badge tone={s.tone}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {s.label}
    </Badge>
  );
}

export function leaveStatusLabel(status: string) {
  return LEAVE_STATUS[status]?.label ?? status;
}

export function TypeDot({ color }: { color: string }) {
  return <span aria-hidden className={clsx("inline-block size-2.5 shrink-0 rounded-full", `abs-${color}`, "ring-1 ring-current/30")} />;
}

// ---------------------------------------------------------------------------
// Tabellen
// ---------------------------------------------------------------------------

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto">
      <table className={clsx("w-full text-left text-sm", className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      className={clsx("border-b border-line px-4 py-2.5 text-xs font-medium tracking-wide text-subtle uppercase first:pl-5 last:pr-5", className)}
      {...props}
    />
  );
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={clsx("border-b border-line px-4 py-3 align-middle first:pl-5 last:pr-5", className)} {...props} />;
}

// ---------------------------------------------------------------------------
// Kennzahl
// ---------------------------------------------------------------------------

export function Stat({
  label,
  value,
  hint,
  href,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
  tone?: "attention";
}) {
  const inner = (
    <>
      <p className="text-sm text-muted">{label}</p>
      <p className={clsx("mt-1 font-display text-3xl font-semibold tabular", tone === "attention" ? "text-warn" : "text-fg")}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-subtle">{hint}</p>}
    </>
  );
  const cls = "block rounded-2xl border border-line bg-surface p-5 shadow-soft";
  return href ? (
    <Link href={href} className={clsx(cls, "transition-colors hover:border-line-strong hover:bg-surface-2")}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
