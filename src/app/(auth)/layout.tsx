import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export const instant = false;

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
      <aside className="relative hidden overflow-hidden bg-[#13294b] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="w-fit [&_span]:text-white">
          <Logo />
        </Link>
        <WeekBoard />
        <p className="max-w-md text-sm text-white/70">
          Anträge, Abwesenheiten und Entscheidungen an einem Ort – für Mitarbeiter, Teamleitungen und Verwaltung.
        </p>
      </aside>
      <main className="flex flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between lg:justify-end">
          <Link href="/" className="lg:hidden">
            <Logo />
          </Link>
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
      </main>
    </div>
  );
}

/** Dekorative Wochentafel (rein illustrativ, keine Daten). */
function WeekBoard() {
  const rows: [number, number, string][] = [
    [1, 3, "#34c3b1"],
    [0, 0, ""],
    [2, 5, "#8fb4f2"],
    [0, 2, "#34c3b1"],
    [3, 4, "#e7b259"],
  ];
  return (
    <div aria-hidden className="w-full max-w-md">
      <div className="mb-3 grid grid-cols-7 gap-1.5 text-center text-[11px] tracking-wider text-white/50 uppercase">
        {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="space-y-2">
        {rows.map(([from, to, color], i) => (
          <div key={i} className="relative grid h-9 grid-cols-7 gap-1.5">
            {Array.from({ length: 7 }).map((_, d) => (
              <span key={d} className={d > 4 ? "rounded-md bg-white/[0.03]" : "rounded-md bg-white/[0.07]"} />
            ))}
            {color && (
              <span
                className="absolute inset-y-1 rounded-md"
                style={{
                  left: `calc(${(from / 7) * 100}% + 3px)`,
                  width: `calc(${((to - from + 1) / 7) * 100}% - 8px)`,
                  background: color,
                  opacity: 0.9,
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
