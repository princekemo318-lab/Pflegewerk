import type { Metadata } from "next";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { requireTenant } from "@/server/auth/current";
import { canAny } from "@/server/authz";
import { notFound } from "next/navigation";
import { listDecidedRequests, listPendingApprovals } from "@/server/services/leave";
import { Card, CardHeader, EmptyState, LeaveStatusBadge, PageHeader, Table, Td, Th, TypeDot } from "@/components/ui/primitives";
import { formatDateTime, formatDays, formatRange } from "@/lib/dates";

export const metadata: Metadata = { title: "Genehmigungen" };

export default async function ApprovalsPage() {
  const { ctx } = await requireTenant();
  if (!canAny(ctx, "leave.approve_team", "leave.approve_all", "leave.view_all")) notFound();
  const [pending, decided] = await Promise.all([listPendingApprovals(ctx), listDecidedRequests(ctx, { limit: 30 })]);

  return (
    <>
      <PageHeader title="Genehmigungen" description="Offene Anträge, für die du zuständig bist – die ältesten zuerst." />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Offen" description={pending.length ? `${pending.length} ${pending.length === 1 ? "Antrag wartet" : "Anträge warten"} auf eine Entscheidung` : undefined} />
          {pending.length === 0 ? (
            <EmptyState icon={<Inbox className="size-5" />} title="Keine offenen Anträge" description="Du wirst benachrichtigt, sobald ein neuer Antrag eingeht." />
          ) : (
            <ul className="divide-y divide-line">
              {pending.map((r) => (
                <li key={r.id}>
                  <Link href={`/app/genehmigungen/${r.id}`} className="flex flex-col gap-2 px-5 py-4 hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-6">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {r.firstName} {r.lastName}
                        {r.teamName && <span className="font-normal text-muted"> · {r.teamName}</span>}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted">
                        <TypeDot color={r.typeColor} />
                        <span>{r.typeName}</span>
                        <span aria-hidden>·</span>
                        <span className="tabular whitespace-nowrap">{formatRange(r.startDate, r.endDate)}</span>
                        <span aria-hidden>·</span>
                        <span className="whitespace-nowrap">{formatDays(r.workingDays)}</span>
                      </p>
                    </div>
                    <span className="text-xs text-subtle">eingereicht {formatDateTime(r.createdAt)}</span>
                    <span className="text-sm font-medium text-accent-text">Entscheiden →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Zuletzt entschieden" />
          {decided.length === 0 ? (
            <EmptyState title="Noch keine Entscheidungen" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Mitarbeiter</Th>
                  <Th>Zeitraum</Th>
                  <Th className="hidden md:table-cell">Art</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {decided.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-2">
                    <Td>
                      <Link href={`/app/genehmigungen/${r.id}`} className="font-medium hover:underline">
                        {r.firstName} {r.lastName}
                      </Link>
                    </Td>
                    <Td className="tabular">{formatRange(r.startDate, r.endDate)}</Td>
                    <Td className="hidden md:table-cell">{r.typeName}</Td>
                    <Td>
                      <LeaveStatusBadge status={r.status} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
