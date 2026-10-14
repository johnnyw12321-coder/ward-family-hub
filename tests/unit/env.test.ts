import { describe, expect, it } from "vitest";
import { normaliseSupabaseUrl } from "@/lib/env";

describe("Supabase URL", () => {
  it("keeps only the origin of whatever was pasted", () => {
    expect(normaliseSupabaseUrl("https://abc.supabase.co")).toBe("https://abc.supabase.co");
    expect(normaliseSupabaseUrl("https://abc.supabase.co/")).toBe("https://abc.supabase.co");
    expect(normaliseSupabaseUrl("https://abc.supabase.co/rest/v1/")).toBe("https://abc.supabase.co");
    expect(normaliseSupabaseUrl("  https://abc.supabase.co  ")).toBe("https://abc.supabase.co");
    expect(normaliseSupabaseUrl("not a url")).toBeUndefined();
    expect(normaliseSupabaseUrl(undefined)).toBeUndefined();
  });
});
