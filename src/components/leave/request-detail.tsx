import Link from "next/link";
import clsx from "clsx";
import { Card, CardHeader, LeaveStatusBadge, TypeDot } from "@/components/ui/primitives";
import { BalanceSummary } from "./balance";
import { formatDateTime, formatDays, formatRange } from "@/lib/dates";
import type { getLeaveRequest } from "@/server/services/leave";

type Detail = Awaited<ReturnType<typeof getLeaveRequest>>;

const EVENT_LABEL: Record<string, string> = {
  submitted: "Eingereicht",
  recorded: "Von der Verwaltung eingetragen",
  approved: "Genehmigt",
  rejected: "Abgelehnt",
  withdrawn: "Zurückgezogen",
  cancelled: "Storniert",
};

export function RequestDetail({ detail, actions, showEmployee }: { detail: Detail; actions?: React.ReactNode; showEmployee?: boolean }) {
  const { request, events, balances, overlappingTeam } = detail;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-6">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
            <div>
              {showEmployee && (
                <p className="mb-1 text-sm text-muted">
                  {request.firstName} {request.lastName}
                </p>
              )}
              <h2 className="font-display text-2xl font-semibold tabular">{formatRange(request.startDate, request.endDate)}</h2>
              <p className="mt-1.5 flex items-center gap-2 text-sm text-muted">
                <TypeDot color={request.typeColor} />
                {request.typeName} · {formatDays(request.workingDays)}
              </p>
            </div>
            <LeaveStatusBadge status={request.status} />
          </div>
          {(request.employeeNote || request.decisionNote) && (
            <dl className="grid gap-4 border-t border-line p-5 text-sm sm:grid-cols-2 sm:p-6">
              {request.employeeNote && (
                <div>
                  <dt className="text-xs font-medium tracking-wide text-subtle uppercase">Nachricht</dt>
                  <dd className="mt-1 whitespace-pre-line">{request.employeeNote}</dd>
                </div>
              )}
              {request.decisionNote && (
                <div>
                  <dt className="text-xs font-medium tracking-wide text-subtle uppercase">Begründung</dt>
                  <dd className="mt-1 whitespace-pre-line">{request.decisionNote}</dd>
                </div>
              )}
            </dl>
          )}
          {actions && <div className="flex flex-wrap gap-2 border-t border-line p-5 sm:p-6">{actions}</div>}
        </Card>

        <Card>
          <CardHeader title="Verlauf" />
          <ol className="relative space-y-5 p-5 sm:p-6">
            {events.map((e, i) => (
              <li key={e.id} className="relative flex gap-3">
                <span
                  aria-hidden
                  className={clsx(
                    "mt-1.5 size-2.5 shrink-0 rounded-full",
                    e.type === "approved" || e.type === "recorded" ? "bg-accent" : e.type === "rejected" ? "bg-danger" : "bg-line-strong",
                  )}
                />
                {i < events.length - 1 && <span aria-hidden className="absolute top-5 left-[4.5px] h-[calc(100%+0.5rem)] w-px bg-line" />}
                <div className="min-w-0 text-sm">
                  <p>
                    <span className="font-medium">{EVENT_LABEL[e.type] ?? e.type}</span>
                    {e.actorName && <span className="text-muted"> von {e.actorName}</span>}
                  </p>
                  <p className="text-xs text-subtle tabular">{formatDateTime(e.createdAt)}</p>
                  {e.note && e.type !== "submitted" && <p className="mt-1 whitespace-pre-line text-muted">„{e.note}“</p>}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <div className="space-y-6">
        {request.deductsLeave &&
          balances.map((b) => (
            <Card key={b.year} className="p-5">
              <h2 className="font-semibold">Urlaubskonto {b.year}</h2>
              <BalanceSummary balance={b} className="mt-4" />
            </Card>
          ))}
        {showEmployee && (
          <Card>
            <CardHeader title="Im selben Zeitraum im Team" />
            {overlappingTeam.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">Niemand sonst aus dem Team ist in diesem Zeitraum abwesend.</p>
            ) : (
              <ul className="divide-y divide-line">
                {overlappingTeam.map((o) => (
                  <li key={o.requestId} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
                    <span className="min-w-0 truncate">
                      {o.firstName} {o.lastName}
                      <span className="block text-xs text-muted tabular">{formatRange(o.startDate, o.endDate)}</span>
                    </span>
                    <LeaveStatusBadge status={o.status} />
                  </li>
                ))}
              </ul>
            )}
            <p className="border-t border-line px-5 py-3 text-xs text-muted">
              <Link href={`/app/kalender?datum=${request.startDate}`} className="hover:underline">
                Im Kalender ansehen
              </Link>
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
