/**
 * In-App-Benachrichtigungen mit optionaler E-Mail.
 *
 * Jede Benachrichtigung hat einen eindeutigen `dedupeKey`. Wiederholte Requests
 * (Doppelklick, Retry) erzeugen dadurch weder doppelte Einträge noch doppelte E-Mails:
 * E-Mails werden nur für tatsächlich neu eingefügte Zeilen und erst nach Commit versendet.
 */
import "server-only";
import { assertId } from "../errors";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { schema, type Tx } from "../db";
import { withTenant, type TxHooks } from "../db/tenant";
import type { TenantContext } from "../authz";
import { absoluteUrl, sendEmail, templates } from "../email";

export type NotificationInput = {
  companyId: string;
  userIds: string[];
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  /** Basis des Deduplizierungsschlüssels; die Empfänger-ID wird angehängt. */
  dedupeBase: string;
  email?: boolean;
};

export async function notify(tx: Tx, hooks: TxHooks, input: NotificationInput) {
  const userIds = [...new Set(input.userIds)].filter(Boolean);
  if (userIds.length === 0) return 0;

  const inserted = await tx
    .insert(schema.notifications)
    .values(
      userIds.map((userId) => ({
        companyId: input.companyId,
        userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
        dedupeKey: `${input.dedupeBase}:${userId}`,
      })),
    )
    .onConflictDoNothing({ target: schema.notifications.dedupeKey })
    .returning({ userId: schema.notifications.userId });

  if (input.email && inserted.length > 0) {
    const recipients = await tx
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(inArray(schema.users.id, inserted.map((r) => r.userId)));
    const message = templates.notification({
      title: input.title,
      body: input.body ?? null,
      url: input.link ? absoluteUrl(input.link) : null,
    });
    hooks.afterCommit(async () => {
      for (const r of recipients) {
        await sendEmail({ to: r.email, companyId: input.companyId, ...message });
      }
    });
  }
  return inserted.length;
}

export async function listNotifications(ctx: TenantContext, opts: { limit?: number } = {}) {
  return withTenant(ctx, (tx) =>
    tx
      .select()
      .from(schema.notifications)
      .where(
        and(eq(schema.notifications.companyId, ctx.companyId), eq(schema.notifications.userId, ctx.userId)),
      )
      .orderBy(desc(schema.notifications.createdAt))
      .limit(Math.min(opts.limit ?? 50, 200)),
  );
}

export async function countUnread(ctx: TenantContext) {
  const [row] = await withTenant(ctx, (tx) =>
    tx
      .select({ n: count() })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.companyId, ctx.companyId),
          eq(schema.notifications.userId, ctx.userId),
          isNull(schema.notifications.readAt),
        ),
      ),
  );
  return row?.n ?? 0;
}

export async function markNotificationRead(ctx: TenantContext, id: string) {
  assertId(id);
  await withTenant(ctx, (tx) =>
    tx
      .update(schema.notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(schema.notifications.id, id),
          eq(schema.notifications.companyId, ctx.companyId),
          eq(schema.notifications.userId, ctx.userId),
          isNull(schema.notifications.readAt),
        ),
      ),
  );
}

export async function markAllNotificationsRead(ctx: TenantContext) {
  await withTenant(ctx, (tx) =>
    tx
      .update(schema.notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(schema.notifications.companyId, ctx.companyId),
          eq(schema.notifications.userId, ctx.userId),
          isNull(schema.notifications.readAt),
        ),
      ),
  );
}
