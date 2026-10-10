/**
 * Zentrale, validierte Server-Konfiguration. Es werden keine Standardwerte für
 * Geheimnisse erfunden: Fehlende Pflichtwerte führen zu einem klaren Fehler.
 */
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL fehlt"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_SECRET: z.string().min(32, "APP_SECRET muss mindestens 32 Zeichen lang sein"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_SECURE: z.enum(["true", "false"]).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  AUDIT_RETENTION_DAYS: z.coerce.number().int().min(90).default(730),
  // Aufbewahrungsfristen in Tagen (Vorschläge – vom Verantwortlichen festzulegen)
  CONTACT_RETENTION_DAYS: z.coerce.number().int().min(30).default(365),
  EMAIL_LOG_RETENTION_DAYS: z.coerce.number().int().min(7).default(90),
  NOTIFICATION_RETENTION_DAYS: z.coerce.number().int().min(30).default(365),
  INVITATION_RETENTION_DAYS: z.coerce.number().int().min(7).default(30),
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(
    Object.fromEntries(
      Object.entries(process.env).map(([k, v]) => [k, v === "" ? undefined : v]),
    ),
  );
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Ungültige Server-Konfiguration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function isProduction() {
  return env().NODE_ENV === "production";
}
