"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch, type FieldValues, type Path, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/actions";
import { currencySymbol } from "@/lib/money";
import { addValuation, saveAsset, saveContractor, saveItem, saveRecord } from "../actions";
import {
  PROPERTY_KINDS,
  RECORD_KINDS,
  RECORD_KIND_LABELS,
  assetSchema,
  contractorSchema,
  itemSchema,
  recordSchema,
  valuationSchema,
  type AssetInput,
  type ContractorInput,
  type ItemInput,
  type RecordInput,
} from "../schemas";
import type { z } from "zod";

type Option = { id: string; name: string };

// ---------------------------------------------------------------------------
// Small helpers shared by the forms below
// ---------------------------------------------------------------------------
function MoneyField<T extends FieldValues>({ form, name, label, currency, description }: { form: UseFormReturn<T>; name: Path<T>; label: string; currency: string; description?: string }) {
  const error = form.getFieldState(name, form.formState).error;
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={`f-${name}`}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupAddon>
          <InputGroupText>{currencySymbol(currency)}</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput id={`f-${name}`} inputMode="decimal" className="tabular" {...form.register(name)} />
      </InputGroup>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError>{error?.message}</FieldError>
    </Field>
  );
}

function TextField<T extends FieldValues>({ form, name, label, type = "text", placeholder, inputMode }: { form: UseFormReturn<T>; name: Path<T>; label: string; type?: string; placeholder?: string; inputMode?: "numeric" | "decimal" | "tel" | "email" }) {
  const error = form.getFieldState(name, form.formState).error;
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={`f-${name}`}>{label}</FieldLabel>
      <Input id={`f-${name}`} type={type} placeholder={placeholder} inputMode={inputMode} {...form.register(name)} />
      <FieldError>{error?.message}</FieldError>
    </Field>
  );
}

function useSubmit<T extends FieldValues>(form: UseFormReturn<T>, action: (v: T) => Promise<ActionResult<unknown>>, onDone: (data: unknown) => void) {
  const [pending, start] = useTransition();
  const submit = form.handleSubmit((values) =>
    start(async () => {
      const r = await action(values);
      if (!r.ok) {
        for (const [k, m] of Object.entries(r.fieldErrors ?? {})) form.setError(k as Path<T>, { message: m });
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "Saved");
      onDone(r.data);
    }),
  );
  return { pending, submit };
}

