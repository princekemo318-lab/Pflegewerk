import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth/current";
import { can } from "@/server/authz";
import { AUDIT_ACTION_LABELS, listCompanyAuditLogs } from "@/server/services/audit";
import { Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Protokoll" };

const FILTERS = [
  ["", "Alle"],
  ["leave.", "Anträge"],
  ["employee.", "Mitarbeiter"],
  ["membership.", "Zugänge & Rollen"],
  ["role.", "Rollendefinitionen"],
  ["invitation.", "Einladungen"],
  ["company.", "Unternehmen"],
] as const;

export default async function AuditPage({ searchParams }: PageProps<"/app/protokoll">) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "audit.view")) notFound();
  const sp = await searchParams;
  const action = FILTERS.find(([k]) => k === sp.bereich)?.[0] ?? "";
  const page = Math.max(1, Number(sp.seite) || 1);
  const logs = await listCompanyAuditLogs(ctx, { page, action: action || undefined });

  return (
    <>
      <PageHeader
        title="Protokoll"
        description="Sicherheitsrelevante und geschäftskritische Änderungen. Einträge können nicht verändert oder gelöscht werden."
      />
      <nav aria-label="Bereich" className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map(([k, label]) => (
          <Link
            key={k}
            href={k ? `/app/protokoll?bereich=${k}` : "/app/protokoll"}
            aria-current={k === action ? "page" : undefined}
            className={k === action ? "rounded-full bg-primary px-3 py-1 text-sm text-primary-fg" : "rounded-full border border-line bg-surface px-3 py-1 text-sm text-muted hover:text-fg"}
          >
            {label}
          </Link>
        ))}
      </nav>
      <Card>
        {logs.rows.length === 0 ? (
          <EmptyState title="Keine Einträge" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Zeitpunkt</Th>
                <Th>Aktion</Th>
                <Th className="hidden sm:table-cell">Durch</Th>
                <Th className="hidden md:table-cell">Details</Th>
              </tr>
            </thead>
            <tbody>
              {logs.rows.map((l) => (
                <tr key={l.id}>
                  <Td className="text-muted tabular whitespace-nowrap">{formatDateTime(l.createdAt)}</Td>
                  <Td className="font-medium">{AUDIT_ACTION_LABELS[l.action] ?? l.action}</Td>
                  <Td className="hidden text-muted sm:table-cell">{l.actorName ?? "System"}</Td>
                  <Td className="hidden max-w-xs truncate text-xs text-subtle md:table-cell">
                    <Details metadata={l.metadata} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {(page > 1 || logs.hasMore) && (
          <div className="flex justify-between border-t border-line px-5 py-3 text-sm">
            {page > 1 ? <Link href={`/app/protokoll?bereich=${action}&seite=${page - 1}`}>← Neuere</Link> : <span />}
            {logs.hasMore ? <Link href={`/app/protokoll?bereich=${action}&seite=${page + 1}`}>Ältere →</Link> : <span />}
          </div>
        )}
      </Card>
    </>
  );
}

function Details({ metadata }: { metadata: Record<string, unknown> | null }) {
  if (!metadata) return null;
  const parts: string[] = [];
  if (Array.isArray(metadata.fields)) parts.push(`Felder: ${(metadata.fields as string[]).join(", ")}`);
  if (typeof metadata.days === "number") parts.push(`${metadata.days} Tage`);
  if (typeof metadata.type === "string") parts.push(metadata.type);
  if (typeof metadata.name === "string") parts.push(metadata.name);
  if (typeof metadata.status === "string") parts.push(`Status: ${metadata.status}`);
  if (typeof metadata.year === "number") parts.push(`Jahr ${metadata.year}`);
  return <>{parts.join(" · ")}</>;
}
