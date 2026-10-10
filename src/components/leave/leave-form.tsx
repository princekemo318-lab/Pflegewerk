"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import clsx from "clsx";
import { AlertTriangle, Loader2 } from "lucide-react";
import { ActionForm, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { previewLeaveAction, type PreviewResult } from "@/app/app/(tenant)/antraege/actions";
import type { ActionState } from "@/server/actions";
import { formatDate, formatDays, formatNumber, WEEKDAY_SHORT, weekdayIndex } from "@/lib/dates";

type TypeOption = { id: string; name: string; deductsLeave: boolean; requiresApproval: boolean };

const noopSubscribe = () => () => {};

export function LeaveForm({
  action,
  types,
  employeeId,
  today,
  submitLabel = "Antrag einreichen",
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  types: TypeOption[];
  employeeId?: string;
  today: string;
  submitLabel?: string;
}) {
  // Eingaben erst nach dem Hydrieren zulassen – sonst würde React früh getippte Werte überschreiben.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [result, setResult] = useState<{ key: string; value: PreviewResult } | null>(null);
  const [loading, startTransition] = useTransition();
  const type = types.find((t) => t.id === typeId);
  // Die Vorschau gilt nur für genau die aktuelle Eingabe.
  const key = start && end && typeId && end >= start ? `${typeId}|${start}|${end}` : null;
  const preview = result && result.key === key ? result.value : null;

  useEffect(() => {
    if (!key) return;
    const [absenceTypeId, startDate, endDate] = key.split("|");
    const timer = setTimeout(() => {
      startTransition(async () => {
        const value = await previewLeaveAction({ startDate, endDate, absenceTypeId, employeeId });
        setResult({ key, value });
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [key, employeeId]);

  const p = preview?.ok ? preview.preview : null;
  const overBalance = p?.deductsLeave && p.balances.some((b) => b.configured && (p.byYear[b.year] ?? 0) > b.available);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]" data-ready={hydrated}>
      <ActionForm action={action} className="space-y-5">
        {employeeId && <input type="hidden" name="employeeId" value={employeeId} />}
        <Field label="Art der Abwesenheit" name="absenceTypeId">
          {(f) => (
            <Select {...f} value={typeId} onChange={(e) => setTypeId(e.target.value)} required>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Erster Tag" name="startDate">
            {(f) => (
              <Input
                {...f}
                type="date"
                disabled={!hydrated}
                required
                value={start}
                min={employeeId ? undefined : `${Number(today.slice(0, 4)) - 1}-01-01`}
                onChange={(e) => {
                  setStart(e.target.value);
                  if (!end || e.target.value > end) setEnd(e.target.value);
                }}
              />
            )}
          </Field>
          <Field label="Letzter Tag" name="endDate">
            {(f) => <Input {...f} type="date" disabled={!hydrated} required value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />}
          </Field>
        </div>
        <Field label="Nachricht" name="note" optional hint="Sichtbar für die Person, die über den Antrag entscheidet.">
          {(f) => <Textarea {...f} maxLength={1000} rows={3} placeholder="z. B. Vertretung ist mit dem Team abgesprochen." />}
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton pendingLabel="Wird gesendet …" disabled={!p || p.total === 0 || p.overlaps.length > 0}>
            {type && !type.requiresApproval ? "Abwesenheit eintragen" : submitLabel}
          </SubmitButton>
          {type && type.requiresApproval && !employeeId && (
            <p className="text-xs text-muted">Der Antrag wird zur Genehmigung weitergeleitet.</p>
          )}
        </div>
      </ActionForm>

      <aside aria-live="polite" className="rounded-2xl border border-line bg-surface-2 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          Berechnung
          {loading && <Loader2 className="size-3.5 animate-spin text-subtle" aria-label="Wird berechnet" />}
        </h2>
        {!preview && <p className="mt-2 text-sm text-muted">Wähle einen Zeitraum, um die Arbeitstage zu sehen.</p>}
        {preview && !preview.ok && <p className="mt-2 text-sm text-danger">{preview.message}</p>}
        {p && (
          <div className={clsx("mt-3", loading && "opacity-60")}>
            <p className="flex items-baseline gap-2">
              <span className="font-display text-4xl font-semibold tabular">{formatNumber(p.total)}</span>
              <span className="text-sm text-muted">{p.total === 1 ? "Arbeitstag" : "Arbeitstage"}</span>
            </p>
            {p.total === 0 && <p className="mt-2 text-sm text-warn">Im Zeitraum liegen keine Arbeitstage.</p>}
            {p.overlaps.length > 0 && (
              <p className="mt-2 flex gap-2 text-sm text-danger">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                Überschneidet sich mit einem bestehenden Antrag ({formatDate(p.overlaps[0].startDate)} – {formatDate(p.overlaps[0].endDate)}).
              </p>
            )}
            {p.deductsLeave &&
              p.balances.map((b) =>
                b.configured ? (
                  <p key={b.year} className={clsx("mt-2 text-sm", overBalance ? "text-danger" : "text-muted")}>
                    {b.year}: {formatDays(p.byYear[b.year] ?? 0)} von {formatDays(Math.max(0, b.available))} verfügbar
                  </p>
                ) : (
                  <p key={b.year} className="mt-2 text-sm text-warn">
                    Für {b.year} ist noch kein Urlaubsanspruch hinterlegt.
                  </p>
                ),
              )}
            <ul className="mt-4 max-h-64 space-y-1 overflow-y-auto pr-1 text-xs">
              {p.days.map((d) => (
                <li key={d.date} className="flex items-center justify-between gap-2">
                  <span className={clsx("tabular", d.status !== "counted" && "text-subtle")}>
                    {WEEKDAY_SHORT[weekdayIndex(d.date)]} {formatDate(d.date)}
                  </span>
                  <span className={clsx(d.status === "counted" ? "font-medium text-accent-text" : "text-subtle")}>
                    {d.status === "counted" ? "zählt" : d.status === "holiday" ? d.holidayName : "frei"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
