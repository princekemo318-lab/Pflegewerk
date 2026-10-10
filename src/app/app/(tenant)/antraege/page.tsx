import type { Metadata } from "next";
import Link from "next/link";
import { CalendarPlus, Plane } from "lucide-react";
import { requireTenant } from "@/server/auth/current";
import { listMyRequests } from "@/server/services/leave";
import { ButtonLink, Card, EmptyState, LeaveStatusBadge, PageHeader, Table, Td, Th, TypeDot } from "@/components/ui/primitives";
import { BalanceSummary } from "@/components/leave/balance";
import { formatDays, formatRange, todayIso, yearOf } from "@/lib/dates";

export const metadata: Metadata = { title: "Meine Anträge" };

export default async function MyRequestsPage({ searchParams }: PageProps<"/app/antraege">) {
  const { ctx } = await requireTenant();
  const current = yearOf(todayIso());
  const raw = Number((await searchParams).jahr);
  const year = Number.isInteger(raw) && raw >= 2018 && raw <= current + 2 ? raw : current;
  const { requests, balance } = await listMyRequests(ctx, { year });

  return (
    <>
      <PageHeader
        title="Meine Anträge"
        description="Alle deine Urlaubsanträge und Abwesenheiten mit aktuellem Status."
        actions={
          <ButtonLink href="/app/antraege/neu">
            <CalendarPlus className="size-4" aria-hidden />
            Neuer Antrag
          </ButtonLink>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
            <h2 className="font-semibold">Jahr {year}</h2>
            <nav aria-label="Jahr wählen" className="flex gap-1 text-sm">
              {[current - 1, current, current + 1].map((y) => (
                <Link
                  key={y}
                  href={`/app/antraege?jahr=${y}`}
                  aria-current={y === year ? "page" : undefined}
                  className={y === year ? "rounded-md bg-primary-soft px-2.5 py-1 font-medium" : "rounded-md px-2.5 py-1 text-muted hover:bg-sunken"}
                >
                  {y}
                </Link>
              ))}
            </nav>
          </div>
          {requests.length === 0 ? (
            <EmptyState
              icon={<Plane className="size-5" />}
              title={`Keine Anträge für ${year}`}
              description="Sobald du einen Antrag stellst, siehst du hier den Status."
              action={<ButtonLink href="/app/antraege/neu">Urlaub beantragen</ButtonLink>}
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Zeitraum</Th>
                  <Th className="hidden sm:table-cell">Art</Th>
                  <Th className="text-right">Tage</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-2">
                    <Td>
                      <Link href={`/app/antraege/${r.id}`} className="font-medium hover:underline">
                        {formatRange(r.startDate, r.endDate)}
                      </Link>
                      <span className="mt-0.5 block text-xs text-muted sm:hidden">{r.typeName}</span>
                    </Td>
                    <Td className="hidden sm:table-cell">
                      <span className="inline-flex items-center gap-2">
                        <TypeDot color={r.typeColor} />
                        {r.typeName}
                      </span>
                    </Td>
                    <Td className="text-right tabular">{formatDays(r.workingDays)}</Td>
                    <Td>
                      <LeaveStatusBadge status={r.status} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card className="h-fit p-5">
          <h2 className="font-semibold">Urlaubskonto {year}</h2>
          <BalanceSummary balance={balance} className="mt-4" />
        </Card>
      </div>
    </>
  );
}
