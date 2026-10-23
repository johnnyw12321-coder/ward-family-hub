"use client";

import { useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import type { CalendarDate } from "@/lib/dates";
import { saveMeasurements } from "../actions/tracking";
import { displayLength, lengthUnit } from "../calc/units";
import { measurementSchema, type MeasurementInput } from "../schemas";
import { MEASUREMENT_FIELDS } from "../measurements";
import type { Measurement, Units } from "../types";
import { report } from "./celebrate";

export function MeasurementForm({ today, units, last, onDone }: { today: CalendarDate; units: Units; last: Measurement | null; onDone?: () => void }) {
  const [pending, start] = useTransition();
  const form = useForm<MeasurementInput>({
    resolver: zodResolver(measurementSchema),
    defaultValues: { onDate: today, units, waist: "", chest: "", hips: "", arm: "", thigh: "" },
  });
  const err = form.formState.errors;
  const unit = lengthUnit(units);
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit((v) =>
        start(async () => {
          const r = await saveMeasurements(v);
          if (!r.ok) for (const [k, m] of Object.entries(r.fieldErrors ?? {})) form.setError(k as keyof MeasurementInput, { message: m });
          if (report(r)) {
            form.reset({ onDate: v.onDate, units, waist: "", chest: "", hips: "", arm: "", thigh: "" });
            onDone?.();
          }
        }),
      )}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {MEASUREMENT_FIELDS.map((f) => {
          const prev = last?.[f.key];
          return (
            <Field key={f.input} data-invalid={Boolean(err[f.input])}>
              <FieldLabel htmlFor={`m-${f.input}`}>{f.label}</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id={`m-${f.input}`}
                  inputMode="decimal"
                  placeholder={prev ? String(displayLength(prev, units)) : f.hint}
                  aria-describedby={`m-${f.input}-hint`}
                  {...form.register(f.input)}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>{unit}</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <span id={`m-${f.input}-hint`} className="sr-only">
                {f.hint}
              </span>
              <FieldError>{err[f.input]?.message}</FieldError>
            </Field>
          );
        })}
        <Field data-invalid={Boolean(err.onDate)}>
          <FieldLabel htmlFor="m-date">Date</FieldLabel>
          <Input id="m-date" type="date" max={today} {...form.register("onDate")} />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">Fill in any you like; placeholders show your last measurements.</p>
      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending}>
        {pending ? <Spinner /> : null}
        Save measurements
      </Button>
    </form>
  );
}
