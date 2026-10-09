/**
 * Geplante Aufgaben. Muss extern regelmäßig (z. B. stündlich) aufgerufen werden:
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron
 *
 * - Erinnerungen an offene Anträge (höchstens eine pro Antrag und Tag)
 * - Abgelaufene Sitzungen, Reset-Tokens und Rate-Limit-Einträge entfernen
 * - Audit-Logs nach Ablauf der Aufbewahrungsfrist löschen
 */
import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { env } from "@/server/env";
import { safeEqual } from "@/server/auth/crypto";
import { withSystem } from "@/server/db/tenant";
import { sendPendingReminders } from "@/server/services/leave";
import { purgeExpiredSessions } from "@/server/auth/sessions";
import { purgeExpiredRateLimits } from "@/server/auth/rate-limit";
import { applyRetention } from "@/server/services/privacy";
import { todayIso } from "@/lib/dates";

export async function GET(request: Request) {
  await connection();
  const secret = env().CRON_SECRET;
  if (!secret || secret.length < 32) {
    return Response.json({ error: "CRON_SECRET ist nicht konfiguriert." }, { status: 503 });
  }
  const header = request.headers.get("authorization") ?? "";
  if (!safeEqual(header, `Bearer ${secret}`)) {
    return Response.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  const reminders = await withSystem((tx, hooks) => sendPendingReminders(tx, hooks, todayIso()));
  const retention = await applyRetention();
  await purgeExpiredSessions();
  await purgeExpiredRateLimits();
  const [purge] = await withSystem((tx) =>
    tx.execute<{ deleted: number }>(sql`select app.purge_audit_logs(${env().AUDIT_RETENTION_DAYS}) as deleted`),
  );

  return Response.json({ ok: true, reminders, retention, auditLogsDeleted: Number(purge?.deleted ?? 0) });
}
