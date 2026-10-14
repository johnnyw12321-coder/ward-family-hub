import { describe, expect, it } from "vitest";
import {
  allocateEvenly,
  applyRate,
  currencySymbol,
  formatMoney,
  parseMoney,
  percentOf,
  sumMinor,
  toDecimalString,
} from "@/lib/money";

describe("parseMoney", () => {
  it.each([
    ["1234", 123_400],
    ["1,234.56", 123_456],
    ["1234.5", 123_450],
    ["TT$ 12.30", 1_230],
    ["$0.99", 99],
    [".5", 50],
    ["0", 0],
    ["-25.10", -2_510],
    ["(25.10)", -2_510],
    ["  42.00 ", 4_200],
    ["1,000,000", 100_000_000],
  ])("parses %s", (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it.each(["", "abc", "1.234", "12,34", "1,2345", "1..2", "1.2.3", "--1", "1e5", "Infinity", "NaN"])(
    "rejects %s",
    (input) => {
      expect(parseMoney(input)).toBeNull();
    },
  );

  it("does not lose cents the way floating point would", () => {
    // 0.1 + 0.2 style traps: 19.99 * 100 = 1998.9999999999998 in floats.
    expect(parseMoney("19.99")).toBe(1_999);
    expect(parseMoney("1.15")).toBe(115);
    expect(parseMoney("4.35")).toBe(435);
  });

  it("respects currencies without minor units", () => {
    expect(parseMoney("1500", "JPY")).toBe(1500);
    expect(parseMoney("15.5", "JPY")).toBeNull();
  });
});

describe("formatting", () => {
  it("formats TTD with the TT$ symbol", () => {
    expect(currencySymbol("TTD")).toBe("TT$");
    expect(formatMoney(123_456)).toBe("TT$1,234.56");
    expect(formatMoney(5)).toBe("TT$0.05");
    expect(formatMoney(-2_500)).toBe("-TT$25.00");
    expect(formatMoney(0)).toBe("TT$0.00");
  });

  it("supports sign display and trimming", () => {
    expect(formatMoney(2_500, { signDisplay: "always" })).toBe("+TT$25.00");
    expect(formatMoney(120_000, { trimZeroCents: true })).toBe("TT$1,200");
    expect(formatMoney(120_050, { trimZeroCents: true })).toBe("TT$1,200.50");
  });

  it("formats large values exactly", () => {
    expect(formatMoney(900_719_925_474_099)).toBe("TT$9,007,199,254,740.99");
    expect(toDecimalString(-7)).toBe("-0.07");
  });

  it("formats other currencies", () => {
    expect(formatMoney(1_000, { currency: "USD" })).toBe("US$10.00");
    expect(formatMoney(1_000, { currency: "JPY" })).toBe("¥1,000");
  });
});

describe("arithmetic", () => {
  it("sums integers and rejects non-integers", () => {
    expect(sumMinor([100, 250, null, undefined, -50])).toBe(300);
    expect(() => sumMinor([0.1 as number])).toThrow(RangeError);
  });

  it("applies percentage rates with half-up rounding", () => {
    expect(applyRate(1_000_000, "7.25")).toBe(72_500);
    expect(applyRate(333, "50")).toBe(167); // 166.5 -> 167
    expect(applyRate(12_345, "12.5")).toBe(1_543); // 1543.125 -> 1543
  });

  it("splits amounts without losing a cent", () => {
    expect(allocateEvenly(1_000, 3)).toEqual([334, 333, 333]);
    expect(allocateEvenly(-1_000, 3)).toEqual([-334, -333, -333]);
    expect(allocateEvenly(1_000, 3).reduce((a, b) => a + b, 0)).toBe(1_000);
  });

  it("computes display percentages", () => {
    expect(percentOf(50, 200)).toBe(25);
    expect(percentOf(1, 3)).toBe(33.3);
    expect(percentOf(0, 0)).toBe(0);
  });
});
