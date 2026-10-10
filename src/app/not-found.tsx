import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { buttonClasses } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <Logo className="mb-8" />
      <p className="text-sm font-medium text-accent-text">404</p>
      <h1 className="mt-1 text-title font-semibold">Diese Seite gibt es nicht</h1>
      <p className="mt-2 text-sm text-muted">
        Der Link ist veraltet oder du hast keinen Zugriff auf diesen Inhalt.
      </p>
      <div className="mt-6 flex gap-2">
        <Link href="/app" className={buttonClasses("primary")}>
          Zur Übersicht
        </Link>
        <Link href="/" className={buttonClasses("secondary")}>
          Startseite
        </Link>
      </div>
    </main>
  );
}
