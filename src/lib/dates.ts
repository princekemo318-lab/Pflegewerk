/**
 * Datums-Hilfsfunktionen für reine Kalendertage ("YYYY-MM-DD").
 * Alle Berechnungen laufen in UTC, damit Sommer-/Winterzeit keine Tage verschiebt.
 */
export type IsoDate = string;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string") return false;
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function toUtc(iso: IsoDate): Date {
  if (!isIsoDate(iso)) throw new Error(`Ungültiges Datum: ${iso}`);
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function fromUtc(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function makeDate(year: number, month: number, day: number): IsoDate {
  return fromUtc(new Date(Date.UTC(year, month - 1, day)));
}

export function addDays(iso: IsoDate, n: number): IsoDate {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtc(d);
}

/** Anzahl Kalendertage von a bis b (b - a). */
export function diffDays(a: IsoDate, b: IsoDate): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);
}

export function eachDay(start: IsoDate, end: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Wochentag mit Montag = 0 … Sonntag = 6. */
export function weekdayIndex(iso: IsoDate): number {
  return (toUtc(iso).getUTCDay() + 6) % 7;
}

export function yearOf(iso: IsoDate): number {
  return Number(iso.slice(0, 4));
}

export function startOfMonth(iso: IsoDate): IsoDate {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: IsoDate): IsoDate {
  const d = toUtc(startOfMonth(iso));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return fromUtc(d);
}

export function addMonths(iso: IsoDate, n: number): IsoDate {
  const d = toUtc(startOfMonth(iso));
  d.setUTCMonth(d.getUTCMonth() + n);
  return fromUtc(d);
}

export function startOfWeek(iso: IsoDate): IsoDate {
  return addDays(iso, -weekdayIndex(iso));
}

export function maxDate(a: IsoDate, b: IsoDate): IsoDate {
  return a > b ? a : b;
}

export function minDate(a: IsoDate, b: IsoDate): IsoDate {
  return a < b ? a : b;
}

/** Heutiges Datum in der Zeitzone der Anwendung (Europe/Berlin). */
export function todayIso(timeZone = "Europe/Berlin", now = new Date()): IsoDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts;
}

// ---------------------------------------------------------------------------
// Wochenarbeitstage als Bitmaske: Mo=1, Di=2, Mi=4, Do=8, Fr=16, Sa=32, So=64
// ---------------------------------------------------------------------------

export const WEEKDAY_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;
export const WEEKDAY_LONG = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
] as const;
export const MONTH_NAMES = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
] as const;

export const FIVE_DAY_WEEK = 0b0011111;

export function maskHasWeekday(mask: number, weekday: number): boolean {
  return ((mask >> weekday) & 1) === 1;
}

export function weekdaysToMask(weekdays: number[]): number {
  return weekdays.reduce((m, d) => m | (1 << d), 0);
}

export function maskToWeekdays(mask: number): number[] {
  return [0, 1, 2, 3, 4, 5, 6].filter((d) => maskHasWeekday(mask, d));
}

export function describeWorkWeek(mask: number): string {
  const days = maskToWeekdays(mask);
  if (mask === FIVE_DAY_WEEK) return "Mo–Fr";
  return days.map((d) => WEEKDAY_SHORT[d]).join(", ") || "Keine Arbeitstage";
}

// ---------------------------------------------------------------------------
// Formatierung (deutsch)
// ---------------------------------------------------------------------------

export function formatDate(iso: IsoDate): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export function formatDateLong(iso: IsoDate): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${WEEKDAY_SHORT[weekdayIndex(iso)]}, ${d}. ${MONTH_NAMES[m - 1]} ${y}`;
}

export function formatRange(start: IsoDate, end: IsoDate): string {
  if (start === end) return formatDate(start);
  return `${formatDate(start)} – ${formatDate(end)}`;
}

export function formatDays(n: number): string {
  const v = Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
  return `${v} ${n === 1 ? "Tag" : "Tage"}`;
}

export function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
}

const dateTimeFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateTime(value: Date | string): string {
  return dateTimeFormatter.format(typeof value === "string" ? new Date(value) : value);
}
