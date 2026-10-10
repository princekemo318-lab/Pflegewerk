"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import clsx from "clsx";

type Theme = "light" | "dark" | "system";
const KEY = "pw-theme";
const EVENT = "pw-theme-change";

function read(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {}
  return "system";
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

export function ThemeToggle({ className }: { className?: string }) {
  // Auf dem Server ist die Einstellung unbekannt (null) – keine Hydration-Abweichung.
  const theme = useSyncExternalStore(subscribe, read, () => null);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const choose = (t: Theme) => {
    try {
      localStorage.setItem(KEY, t);
    } catch {}
    apply(t);
    window.dispatchEvent(new Event(EVENT));
  };

  const options: { value: Theme; label: string; Icon: typeof Sun }[] = [
    { value: "light", label: "Hell", Icon: Sun },
    { value: "dark", label: "Dunkel", Icon: Moon },
    { value: "system", label: "System", Icon: Monitor },
  ];

  return (
    <div role="radiogroup" aria-label="Erscheinungsbild" className={clsx("inline-flex rounded-lg border border-line bg-sunken p-0.5", className)}>
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          title={label}
          onClick={() => choose(value)}
          className={clsx(
            "grid h-7 w-8 place-items-center rounded-md text-muted transition-colors",
            theme === value ? "bg-surface text-fg shadow-soft" : "hover:text-fg",
          )}
        >
          <Icon className="size-3.5" aria-hidden />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
