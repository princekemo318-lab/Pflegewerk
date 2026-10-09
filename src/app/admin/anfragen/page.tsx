import type { Metadata } from "next";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { requirePlatformAdmin } from "@/server/auth/current";
import { CONTACT_STATUS_LABELS, listContactRequests, type ContactStatus } from "@/server/services/contact";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Anfragen" };

const STATUS_TONE: Record<ContactStatus, "warn" | "info" | "primary" | "success" | "neutral"> = {
  new: "warn",
  in_progress: "info",
  contacted: "info",
  qualified: "primary",
  won: "success",
  rejected: "neutral",
};

export default async function ContactRequestsPage({ searchParams }: PageProps<"/admin/anfragen">) {
  const { ctx } = await requirePlatformAdmin();
  const sp = await searchParams;
  const status = sp.status === "open" ? "open" : typeof sp.status === "string" && sp.status in CONTACT_STATUS_LABELS ? (sp.status as ContactStatus) : undefined;
  const page = Math.max(1, Number(sp.seite) || 1);
  const list = await listContactRequests(ctx, { status, page });
  const filters: [string | undefined, string][] = [[undefined, "Alle"], ["open", "Offen"], ...Object.entries(CONTACT_STATUS_LABELS)];

  return (
    <>
      <PageHeader title="Anfragen" description="Demo-Anfragen von der Website. Kontaktdaten nur zur Bearbeitung der Anfrage verwenden." />
      <nav aria-label="Status" className="mb-4 flex flex-wrap gap-1.5">
        {filters.map(([k, label]) => (
          <Link
            key={label}
            href={k ? `/admin/anfragen?status=${k}` : "/admin/anfragen"}
            aria-current={k === status ? "page" : undefined}
            className={k === status ? "rounded-full bg-primary px-3 py-1 text-sm text-primary-fg" : "rounded-full border border-line bg-surface px-3 py-1 text-sm text-muted hover:text-fg"}
          >
            {label}
          </Link>
        ))}
      </nav>
      <Card>
        {list.rows.length === 0 ? (
          <EmptyState icon={<Inbox className="size-5" />} title="Keine Anfragen" description="Neue Anfragen über das Formular auf der Website erscheinen hier." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Unternehmen</Th>
                <Th className="hidden sm:table-cell">Kontakt</Th>
                <Th className="hidden md:table-cell">Größe</Th>
                <Th className="hidden lg:table-cell">Eingang</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2">
                  <Td>
                    <Link href={`/admin/anfragen/${r.id}`} className="font-medium hover:underline">
                      {r.companyName}
                    </Link>
                    {r.assignedName && <span className="block text-xs text-muted">zuständig: {r.assignedName}</span>}
                  </Td>
                  <Td className="hidden text-muted sm:table-cell">{r.name}</Td>
                  <Td className="hidden text-muted md:table-cell">{r.employeeRange ?? "–"}</Td>
                  <Td className="hidden text-muted lg:table-cell">{formatDateTime(r.createdAt)}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[r.status]}>{CONTACT_STATUS_LABELS[r.status]}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {(page > 1 || list.hasMore) && (
          <div className="flex justify-between border-t border-line px-5 py-3 text-sm">
            {page > 1 ? <Link href={`/admin/anfragen?${status ? `status=${status}&` : ""}seite=${page - 1}`}>← Zurück</Link> : <span />}
            {list.hasMore ? <Link href={`/admin/anfragen?${status ? `status=${status}&` : ""}seite=${page + 1}`}>Weiter →</Link> : <span />}
          </div>
        )}
      </Card>
    </>
  );
}
