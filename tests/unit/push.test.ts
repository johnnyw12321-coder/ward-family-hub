import { describe, expect, it } from "vitest";
import { reminderPayload } from "@/lib/push";

describe("push reminders", () => {
  it("sends a single reminder as itself, opening its page", () => {
    expect(reminderPayload([{ title: "Car loan is due tomorrow", body: "TT$3,100", link_path: "/finances/bills/1" }])).toEqual({
      title: "Car loan is due tomorrow",
      body: "TT$3,100",
      url: "/finances/bills/1",
      tag: "ward-reminders",
    });
  });

  it("rolls several reminders into one notification", () => {
    const many = ["Car loan due", "WASA due", "Book dentist", "Groceries at 80%", "Mortgage due", "Daycare due"].map((title) => ({
      title,
      body: null,
      link_path: null,
    }));
    const p = reminderPayload(many);
    expect(p.title).toBe("6 reminders today");
    expect(p.body).toBe("• Car loan due\n• WASA due\n• Book dentist\n• Groceries at 80%\n+2 more");
    expect(p.url).toBe("/notifications");
  });
});
