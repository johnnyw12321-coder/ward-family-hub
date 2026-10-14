import { z } from "zod";
import { isCalendarDate } from "@/lib/dates";

const optionalUuid = z.union([z.uuid(), z.literal("")]).optional();
const optionalDate = z.union([z.string().refine(isCalendarDate, "Enter a valid date"), z.literal("")]).optional();

export const documentSchema = z
  .object({
    id: optionalUuid,
    name: z.string().trim().min(1, "Name the document").max(160),
    categoryId: z.uuid("Choose a category"),
    description: z.string().trim().max(2000).optional(),
    tags: z.string().max(400).optional(),
    issueDate: optionalDate,
    expiryDate: optionalDate,
    expiryReminderDays: z.string().refine((v) => /^\d{1,3}$/.test(v) && Number(v) <= 365, "0–365 days"),
    isSensitive: z.boolean(),
    relatedUserId: optionalUuid,
    accountId: optionalUuid,
    transactionId: optionalUuid,
    recurringId: optionalUuid,
    goalId: optionalUuid,
  })
  .superRefine((v, ctx) => {
    if (v.issueDate && v.expiryDate && v.expiryDate < v.issueDate) {
      ctx.addIssue({ code: "custom", path: ["expiryDate"], message: "Expiry must be after the issue date" });
    }
  });
export type DocumentInput = z.infer<typeof documentSchema>;

export function parseTags(input: string | undefined): string[] {
  if (!input) return [];
  return [...new Set(input.split(/[,#]/).map((t) => t.trim().toLowerCase().slice(0, 30)).filter(Boolean))].slice(0, 12);
}

export const startUploadSchema = z.object({
  documentId: z.uuid(),
  fileName: z.string().min(1).max(255),
  size: z.number().int().positive(),
  contentType: z.string().max(100),
});

export const finishUploadSchema = z.object({
  documentId: z.uuid(),
  fileId: z.uuid(),
  fileName: z.string().min(1).max(255),
  /** Remove the (empty) document if the file is rejected — used for brand-new documents. */
  discardDocumentOnFailure: z.boolean(),
});

export const documentFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  category: z.uuid().optional().catch(undefined),
  archived: z.enum(["1"]).optional().catch(undefined),
});
