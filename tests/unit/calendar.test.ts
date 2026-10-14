import { describe, expect, it } from "vitest";
import { expandBills, expandEvents, occurrenceInstants, sortItems, type EventRow } from "@/features/calendar/expand";

const TZ = "America/Port_of_Spain";

const base: EventRow = {
  id: "e1",
  title: "Event",
  description: null,
  location: null,
  category: "family",
  all_day: false,
  starts_at: "2026-10-14T22:00:00Z", // 18:00 local
  ends_at: "2026-10-14T23:30:00Z", // 19:30 local
  start_date: "2026-10-14",
  recurrence_frequency: null,
  recurrence_interval: 1,
  recurrence_until: null,
  reminder_minutes: [],
  is_completed: false,
  participants: [],
};

describe("calendar expansion", () => {
  it("places a timed event on its local date with local times", () => {
    const items = expandEvents([base], "2026-10-01", "2026-10-31", TZ);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ date: "2026-10-14", time: "18:00", endTime: "19:30" });
  });

  it("uses the local date for late-evening events that are the next day in UTC", () => {
    const late = { ...base, starts_at: "2026-10-15T01:30:00Z", ends_at: "2026-10-15T02:30:00Z", start_date: "2026-10-14" };
    expect(expandEvents([late], "2026-10-14", "2026-10-14", TZ)[0]).toMatchObject({ date: "2026-10-14", time: "21:30" });
  });

  it("repeats yearly birthdays and respects the window", () => {
    const bday = { ...base, id: "b", all_day: true, category: "birthday" as const, starts_at: "1990-03-12T04:00:00Z", ends_at: "1990-03-12T04:00:00Z", start_date: "1990-03-12", recurrence_frequency: "yearly" as const };
    const items = expandEvents([bday], "2026-01-01", "2027-12-31", TZ);
    expect(items.map((i) => i.date)).toEqual(["2026-03-12", "2027-03-12"]);
    expect(items[0].href).toBe("/calendar/events/b?date=2026-03-12");
  });

  it("spreads multi-day all-day events across each day, clipped to the window", () => {
    const trip = { ...base, all_day: true, starts_at: "2026-10-30T04:00:00Z", ends_at: "2026-11-02T04:00:00Z", start_date: "2026-10-30" };
    const items = expandEvents([trip], "2026-10-01", "2026-10-31", TZ);
    expect(items.map((i) => [i.date, i.span])).toEqual([
      ["2026-10-30", { day: 1, of: 4 }],
      ["2026-10-31", { day: 2, of: 4 }],
    ]);
    // A window that starts mid-trip still shows the remaining days.
    expect(expandEvents([trip], "2026-11-01", "2026-11-30", TZ).map((i) => i.date)).toEqual(["2026-11-01", "2026-11-02"]);
  });

  it("marks individual recurring occurrences complete", () => {
    const weekly = { ...base, recurrence_frequency: "weekly" as const };
    const items = expandEvents([weekly], "2026-10-14", "2026-10-28", TZ, new Set(["e1:2026-10-21"]));
    expect(items.map((i) => [i.date, i.completed])).toEqual([
      ["2026-10-14", false],
      ["2026-10-21", true],
      ["2026-10-28", false],
    ]);
  });

  it("stops recurring at the until date", () => {
    const weekly = { ...base, recurrence_frequency: "weekly" as const, recurrence_until: "2026-10-21" };
    expect(expandEvents([weekly], "2026-10-01", "2026-12-31", TZ)).toHaveLength(2);
  });

  it("computes the instants for a given occurrence at the same local time", () => {
    expect(occurrenceInstants(base, "2026-10-21", TZ)).toEqual({
      startDate: "2026-10-21",
      endDate: "2026-10-21",
      start: "2026-10-21T22:00:00.000Z",
      end: "2026-10-21T23:30:00.000Z",
    });
  });

  it("shows only outstanding and future bill due dates", () => {
    const bill = {
      id: "t",
      name: "T&TEC",
      direction: "bill" as const,
      anchor_date: "2026-01-31",
      next_due_date: "2026-10-31",
      end_date: null,
      frequency: "monthly" as const,
      interval_count: 1,
      is_active: true,
    };
    expect(expandBills([bill], "2026-09-01", "2026-12-31").map((i) => i.date)).toEqual(["2026-10-31", "2026-11-30", "2026-12-31"]);
    expect(expandBills([{ ...bill, is_active: false }], "2026-09-01", "2026-12-31")).toEqual([]);
  });

  it("sorts all-day items first, then by time", () => {
    const items = sortItems([
      { key: "a", kind: "event", sourceId: "a", date: "2026-10-14", time: "18:00", endTime: null, title: "Dinner", href: "" },
      { key: "b", kind: "bill", sourceId: "b", date: "2026-10-14", time: null, endTime: null, title: "WASA", href: "" },
      { key: "c", kind: "event", sourceId: "c", date: "2026-10-14", time: "08:00", endTime: null, title: "School run", href: "" },
    ]);
    expect(items.map((i) => i.key)).toEqual(["b", "c", "a"]);
  });
});
