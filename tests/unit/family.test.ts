import { describe, expect, it } from "vitest";
import { ageOn, daysUntilBirthday } from "@/features/family/queries";

describe("family dates", () => {
  it("describes ages in months for under-twos and years after", () => {
    expect(ageOn("2026-01-15", "2026-10-14")).toBe("8 months");
    expect(ageOn("2025-10-14", "2026-10-14")).toBe("12 months");
    expect(ageOn("2022-10-18", "2026-10-14")).toBe("3 years");
    expect(ageOn("2022-10-14", "2026-10-14")).toBe("4 years");
    expect(ageOn("2027-01-01", "2026-10-14")).toBe("Not born yet");
  });

  it("counts days to the next birthday, including leap-day birthdays", () => {
    expect(daysUntilBirthday("2022-10-18", "2026-10-14")).toBe(4);
    expect(daysUntilBirthday("2022-10-14", "2026-10-14")).toBe(0);
    expect(daysUntilBirthday("2022-10-13", "2026-10-14")).toBe(364);
    expect(daysUntilBirthday("2024-02-29", "2027-02-20")).toBe(8); // 28 Feb in non-leap years
  });
});
