/**
 * Gesetzliche Feiertage in Deutschland je Bundesland.
 *
 * Grundlage sind die Feiertagsgesetze der Länder (Stand der Regeln: ab 2018).
 * Feiertage, die nur in einzelnen Gemeinden gelten, sind als optionale regionale
 * Feiertage modelliert und müssen pro Standort aktiviert werden.
 *
 * WICHTIG: Unternehmen müssen die Feiertage für ihre Standorte fachlich prüfen.
 * Gesetzesänderungen nach Veröffentlichung dieser Version sind nicht enthalten.
 */
import { addDays, makeDate, weekdayIndex, type IsoDate } from "./dates";

export const MIN_HOLIDAY_YEAR = 2018;
export const MAX_HOLIDAY_YEAR = 2100;

export const STATES = {
  BW: "Baden-Württemberg",
  BY: "Bayern",
  BE: "Berlin",
  BB: "Brandenburg",
  HB: "Bremen",
  HH: "Hamburg",
  HE: "Hessen",
  MV: "Mecklenburg-Vorpommern",
  NI: "Niedersachsen",
  NW: "Nordrhein-Westfalen",
  RP: "Rheinland-Pfalz",
  SL: "Saarland",
  SN: "Sachsen",
  ST: "Sachsen-Anhalt",
  SH: "Schleswig-Holstein",
  TH: "Thüringen",
} as const;

export type StateCode = keyof typeof STATES;

export function isStateCode(value: unknown): value is StateCode {
  return typeof value === "string" && value in STATES;
}

/** Feiertage, die nur in Teilen eines Bundeslandes gelten. */
export const OPTIONAL_HOLIDAYS = {
  BY_ASSUMPTION: {
    state: "BY",
    name: "Mariä Himmelfahrt",
    hint: "Nur in Gemeinden mit überwiegend katholischer Bevölkerung",
  },
  BY_AUGSBURG_PEACE: {
    state: "BY",
    name: "Augsburger Hohes Friedensfest",
    hint: "Nur im Stadtgebiet Augsburg",
  },
  SN_CORPUS_CHRISTI: {
    state: "SN",
    name: "Fronleichnam",
    hint: "Nur in einzelnen Gemeinden (v. a. Landkreis Bautzen)",
  },
  TH_CORPUS_CHRISTI: {
    state: "TH",
    name: "Fronleichnam",
    hint: "Nur in einzelnen Gemeinden (v. a. Eichsfeld)",
  },
} as const satisfies Record<string, { state: StateCode; name: string; hint: string }>;

export type OptionalHolidayKey = keyof typeof OPTIONAL_HOLIDAYS;

export function isOptionalHolidayKey(value: unknown): value is OptionalHolidayKey {
  return typeof value === "string" && value in OPTIONAL_HOLIDAYS;
}

export function optionalHolidaysForState(state: StateCode): OptionalHolidayKey[] {
  return (Object.keys(OPTIONAL_HOLIDAYS) as OptionalHolidayKey[]).filter(
    (k) => OPTIONAL_HOLIDAYS[k].state === state,
  );
}

export type Holiday = { date: IsoDate; name: string };

/** Ostersonntag nach dem gregorianischen Kalender (Algorithmus nach Meeus/Jones/Butcher). */
export function easterSunday(year: number): IsoDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return makeDate(year, month, day);
}

/** Buß- und Bettag: Mittwoch vor dem 23. November. */
export function repentanceDay(year: number): IsoDate {
  const nov22 = makeDate(year, 11, 22);
  return addDays(nov22, -((weekdayIndex(nov22) - 2 + 7) % 7));
}

export class HolidayRangeError extends Error {}

