/**
 * Berechnung der Urlaubstage eines Antrags.
 *
 * Gezählt wird jeder Kalendertag im Zeitraum, der
 *   1. nach dem am jeweiligen Tag gültigen Arbeitszeitmodell ein Arbeitstag ist und
 *   2. kein Feiertag am Standort des Mitarbeiters ist.
 * Jeder gezählte Tag zählt als 1,0 Tag. Halbe Tage, Stundenkonten und rollierende
 * Schichtpläne werden (noch) nicht unterstützt – siehe docs/URLAUBSBERECHNUNG.md.
 */
import { eachDay, isIsoDate, maskHasWeekday, weekdayIndex, yearOf, type IsoDate } from "./dates";

export const MAX_REQUEST_LENGTH_DAYS = 366;

export type ScheduleEntry = { validFrom: IsoDate; weekdays: number };

export type DayStatus = "counted" | "non_working" | "holiday";

export type DayBreakdown = {
  date: IsoDate;
  status: DayStatus;
  holidayName?: string;
  amount: number;
};

export type LeaveCalculation = {
  total: number;
  days: DayBreakdown[];
  countedDates: IsoDate[];
  byYear: Record<number, number>;
};

export class LeaveCalculationError extends Error {}

/** Liefert die Bitmaske des Arbeitszeitmodells, das an `date` gilt. */
export function weekdaysOn(
  date: IsoDate,
  schedules: readonly ScheduleEntry[],
  defaultWeekdays: number,
): number {
  let current: ScheduleEntry | undefined;
  for (const s of schedules) {
    if (s.validFrom <= date && (!current || s.validFrom > current.validFrom)) current = s;
  }
  return current ? current.weekdays : defaultWeekdays;
}

export function calculateLeave(input: {
  startDate: IsoDate;
  endDate: IsoDate;
  defaultWeekdays: number;
  schedules?: readonly ScheduleEntry[];
  holidays?: ReadonlyMap<IsoDate, string>;
}): LeaveCalculation {
  const { startDate, endDate, defaultWeekdays } = input;
  const schedules = input.schedules ?? [];
  const holidays = input.holidays ?? new Map<IsoDate, string>();

  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    throw new LeaveCalculationError("Bitte gültige Start- und Enddaten angeben.");
  }
  if (endDate < startDate) {
    throw new LeaveCalculationError("Das Enddatum darf nicht vor dem Startdatum liegen.");
  }
  const all = eachDay(startDate, endDate);
  if (all.length > MAX_REQUEST_LENGTH_DAYS) {
    throw new LeaveCalculationError(
      `Ein Antrag darf höchstens ${MAX_REQUEST_LENGTH_DAYS} Kalendertage umfassen.`,
    );
  }
  for (const mask of [defaultWeekdays, ...schedules.map((s) => s.weekdays)]) {
    if (!Number.isInteger(mask) || mask < 0 || mask > 127) {
      throw new LeaveCalculationError("Ungültiges Arbeitszeitmodell.");
    }
  }

  const days: DayBreakdown[] = all.map((date) => {
    const mask = weekdaysOn(date, schedules, defaultWeekdays);
    if (!maskHasWeekday(mask, weekdayIndex(date))) {
      return { date, status: "non_working", amount: 0 };
    }
    const holidayName = holidays.get(date);
    if (holidayName) return { date, status: "holiday", holidayName, amount: 0 };
    return { date, status: "counted", amount: 1 };
  });

  const counted = days.filter((d) => d.status === "counted");
  const byYear: Record<number, number> = {};
  for (const d of counted) byYear[yearOf(d.date)] = (byYear[yearOf(d.date)] ?? 0) + d.amount;

  return {
    total: counted.reduce((sum, d) => sum + d.amount, 0),
    days,
    countedDates: counted.map((d) => d.date),
    byYear,
  };
}

export type LeaveBalance = {
  year: number;
  configured: boolean;
  entitlement: number;
  carryover: number;
  approved: number;
  pending: number;
  /** Anspruch + Übertrag − genehmigt */
  remaining: number;
  /** Anspruch + Übertrag − genehmigt − beantragt */
  available: number;
};

export function computeBalance(input: {
  year: number;
  entitlement: { days: number; carryoverDays: number } | null;
  approved: number;
  pending: number;
}): LeaveBalance {
  const entitlement = input.entitlement?.days ?? 0;
  const carryover = input.entitlement?.carryoverDays ?? 0;
  const remaining = round1(entitlement + carryover - input.approved);
  return {
    year: input.year,
    configured: input.entitlement !== null,
    entitlement,
    carryover,
    approved: round1(input.approved),
    pending: round1(input.pending),
    remaining,
    available: round1(remaining - input.pending),
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
