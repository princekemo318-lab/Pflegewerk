import { describe, expect, it } from "vitest";
import { calculateLeave, computeBalance, LeaveCalculationError, weekdaysOn } from "@/lib/leave-calc";
import { FIVE_DAY_WEEK, weekdaysToMask } from "@/lib/dates";
import { holidayMapForRange } from "@/lib/holidays";

describe("calculateLeave", () => {
  it("zählt Mo–Fr in einer normalen Woche", () => {
    const r = calculateLeave({
      startDate: "2026-10-12",
      endDate: "2026-10-18",
      defaultWeekdays: FIVE_DAY_WEEK,
    });
    expect(r.total).toBe(5);
    expect(r.countedDates).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
    ]);
    expect(r.days.filter((d) => d.status === "non_working").map((d) => d.date)).toEqual([
      "2026-10-17",
      "2026-10-18",
    ]);
  });

  it("zählt einen einzelnen Tag", () => {
    expect(
      calculateLeave({ startDate: "2026-10-14", endDate: "2026-10-14", defaultWeekdays: FIVE_DAY_WEEK })
        .total,
    ).toBe(1);
  });

  it("zählt 0 Tage, wenn nur Wochenende beantragt wird", () => {
    expect(
      calculateLeave({ startDate: "2026-10-17", endDate: "2026-10-18", defaultWeekdays: FIVE_DAY_WEEK })
        .total,
    ).toBe(0);
  });

  it("zieht Feiertage am Standort ab", () => {
    const holidays = holidayMapForRange("2026-03-30", "2026-04-10", "NW");
    const r = calculateLeave({
      startDate: "2026-03-30",
      endDate: "2026-04-10",
      defaultWeekdays: FIVE_DAY_WEEK,
      holidays,
    });
    // 10 Werktage minus Karfreitag (03.04.) und Ostermontag (06.04.)
    expect(r.total).toBe(8);
    expect(r.days.find((d) => d.date === "2026-04-03")).toMatchObject({
      status: "holiday",
      holidayName: "Karfreitag",
      amount: 0,
    });
  });

  it("unterscheidet Bundesländer (Fronleichnam)", () => {
    const range = { startDate: "2026-06-01", endDate: "2026-06-05", defaultWeekdays: FIVE_DAY_WEEK };
    expect(calculateLeave({ ...range, holidays: holidayMapForRange("2026-06-01", "2026-06-05", "NW") }).total).toBe(4);
    expect(calculateLeave({ ...range, holidays: holidayMapForRange("2026-06-01", "2026-06-05", "HH") }).total).toBe(5);
  });

  it("zählt einen Feiertag auf einem arbeitsfreien Tag nicht doppelt ab", () => {
    // 01.11.2026 ist ein Sonntag
    const holidays = holidayMapForRange("2026-10-26", "2026-11-01", "NW");
    const r = calculateLeave({ startDate: "2026-10-26", endDate: "2026-11-01", defaultWeekdays: FIVE_DAY_WEEK, holidays });
    expect(r.total).toBe(5);
    expect(r.days.find((d) => d.date === "2026-11-01")?.status).toBe("non_working");
  });

  it("berücksichtigt Teilzeit (Mo, Di, Mi)", () => {
    const r = calculateLeave({
      startDate: "2026-10-12",
      endDate: "2026-10-25",
      defaultWeekdays: weekdaysToMask([0, 1, 2]),
    });
    expect(r.total).toBe(6);
  });

  it("berücksichtigt Wochenenddienst (Mi–So)", () => {
    const r = calculateLeave({
      startDate: "2026-10-12",
      endDate: "2026-10-18",
      defaultWeekdays: weekdaysToMask([2, 3, 4, 5, 6]),
    });
    expect(r.countedDates).toEqual(["2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
  });

  it("wechselt das Arbeitszeitmodell innerhalb des Zeitraums", () => {
    const r = calculateLeave({
      startDate: "2026-10-12",
      endDate: "2026-10-23",
      defaultWeekdays: FIVE_DAY_WEEK,
      schedules: [
        { validFrom: "2025-01-01", weekdays: FIVE_DAY_WEEK },
        // ab 19.10. nur noch Mo + Di
        { validFrom: "2026-10-19", weekdays: weekdaysToMask([0, 1]) },
      ],
    });
    expect(r.total).toBe(5 + 2);
  });

  it("teilt Tage über den Jahreswechsel korrekt auf", () => {
    const holidays = holidayMapForRange("2026-12-28", "2027-01-08", "NW");
    const r = calculateLeave({ startDate: "2026-12-28", endDate: "2027-01-08", defaultWeekdays: FIVE_DAY_WEEK, holidays });
    // 2026: 28.–31.12. = 4 Tage; 2027: 4.–8.1. = 5 Tage (01.01. Feiertag)
    expect(r.byYear).toEqual({ 2026: 4, 2027: 5 });
    expect(r.total).toBe(9);
  });

  it("behandelt Schaltjahre", () => {
    const r = calculateLeave({ startDate: "2028-02-28", endDate: "2028-03-01", defaultWeekdays: 127 });
    expect(r.days.map((d) => d.date)).toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]);
    expect(r.total).toBe(3);
  });

  it("ist unabhängig von der Sommerzeitumstellung", () => {
    const r = calculateLeave({ startDate: "2026-03-27", endDate: "2026-03-31", defaultWeekdays: 127 });
    expect(r.total).toBe(5);
  });

  it("lehnt ungültige Eingaben ab", () => {
    expect(() =>
      calculateLeave({ startDate: "2026-10-20", endDate: "2026-10-19", defaultWeekdays: FIVE_DAY_WEEK }),
    ).toThrow(LeaveCalculationError);
    expect(() =>
      calculateLeave({ startDate: "2026-02-30", endDate: "2026-03-02", defaultWeekdays: FIVE_DAY_WEEK }),
    ).toThrow(LeaveCalculationError);
    expect(() =>
      calculateLeave({ startDate: "2026-01-01", endDate: "2027-06-01", defaultWeekdays: FIVE_DAY_WEEK }),
    ).toThrow(/höchstens/);
    expect(() =>
      calculateLeave({ startDate: "2026-01-01", endDate: "2026-01-02", defaultWeekdays: 200 }),
    ).toThrow(/Arbeitszeitmodell/);
  });
});

describe("weekdaysOn", () => {
  it("nimmt das zuletzt gültige Modell und sonst den Standard", () => {
    const schedules = [
      { validFrom: "2026-06-01", weekdays: 3 },
      { validFrom: "2026-01-01", weekdays: 7 },
    ];
    expect(weekdaysOn("2025-12-31", schedules, 31)).toBe(31);
    expect(weekdaysOn("2026-01-01", schedules, 31)).toBe(7);
    expect(weekdaysOn("2026-06-15", schedules, 31)).toBe(3);
  });
});

describe("computeBalance", () => {
  it("berechnet Rest und verfügbare Tage", () => {
    expect(
      computeBalance({ year: 2026, entitlement: { days: 30, carryoverDays: 2.5 }, approved: 10, pending: 3 }),
    ).toEqual({
      year: 2026,
      configured: true,
      entitlement: 30,
      carryover: 2.5,
      approved: 10,
      pending: 3,
      remaining: 22.5,
      available: 19.5,
    });
  });

  it("kennzeichnet fehlenden Anspruch", () => {
    expect(computeBalance({ year: 2026, entitlement: null, approved: 0, pending: 0 }).configured).toBe(false);
  });
});
