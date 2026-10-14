import { describe, expect, it } from "vitest";
import {
  addMonths,
  formatDate,
  formatInstant,
  instantToCalendarDate,
  isCalendarDate,
  localToInstant,
  monthEnd,
  monthsBetween,
  relativeDay,
  weekStart,
} from "@/lib/dates";
import { describeRecurrence, nextOccurrenceAfter, occurrencesBetween } from "@/lib/recurrence";

describe("calendar dates", () => {
  it("formats as DD/MM/YYYY", () => {
    expect(formatDate("2026-10-14")).toBe("14/10/2026");
  });

  it("validates dates", () => {
    expect(isCalendarDate("2026-02-29")).toBe(false);
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(isCalendarDate("14/10/2026")).toBe(false);
  });

  it("adds months with end-of-month clamping", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(monthEnd("2026-02-10")).toBe("2026-02-28");
  });

  it("lists months inclusively", () => {
    expect(monthsBetween("2026-11-20", "2027-02-01")).toEqual(["2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01"]);
  });

  it("finds the Monday of the week", () => {
    expect(weekStart("2026-10-14")).toBe("2026-10-12"); // Wednesday -> Monday
    expect(weekStart("2026-10-18")).toBe("2026-10-12"); // Sunday -> previous Monday
  });

  it("describes relative days", () => {
    expect(relativeDay("2026-10-14", "2026-10-14")).toBe("Today");
    expect(relativeDay("2026-10-15", "2026-10-14")).toBe("Tomorrow");
    expect(relativeDay("2026-10-19", "2026-10-14")).toBe("in 5 days");
    expect(relativeDay("2026-10-11", "2026-10-14")).toBe("3 days ago");
  });
});

describe("household timezone (America/Port_of_Spain, UTC-4, no DST)", () => {
  it("converts local wall-clock time to UTC", () => {
    expect(localToInstant("2026-10-14", "20:30")).toBe("2026-10-15T00:30:00.000Z");
    expect(localToInstant("2026-07-01", "00:00")).toBe("2026-07-01T04:00:00.000Z");
  });

  it("derives the local calendar date for an instant", () => {
    expect(instantToCalendarDate("2026-10-15T02:00:00Z")).toBe("2026-10-14");
    expect(instantToCalendarDate("2026-10-15T04:00:00Z")).toBe("2026-10-15");
  });

  it("displays instants in local time", () => {
    expect(formatInstant("2026-10-15T00:30:00Z")).toBe("14/10/2026, 20:30");
  });
});

describe("recurrence (mirrors public.next_occurrence_after)", () => {
  // Same cases as tests/db/ledger.test.ts
  it.each([
    ["2026-01-31", "monthly", 1, "2026-01-31", "2026-02-28"],
    ["2026-01-31", "monthly", 1, "2026-02-28", "2026-03-31"],
    ["2026-01-15", "weekly", 2, "2026-01-15", "2026-01-29"],
    ["2024-02-29", "yearly", 1, "2024-02-29", "2025-02-28"],
    ["2026-03-01", "monthly", 3, "2026-01-01", "2026-03-01"],
  ] as const)("next after: anchor %s %s x%i after %s -> %s", (anchor, freq, interval, after, expected) => {
    expect(nextOccurrenceAfter(anchor, freq, interval, after)).toBe(expected);
  });

  it("does not drift for long sequences", () => {
    expect(nextOccurrenceAfter("2026-01-31", "monthly", 1, "2030-04-15")).toBe("2030-04-30");
    expect(nextOccurrenceAfter("2026-01-31", "monthly", 1, "2030-05-01")).toBe("2030-05-31");
  });

  it("lists occurrences in a window and stops at the end date", () => {
    expect(occurrencesBetween("2026-01-31", "monthly", 1, "2026-02-01", "2026-05-31")).toEqual([
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
    ]);
    expect(occurrencesBetween("2026-01-05", "weekly", 1, "2026-01-01", "2026-03-01", "2026-01-20")).toEqual([
      "2026-01-05",
      "2026-01-12",
      "2026-01-19",
    ]);
  });

  it("describes schedules", () => {
    expect(describeRecurrence("monthly", 1)).toBe("Monthly");
    expect(describeRecurrence("monthly", 3)).toBe("Quarterly");
    expect(describeRecurrence("weekly", 2)).toBe("Every 2 weeks");
  });
});
