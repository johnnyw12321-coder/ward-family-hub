import { describe, expect, it } from "vitest";
import { resolvePeriod } from "@/features/reports/period";

const today = "2026-10-14";

describe("report periods", () => {
  it("defaults to this month to date, compared with last month to the same day", () => {
    expect(resolvePeriod({}, today)).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-14",
      prevFrom: "2026-09-01",
      prevTo: "2026-09-14",
      trendFrom: "2026-05-01",
      trendTo: "2026-10-31",
    });
  });

  it("clamps the comparison at month end (31 March vs February)", () => {
    expect(resolvePeriod({}, "2026-03-31")).toMatchObject({ prevFrom: "2026-02-01", prevTo: "2026-02-28" });
  });

  it("compares last month with the month before", () => {
    expect(resolvePeriod({ preset: "last-month" }, today)).toMatchObject({
      from: "2026-09-01",
      to: "2026-09-30",
      prevFrom: "2026-08-01",
      prevTo: "2026-08-31",
    });
  });

  it("compares a year to date with the previous year to the same date", () => {
    expect(resolvePeriod({ preset: "this-year" }, today)).toMatchObject({
      from: "2026-01-01",
      to: "2026-10-14",
      prevFrom: "2025-01-01",
      prevTo: "2025-10-14",
      trendFrom: "2026-01-01",
    });
  });

  it("supports a specific year and rejects nonsense years", () => {
    expect(resolvePeriod({ preset: "year", year: "2024" }, today)).toMatchObject({ from: "2024-01-01", to: "2024-12-31", prevFrom: "2023-01-01" });
    expect(resolvePeriod({ preset: "year", year: "abc" }, today)).toMatchObject({ from: "2025-01-01", to: "2025-12-31" });
  });

  it("uses an equal-length window before a custom range, and swaps reversed dates", () => {
    expect(resolvePeriod({ preset: "custom", from: "2026-06-10", to: "2026-06-19" }, today)).toMatchObject({
      from: "2026-06-10",
      to: "2026-06-19",
      prevFrom: "2026-05-31",
      prevTo: "2026-06-09",
    });
    expect(resolvePeriod({ preset: "custom", from: "2026-06-19", to: "2026-06-10" }, today)).toMatchObject({ from: "2026-06-10", to: "2026-06-19" });
  });

  it("falls back safely on unknown presets", () => {
    expect(resolvePeriod({ preset: "drop table" }, today).preset).toBe("this-month");
  });
});
