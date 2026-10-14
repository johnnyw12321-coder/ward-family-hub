"use client";

import { useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { HandCoinsIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ModalButton } from "@/components/shared/modal-button";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { currencySymbol, minorToInput } from "@/lib/money";
import { recordDebtPayment } from "../actions";
import { debtPaymentSchema, type DebtPaymentInput } from "../schemas";

type Props = {
  debt: { id: string; name: string };
  fromAccounts: { id: string; name: string }[];
  today: string;
  currency: string;
  suggestedPayment: number | null;
};

function DebtPaymentForm({ debt, fromAccounts, today, currency, suggestedPayment, onDone }: Props & { onDone: () => void }) {
  const [pending, start] = useTransition();
  const form = useForm<DebtPaymentInput>({
    resolver: zodResolver(debtPaymentSchema),
    defaultValues: {
      fromAccountId: fromAccounts[0]?.id ?? "",
      debtAccountId: debt.id,
      principal: suggestedPayment ? minorToInput(suggestedPayment) : "",
      interest: "",
      date: today,
      description: `${debt.name} payment`,
    },
  });
  const err = form.formState.errors;
  const symbol = currencySymbol(currency);
  if (!fromAccounts.length) {
    return <p className="text-sm text-muted-foreground">Add a chequing or cash account to pay from first.</p>;
  }
  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={form.handleSubmit((values) =>
        start(async () => {
          const result = await recordDebtPayment(values);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(result.message);
          onDone();
        }),
      )}
    >
      <p className="text-sm text-muted-foreground">
        Your statement usually shows how much of a payment went to interest. Principal reduces what you owe and is a
        transfer, not spending. Interest is recorded as spending under Debt Interest.
      </p>
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="dp-from">Paid from</FieldLabel>
          <NativeSelect id="dp-from" {...form.register("fromAccountId")}>
            {fromAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field data-invalid={Boolean(err.principal)}>
            <FieldLabel htmlFor="dp-principal">Principal</FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <InputGroupText>{symbol}</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput id="dp-principal" inputMode="decimal" className="tabular" {...form.register("principal")} />
            </InputGroup>
            <FieldError>{err.principal?.message}</FieldError>
          </Field>
          <Field data-invalid={Boolean(err.interest)}>
            <FieldLabel htmlFor="dp-interest">Interest</FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <InputGroupText>{symbol}</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput id="dp-interest" inputMode="decimal" placeholder="0.00" className="tabular" {...form.register("interest")} />
            </InputGroup>
            <FieldError>{err.interest?.message}</FieldError>
          </Field>
        </div>
        <FieldDescription>Only know the total? Enter it all as principal and adjust later.</FieldDescription>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="dp-date">Date</FieldLabel>
            <Input id="dp-date" type="date" {...form.register("date")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="dp-desc">Description</FieldLabel>
            <Input id="dp-desc" {...form.register("description")} />
          </Field>
        </div>
      </FieldGroup>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : null}
        Record payment
      </Button>
    </form>
  );
}

export function DebtPaymentButton(props: Props) {
  return (
    <ModalButton
      title={`Pay ${props.debt.name}`}
      variant="outline"
      label={
        <>
          <HandCoinsIcon data-icon="inline-start" /> Record payment
        </>
      }
    >
      {(close) => <DebtPaymentForm {...props} onDone={close} />}
    </ModalButton>
  );
}
