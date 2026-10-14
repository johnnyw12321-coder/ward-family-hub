"use client";

import { useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, isLiability } from "@/lib/finance/calculations";
import { currencySymbol } from "@/lib/money";
import { saveAccount } from "../actions";
import { accountSchema, type AccountInput } from "../schemas";
import type { MemberOption } from "./transaction-form";

export function AccountForm({
  initial,
  members,
  currency,
  today,
  onSaved,
}: {
  initial?: Partial<AccountInput>;
  members: MemberOption[];
  currency: string;
  today: string;
  onSaved?: (id: string) => void;
}) {
  const editing = Boolean(initial?.id);
  const [pending, start] = useTransition();
  const form = useForm<AccountInput>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: "",
      type: "chequing",
      institution: "",
      last4: "",
      ownerScope: "shared",
      ownerUserId: "",
      openingBalance: "",
      openingDate: today,
      creditLimit: "",
      interestRate: "",
      minimumPayment: "",
      paymentDueDay: "",
      includeInNetWorth: true,
      notes: "",
      ...initial,
    },
  });
  const { register, control, handleSubmit, formState, setError } = form;
  const type = useWatch({ control, name: "type" });
  const scope = useWatch({ control, name: "ownerScope" });
  const liability = isLiability(type);
  const err = formState.errors;
  const symbol = currencySymbol(currency);

  const submit = handleSubmit((values) =>
    start(async () => {
      const result = await saveAccount(values);
      if (!result.ok) {
        for (const [k, m] of Object.entries(result.fieldErrors ?? {})) setError(k as keyof AccountInput, { message: m });
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Saved");
      onSaved?.(result.data.id);
    }),
  );

  const money = (name: "openingBalance" | "creditLimit" | "minimumPayment", label: string, description?: string) => (
    <Field data-invalid={Boolean(err[name])}>
      <FieldLabel htmlFor={`acc-${name}`}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupAddon>
          <InputGroupText>{symbol}</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput id={`acc-${name}`} inputMode="decimal" placeholder="0.00" className="tabular" {...register(name)} />
      </InputGroup>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError>{err[name]?.message}</FieldError>
    </Field>
  );

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <FieldGroup className="gap-4">
        <Field data-invalid={Boolean(err.name)}>
          <FieldLabel htmlFor="acc-name">Account name</FieldLabel>
          <Input id="acc-name" placeholder="e.g. Republic Bank Chequing" {...register("name")} />
          <FieldError>{err.name?.message}</FieldError>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="acc-type">Type</FieldLabel>
            <NativeSelect id="acc-type" {...register("type")}>
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACCOUNT_TYPE_LABELS[t]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field data-invalid={Boolean(err.last4)}>
            <FieldLabel htmlFor="acc-last4">Last 4 digits</FieldLabel>
            <Input id="acc-last4" inputMode="numeric" maxLength={4} placeholder="Optional" {...register("last4")} />
            <FieldError>{err.last4?.message}</FieldError>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="acc-institution">Bank or provider</FieldLabel>
          <Input id="acc-institution" placeholder="e.g. Republic, RBC, First Citizens, Scotiabank" {...register("institution")} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="acc-scope">Belongs to</FieldLabel>
            <NativeSelect id="acc-scope" {...register("ownerScope")}>
              <option value="shared">Shared</option>
              <option value="personal">One person</option>
            </NativeSelect>
          </Field>
          {scope === "personal" ? (
            <Field data-invalid={Boolean(err.ownerUserId)}>
              <FieldLabel htmlFor="acc-owner">Whose?</FieldLabel>
              <NativeSelect id="acc-owner" {...register("ownerUserId")}>
                <option value="">Choose…</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.display_name}
                  </option>
                ))}
              </NativeSelect>
              <FieldError>{err.ownerUserId?.message}</FieldError>
            </Field>
          ) : null}
        </div>

        {!editing ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {money(
              "openingBalance",
              liability ? "Amount owed today" : "Current balance",
              liability ? "What you owe right now. Enter 0 if paid off." : "Use a minus sign if overdrawn.",
            )}
            <Field>
              <FieldLabel htmlFor="acc-opening-date">As of</FieldLabel>
              <Input id="acc-opening-date" type="date" {...register("openingDate")} />
            </Field>
          </div>
        ) : null}

        {type === "credit_card" || type === "line_of_credit" ? money("creditLimit", "Credit limit") : null}

        {liability || type === "savings" ? (
          <Field data-invalid={Boolean(err.interestRate)}>
            <FieldLabel htmlFor="acc-rate">{liability ? "Interest rate (APR %)" : "Interest rate (% per year)"}</FieldLabel>
            <Input id="acc-rate" inputMode="decimal" placeholder="e.g. 7.25" {...register("interestRate")} />
            <FieldError>{err.interestRate?.message}</FieldError>
          </Field>
        ) : null}

        {liability ? (
          <div className="grid grid-cols-2 gap-3">
            {money("minimumPayment", "Monthly payment")}
            <Field data-invalid={Boolean(err.paymentDueDay)}>
              <FieldLabel htmlFor="acc-due">Due day of month</FieldLabel>
              <Input id="acc-due" inputMode="numeric" placeholder="1–31" {...register("paymentDueDay")} />
              <FieldError>{err.paymentDueDay?.message}</FieldError>
            </Field>
          </div>
        ) : null}

        <Controller
          control={control}
          name="includeInNetWorth"
          render={({ field }) => (
            <Field orientation="horizontal" className="justify-between rounded-xl bg-muted/60 p-3">
              <FieldLabel htmlFor="acc-networth" className="font-normal">
                Include in net worth
              </FieldLabel>
              <Switch id="acc-networth" checked={field.value} onCheckedChange={field.onChange} />
            </Field>
          )}
        />

        <Field>
          <FieldLabel htmlFor="acc-notes">Notes</FieldLabel>
          <Textarea id="acc-notes" rows={2} placeholder="Never store passwords or PINs here." {...register("notes")} />
        </Field>
      </FieldGroup>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : null}
        {editing ? "Save changes" : "Add account"}
      </Button>
    </form>
  );
}
