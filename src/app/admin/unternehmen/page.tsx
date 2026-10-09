import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/server/auth/current";
import { listCompanies } from "@/server/services/platform";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, Table, Td, Th, buttonClasses } from "@/components/ui/primitives";
import { AutoSubmitSelect } from "@/components/ui/auto-submit-select";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Unternehmen" };

export default async function CompaniesPage({ searchParams }: PageProps<"/admin/unternehmen">) {
  const { ctx } = await requirePlatformAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = sp.status === "active" || sp.status === "suspended" ? sp.status : undefined;
  const page = Math.max(1, Number(sp.seite) || 1);
  const list = await listCompanies(ctx, { q, status, page });
  const link = (p: number) => `/admin/unternehmen?${new URLSearchParams({ ...(q && { q }), ...(status && { status }), seite: String(p) })}`;

  return (
    <>
      <PageHeader title="Unternehmen" actions={<ButtonLink href="/admin/unternehmen/neu">Unternehmen anlegen</ButtonLink>} />
      <Card>
        <form action="/admin/unternehmen" className="flex flex-wrap gap-2 border-b border-line p-3">
          <input
            name="q"
            defaultValue={q}
            placeholder="Name oder Kurzbezeichnung"
            aria-label="Suchen"
            className="h-8 min-w-48 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-sm placeholder:text-subtle"
          />
          <AutoSubmitSelect name="status" defaultValue={status ?? ""} aria-label="Status">
            <option value="">Alle Status</option>
            <option value="active">Aktiv</option>
            <option value="suspended">Gesperrt</option>
          </AutoSubmitSelect>
          <button className={buttonClasses("secondary", "sm")}>Suchen</button>
        </form>
        {list.rows.length === 0 ? (
          <EmptyState title="Keine Unternehmen gefunden" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th className="hidden sm:table-cell">Kurzbezeichnung</Th>
                <Th className="text-right">Aktive Zugänge</Th>
                <Th className="hidden md:table-cell">Angelegt</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((c) => (
                <tr key={c.id} className="hover:bg-surface-2">
                  <Td>
                    <Link href={`/admin/unternehmen/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                  </Td>
                  <Td className="hidden font-mono text-xs text-muted sm:table-cell">{c.slug}</Td>
                  <Td className="text-right tabular">{c.members}</Td>
                  <Td className="hidden text-muted md:table-cell">{formatDateTime(c.createdAt)}</Td>
                  <Td>{c.status === "active" ? <Badge tone="success">Aktiv</Badge> : <Badge tone="danger">Gesperrt</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {(page > 1 || list.hasMore) && (
          <div className="flex justify-between border-t border-line px-5 py-3 text-sm">
            {page > 1 ? <Link href={link(page - 1)}>← Zurück</Link> : <span />}
            {list.hasMore ? <Link href={link(page + 1)}>Weiter →</Link> : <span />}
          </div>
        )}
      </Card>
    </>
  );
}
