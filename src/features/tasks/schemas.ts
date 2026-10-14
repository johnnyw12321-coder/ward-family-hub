import { z } from "zod";
import { isCalendarDate } from "@/lib/dates";

const optionalUuid = z.union([z.uuid(), z.literal("")]).optional();
const optionalDate = z.union([z.string().refine(isCalendarDate, "Enter a valid date"), z.literal("")]).optional();

export const TASK_AREAS = ["home", "finance", "family", "errands", "vehicle", "garden", "other"] as const;
export const TASK_AREA_LABELS: Record<(typeof TASK_AREAS)[number], string> = {
  home: "Home",
  finance: "Finances",
  family: "Family",
  errands: "Errands",
  vehicle: "Vehicle",
  garden: "Garden & yard",
  other: "Other",
};

export const taskSchema = z
  .object({
    id: optionalUuid,
    title: z.string().trim().min(1, "What needs doing?").max(200),
    description: z.string().trim().max(4000).optional(),
    area: z.enum(TASK_AREAS),
    assignedUserId: optionalUuid,
    dueDate: optionalDate,
    priority: z.enum(["low", "medium", "high"]),
    schedule: z.union([z.literal(""), z.string().regex(/^(weekly|monthly|yearly)-\d{1,2}$/)]),
  })
  .superRefine((v, ctx) => {
    if (v.schedule && !v.dueDate) ctx.addIssue({ code: "custom", path: ["dueDate"], message: "Repeating tasks need a first due date" });
  });
export type TaskInput = z.infer<typeof taskSchema>;

export const quickTaskSchema = z.object({
  title: z.string().trim().min(1, "What needs doing?").max(200),
  dueDate: optionalDate,
  assignedUserId: optionalUuid,
});

export const shoppingItemSchema = z.object({
  id: optionalUuid,
  listId: z.uuid(),
  name: z.string().trim().min(1, "Add an item").max(120),
  quantity: z.string().trim().max(40).optional(),
  price: z
    .string()
    .trim()
    .optional(),
});
export type ShoppingItemInput = z.infer<typeof shoppingItemSchema>;
