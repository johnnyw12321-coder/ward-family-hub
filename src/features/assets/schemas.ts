import { z } from "zod";
import { nonNegativeMoney } from "@/features/finance/schemas";
import { isCalendarDate } from "@/lib/dates";

const optionalUuid = z.union([z.uuid(), z.literal("")]).optional();
const date = z.string().refine(isCalendarDate, "Enter a valid date");
const optionalDate = z.union([date, z.literal("")]).optional();
const optionalInt = (max: number, message: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d{1,9}$/.test(v) && Number(v) <= max), message)
    .optional();
const text = (max: number) => z.string().trim().max(max).optional();

export const PROPERTY_KINDS = ["house", "apartment", "townhouse", "land", "commercial", "other"] as const;
export const RECORD_KINDS = ["maintenance", "repair", "renovation", "service", "inspection", "improvement", "other"] as const;
export const RECORD_KIND_LABELS: Record<(typeof RECORD_KINDS)[number], string> = {
  maintenance: "Maintenance",
  repair: "Repair",
  renovation: "Renovation",
  service: "Service",
  inspection: "Inspection",
  improvement: "Improvement",
  other: "Other",
};

export const assetSchema = z.object({
  id: optionalUuid,
  type: z.enum(["property", "vehicle", "other"]),
  name: z.string().trim().min(1, "Give it a name").max(120),
  purchaseDate: optionalDate,
  purchasePrice: nonNegativeMoney.optional(),
  estimatedValue: nonNegativeMoney.optional(),
  loanAccountId: optionalUuid,
  includeInNetWorth: z.boolean(),
  notes: text(4000),
  address: text(300),
  propertyKind: z.union([z.enum(PROPERTY_KINDS), z.literal("")]).optional(),
  make: text(60),
  model: text(60),
  modelYear: optionalInt(2100, "Enter a year like 2021"),
  registrationPlate: text(20),
  vin: text(30),
  colour: text(30),
  mileageUnit: z.enum(["km", "mi"]),
  currentMileage: optionalInt(5_000_000, "Enter the odometer reading"),
  insuranceRenewalDate: optionalDate,
  registrationRenewalDate: optionalDate,
  nextServiceDate: optionalDate,
  nextServiceMileage: optionalInt(5_000_000, "Enter a mileage"),
});
export type AssetInput = z.infer<typeof assetSchema>;

export const valuationSchema = z.object({
  assetId: z.uuid(),
  valuedOn: date,
  value: nonNegativeMoney.refine((v) => v !== "", "Enter the value"),
  note: text(300),
});

export const recordSchema = z
  .object({
    id: optionalUuid,
    assetId: z.uuid(),
    kind: z.enum(RECORD_KINDS),
    title: z.string().trim().min(1, "Describe the work").max(160),
    performedOn: date,
    cost: nonNegativeMoney.optional(),
    contractorId: optionalUuid,
    mileage: optionalInt(5_000_000, "Enter the odometer reading"),
    nextDueDate: optionalDate,
    notes: text(2000),
    recordExpense: z.boolean(),
    accountId: optionalUuid,
    categoryId: optionalUuid,
  })
  .superRefine((v, ctx) => {
    if (!v.recordExpense) return;
    if (!v.cost) ctx.addIssue({ code: "custom", path: ["cost"], message: "Enter the cost to record it as an expense" });
    if (!v.accountId) ctx.addIssue({ code: "custom", path: ["accountId"], message: "Choose the account it was paid from" });
    if (!v.categoryId) ctx.addIssue({ code: "custom", path: ["categoryId"], message: "Choose a category" });
  });
export type RecordInput = z.infer<typeof recordSchema>;

export const itemSchema = z.object({
  id: optionalUuid,
  assetId: z.uuid(),
  name: z.string().trim().min(1, "Name the item").max(120),
  brand: text(60),
  model: text(60),
  serialNumber: text(60),
  purchaseDate: optionalDate,
  price: nonNegativeMoney.optional(),
  warrantyExpiresOn: optionalDate,
  notes: text(2000),
});
export type ItemInput = z.infer<typeof itemSchema>;

export const contractorSchema = z.object({
  id: optionalUuid,
  name: z.string().trim().min(1, "Enter a name").max(120),
  trade: text(60),
  phone: text(40),
  email: z.union([z.email("Enter a valid email"), z.literal("")]).optional(),
  rating: z.union([z.enum(["1", "2", "3", "4", "5"]), z.literal("")]).optional(),
  notes: text(2000),
});
export type ContractorInput = z.infer<typeof contractorSchema>;
