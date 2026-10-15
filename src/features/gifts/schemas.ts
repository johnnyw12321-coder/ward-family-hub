import { z } from "zod";
import { nonNegativeMoney } from "@/features/finance/schemas";

export const OCCASIONS = ["birthday", "christmas", "anniversary", "mothers_day", "fathers_day", "valentines", "other"] as const;
export type Occasion = (typeof OCCASIONS)[number];
export const OCCASION_LABELS: Record<Occasion, string> = {
  birthday: "Birthday",
  christmas: "Christmas",
  anniversary: "Anniversary",
  mothers_day: "Mother's Day",
  fathers_day: "Father's Day",
  valentines: "Valentine's Day",
  other: "Just because",
};

export const CLAIM_STATUS_LABELS = { planned: "Planned", bought: "Bought", given: "Given" } as const;

/** A list is a member's own (m-<user id>) or a family profile's (f-<profile id>). */
export const listKey = z.string().regex(/^[mf]-[0-9a-f-]{36}$/i, "Unknown list");

const optional = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`).optional();

export const wishSchema = z.object({
  id: z.union([z.uuid(), z.literal("")]).optional(),
  list: listKey,
  // Can be left empty when there's a link: the link's own title is used.
  title: z.string().trim().max(120),
  details: optional(1000),
  link: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Paste a full link starting with https://")
    .optional(),
  store: optional(160),
  price: nonNegativeMoney.optional(),
  priority: z.enum(["love", "like"]),
}).refine((v) => v.title || v.link, { path: ["title"], message: "Say what it is, or paste a link" });
export type WishInput = z.infer<typeof wishSchema>;

export const claimSchema = z.object({
  itemId: z.uuid(),
  occasion: z.enum(OCCASIONS),
  note: optional(500),
});
export type ClaimInput = z.infer<typeof claimSchema>;

export const claimUpdateSchema = z.object({
  id: z.uuid(),
  status: z.enum(["planned", "bought", "given"]),
  pricePaid: nonNegativeMoney.optional(),
});
export type ClaimUpdateInput = z.infer<typeof claimUpdateSchema>;
