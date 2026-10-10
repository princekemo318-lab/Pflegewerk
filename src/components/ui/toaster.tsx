"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { CheckCircle2, AlertCircle, X } from "lucide-react";

type Toast = { id: number; message: string; tone: "success" | "error" };

let counter = 0;
let toasts: Toast[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function toast(message: string, tone: Toast["tone"] = "success") {
  const id = ++counter;
  toasts = [...toasts.slice(-2), { id, message, tone }];
  emit();
  setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4500);
}

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const EMPTY: Toast[] = [];

/** Liest einmalige Erfolgsmeldungen, die eine Server Action vor einem Redirect gesetzt hat. */
function useFlashCookie() {
  const pathname = usePathname();
  const check = useCallback(() => {
    const match = document.cookie.match(/(?:^|; )pw_flash=([^;]*)/);
    if (!match) return;
    document.cookie = "pw_flash=; Max-Age=0; path=/";
    try {
      toast(decodeURIComponent(match[1]));
    } catch {}
  }, []);
  useEffect(() => {
    check();
  }, [pathname, check]);
}

export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => toasts, () => EMPTY);
  useFlashCookie();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
    >
      {list.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className="pw-toast pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm shadow-card"
        >
          {t.tone === "success" ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          ) : (
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
          )}
          <p className="flex-1 text-fg">{t.message}</p>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            className="-m-1 rounded p-1 text-subtle hover:text-fg"
            aria-label="Meldung schließen"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