export function getHolidays(
  year: number,
  state: StateCode,
  optional: readonly string[] = [],
): Holiday[] {
  if (!Number.isInteger(year) || year < MIN_HOLIDAY_YEAR || year > MAX_HOLIDAY_YEAR) {
    throw new HolidayRangeError(
      `Feiertage werden nur für die Jahre ${MIN_HOLIDAY_YEAR}–${MAX_HOLIDAY_YEAR} berechnet.`,
    );
  }
  const easter = easterSunday(year);
  const e = (offset: number) => addDays(easter, offset);
  const d = (month: number, day: number) => makeDate(year, month, day);
  const list: Holiday[] = [];
  const add = (date: IsoDate, name: string) => list.push({ date, name });
  const is = (...states: StateCode[]) => states.includes(state);

  // Bundesweit
  add(d(1, 1), "Neujahr");
  add(e(-2), "Karfreitag");
  add(e(1), "Ostermontag");
  add(d(5, 1), "Tag der Arbeit");
  add(e(39), "Christi Himmelfahrt");
  add(e(50), "Pfingstmontag");
  add(d(10, 3), "Tag der Deutschen Einheit");
  add(d(12, 25), "1. Weihnachtstag");
  add(d(12, 26), "2. Weihnachtstag");

  // Landesrecht
  if (is("BW", "BY", "ST")) add(d(1, 6), "Heilige Drei Könige");
  if (is("BE") && year >= 2019) add(d(3, 8), "Internationaler Frauentag");
  if (is("MV") && year >= 2023) add(d(3, 8), "Internationaler Frauentag");
  // Ostersonntag/Pfingstsonntag sind in BB und HE ausdrücklich gesetzliche Feiertage
  // (relevant für Mitarbeiter mit Sonntagsdienst).
  if (is("BB", "HE")) {
    add(easter, "Ostersonntag");
    add(e(49), "Pfingstsonntag");
  }
  if (is("BE") && (year === 2020 || year === 2025)) add(d(5, 8), "Tag der Befreiung");
  if (is("BW", "BY", "HE", "NW", "RP", "SL")) add(e(60), "Fronleichnam");
  if (is("SL")) add(d(8, 15), "Mariä Himmelfahrt");
  if (is("TH") && year >= 2019) add(d(9, 20), "Weltkindertag");
  if (is("BB", "HB", "HH", "MV", "NI", "SN", "ST", "SH", "TH")) {
    add(d(10, 31), "Reformationstag");
  }
  if (is("BW", "BY", "NW", "RP", "SL")) add(d(11, 1), "Allerheiligen");
  if (is("SN")) add(repentanceDay(year), "Buß- und Bettag");

  // Optionale regionale Feiertage (pro Standort aktivierbar)
  for (const key of optional) {
    if (!isOptionalHolidayKey(key) || OPTIONAL_HOLIDAYS[key].state !== state) continue;
    if (key === "BY_ASSUMPTION") add(d(8, 15), "Mariä Himmelfahrt");
    if (key === "BY_AUGSBURG_PEACE") add(d(8, 8), "Augsburger Hohes Friedensfest");
    if (key === "SN_CORPUS_CHRISTI" || key === "TH_CORPUS_CHRISTI") add(e(60), "Fronleichnam");
  }

  return list.sort((a, b) => a.date.localeCompare(b.date));
}

/** Feiertage für einen Datumsbereich als Map Datum → Name. */
export function holidayMapForRange(
  start: IsoDate,
  end: IsoDate,
  state: StateCode,
  optional: readonly string[] = [],
  custom: readonly Holiday[] = [],
): Map<IsoDate, string> {
  const map = new Map<IsoDate, string>();
  const startYear = Number(start.slice(0, 4));
  const endYear = Number(end.slice(0, 4));
  for (let y = startYear; y <= endYear; y++) {
    for (const h of getHolidays(y, state, optional)) {
      if (h.date >= start && h.date <= end && !map.has(h.date)) map.set(h.date, h.name);
    }
  }
  for (const h of custom) {
    if (h.date >= start && h.date <= end && !map.has(h.date)) map.set(h.date, h.name);
  }
  return map;
}
