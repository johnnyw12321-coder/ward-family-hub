"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDownIcon } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { currencySymbol } from "@/lib/money";
import { saveTransaction } from "../actions";
import { PAYMENT_METHODS, transactionSchema, type TransactionInput } from "../schemas";
import { PAYMENT_METHOD_LABELS, type Category, type PaymentMethod } from "../types";
import type { AccountType } from "@/lib/finance/calculations";

export type AccountOption = { id: string; name: string; type: AccountType; currency: string };
export type MemberOption = { user_id: string; display_name: string };

type Props = {
  accounts: AccountOption[];
  categories: Category[];
  members: MemberOption[];
  meId: string;
  today: string;
  nowTime: string;
  currency: string;
  initial?: Partial<TransactionInput>;
  onSaved?: (id: string) => void;
  autoFocusAmount?: boolean;
};

const KINDS = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
] as const;

const LAST_ACCOUNT_KEY = "wfh:last-account";

function readLastAccount(kind: string): string | null {
  try {
    return window.localStorage.getItem(`${LAST_ACCOUNT_KEY}:${kind}`);
  } catch {
    return null;
  }
}

function rememberAccount(kind: string, id: string) {
  try {
    window.localStorage.setItem(`${LAST_ACCOUNT_KEY}:${kind}`, id);
  } catch {
    // Storage unavailable (private mode): the default just won't be remembered.
  }
}

function suggestedPaymentMethod(type: AccountType | undefined): PaymentMethod | "" {
  switch (type) {
    case "credit_card":
      return "credit_card";
    case "cash":
      return "cash";
    case "chequing":
    case "savings":
      return "debit_card";
    default:
      return "";
  }
}

