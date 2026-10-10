import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/current";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Anmelden" };

function safeNext(next: unknown) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : undefined;
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = safeNext((await searchParams).next);
  if (await getSession()) redirect(next ?? "/app");
  return (
    <>
      <h1 className="text-title font-semibold">Anmelden</h1>
      <p className="mt-1.5 mb-8 text-sm text-muted">Melde dich mit deiner geschäftlichen E-Mail-Adresse an.</p>
      <LoginForm next={next} />
      <p className="mt-8 text-sm text-muted">
        Noch kein Zugang? Zugänge vergibt dein Unternehmen.{" "}
        <Link href="/#kontakt" className="font-medium text-fg underline underline-offset-4">
          Demo für dein Unternehmen anfragen
        </Link>
      </p>
    </>
  );
}
