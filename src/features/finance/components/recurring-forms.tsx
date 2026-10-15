"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon, PencilIcon, PlusIcon, SkipForwardIcon } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import { formatDate } from "@/lib/dates";
import { isLiability, type AccountType } from "@/lib/finance/calculations";
import { currencySymbol } from "@/lib/money";
import { RECURRENCE_PRESETS } from "@/lib/recurrence";
import { saveRecurring, settleRecurring } from "../actions";
import { recurringSchema, settleSchema, type RecurringInput, type SettleInput } from "../schemas";
import { BILL_TYPES_FOR_BILLS, BILL_TYPES_FOR_INCOME, BILL_TYPE_LABELS, type Category } from "../types";
import type { MemberOption } from "./transaction-form";

type AccountLite = { id: string; name: string; type: AccountType };

type FormProps = {
  direction: "bill" | "income";
  accounts: AccountLite[];
  categories: Category[];
  members: MemberOption[];
  currency: string;
  today: string;
  initial?: Partial<RecurringInput>;
  onSaved: (id: string) => void;
};

function RecurringForm({ direction, accounts, categories, members, currency, today, initial, onSaved }: FormProps) {
  const [pending, start] = useTransition();
  const form = useForm<RecurringInput>({
    resolver: zodResolver(recurringSchema),
    defaultValues: {
      direction,
      name: "",
      billType: direction === "bill" ? "utility" : "salary",
      amount: "",
      isVariableAmount: false,
      schedule: "monthly-1",
      firstDueDate: today,
      endDate: "",
      accountId: accounts.find((a) => !isLiability(a.type))?.id ?? "",
      categoryId: "",
      liabilityAccountId: "",
      payee: "",
      personUserId: "",
      autopay: false,
      reminderDaysBefore: "3",
      notes: "",
      ...initial,
    },
  });
  const { register, control, formState } = form;
  const err = formState.errors;
  const billType = useWatch({ control, name: "billType" });
  const liabilityId = useWatch({ control, name: "liabilityAccountId" });
  const types = direction === "bill" ? BILL_TYPES_FOR_BILLS : BILL_TYPES_FOR_INCOME;
  const kind = direction === "bill" ? "expense" : "income";
  const cats = categories.filter((c) => c.kind === kind && !c.is_archived);
  const parents = cats.filter((c) => !c.parent_id);
  const liabilities = accounts.filter((a) => isLiability(a.type));
  const debtType = ["mortgage", "car_loan", "loan", "credit_card"].includes(billType);
  const editing = Boolean(initial?.id);

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={form.handleSubmit((v) =>
        start(async () => {
          const r = await saveRecurring(v);
          if (!r.ok) {
            for (const [k, m] of Object.entries(r.fieldErrors ?? {})) form.setError(k as keyof RecurringInput, { message: m });
            toast.error(r.error);
            return;
          }
          toast.success(r.message);
          onSaved(r.data.id);
        }),
      )}
    >
      <FieldGroup className="gap-4">
        <Field data-invalid={Boolean(err.name)}>
          <FieldLabel htmlFor="rc-name">Name</FieldLabel>
          <Input id="rc-name" placeholder={direction === "bill" ? "e.g. T&TEC electricity" : "e.g. Jonathan's salary"} {...register("name")} />
          <FieldError>{err.name?.message}</FieldError>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="rc-type">Type</FieldLabel>
            <NativeSelect id="rc-type" {...register("billType")}>
              {types.map((t) => (
                <option key={t} value={t}>
                  {BILL_TYPE_LABELS[t]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field data-invalid={Boolean(err.amount)}>
            <FieldLabel htmlFor="rc-amount">Usual amount</FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <InputGroupText>{currencySymbol(currency)}</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput id="rc-amount" inputMode="decimal" className="tabular" {...register("amount")} />
            </InputGroup>
            <FieldError>{err.amount?.message}</FieldError>
          </Field>
        </div>
        <Controller
          control={control}
          name="isVariableAmount"
          render={({ field }) => (
            <Field orientation="horizontal">
              <Checkbox id="rc-variable" checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
              <FieldLabel htmlFor="rc-variable" className="font-normal">
                The amount changes each time (e.g. utilities)
              </FieldLabel>
            </Field>
          )}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field data-invalid={Boolean(err.schedule)}>
            <FieldLabel htmlFor="rc-schedule">Repeats</FieldLabel>
            <NativeSelect id="rc-schedule" {...register("schedule")}>
              {RECURRENCE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field data-invalid={Boolean(err.firstDueDate)}>
            <FieldLabel htmlFor="rc-first">{editing ? "Next due" : "First due"}</FieldLabel>
            <Input id="rc-first" type="date" {...register("firstDueDate")} />
            <FieldError>{err.firstDueDate?.message}</FieldError>
          </Field>
        </div>
        {editing ? (
          <FieldDescription className="-mt-2">Changing the schedule or date restarts the schedule from that date.</FieldDescription>
        ) : null}

        <Field>
          <FieldLabel htmlFor="rc-account">{direction === "bill" ? "Usually paid from" : "Paid into"}</FieldLabel>
          <NativeSelect id="rc-account" {...register("accountId")}>
            <option value="">Not set</option>
            {accounts
              .filter((a) => !isLiability(a.type) || direction === "bill")
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </NativeSelect>
        </Field>

        {direction === "bill" && (debtType || liabilityId) && liabilities.length ? (
          <Field>
            <FieldLabel htmlFor="rc-liability">Pays down</FieldLabel>
            <NativeSelect id="rc-liability" {...register("liabilityAccountId")}>
              <option value="">Nothing — record as an expense</option>
              {liabilities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
            <FieldDescription>
              Payments become a transfer to this account, so they reduce the debt and aren&apos;t counted as spending twice.
              Use “Record payment” on the account to split out interest.
            </FieldDescription>
          </Field>
        ) : null}

        {!liabilityId ? (
          <Field>
            <FieldLabel htmlFor="rc-category">Category</FieldLabel>
            <NativeSelect id="rc-category" {...register("categoryId")}>
              <option value="">Choose… (needed to record transactions)</option>
              {parents.map((p) => {
                const kids = cats.filter((c) => c.parent_id === p.id);
                return kids.length ? (
                  <optgroup key={p.id} label={p.name}>
                    <option value={p.id}>{p.name} (general)</option>
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
          </Field>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="rc-payee">{direction === "bill" ? "Payee" : "Payer"}</FieldLabel>
            <Input id="rc-payee" {...register("payee")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="rc-person">Responsible</FieldLabel>
            <NativeSelect id="rc-person" {...register("personUserId")}>
              <option value="">Shared</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.display_name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field data-invalid={Boolean(err.reminderDaysBefore)}>
            <FieldLabel htmlFor="rc-reminder">Remind days before</FieldLabel>
            <Input id="rc-reminder" inputMode="numeric" {...register("reminderDaysBefore")} />
            <FieldError>{err.reminderDaysBefore?.message}</FieldError>
          </Field>
          <Field data-invalid={Boolean(err.endDate)}>
            <FieldLabel htmlFor="rc-end">Ends (optional)</FieldLabel>
            <Input id="rc-end" type="date" {...register("endDate")} />
            <FieldError>{err.endDate?.message}</FieldError>
          </Field>
        </div>
        {direction === "bill" ? (
          <Controller
            control={control}
            name="autopay"
            render={({ field }) => (
              <Field orientation="horizontal" className="justify-between rounded-xl bg-muted/60 p-3">
                <div>
                  <FieldLabel htmlFor="rc-autopay" className="font-normal">
                    Paid automatically by the bank
                  </FieldLabel>
                  <FieldDescription>For your information only — you still confirm each payment here.</FieldDescription>
                </div>
                <Switch id="rc-autopay" checked={field.value} onCheckedChange={field.onChange} />
              </Field>
            )}
          />
        ) : null}
        <Field>
          <FieldLabel htmlFor="rc-notes">Notes</FieldLabel>
          <Textarea id="rc-notes" rows={2} placeholder="Account or reference numbers are fine; never passwords or PINs." {...register("notes")} />
        </Field>
      </FieldGroup>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : null}
        {editing ? "Save changes" : direction === "bill" ? "Add bill" : "Add income"}
      </Button>
    </form>
  );
}

export function AddRecurringButton(props: Omit<FormProps, "onSaved" | "initial">) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button variant={props.direction === "bill" ? "default" : "outline"} onClick={() => setOpen(true)}>
        <PlusIcon data-icon="inline-start" /> {props.direction === "bill" ? "Bill" : "Income"}
      </Button>
      <ResponsiveModal open={open} onOpenChange={setOpen} title={props.direction === "bill" ? "New recurring bill" : "New recurring income"}>
        {open ? (
          <RecurringForm
            {...props}
            onSaved={(id) => {
              setOpen(false);
              router.push(`/finances/bills/${id}`);
            }}
          />
        ) : null}
      </ResponsiveModal>
    </>
  );
}

export function EditRecurringButton(props: Omit<FormProps, "onSaved">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <PencilIcon data-icon="inline-start" /> Edit
      </Button>
      <ResponsiveModal open={open} onOpenChange={setOpen} title="Edit">
        {open ? <RecurringForm {...props} onSaved={() => setOpen(false)} /> : null}
      </ResponsiveModal>
    </>
  );
}

function SettleForm({
  recurringId,
  dueDate,
  amount,
  accountId,
  accounts,
  today,
  currency,
  canRecord,
  direction,
  onDone,
}: {
  recurringId: string;
  dueDate: string;
  amount: string;
  accountId: string;
  accounts: AccountLite[];
  today: string;
  currency: string;
  canRecord: boolean;
  direction: "bill" | "income";
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const form = useForm<SettleInput>({
    resolver: zodResolver(settleSchema),
    defaultValues: { recurringId, dueDate, status: "paid", paidOn: today, amount, accountId, recordTransaction: canRecord, notes: "" },
  });
  const record = useWatch({ control: form.control, name: "recordTransaction" });
  const err = form.formState.errors;
  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={form.handleSubmit((v) =>
        start(async () => {
          const r = await settleRecurring(v);
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          toast.success(r.message);
          onDone();
        }),
      )}
    >
      <p className="text-sm text-muted-foreground">
        For the occurrence due <span className="font-medium text-foreground">{formatDate(dueDate)}</span>.
      </p>
      <FieldGroup className="gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field data-invalid={Boolean(err.amount)}>
            <FieldLabel htmlFor="st-amount">Amount {direction === "bill" ? "paid" : "received"}</FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <InputGroupText>{currencySymbol(currency)}</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput id="st-amount" inputMode="decimal" className="tabular" autoFocus {...form.register("amount")} />
            </InputGroup>
            <FieldError>{err.amount?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="st-date">On</FieldLabel>
            <Input id="st-date" type="date" {...form.register("paidOn")} />
          </Field>
        </div>
        <Controller
          control={form.control}
          name="recordTransaction"
          render={({ field }) => (
            <Field orientation="horizontal">
              <Checkbox id="st-record" checked={field.value} disabled={!canRecord} onCheckedChange={(v) => field.onChange(v === true)} />
              <FieldLabel htmlFor="st-record" className="font-normal">
                Record it in the ledger {canRecord ? "" : "(set a category or 'pays down' account first)"}
              </FieldLabel>
            </Field>
          )}
        />
        {record ? (
          <Field>
            <FieldLabel htmlFor="st-account">{direction === "bill" ? "Paid from" : "Paid into"}</FieldLabel>
            <NativeSelect id="st-account" {...form.register("accountId")}>
              <option value="">Choose…</option>
              {accounts
                .filter((a) => !isLiability(a.type) || a.type === "credit_card")
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </NativeSelect>
          </Field>
        ) : null}
        <Field>
          <FieldLabel htmlFor="st-notes">Note (optional)</FieldLabel>
          <Input id="st-notes" placeholder="e.g. confirmation number" {...form.register("notes")} />
        </Field>
      </FieldGroup>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : null}
        {direction === "bill" ? "Mark as paid" : "Mark as received"}
      </Button>
    </form>
  );
}

export function SettleButtons(props: Omit<Parameters<typeof SettleForm>[0], "onDone">) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button size="lg" onClick={() => setOpen(true)}>
        <CheckIcon data-icon="inline-start" /> {props.direction === "bill" ? "Mark paid" : "Received"}
      </Button>
      <Button
        size="lg"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await settleRecurring({ recurringId: props.recurringId, dueDate: props.dueDate, status: "skipped", recordTransaction: false });
            if (!r.ok) toast.error(r.error);
            else toast.success(r.message);
          })
        }
      >
        {pending ? <Spinner /> : <SkipForwardIcon data-icon="inline-start" />} Skip this one
      </Button>
      <ResponsiveModal open={open} onOpenChange={setOpen} title={props.direction === "bill" ? "Mark as paid" : "Mark as received"}>
        {open ? <SettleForm {...props} onDone={() => setOpen(false)} /> : null}
      </ResponsiveModal>
    </div>
  );
}

/** Compact "Pay" / "Received" button for lists; opens the same form as the bill page. */
export function SettleQuickButton(props: Omit<Parameters<typeof SettleForm>[0], "onDone"> & { label: string }) {
  const [open, setOpen] = useState(false);
  const { label, ...form } = props;
  return (
    <>
      <Button size="sm" variant="outline" className="shrink-0" onClick={() => setOpen(true)} aria-label={label}>
        <CheckIcon data-icon="inline-start" /> {props.direction === "bill" ? "Pay" : "Received"}
      </Button>
      <ResponsiveModal open={open} onOpenChange={setOpen} title={label}>
        {open ? <SettleForm {...form} onDone={() => setOpen(false)} /> : null}
      </ResponsiveModal>
    </>
  );
}
