import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { buttonClasses } from "@/components/ui/primitives";
import { brand } from "@/config/brand";
import { MarketingMenu } from "@/components/marketing/menu";

const NAV = [
  { href: "/#funktionen", label: "Funktionen" },
  { href: "/#rechner", label: "Urlaubsrechner" },
  { href: "/#fuer-wen", label: "Für wen?" },
  { href: "/#ablauf", label: "So funktioniert es" },
  { href: "/#faq", label: "FAQ" },
  { href: "/#kontakt", label: "Kontakt" },
];

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#inhalt" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Zum Inhalt springen
      </a>
      <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" aria-label={`${brand.name} – Startseite`}>
            <Logo />
          </Link>
          <nav aria-label="Hauptnavigation" className="hidden flex-1 items-center gap-1 lg:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-md px-3 py-2 text-sm text-muted hover:text-fg">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <Link href="/login" className="hidden rounded-md px-3 py-2 text-sm font-medium text-fg hover:bg-sunken sm:inline-flex">
              Login
            </Link>
            <Link href="/#kontakt" className={buttonClasses("primary", "md", "hidden sm:inline-flex")}>
              Demo anfragen
            </Link>
            <MarketingMenu items={NAV} />
          </div>
        </div>
      </header>
      <div id="inhalt" className="flex-1">
        {children}
      </div>
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1fr_auto]">
          <div>
            <Logo />
            <p className="mt-3 max-w-sm text-sm text-muted">{brand.tagline}.</p>
          </div>
          <nav aria-label="Rechtliches" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
            <Link href="/impressum" className="hover:text-fg">Impressum</Link>
            <Link href="/datenschutz" className="hover:text-fg">Datenschutz</Link>
            <Link href="/login" className="hover:text-fg">Login</Link>
            <Link href="/#kontakt" className="hover:text-fg">Kontakt</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
