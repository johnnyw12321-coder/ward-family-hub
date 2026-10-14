import { z } from "zod";
import { isCalendarDate } from "@/lib/dates";

const optionalUuid = z.union([z.uuid(), z.literal("")]).optional();
const date = z.string().refine(isCalendarDate, "Enter a valid date");
const optionalDate = z.union([date, z.literal("")]).optional();
const text = (max: number) => z.string().trim().max(max).optional();

export const RELATIONSHIPS = ["self", "partner", "child", "parent", "sibling", "grandparent", "other"] as const;
export const RELATIONSHIP_LABELS: Record<(typeof RELATIONSHIPS)[number], string> = {
  self: "Me",
  partner: "Partner",
  child: "Child",
  parent: "Parent",
  sibling: "Sibling",
  grandparent: "Grandparent",
  other: "Other",
};
export const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"] as const;

export const memberSchema = z.object({
  id: optionalUuid,
  fullName: z.string().trim().min(1, "Enter a name").max(120),
  preferredName: text(60),
  relationship: z.enum(RELATIONSHIPS),
  dateOfBirth: optionalDate,
  schoolOrCare: text(160),
  schoolDetails: text(2000),
  notes: text(4000),
  colour: z.string().regex(/^[a-z]{3,16}$/),
  userId: optionalUuid,
});
export type MemberInput = z.infer<typeof memberSchema>;

export const healthSchema = z.object({
  familyMemberId: z.uuid(),
  bloodType: z.union([z.enum(BLOOD_TYPES), z.literal("")]).optional(),
  allergies: text(2000),
  conditions: text(2000),
  medications: text(2000),
  doctor: text(300),
  healthInsurance: text(300),
  notes: text(4000),
});
export type HealthInput = z.infer<typeof healthSchema>;

export const contactSchema = z.object({
  id: optionalUuid,
  familyMemberId: optionalUuid,
  name: z.string().trim().min(1, "Enter a name").max(120),
  relationship: text(60),
  phone: text(40),
  email: z.union([z.email("Enter a valid email"), z.literal("")]).optional(),
  isEmergency: z.boolean(),
  notes: text(1000),
});
export type ContactInput = z.infer<typeof contactSchema>;

export const familyDateSchema = z.object({
  id: optionalUuid,
  familyMemberId: z.uuid(),
  kind: z.enum(["milestone", "important_date"]),
  title: z.string().trim().min(1, "Describe it").max(160),
  onDate: date,
  isAnnual: z.boolean(),
  notes: text(2000),
});
export type FamilyDateInput = z.infer<typeof familyDateSchema>;
