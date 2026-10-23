"use client";

import { useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import type { CalendarDate } from "@/lib/dates";
import { logWeight } from "../actions/tracking";
import { displayWeight, weightUnit } from "../calc/units";
import { weighInSchema, type WeighInInput } from "../schemas";
import type { Units } from "../types";
import { report } from "./celebrate";

export function WeighInForm({
  date,
  today,
  units,
  lastKg,
  compact = false,
  onDone,
}: {
  date: CalendarDate;
  today: CalendarDate;
  units: Units;
  lastKg: number | null;
  compact?: boolean;
  onDone?: () => void;
}) {
  const [pending, start] = useTransition();
  const form = useForm<WeighInInput>({
    resolver: zodResolver(weighInSchema),
    defaultValues: { onDate: date, weight: "", units, note: "" },
  });
  const err = form.formState.errors;
  const unit = weightUnit(units);
  const placeholder = lastKg ? String(displayWeight(lastKg, units)) : undefined;

  return (
    <form
      noValidate
      className={cn(compact ? "flex items-start gap-2" : "space-y-4")}
      onSubmit={form.handleSubmit((v) =>
        start(async () => {
          const r = await logWeight(v);
          if (!r.ok) for (const [k, m] of Object.entries(r.fieldErrors ?? {})) form.setError(k as keyof WeighInInput, { message: m });
          if (report(r)) {
            form.reset({ onDate: v.onDate, weight: "", units, note: "" });
            onDone?.();
          }
        }),
      )}
    >
      <Field data-invalid={Boolean(err.weight)} className={compact ? "flex-1" : undefined}>
        <FieldLabel htmlFor={compact ? "wi-weight-c" : "wi-weight"} className={compact ? "sr-only" : undefined}>
          Weight
        </FieldLabel>
        <InputGroup>
          <InputGroupInput id={compact ? "wi-weight-c" : "wi-weight"} inputMode="decimal" placeholder={placeholder} {...form.register("weight")} />
          <InputGroupAddon align="inline-end">
            <InputGroupText>{unit}</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
        <FieldError>{err.weight?.message}</FieldError>
      </Field>
      {!compact ? (
        <div className="grid grid-cols-2 gap-3">
          <Field data-invalid={Boolean(err.onDate)}>
            <FieldLabel htmlFor="wi-date">Date</FieldLabel>
            <Input id="wi-date" type="date" max={today} {...form.register("onDate")} />
            <FieldError>{err.onDate?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="wi-note">Note</FieldLabel>
            <Input id="wi-note" placeholder="Optional" maxLength={200} {...form.register("note")} />
          </Field>
        </div>
      ) : null}
      <Button type="submit" size={compact ? "default" : "lg"} className={compact ? undefined : "w-full"} disabled={pending}>
        {pending ? <Spinner /> : null}
        {compact ? "Save" : "Log weight"}
      </Button>
    </form>
  );
}
