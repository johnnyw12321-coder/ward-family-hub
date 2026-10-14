import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCENT_BOOT_SCRIPT, MEMBER_COLOR_LABELS, MEMBER_COLORS, isMemberColor } from "@/components/shared/member-color";

function runBootScript(stored: string | null) {
  const dataset: Record<string, string> = {};
  const localStorage = { getItem: () => stored };
  new Function("localStorage", "document", ACCENT_BOOT_SCRIPT)(localStorage, { documentElement: { dataset } });
  return dataset.accent;
}

describe("member colours as themes", () => {
  it("defines a theme tone and a label for every colour", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    for (const color of MEMBER_COLORS) {
      expect(css).toContain(`[data-accent="${color}"]`);
      expect(MEMBER_COLOR_LABELS[color]).toBeTruthy();
    }
  });

  it("restores the last theme before paint, ignoring unknown values", () => {
    expect(runBootScript("pink")).toBe("pink");
    expect(runBootScript("hotpink")).toBeUndefined();
    expect(runBootScript(null)).toBeUndefined();
  });

  it("recognises only known colours", () => {
    expect(isMemberColor("pink")).toBe(true);
    expect(isMemberColor("red")).toBe(false);
    expect(isMemberColor(undefined)).toBe(false);
  });
});
