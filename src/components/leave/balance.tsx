import clsx from "clsx";
import type { LeaveBalance } from "@/lib/leave-calc";
import { formatNumber } from "@/lib/dates";

/** Urlaubssaldo als Balken: genehmigt | beantragt | verfügbar. */
export function BalanceSummary({ balance, className }: { balance: LeaveBalance | null; className?: string }) {
  if (!balance || !balance.configured) {
    return (
      <p className={clsx("text-sm text-muted", className)}>
        Für dieses Jahr ist noch kein Urlaubsanspruch hinterlegt. Deine Verwaltung kann ihn in deinem Profil eintragen.
      </p>
    );
  }
  const total = balance.entitlement + balance.carryover;
  const pct = (n: number) => (total > 0 ? Math.max(0, Math.min(100, (n / total) * 100)) : 0);
  return (
    <div className={className}>
      <p className="flex items-baseline gap-1.5">
        <span className="font-display text-4xl font-semibold tabular">{formatNumber(Math.max(0, balance.available))}</span>
        <span className="text-sm text-muted">von {formatNumber(total)} Tagen verfügbar</span>
      </p>
      <div
        className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-sunken"
        role="img"
        aria-label={`${formatNumber(balance.approved)} genehmigt, ${formatNumber(balance.pending)} beantragt, ${formatNumber(Math.max(0, balance.available))} verfügbar`}
      >
        <span className="bg-primary" style={{ width: `${pct(balance.approved)}%` }} />
        <span className="abs-pending text-warn" style={{ width: `${pct(balance.pending)}%` }} />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="flex items-center gap-1.5 text-muted">
            <span className="size-2 rounded-full bg-primary" aria-hidden /> Genehmigt
          </dt>
          <dd className="mt-0.5 font-semibold tabular">{formatNumber(balance.approved)}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-muted">
            <span className="size-2 rounded-full bg-warn" aria-hidden /> Beantragt
          </dt>
          <dd className="mt-0.5 font-semibold tabular">{formatNumber(balance.pending)}</dd>
        </div>
        <div>
          <dt className="text-muted">Übertrag</dt>
          <dd className="mt-0.5 font-semibold tabular">{formatNumber(balance.carryover)}</dd>
        </div>
      </dl>
      {balance.available < 0 && (
        <p className="mt-3 text-xs font-medium text-danger">Der Saldo ist negativ. Bitte mit der Verwaltung klären.</p>
      )}
    </div>
  );
}
