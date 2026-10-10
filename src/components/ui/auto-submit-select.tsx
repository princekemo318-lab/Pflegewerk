"use client";

import type { ComponentProps } from "react";
import clsx from "clsx";

/** Select, das sein Formular bei Änderung sofort absendet (z. B. Filter). */
export function AutoSubmitSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      {...props}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className={clsx("h-8 rounded-lg border border-line-strong bg-surface px-2 pr-7 text-sm text-fg", className)}
    />
  );
}