export function TransactionForm({
  accounts,
  categories,
  members,
  meId,
  today,
  nowTime,
  currency,
  initial,
  onSaved,
  autoFocusAmount,
}: Props) {
  const editing = Boolean(initial?.id);
  const [pending, startTransition] = useTransition();
  const [showMore, setShowMore] = useState(Boolean(initial?.merchant || initial?.notes || initial?.isRefund));

  const form = useForm<TransactionInput>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      kind: "expense",
      amount: "",
      description: "",
      accountId: accounts[0]?.id ?? "",
      toAccountId: "",
      categoryId: "",
      date: today,
      time: nowTime,
      paymentMethod: suggestedPaymentMethod(accounts[0]?.type),
      personUserId: meId,
      merchant: "",
      notes: "",
      isRefund: false,
      ...initial,
    },
  });
  const { register, control, handleSubmit, setValue, formState, setError, getFieldState } = form;
  const kind = useWatch({ control, name: "kind" });
  const accountId = useWatch({ control, name: "accountId" });

  // Restore the last-used account for this kind on new entries.
  useEffect(() => {
    if (editing) return;
    const last = readLastAccount(kind);
    if (last && accounts.some((a) => a.id === last)) setValue("accountId", last);
  }, [kind, editing, accounts, setValue]);

  // Suggest a payment method from the account type unless the user chose one.
  useEffect(() => {
    if (kind !== "expense" || getFieldState("paymentMethod").isDirty) return;
    const type = accounts.find((a) => a.id === accountId)?.type;
    setValue("paymentMethod", suggestedPaymentMethod(type));
  }, [accountId, kind, accounts, setValue, getFieldState]);

  const categoryGroups = useMemo(() => {
    const ofKind = categories.filter((c) => c.kind === (kind === "income" ? "income" : "expense") && !c.is_archived);
    const parents = ofKind.filter((c) => !c.parent_id);
    return parents.map((p) => ({ parent: p, children: ofKind.filter((c) => c.parent_id === p.id) }));
  }, [categories, kind]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await saveTransaction(values);
      if (!result.ok) {
        if (result.fieldErrors) {
          for (const [name, message] of Object.entries(result.fieldErrors)) {
            setError(name as keyof TransactionInput, { message });
          }
        }
        toast.error(result.error);
        return;
      }
      rememberAccount(values.kind, values.accountId);
      toast.success(result.message ?? "Saved");
      if (!editing) {
        form.reset({
          ...values,
          amount: "",
          description: "",
          merchant: "",
          notes: "",
          isRefund: false,
          time: nowTime,
        });
      }
      onSaved?.(result.data.id);
    });
  });

  const err = formState.errors;
  const accountLabel = kind === "income" ? "Deposited to" : kind === "transfer" ? "From account" : "Paid from";
  const personLabel = kind === "income" ? "Earned by" : kind === "transfer" ? "Made by" : "Paid by";

  if (accounts.length === 0) {
    return (
      <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
        Add an account first (Finances → Accounts) so transactions have somewhere to go.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Controller
        control={control}
        name="kind"
        render={({ field }) => (
          <div role="radiogroup" aria-label="Transaction type" className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                role="radio"
                aria-checked={field.value === k.value}
                onClick={() => {
                  if (field.value !== k.value) setValue("categoryId", "");
                  field.onChange(k.value);
                }}
                className={cn(
                  "h-10 rounded-lg text-sm font-medium transition-all",
                  field.value === k.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {k.label}
              </button>
            ))}
          </div>
        )}
      />

      <FieldGroup className="gap-4">
        <Field data-invalid={Boolean(err.amount)}>
          <FieldLabel htmlFor="tx-amount">Amount</FieldLabel>
          <InputGroup className="h-16 rounded-2xl">
            <InputGroupAddon>
              <InputGroupText className="text-lg">{currencySymbol(currency)}</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              id="tx-amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              autoFocus={autoFocusAmount}
              className="tabular text-3xl font-semibold md:text-3xl"
              aria-invalid={Boolean(err.amount)}
              {...register("amount")}
            />
          </InputGroup>
          <FieldError>{err.amount?.message}</FieldError>
        </Field>

        <Field data-invalid={Boolean(err.description)}>
          <FieldLabel htmlFor="tx-description">Description</FieldLabel>
          <Input
            id="tx-description"
            placeholder={kind === "income" ? "e.g. October salary" : kind === "transfer" ? "e.g. Pay credit card" : "e.g. Groceries at Massy"}
            autoComplete="off"
            aria-invalid={Boolean(err.description)}
            {...register("description")}
          />
          <FieldError>{err.description?.message}</FieldError>
        </Field>

        {kind !== "transfer" ? (
          <Field data-invalid={Boolean(err.categoryId)}>
            <FieldLabel htmlFor="tx-category">Category</FieldLabel>
            <NativeSelect id="tx-category" aria-invalid={Boolean(err.categoryId)} {...register("categoryId")}>
              <option value="">Choose a category…</option>
              {categoryGroups.map(({ parent, children }) =>
                children.length ? (
                  <optgroup key={parent.id} label={parent.name}>
                    <option value={parent.id}>{parent.name} (general)</option>
                    {children.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                ) : (
                  <option key={parent.id} value={parent.id}>
                    {parent.name}
                  </option>
                ),
              )}
            </NativeSelect>
            <FieldError>{err.categoryId?.message}</FieldError>
          </Field>
        ) : null}

        <div className={cn("grid gap-4", kind === "transfer" && "sm:grid-cols-2")}>
          <Field data-invalid={Boolean(err.accountId)}>
            <FieldLabel htmlFor="tx-account">{accountLabel}</FieldLabel>
            <NativeSelect id="tx-account" {...register("accountId")}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
            <FieldError>{err.accountId?.message}</FieldError>
          </Field>
          {kind === "transfer" ? (
            <Field data-invalid={Boolean(err.toAccountId)}>
              <FieldLabel htmlFor="tx-to-account">To account</FieldLabel>
              <NativeSelect id="tx-to-account" aria-invalid={Boolean(err.toAccountId)} {...register("toAccountId")}>
                <option value="">Choose…</option>
                {accounts
                  .filter((a) => a.id !== accountId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </NativeSelect>
              <FieldError>{err.toAccountId?.message}</FieldError>
            </Field>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field data-invalid={Boolean(err.date)}>
            <FieldLabel htmlFor="tx-date">Date</FieldLabel>
            <Input id="tx-date" type="date" max="2100-12-31" {...register("date")} />
            <FieldError>{err.date?.message}</FieldError>
          </Field>
          <Field data-invalid={Boolean(err.time)}>
            <FieldLabel htmlFor="tx-time">Time</FieldLabel>
            <Input id="tx-time" type="time" {...register("time")} />
            <FieldError>{err.time?.message}</FieldError>
          </Field>
        </div>

        {members.length > 1 ? (
          <Controller
            control={control}
            name="personUserId"
            render={({ field }) => (
              <Field>
                <FieldLabel id="tx-person-label">{personLabel}</FieldLabel>
                <div role="radiogroup" aria-labelledby="tx-person-label" className="flex flex-wrap gap-2">
                  {members.map((m) => (
                    <button
                      key={m.user_id}
                      type="button"
                      role="radio"
                      aria-checked={field.value === m.user_id}
                      onClick={() => field.onChange(m.user_id)}
                      className={cn(
                        "h-10 rounded-full border px-4 text-sm font-medium transition-colors",
                        field.value === m.user_id
                          ? "border-primary bg-accent text-accent-foreground"
                          : "bg-card text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {m.display_name}
                    </button>
                  ))}
                </div>
              </Field>
            )}
          />
        ) : null}

        {kind === "expense" ? (
          <Field>
            <FieldLabel htmlFor="tx-method">Payment method</FieldLabel>
            <NativeSelect id="tx-method" {...register("paymentMethod")}>
              <option value="">Not specified</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : null}

        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={showMore}
          className="flex w-fit items-center gap-1 text-sm font-medium text-primary"
        >
          <ChevronDownIcon className={cn("size-4 transition-transform", showMore && "rotate-180")} aria-hidden />
          {showMore ? "Fewer details" : "More details"}
        </button>

        {showMore ? (
          <div className="space-y-4">
            {kind !== "transfer" ? (
              <Field data-invalid={Boolean(err.merchant)}>
                <FieldLabel htmlFor="tx-merchant">{kind === "income" ? "Payer" : "Merchant"} (optional)</FieldLabel>
                <Input id="tx-merchant" autoComplete="off" {...register("merchant")} />
                <FieldError>{err.merchant?.message}</FieldError>
              </Field>
            ) : null}
            <Field data-invalid={Boolean(err.notes)}>
              <FieldLabel htmlFor="tx-notes">Notes (optional)</FieldLabel>
              <Textarea id="tx-notes" rows={3} {...register("notes")} />
              <FieldError>{err.notes?.message}</FieldError>
            </Field>
            {kind === "expense" ? (
              <Controller
                control={control}
                name="isRefund"
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <Checkbox id="tx-refund" checked={Boolean(field.value)} onCheckedChange={(v) => field.onChange(v === true)} />
                    <FieldLabel htmlFor="tx-refund" className="font-normal">
                      This is a refund (money back into the account)
                    </FieldLabel>
                  </Field>
                )}
              />
            ) : null}
          </div>
        ) : null}
      </FieldGroup>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : null}
        {editing ? "Save changes" : `Save ${kind}`}
      </Button>
    </form>
  );
}
