"use client";

import { useState, useTransition } from "react";
import { BellIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { saveReminders, saveWaterGoal } from "../actions/data";
import { mlToFlOz, volumeUnit } from "../calc/units";
import type { Reminders, Units } from "../types";

export function WaterGoalForm({ goalMl, units }: { goalMl: number; units: Units }) {
  const [value, setValue] = useState(String(units === "imperial" ? Math.round(mlToFlOz(goalMl)) : goalMl));
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <form
      noValidate
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveWaterGoal({ goal: value.trim(), units });
          setError(r.ok ? undefined : r.fieldErrors?.goal ?? r.error);
          if (r.ok) toast.success(r.message);
          else toast.error(r.error);
        });
      }}
    >
      <Field data-invalid={Boolean(error)} className="flex-1">
        <FieldLabel htmlFor="water-goal">Daily water goal</FieldLabel>
        <InputGroup>
          <InputGroupInput id="water-goal" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} />
          <InputGroupAddon align="inline-end">
            <InputGroupText>{volumeUnit(units)}</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
        <FieldError>{error}</FieldError>
      </Field>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? <Spinner /> : null}
        Save
      </Button>
    </form>
  );
}

const REMINDERS: { key: keyof Reminders; label: string; hint: string }[] = [
  { key: "weighIn", label: "Morning weigh-in", hint: "If you haven't weighed in today" },
  { key: "logMeals", label: "Log your meals", hint: "If nothing's logged by the evening" },
  { key: "workouts", label: "Workout days", hint: "On days your program has a session" },
  { key: "water", label: "Drink water", hint: "If you're behind on your water goal" },
];

export function RemindersForm({ initial }: { initial: Reminders }) {
  const [values, setValues] = useState<Required<Reminders>>({
    weighIn: Boolean(initial.weighIn),
    logMeals: Boolean(initial.logMeals),
    workouts: Boolean(initial.workouts),
    water: Boolean(initial.water),
  });
  const [pending, start] = useTransition();
  const toggle = (key: keyof Reminders, on: boolean) => {
    const next = { ...values, [key]: on };
    setValues(next);
    start(async () => {
      const r = await saveReminders(next);
      if (!r.ok) {
        toast.error(r.error);
        setValues(values);
      }
    });
  };
  return (
    <div>
      <ul className="divide-y">
        {REMINDERS.map((r) => (
          <li key={r.key} className="flex min-h-14 items-center gap-3 py-2">
            <label htmlFor={`rem-${r.key}`} className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{r.label}</span>
              <span className="block text-xs text-muted-foreground">{r.hint}</span>
            </label>
            <Switch id={`rem-${r.key}`} checked={values[r.key]} onCheckedChange={(on) => toggle(r.key, on)} disabled={pending} />
          </li>
        ))}
      </ul>
      <p className="mt-2 flex gap-2 text-xs text-muted-foreground">
        <BellIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Reminders appear at the top of your Ward Health dashboard when they&apos;re due.
      </p>
    </div>
  );
}
