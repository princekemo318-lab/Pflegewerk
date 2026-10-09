import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/server/auth/current";
import { AUDIT_ACTION_LABELS, listPlatformAuditLogs } from "@/server/services/audit";
import { Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Plattform-Protokoll" };

export default async function PlatformAuditPage({ searchParams }: PageProps<"/admin/protokoll">) {
  const { ctx } = await requirePlatformAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.seite) || 1);
  const platformOnly = sp.alle !== "1";
  const logs = await listPlatformAuditLogs(ctx, { page, platformOnly });
  return (
    <>
      <PageHeader
        title="Protokoll"
        description="Plattformweite Aktionen wie Freischaltungen, Sperren und Anfragebearbeitung."
        actions={
          <Link href={platformOnly ? "/admin/protokoll?alle=1" : "/admin/protokoll"} className="text-sm underline">
            {platformOnly ? "Auch Unternehmensereignisse zeigen" : "Nur Plattformereignisse"}
          </Link>
        }
      />
      <Card>
        {logs.rows.length === 0 ? (
          <EmptyState title="Keine Einträge" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Zeitpunkt</Th>
                <Th>Aktion</Th>
                <Th className="hidden sm:table-cell">Unternehmen</Th>
                <Th className="hidden md:table-cell">Durch</Th>
              </tr>
            </thead>
            <tbody>
              {logs.rows.map((l) => (
                <tr key={l.id}>
                  <Td className="text-muted tabular whitespace-nowrap">{formatDateTime(l.createdAt)}</Td>
                  <Td className="font-medium">{AUDIT_ACTION_LABELS[l.action] ?? l.action}</Td>
                  <Td className="hidden text-muted sm:table-cell">{l.companyName ?? "Plattform"}</Td>
                  <Td className="hidden text-muted md:table-cell">{l.actorName ?? "System"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {(page > 1 || logs.hasMore) && (
          <div className="flex justify-between border-t border-line px-5 py-3 text-sm">
            {page > 1 ? <Link href={`/admin/protokoll?${platformOnly ? "" : "alle=1&"}seite=${page - 1}`}>← Neuere</Link> : <span />}
            {logs.hasMore ? <Link href={`/admin/protokoll?${platformOnly ? "" : "alle=1&"}seite=${page + 1}`}>Ältere →</Link> : <span />}
          </div>
        )}
      </Card>
    </>
  );
}
