"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { PencilIcon, PlusIcon, ScaleIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ModalButton } from "@/components/shared/modal-button";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { formatMoney, currencySymbol } from "@/lib/money";
import { reconcileAccount } from "../actions";
import { reconcileSchema, type AccountInput, type ReconcileInput } from "../schemas";
import { AccountForm } from "./account-form";
import type { MemberOption } from "./transaction-form";

export function AddAccountButton({ members, currency, today }: { members: MemberOption[]; currency: string; today: string }) {
  const router = useRouter();
  return (
    <ModalButton
      title="Add account"
      description="Track a bank account, cash, card or loan. Balances come from the transactions you record."
      label={
        <>
          <PlusIcon data-icon="inline-start" /> Add
        </>
      }
    >
      {(close) => (
        <AccountForm
          members={members}
          currency={currency}
          today={today}
          onSaved={(id) => {
            close();
            router.push(`/finances/accounts/${id}`);
          }}
        />
      )}
    </ModalButton>
  );
}

export function EditAccountButton({
  initial,
  members,
  currency,
  today,
}: {
  initial: Partial<AccountInput>;
  members: MemberOption[];
  currency: string;
  today: string;
}) {
  return (
    <ModalButton
      title="Edit account"
      variant="outline"
      label={
        <>
          <PencilIcon data-icon="inline-start" /> Edit
        </>
      }
    >
      {(close) => <AccountForm initial={initial} members={members} currency={currency} today={today} onSaved={close} />}
    </ModalButton>
  );
}

function ReconcileForm({
  accountId,
  liability,
  currentMinor,
  currency,
  today,
  onDone,
}: {
  accountId: string;
  liability: boolean;
  currentMinor: number;
  currency: string;
  today: string;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const form = useForm<ReconcileInput>({
    resolver: zodResolver(reconcileSchema),
    defaultValues: { accountId, statementBalance: "", statementDate: today, enteredAsOwed: liability },
  });
  const err = form.formState.errors;
  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={form.handleSubmit((values) =>
        start(async () => {
          const result = await reconcileAccount(values);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          const diff = result.data.difference;
          toast.success(result.message, {
            description: diff !== 0 ? `Adjustment of ${formatMoney(diff, { currency, signDisplay: "always" })} recorded.` : undefined,
          });
          onDone();
        }),
      )}
    >
      <p className="text-sm text-muted-foreground">
        Enter the balance shown on your bank statement or app. If it differs from the{" "}
        <span className="font-medium text-foreground">{formatMoney(currentMinor, { currency })}</span> recorded here, an
        adjustment is posted for the difference and everything up to that date is marked reconciled.
      </p>
      <FieldGroup className="gap-4">
        <Field data-invalid={Boolean(err.statementBalance)}>
          <FieldLabel htmlFor="rec-balance">{liability ? "Amount owed on statement" : "Statement balance"}</FieldLabel>
          <InputGroup>
            <InputGroupAddon>
              <InputGroupText>{currencySymbol(currency)}</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput id="rec-balance" inputMode="decimal" className="tabular" {...form.register("statementBalance")} />
          </InputGroup>
          {liability ? <FieldDescription>Enter the amount you owe as a positive number.</FieldDescription> : null}
          <FieldError>{err.statementBalance?.message}</FieldError>
        </Field>
        <Field data-invalid={Boolean(err.statementDate)}>
          <FieldLabel htmlFor="rec-date">Statement date</FieldLabel>
          <Input id="rec-date" type="date" {...form.register("statementDate")} />
          <FieldError>{err.statementDate?.message}</FieldError>
        </Field>
      </FieldGroup>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : null}
        Reconcile
      </Button>
    </form>
  );
}

export function ReconcileButton(props: {
  accountId: string;
  liability: boolean;
  currentMinor: number;
  currency: string;
  today: string;
}) {
  return (
    <ModalButton
      title="Reconcile with statement"
      variant="outline"
      label={
        <>
          <ScaleIcon data-icon="inline-start" /> Reconcile
        </>
      }
    >
      {(close) => <ReconcileForm {...props} onDone={close} />}
    </ModalButton>
  );
}
