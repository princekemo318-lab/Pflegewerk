import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { Bell } from "lucide-react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/server/auth/current";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "@/server/services/notifications";
import { Card, EmptyState, PageHeader, buttonClasses } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Benachrichtigungen" };

async function markAll() {
  "use server";
  const { ctx } = await requireTenant();
  await markAllNotificationsRead(ctx);
  revalidatePath("/app", "layout");
}

async function openNotification(form: FormData) {
  "use server";
  const { ctx } = await requireTenant();
  const id = String(form.get("id") ?? "");
  const link = String(form.get("link") ?? "");
  await markNotificationRead(ctx, id);
  // Nur interne App-Links öffnen
  redirect(link.startsWith("/app/") ? link : "/app/benachrichtigungen");
}

export default async function NotificationsPage() {
  const { ctx } = await requireTenant();
  const items = await listNotifications(ctx, { limit: 100 });
  const unread = items.some((i) => !i.readAt);

  return (
    <>
      <PageHeader
        title="Benachrichtigungen"
        actions={
          unread && (
            <form action={markAll}>
              <button className={buttonClasses("secondary", "sm")}>Alle als gelesen markieren</button>
            </form>
          )
        }
      />
      <Card>
        {items.length === 0 ? (
          <EmptyState icon={<Bell className="size-5" />} title="Keine Benachrichtigungen" description="Hier erscheinen Entscheidungen zu deinen Anträgen und neue Anträge, für die du zuständig bist." />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((n) => (
              <li key={n.id}>
                <form action={openNotification}>
                  <input type="hidden" name="id" value={n.id} />
                  <input type="hidden" name="link" value={n.link ?? ""} />
                  <button className={clsx("flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-surface-2", !n.readAt && "bg-accent-soft/40")}>
                    <span aria-hidden className={clsx("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-accent")} />
                    <span className="min-w-0 flex-1">
                      <span className={clsx("block text-sm", !n.readAt && "font-semibold")}>
                        {n.title}
                        {!n.readAt && <span className="sr-only"> (ungelesen)</span>}
                      </span>
                      {n.body && <span className="mt-0.5 block truncate text-sm text-muted">{n.body}</span>}
                      <span className="mt-0.5 block text-xs text-subtle">{formatDateTime(n.createdAt)}</span>
                    </span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="mt-4 text-xs text-muted">
        Wichtige Ereignisse werden zusätzlich per E-Mail versendet, sofern der E-Mail-Versand eingerichtet ist.{" "}
        <Link href="/app/profil" className="underline">
          Profil
        </Link>
      </p>
    </>
  );
}
