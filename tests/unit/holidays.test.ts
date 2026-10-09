import { describe, expect, it } from "vitest";
import {
  easterSunday,
  getHolidays,
  holidayMapForRange,
  HolidayRangeError,
  repentanceDay,
  STATES,
  type StateCode,
} from "@/lib/holidays";

describe("easterSunday", () => {
  it.each([
    [2018, "2018-04-01"],
    [2019, "2019-04-21"],
    [2024, "2024-03-31"],
    [2025, "2025-04-20"],
    [2026, "2026-04-05"],
    [2027, "2027-03-28"],
    [2038, "2038-04-25"],
  ])("%i → %s", (year, expected) => {
    expect(easterSunday(year)).toBe(expected);
  });
});

describe("repentanceDay (Buß- und Bettag)", () => {
  it.each([
    [2024, "2024-11-20"],
    [2025, "2025-11-19"],
    [2026, "2026-11-18"],
    [2028, "2028-11-22"],
    [2029, "2029-11-21"],
  ])("%i → %s", (year, expected) => {
    expect(repentanceDay(year)).toBe(expected);
  });
});

const names = (year: number, state: StateCode, optional: string[] = []) =>
  getHolidays(year, state, optional).map((h) => `${h.date} ${h.name}`);

describe("getHolidays", () => {
  it("liefert die bundesweiten Feiertage für jedes Land", () => {
    for (const state of Object.keys(STATES) as StateCode[]) {
      const dates = getHolidays(2026, state).map((h) => h.date);
      for (const d of [
        "2026-01-01",
        "2026-04-03",
        "2026-04-06",
        "2026-05-01",
        "2026-05-14",
        "2026-05-25",
        "2026-10-03",
        "2026-12-25",
        "2026-12-26",
      ]) {
        expect(dates, `${state} ${d}`).toContain(d);
      }
    }
  });

  it("Nordrhein-Westfalen 2026", () => {
    expect(names(2026, "NW")).toEqual([
      "2026-01-01 Neujahr",
      "2026-04-03 Karfreitag",
      "2026-04-06 Ostermontag",
      "2026-05-01 Tag der Arbeit",
      "2026-05-14 Christi Himmelfahrt",
      "2026-05-25 Pfingstmontag",
      "2026-06-04 Fronleichnam",
      "2026-10-03 Tag der Deutschen Einheit",
      "2026-11-01 Allerheiligen",
      "2026-12-25 1. Weihnachtstag",
      "2026-12-26 2. Weihnachtstag",
    ]);
  });

  it("Sachsen hat Reformationstag und Buß- und Bettag, aber kein Fronleichnam", () => {
    const list = names(2026, "SN");
    expect(list).toContain("2026-10-31 Reformationstag");
    expect(list).toContain("2026-11-18 Buß- und Bettag");
    expect(list.some((n) => n.includes("Fronleichnam"))).toBe(false);
  });

  it("aktiviert optionale regionale Feiertage nur für das passende Land", () => {
    expect(names(2026, "SN", ["SN_CORPUS_CHRISTI"])).toContain("2026-06-04 Fronleichnam");
    // Bayerische Option wirkt in Sachsen nicht
    expect(names(2026, "SN", ["BY_ASSUMPTION"]).some((n) => n.includes("Mariä"))).toBe(false);
    expect(names(2026, "BY")).not.toContain("2026-08-15 Mariä Himmelfahrt");
    expect(names(2026, "BY", ["BY_ASSUMPTION"])).toContain("2026-08-15 Mariä Himmelfahrt");
    expect(names(2026, "BY", ["BY_AUGSBURG_PEACE"])).toContain(
      "2026-08-08 Augsburger Hohes Friedensfest",
    );
  });

  it("berücksichtigt Einführungsjahre", () => {
    expect(names(2018, "BE").some((n) => n.includes("Frauentag"))).toBe(false);
    expect(names(2019, "BE")).toContain("2019-03-08 Internationaler Frauentag");
    expect(names(2022, "MV").some((n) => n.includes("Frauentag"))).toBe(false);
    expect(names(2023, "MV")).toContain("2023-03-08 Internationaler Frauentag");
    expect(names(2018, "TH").some((n) => n.includes("Weltkindertag"))).toBe(false);
    expect(names(2019, "TH")).toContain("2019-09-20 Weltkindertag");
    expect(names(2018, "HH")).toContain("2018-10-31 Reformationstag");
  });

  it("enthält einmalige Feiertage in Berlin", () => {
    expect(names(2025, "BE")).toContain("2025-05-08 Tag der Befreiung");
    expect(names(2026, "BE").some((n) => n.includes("Befreiung"))).toBe(false);
  });

  it("Saarland: Mariä Himmelfahrt landesweit", () => {
    expect(names(2026, "SL")).toContain("2026-08-15 Mariä Himmelfahrt");
  });

  it("Brandenburg und Hessen: Oster- und Pfingstsonntag", () => {
    for (const state of ["BB", "HE"] as const) {
      expect(names(2026, state)).toContain("2026-04-05 Ostersonntag");
      expect(names(2026, state)).toContain("2026-05-24 Pfingstsonntag");
    }
    expect(names(2026, "NW")).not.toContain("2026-04-05 Ostersonntag");
  });

  it("lehnt nicht unterstützte Jahre ab statt still falsch zu rechnen", () => {
    expect(() => getHolidays(2017, "NW")).toThrow(HolidayRangeError);
    expect(() => getHolidays(2101, "NW")).toThrow(HolidayRangeError);
  });
});

describe("holidayMapForRange", () => {
  it("verbindet gesetzliche und eigene Feiertage über Jahresgrenzen", () => {
    const map = holidayMapForRange("2026-12-20", "2027-01-10", "BW", [], [
      { date: "2026-12-24", name: "Heiligabend (betrieblich)" },
    ]);
    expect([...map.entries()]).toEqual([
      ["2026-12-25", "1. Weihnachtstag"],
      ["2026-12-26", "2. Weihnachtstag"],
      ["2027-01-01", "Neujahr"],
      ["2027-01-06", "Heilige Drei Könige"],
      ["2026-12-24", "Heiligabend (betrieblich)"],
    ]);
  });
});