export function FormModal({ label, title, variant = "outline", children }: { label: ReactNode; title: string; variant?: "default" | "outline" | "ghost" | "secondary"; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <ResponsiveModal open={open} onOpenChange={setOpen} title={title}>
        {open ? children(() => setOpen(false)) : null}
      </ResponsiveModal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Asset
// ---------------------------------------------------------------------------
export function AssetForm({
  type,
  initial,
  loanAccounts,
  currency,
  onSaved,
}: {
  type: "property" | "vehicle";
  initial?: Partial<AssetInput>;
  loanAccounts: Option[];
  currency: string;
  onSaved: (id: string) => void;
}) {
  const editing = Boolean(initial?.id);
  const form = useForm<AssetInput>({
    resolver: zodResolver(assetSchema),
    defaultValues: {
      type,
      name: "",
      purchaseDate: "",
      purchasePrice: "",
      estimatedValue: "",
      loanAccountId: "",
      includeInNetWorth: true,
      notes: "",
      address: "",
      propertyKind: type === "property" ? "house" : "",
      make: "",
      model: "",
      modelYear: "",
      registrationPlate: "",
      vin: "",
      colour: "",
      mileageUnit: "km",
      currentMileage: "",
      insuranceRenewalDate: "",
      registrationRenewalDate: "",
      nextServiceDate: "",
      nextServiceMileage: "",
      ...initial,
    },
  });
  const { pending, submit } = useSubmit(form, saveAsset, (d) => onSaved((d as { id: string }).id));
  const vehicle = type === "vehicle";
  return (
    <form noValidate onSubmit={submit} className="space-y-5">
      <FieldGroup className="gap-4">
        <TextField form={form} name="name" label="Name" placeholder={vehicle ? "e.g. Family SUV" : "e.g. Our home"} />
        {vehicle ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <TextField form={form} name="make" label="Make" placeholder="Toyota" />
              <TextField form={form} name="model" label="Model" placeholder="Corolla" />
              <TextField form={form} name="modelYear" label="Year" inputMode="numeric" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField form={form} name="registrationPlate" label="Registration plate" placeholder="PDF 1234" />
              <TextField form={form} name="colour" label="Colour" />
            </div>
            <TextField form={form} name="vin" label="VIN / chassis number" />
            <div className="grid grid-cols-2 gap-3">
              <TextField form={form} name="currentMileage" label="Odometer" inputMode="numeric" />
              <Field>
                <FieldLabel htmlFor="f-unit">Unit</FieldLabel>
                <NativeSelect id="f-unit" {...form.register("mileageUnit")}>
                  <option value="km">Kilometres</option>
                  <option value="mi">Miles</option>
                </NativeSelect>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField form={form} name="nextServiceDate" label="Next service" type="date" />
              <TextField form={form} name="nextServiceMileage" label="…or at mileage" inputMode="numeric" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField form={form} name="insuranceRenewalDate" label="Insurance renews" type="date" />
              <TextField form={form} name="registrationRenewalDate" label="Registration renews" type="date" />
            </div>
          </>
        ) : (
          <>
            <TextField form={form} name="address" label="Address" />
            <Field>
              <FieldLabel htmlFor="f-kind">Type</FieldLabel>
              <NativeSelect id="f-kind" {...form.register("propertyKind")}>
                {PROPERTY_KINDS.map((k) => (
                  <option key={k} value={k} className="capitalize">
                    {k[0].toUpperCase() + k.slice(1)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <TextField form={form} name="purchaseDate" label="Bought on" type="date" />
          <MoneyField form={form} name="purchasePrice" label="Purchase price" currency={currency} />
        </div>
        {!editing ? <MoneyField form={form} name="estimatedValue" label="Estimated value today" currency={currency} description="Update it any time from the detail page." /> : null}
        <Field>
          <FieldLabel htmlFor="f-loan">{vehicle ? "Car loan account" : "Mortgage account"}</FieldLabel>
          <NativeSelect id="f-loan" {...form.register("loanAccountId")}>
            <option value="">None</option>
            {loanAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
          <FieldDescription>Used to show equity (value minus what&apos;s owed).</FieldDescription>
        </Field>
        <Controller
          control={form.control}
          name="includeInNetWorth"
          render={({ field }) => (
            <Field orientation="horizontal" className="justify-between rounded-xl bg-muted/60 p-3">
              <FieldLabel htmlFor="f-nw" className="font-normal">
                Include value in net worth
              </FieldLabel>
              <Switch id="f-nw" checked={field.value} onCheckedChange={field.onChange} />
            </Field>
          )}
        />
        <Field>
          <FieldLabel htmlFor="f-notes">Notes</FieldLabel>
          <Textarea id="f-notes" rows={2} {...form.register("notes")} />
        </Field>
      </FieldGroup>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : null} {editing ? "Save changes" : vehicle ? "Add vehicle" : "Add property"}
      </Button>
    </form>
  );
}

export function NewAssetButton(props: { type: "property" | "vehicle"; loanAccounts: Option[]; currency: string }) {
  const router = useRouter();
  return (
    <FormModal label={props.type === "vehicle" ? "Add vehicle" : "Add property"} title={props.type === "vehicle" ? "New vehicle" : "New property"} variant="default">
      {(close) => (
        <AssetForm
          {...props}
          onSaved={(id) => {
            close();
            router.push(`/${props.type === "vehicle" ? "vehicles" : "property"}/${id}`);
          }}
        />
      )}
    </FormModal>
  );
}

export function EditAssetButton(props: { type: "property" | "vehicle"; loanAccounts: Option[]; currency: string; initial: Partial<AssetInput> }) {
  return <FormModal label="Edit" title="Edit details">{(close) => <AssetForm {...props} onSaved={close} />}</FormModal>;
}

// ---------------------------------------------------------------------------
// Valuation
// ---------------------------------------------------------------------------
type ValuationValues = z.infer<typeof valuationSchema>;

export function ValuationButton({ assetId, currency, today }: { assetId: string; currency: string; today: string }) {
  return (
    <FormModal label="Update value" title="Current value">
      {(close) => <ValuationForm assetId={assetId} currency={currency} today={today} onDone={close} />}
    </FormModal>
  );
}

function ValuationForm({ assetId, currency, today, onDone }: { assetId: string; currency: string; today: string; onDone: () => void }) {
  const form = useForm<ValuationValues>({ resolver: zodResolver(valuationSchema), defaultValues: { assetId, valuedOn: today, value: "", note: "" } });
  const { pending, submit } = useSubmit(form, addValuation, onDone);
  return (
    <form noValidate onSubmit={submit} className="space-y-4">
      <MoneyField form={form} name="value" label="Estimated value" currency={currency} description="A valuation report, insurance figure or your best estimate." />
      <TextField form={form} name="valuedOn" label="As of" type="date" />
      <TextField form={form} name="note" label="Source (optional)" placeholder="e.g. bank valuation" />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : null} Save value
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Maintenance record
// ---------------------------------------------------------------------------
export function RecordForm({
  assetId,
  initial,
  contractors,
  accounts,
  categories,
  currency,
  today,
  vehicle,
  onDone,
}: {
  assetId: string;
  initial?: Partial<RecordInput>;
  contractors: Option[];
  accounts: Option[];
  categories: { id: string; name: string; group: string }[];
  currency: string;
  today: string;
  vehicle: boolean;
  onDone: () => void;
}) {
  const editing = Boolean(initial?.id);
  const form = useForm<RecordInput>({
    resolver: zodResolver(recordSchema),
    defaultValues: {
      assetId,
      kind: vehicle ? "service" : "maintenance",
      title: "",
      performedOn: today,
      cost: "",
      contractorId: "",
      mileage: "",
      nextDueDate: "",
      notes: "",
      recordExpense: !editing && accounts.length > 0,
      accountId: accounts[0]?.id ?? "",
      categoryId: categories.find((c) => /maint|repair/i.test(c.name))?.id ?? "",
      ...initial,
    },
  });
  const recordExpense = useWatch({ control: form.control, name: "recordExpense" });
  const { pending, submit } = useSubmit(form, saveRecord, onDone);
  const groups = [...new Set(categories.map((c) => c.group))];
  return (
    <form noValidate onSubmit={submit} className="space-y-5">
      <FieldGroup className="gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="f-rkind">Type</FieldLabel>
            <NativeSelect id="f-rkind" {...form.register("kind")}>
              {RECORD_KINDS.map((k) => (
                <option key={k} value={k}>
                  {RECORD_KIND_LABELS[k]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <TextField form={form} name="performedOn" label="Date" type="date" />
        </div>
        <TextField form={form} name="title" label="What was done" placeholder={vehicle ? "e.g. 40,000 km service" : "e.g. Serviced AC units"} />
        <div className="grid grid-cols-2 gap-3">
          <MoneyField form={form} name="cost" label="Cost" currency={currency} />
          {vehicle ? <TextField form={form} name="mileage" label="Odometer" inputMode="numeric" /> : <TextField form={form} name="nextDueDate" label="Next due" type="date" />}
        </div>
        {vehicle ? <TextField form={form} name="nextDueDate" label="Next due (optional)" type="date" /> : null}
        <Field>
          <FieldLabel htmlFor="f-contractor">Done by</FieldLabel>
          <NativeSelect id="f-contractor" {...form.register("contractorId")}>
            <option value="">Ourselves / not recorded</option>
            {contractors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {!editing ? (
          <>
            <Controller
              control={form.control}
              name="recordExpense"
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Checkbox id="f-expense" checked={field.value} disabled={!accounts.length} onCheckedChange={(v) => field.onChange(v === true)} />
                  <FieldLabel htmlFor="f-expense" className="font-normal">
                    Also record the cost as an expense in our accounts
                  </FieldLabel>
                </Field>
              )}
            />
            {recordExpense ? (
              <div className="grid grid-cols-2 gap-3">
                <Field data-invalid={Boolean(form.formState.errors.accountId)}>
                  <FieldLabel htmlFor="f-acct">Paid from</FieldLabel>
                  <NativeSelect id="f-acct" {...form.register("accountId")}>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </NativeSelect>
                  <FieldError>{form.formState.errors.accountId?.message}</FieldError>
                </Field>
                <Field data-invalid={Boolean(form.formState.errors.categoryId)}>
                  <FieldLabel htmlFor="f-cat">Category</FieldLabel>
                  <NativeSelect id="f-cat" {...form.register("categoryId")}>
                    <option value="">Choose…</option>
                    {groups.map((g) => (
                      <optgroup key={g} label={g}>
                        {categories
                          .filter((c) => c.group === g)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </NativeSelect>
                  <FieldError>{form.formState.errors.categoryId?.message}</FieldError>
                </Field>
              </div>
            ) : null}
          </>
        ) : null}
        <Field>
          <FieldLabel htmlFor="f-rnotes">Notes</FieldLabel>
          <Textarea id="f-rnotes" rows={2} {...form.register("notes")} />
        </Field>
      </FieldGroup>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : null} {editing ? "Save changes" : "Save record"}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Appliance / component with warranty
// ---------------------------------------------------------------------------
export function ItemForm({ assetId, initial, currency, onDone }: { assetId: string; initial?: Partial<ItemInput>; currency: string; onDone: () => void }) {
  const form = useForm<ItemInput>({
    resolver: zodResolver(itemSchema),
    defaultValues: { assetId, name: "", brand: "", model: "", serialNumber: "", purchaseDate: "", price: "", warrantyExpiresOn: "", notes: "", ...initial },
  });
  const { pending, submit } = useSubmit(form, saveItem, onDone);
  return (
    <form noValidate onSubmit={submit} className="space-y-5">
      <FieldGroup className="gap-4">
        <TextField form={form} name="name" label="Item" placeholder="e.g. Fridge, water heater, tyres" />
        <div className="grid grid-cols-2 gap-3">
          <TextField form={form} name="brand" label="Brand" />
          <TextField form={form} name="model" label="Model" />
        </div>
        <TextField form={form} name="serialNumber" label="Serial number" />
        <div className="grid grid-cols-2 gap-3">
          <TextField form={form} name="purchaseDate" label="Bought" type="date" />
          <MoneyField form={form} name="price" label="Price" currency={currency} />
        </div>
        <TextField form={form} name="warrantyExpiresOn" label="Warranty ends" type="date" />
        <Field>
          <FieldLabel htmlFor="f-inotes">Notes</FieldLabel>
          <Textarea id="f-inotes" rows={2} placeholder="Where the warranty card is, who to call…" {...form.register("notes")} />
        </Field>
      </FieldGroup>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : null} {initial?.id ? "Save changes" : "Add item"}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Contractor
// ---------------------------------------------------------------------------
export function ContractorForm({ initial, onDone }: { initial?: Partial<ContractorInput>; onDone: () => void }) {
  const form = useForm<ContractorInput>({
    resolver: zodResolver(contractorSchema),
    defaultValues: { name: "", trade: "", phone: "", email: "", rating: "", notes: "", ...initial },
  });
  const { pending, submit } = useSubmit(form, saveContractor, onDone);
  return (
    <form noValidate onSubmit={submit} className="space-y-5">
      <FieldGroup className="gap-4">
        <TextField form={form} name="name" label="Name" />
        <div className="grid grid-cols-2 gap-3">
          <TextField form={form} name="trade" label="Trade" placeholder="Plumber, electrician…" />
          <Field>
            <FieldLabel htmlFor="f-rating">Rating</FieldLabel>
            <NativeSelect id="f-rating" {...form.register("rating")}>
              <option value="">—</option>
              {["5", "4", "3", "2", "1"].map((r) => (
                <option key={r} value={r}>
                  {"★".repeat(Number(r))}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField form={form} name="phone" label="Phone" type="tel" inputMode="tel" />
          <TextField form={form} name="email" label="Email" type="email" inputMode="email" />
        </div>
        <Field>
          <FieldLabel htmlFor="f-cnotes">Notes</FieldLabel>
          <Textarea id="f-cnotes" rows={2} {...form.register("notes")} />
        </Field>
      </FieldGroup>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : null} {initial?.id ? "Save changes" : "Add contractor"}
      </Button>
    </form>
  );
}
