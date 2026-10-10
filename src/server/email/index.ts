/**
 * E-Mail-Versand.
 *
 * Ist kein SMTP-Server konfiguriert, wird NICHTS versendet und der Versuch mit
 * Status "not_configured" protokolliert. Es wird keine erfolgreiche Zustellung
 * vorgetäuscht. In der lokalen Entwicklung wird der Inhalt zusätzlich in der
 * Server-Konsole ausgegeben, damit Abläufe testbar bleiben.
 */
import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { schema } from "../db";
import { withSystem } from "../db/tenant";
import { env } from "../env";
import { brand } from "@/config/brand";

export type EmailMessage = {
  to: string;
  template: string;
  subject: string;
  text: string;
  companyId?: string | null;
};

export type EmailResult = { status: "sent" | "failed" | "not_configured" };

let transporter: Transporter | null | undefined;

export function isEmailConfigured(): boolean {
  const e = env();
  return Boolean(e.SMTP_HOST && e.SMTP_FROM);
}

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;
  const e = env();
  if (!isEmailConfigured()) {
    transporter = null;
    return null;
  }
  transporter = nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT ?? 587,
    secure: e.SMTP_SECURE === "true",
    auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return transporter;
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const t = getTransporter();
  let status: EmailResult["status"];
  let error: string | null = null;

  if (!t) {
    status = "not_configured";
    if (env().NODE_ENV === "development") {
      console.info(
        `\n[E-Mail NICHT versendet – SMTP nicht konfiguriert]\nAn: ${message.to}\nBetreff: ${message.subject}\n\n${message.text}\n`,
      );
    }
  } else {
    try {
      await t.sendMail({
        from: env().SMTP_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
      status = "sent";
    } catch (e) {
      status = "failed";
      // Nur die Fehlermeldung des Transports speichern, keine Inhalte.
      error = (e as Error).message.slice(0, 300);
      console.error("[E-Mail] Versand fehlgeschlagen:", error);
    }
  }

  await withSystem((tx) =>
    tx.insert(schema.emailDeliveries).values({
      companyId: message.companyId ?? null,
      toEmail: message.to,
      template: message.template,
      subject: message.subject,
      status,
      error,
    }),
  );
  return { status };
}

// ---------------------------------------------------------------------------
// Vorlagen (Klartext)
// ---------------------------------------------------------------------------

const footer = `\n\n--\n${brand.name}\nDiese Nachricht wurde automatisch erzeugt.`;

export const templates = {
  invitation(p: { companyName: string; inviterName: string | null; url: string; expiresInDays: number }) {
    return {
      template: "invitation",
      subject: `Einladung zu ${p.companyName} auf ${brand.name}`,
      text:
        `Hallo,\n\n${p.inviterName ? `${p.inviterName} hat dich` : "Du wurdest"} eingeladen, ` +
        `${p.companyName} auf ${brand.name} beizutreten.\n\n` +
        `Über diesen Link richtest du dein Konto ein:\n${p.url}\n\n` +
        `Der Link ist ${p.expiresInDays} Tage gültig und kann nur einmal verwendet werden.` +
        footer,
    };
  },
  passwordReset(p: { url: string }) {
    return {
      template: "password_reset",
      subject: `Passwort zurücksetzen – ${brand.name}`,
      text:
        `Hallo,\n\nfür dein Konto wurde das Zurücksetzen des Passworts angefordert.\n\n` +
        `Neues Passwort festlegen:\n${p.url}\n\n` +
        `Der Link ist 60 Minuten gültig. Falls du das nicht angefordert hast, kannst du diese E-Mail ignorieren.` +
        footer,
    };
  },
  notification(p: { title: string; body: string | null; url: string | null }) {
    return {
      template: "notification",
      subject: `${p.title} – ${brand.name}`,
      text: `${p.title}\n\n${p.body ?? ""}${p.url ? `\n\nDirekt öffnen:\n${p.url}` : ""}${footer}`,
    };
  },
};

export function absoluteUrl(path: string): string {
  return new URL(path, env().APP_URL).toString();
}
