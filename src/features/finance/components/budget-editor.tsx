"use client";

import { useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { CopyIcon, PencilIcon, PlusIcon } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { formatMoney, currencySymbol, parseMoney } from "@/lib/money";
import { daysInMonth, rateForMonth, weekdaysBetween } from "../until";
import { monthEnd, monthLabel } from "@/lib/dates";
import { copyBudget, deleteAllocation, saveAllocation } from "../actions";
import { allocationSchema, type AllocationInput } from "../schemas";
import type { Category } from "../types";

function AllocationForm({
  month,
  categories,
  initial,
  currency,
  allocationId,
  onDone,
}: {
  month: string;
  categories: Category[];
  initial?: Partial<AllocationInput>;
  currency: string;
  allocationId?: string;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const form = useForm<AllocationInput>({
    resolver: zodResolver(allocationSchema),
    defaultValues: { month, categoryId: "", amount: "", ratePeriod: "month", carryForward: false, ...initial },
  });
  const err = form.formState.errors;
  const [amount, ratePeriod] = useWatch({ control: form.control, name: ["amount", "ratePeriod"] });
  const entered = parseMoney(amount ?? "", currency);
  const monthName = monthLabel(month).split(" ")[0];
  const preview =
    entered !== null && ratePeriod !== "month"
      ? `${formatMoney(rateForMonth(entered, ratePeriod, month), { currency })} for ${monthName} (${
          ratePeriod === "weekday"
            ? `${weekdaysBetween(month, monthEnd(month))} weekdays`
            : ratePeriod === "day"
              ? `${daysInMonth(month)} days`
              : `about ${(Math.round((daysInMonth(month) / 7) * 10) / 10).toLocaleString("en-GB")} weeks`
        })`
      : null;
  const parents = categories.filter((c) => !c.parent_id);
  const editing = Boolean(initial?.categoryId);
  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={form.handleSubmit((v) =>
        start(async () => {
          const r = await saveAllocation(v);
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          toast.success(r.message);
          onDone();
        }),
      )}
    >
      <FieldGroup className="gap-4">
        {editing ? (
          <p className="text-sm text-muted-foreground">
            Category: <span className="font-medium text-foreground">{categories.find((c) => c.id === initial?.categoryId)?.name}</span>
          </p>
        ) : (
          <Field data-invalid={Boolean(err.categoryId)}>
            <FieldLabel htmlFor="al-cat">Category</FieldLabel>
            <NativeSelect id="al-cat" {...form.register("categoryId")}>
              <option value="">Choose…</option>
              {parents.map((p) => {
                const kids = categories.filter((c) => c.parent_id === p.id);
                return kids.length ? (
                  <optgroup key={p.id} label={p.name}>
                    <option value={p.id}>All {p.name}</option>
                    {kids.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                ) : (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                );
              })}
            </NativeSelect>
            <FieldDescription>
              Budgeting a whole category covers its subcategories unless a subcategory has its own line.
            </FieldDescription>
            <FieldError>{err.categoryId?.message}</FieldError>
          </Field>
        )}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
          <Field data-invalid={Boolean(err.amount)}>
            <FieldLabel htmlFor="al-amount">Amount</FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <InputGroupText>{currencySymbol(currency)}</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput id="al-amount" inputMode="decimal" className="tabular" autoFocus {...form.register("amount")} />
            </InputGroup>
            <FieldError>{err.amount?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="al-per">Per</FieldLabel>
            <NativeSelect id="al-per" {...form.register("ratePeriod")}>
              <option value="month">Month</option>
              <option value="week">Week</option>
              <option value="weekday">Weekday (Mon–Fri)</option>
              <option value="day">Day</option>
            </NativeSelect>
          </Field>
        </div>
        <FieldDescription className="-mt-2">
          {preview ?? "Spending you think of by the week or day, like gas or travel to work? Choose it under Per."}
        </FieldDescription>
        <Controller
          control={form.control}
          name="carryForward"
          render={({ field }) => (
            <Field orientation="horizontal">
              <Checkbox id="al-carry" checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
              <FieldLabel htmlFor="al-carry" className="font-normal">
                Carry unspent money into next month
              </FieldLabel>
            </Field>
          )}
        />
      </FieldGroup>
      <div className="flex gap-2">
        <Button type="submit" size="lg" className="flex-1" disabled={pending}>
          {pending ? <Spinner /> : null}
          {editing ? "Save" : "Add to budget"}
        </Button>
        {allocationId ? (
          <Button
            type="button"
            size="lg"
            variant="destructive"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await deleteAllocation(allocationId);
                if (!r.ok) toast.error(r.error);
                else {
                  toast.success(r.message);
                  onDone();
                }
              })
            }
          >
            Remove
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function AddAllocationButton({
  month,
  categories,
  currency,
  label = "Add budget line",
}: {
  month: string;
  categories: Category[];
  currency: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon data-icon="inline-start" /> {label}
      </Button>
      <ResponsiveModal open={open} onOpenChange={setOpen} title="Add budget line">
        {open ? <AllocationForm month={month} categories={categories} currency={currency} onDone={() => setOpen(false)} /> : null}
      </ResponsiveModal>
    </>
  );
}

export function EditAllocationButton({
  month,
  categories,
  currency,
  allocationId,
  initial,
  name,
}: {
  month: string;
  categories: Category[];
  currency: string;
  allocationId: string;
  initial: AllocationInput;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${name} budget`} onClick={() => setOpen(true)}>
        <PencilIcon />
      </Button>
      <ResponsiveModal open={open} onOpenChange={setOpen} title={`Budget for ${name}`}>
        {open ? (
          <AllocationForm
            month={month}
            categories={categories}
            currency={currency}
            initial={initial}
            allocationId={allocationId}
            onDone={() => setOpen(false)}
          />
        ) : null}
      </ResponsiveModal>
    </>
  );
}

export function CopyBudgetButton({ from, to, label, variant = "outline" }: { from: string; to: string; label: string; variant?: "outline" | "default" }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant={variant}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await copyBudget(from, to);
          if (!r.ok) toast.error(r.error);
          else toast.success(r.message);
        })
      }
    >
      {pending ? <Spinner /> : <CopyIcon data-icon="inline-start" />} {label}
    </Button>
  );
}
