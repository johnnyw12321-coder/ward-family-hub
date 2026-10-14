import { z } from "zod";
import { isCalendarDate } from "@/lib/dates";

const date = z.string().refine(isCalendarDate, "Enter a valid date");
const time = z.union([z.string().regex(/^\d{2}:\d{2}$/, "Enter a valid time"), z.literal("")]).optional();

export const EVENT_CATEGORIES = [
  "family", "work", "medical", "financial", "school", "birthday", "anniversary", "home_maintenance", "personal", "other",
] as const;
export const REMINDER_OPTIONS = [
  { value: 0, label: "At the time" },
  { value: 15, label: "15 min before" },
  { value: 60, label: "1 hour before" },
  { value: 1440, label: "1 day before" },
  { value: 10080, label: "1 week before" },
] as const;

export const eventSchema = z
  .object({
    id: z.union([z.uuid(), z.literal("")]).optional(),
    title: z.string().trim().min(1, "Give the event a name").max(160),
    category: z.enum(EVENT_CATEGORIES),
    allDay: z.boolean(),
    startDate: date,
    startTime: time,
    endDate: date,
    endTime: time,
    location: z.string().trim().max(200).optional(),
    description: z.string().trim().max(4000).optional(),
    participants: z.array(z.uuid()).max(20),
    schedule: z.union([z.literal(""), z.string().regex(/^(weekly|monthly|yearly)-\d{1,2}$/)]),
    until: z.union([date, z.literal("")]).optional(),
    reminders: z.array(z.number().int().refine((n) => REMINDER_OPTIONS.some((r) => r.value === n))).max(5),
  })
  .superRefine((v, ctx) => {
    if (!v.allDay) {
      if (!v.startTime) ctx.addIssue({ code: "custom", path: ["startTime"], message: "Add a start time" });
      if (!v.endTime) ctx.addIssue({ code: "custom", path: ["endTime"], message: "Add an end time" });
    }
    const start = `${v.startDate}T${v.allDay ? "00:00" : (v.startTime ?? "")}`;
    const end = `${v.endDate}T${v.allDay ? "00:00" : (v.endTime ?? "")}`;
    if (end < start) ctx.addIssue({ code: "custom", path: ["endDate"], message: "The end must be after the start" });
    if (v.until && v.until < v.startDate) ctx.addIssue({ code: "custom", path: ["until"], message: "Must be after the first date" });
  });
export type EventInput = z.infer<typeof eventSchema>;
