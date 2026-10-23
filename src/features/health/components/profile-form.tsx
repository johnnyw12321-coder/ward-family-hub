"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArmchairIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BikeIcon,
  DumbbellIcon,
  FlameIcon,
  FootprintsIcon,
  MountainIcon,
  ScaleIcon,
  TrendingUpIcon,
  ZapIcon,
} from "lucide-react";
import { Controller, useForm, useWatch, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import type { CalendarDate } from "@/lib/dates";
import { saveHealthProfile } from "../actions/profile";
import { ACTIVITY_LABELS, energyPlan, GOAL_LABELS } from "../calc/energy";
import { cmToFeetInches, displayLength, displayWeight, weightUnit } from "../calc/units";
import { heightToCm, profileChoices, profileSchema, weightToKg, type ProfileInput } from "../schemas";
import { ACTIVITY_LEVELS, GOALS, type HealthProfile, type Units } from "../types";
import { ChoiceCards, Segmented } from "./choice-cards";
import { MedicalNote, PlanSummary } from "./plan-summary";

const ACTIVITY_ICONS = {
  sedentary: <ArmchairIcon className="size-5" />,
  light: <FootprintsIcon className="size-5" />,
  moderate: <BikeIcon className="size-5" />,
  active: <ZapIcon className="size-5" />,
  very_active: <MountainIcon className="size-5" />,
};
const GOAL_ICONS = {
  lose_fat: <FlameIcon className="size-5" />,
  build_muscle: <DumbbellIcon className="size-5" />,
  gain_weight: <TrendingUpIcon className="size-5" />,
  maintain: <ScaleIcon className="size-5" />,
};

function initialValues(profile: HealthProfile | null, currentWeightKg: number | null): ProfileInput {
  const units: Units = profile?.units ?? "metric";
  const ftIn = profile ? cmToFeetInches(profile.heightCm) : null;
  return {
    units,
    sex: profile?.sex ?? "",
    age: profile ? String(profile.ageYears) : "",
    heightCm: profile ? String(profile.heightCm) : "",
    heightFt: ftIn ? String(ftIn.feet) : "",
    heightIn: ftIn ? String(ftIn.inches) : "",
    weight: currentWeightKg ? String(displayWeight(currentWeightKg, units)) : "",
    activityLevel: profile?.activityLevel ?? "",
    goal: profile?.goal ?? "",
    targetWeight: profile?.targetWeightKg ? String(displayWeight(profile.targetWeightKg, units)) : "",
    targetDate: profile?.targetDate ?? "",
  };
}

const STEPS: { title: string; description: string; fields: FieldPath<ProfileInput>[] }[] = [
  { title: "About you", description: "Used to estimate how much energy your body uses.", fields: ["units", "sex", "age", "heightCm", "heightFt", "heightIn", "weight"] },
  { title: "How active are you?", description: "Think about a typical week, including work.", fields: ["activityLevel"] },
  { title: "What's your goal?", description: "You can change this any time.", fields: ["goal", "targetWeight", "targetDate"] },
  { title: "Your plan", description: "Here's where your numbers land.", fields: [] },
];

export function ProfileForm({
  profile,
  currentWeightKg,
  today,
}: {
  /** null = onboarding (a step-by-step wizard); otherwise editing. */
  profile: HealthProfile | null;
  currentWeightKg: number | null;
  today: CalendarDate;
}) {
  const onboarding = !profile;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [step, setStep] = useState(0);
  const schema = useMemo(() => profileSchema({ today, requireWeight: onboarding }), [today, onboarding]);
  const form = useForm<ProfileInput>({ resolver: zodResolver(schema), defaultValues: initialValues(profile, currentWeightKg), mode: "onTouched" });
  const { register, control, formState, setValue } = form;
  const err = formState.errors;
  const values = useWatch({ control }) as ProfileInput;
  const units = values.units;

  // Live preview: recalculated as the person types.
  const plan = useMemo(() => {
    const heightCm = heightToCm(values);
    const weightKg = onboarding ? weightToKg(values.weight, units) : currentWeightKg;
    const age = Number(values.age);
    if (!heightCm || !weightKg || !age || !values.sex || !values.activityLevel || !values.goal) return null;
    const { sex, activityLevel, goal } = profileChoices(values);
    return energyPlan({
      sex,
      ageYears: age,
      heightCm,
      activityLevel,
      goal,
      currentWeightKg: weightKg,
      targetWeightKg: values.goal === "maintain" ? null : weightToKg(values.targetWeight, units),
      targetDate: values.goal === "maintain" || !values.targetDate ? null : values.targetDate,
      today,
    });
  }, [values, units, onboarding, currentWeightKg, today]);

  const switchUnits = (next: Units) => {
    if (next === units) return;
    // Convert what's already typed so nothing has to be re-entered.
    const kg = weightToKg(values.weight, units);
    const target = weightToKg(values.targetWeight, units);
    const cm = heightToCm(values);
    setValue("units", next);
    if (kg) setValue("weight", String(displayWeight(kg, next)));
    if (target) setValue("targetWeight", String(displayWeight(target, next)));
    if (cm) {
      const ftIn = cmToFeetInches(cm);
      setValue("heightCm", String(Math.round(displayLength(cm, "metric"))));
      setValue("heightFt", String(ftIn.feet));
      setValue("heightIn", String(ftIn.inches));
    }
  };

  const submit = form.handleSubmit((v) =>
    start(async () => {
      const r = await saveHealthProfile(v);
      if (!r.ok) {
        for (const [k, m] of Object.entries(r.fieldErrors ?? {})) form.setError(k as FieldPath<ProfileInput>, { message: m });
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      if (r.data.created) router.push("/health");
    }),
  );

  const top = useRef<HTMLDivElement>(null);
  const goTo = (s: number) => {
    setStep(s);
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const next = async () => {
    const valid = await form.trigger(STEPS[step].fields);
    if (valid) goTo(Math.min(STEPS.length - 1, step + 1));
  };

  const unit = weightUnit(units);
  const show = (i: number) => !onboarding || step === i;

  const sections = (
    <>
      {show(0) ? (
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel>Units</FieldLabel>
            <Segmented
              label="Units"
              value={units}
              onChange={switchUnits}
              options={[
                { value: "metric", label: "kg · cm" },
                { value: "imperial", label: "lb · ft" },
              ]}
            />
          </Field>
          <Controller
            control={control}
            name="sex"
            render={({ field }) => (
              <Field data-invalid={Boolean(err.sex)}>
                <FieldLabel>Sex</FieldLabel>
                <ChoiceCards
                  label="Sex"
                  columns={3}
                  value={field.value || undefined}
                  onChange={field.onChange}
                  invalid={Boolean(err.sex)}
                  choices={[
                    { value: "female", label: "Female" },
                    { value: "male", label: "Male" },
                    { value: "unspecified", label: "Prefer not to say" },
                  ]}
                />
                <FieldDescription>Only used in the calorie formula.</FieldDescription>
                <FieldError>{err.sex ? "Choose one" : null}</FieldError>
              </Field>
            )}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field data-invalid={Boolean(err.age)}>
              <FieldLabel htmlFor="hp-age">Age</FieldLabel>
              <InputGroup>
                <InputGroupInput id="hp-age" inputMode="numeric" autoComplete="off" {...register("age")} />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>years</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <FieldError>{err.age?.message}</FieldError>
            </Field>
            {units === "metric" ? (
              <Field data-invalid={Boolean(err.heightCm)}>
                <FieldLabel htmlFor="hp-height">Height</FieldLabel>
                <InputGroup>
                  <InputGroupInput id="hp-height" inputMode="decimal" {...register("heightCm")} />
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>cm</InputGroupText>
                  </InputGroupAddon>
                </InputGroup>
                <FieldError>{err.heightCm?.message}</FieldError>
              </Field>
            ) : (
              <Field data-invalid={Boolean(err.heightFt)}>
                <FieldLabel htmlFor="hp-ft">Height</FieldLabel>
                <div className="flex gap-2">
                  <InputGroup>
                    <InputGroupInput id="hp-ft" inputMode="numeric" aria-label="Feet" {...register("heightFt")} />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText>ft</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                  <InputGroup>
                    <InputGroupInput inputMode="numeric" aria-label="Inches" {...register("heightIn")} />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText>in</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                </div>
                <FieldError>{err.heightFt?.message}</FieldError>
              </Field>
            )}
          </div>
          {onboarding ? (
            <Field data-invalid={Boolean(err.weight)}>
              <FieldLabel htmlFor="hp-weight">Current weight</FieldLabel>
              <InputGroup>
                <InputGroupInput id="hp-weight" inputMode="decimal" {...register("weight")} />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>{unit}</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription>Saved as today&apos;s weigh-in.</FieldDescription>
              <FieldError>{err.weight?.message}</FieldError>
            </Field>
          ) : null}
        </FieldGroup>
      ) : null}

      {show(1) ? (
        <Controller
          control={control}
          name="activityLevel"
          render={({ field }) => (
            <Field data-invalid={Boolean(err.activityLevel)}>
              {!onboarding ? <FieldLabel>Activity level</FieldLabel> : null}
              <ChoiceCards
                label="Activity level"
                value={field.value || undefined}
                onChange={field.onChange}
                invalid={Boolean(err.activityLevel)}
                choices={ACTIVITY_LEVELS.map((a) => ({ value: a, ...ACTIVITY_LABELS[a], icon: ACTIVITY_ICONS[a] }))}
              />
              <FieldError>{err.activityLevel ? "Choose the closest match" : null}</FieldError>
            </Field>
          )}
        />
      ) : null}

      {show(2) ? (
        <FieldGroup className="gap-4">
          <Controller
            control={control}
            name="goal"
            render={({ field }) => (
              <Field data-invalid={Boolean(err.goal)}>
                {!onboarding ? <FieldLabel>Goal</FieldLabel> : null}
                <ChoiceCards
                  label="Goal"
                  columns={2}
                  value={field.value || undefined}
                  onChange={field.onChange}
                  invalid={Boolean(err.goal)}
                  choices={GOALS.map((g) => ({ value: g, ...GOAL_LABELS[g], icon: GOAL_ICONS[g] }))}
                />
                <FieldError>{err.goal ? "Choose a goal" : null}</FieldError>
              </Field>
            )}
          />
          {values.goal && values.goal !== "maintain" ? (
            <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-1">
              <Field data-invalid={Boolean(err.targetWeight)}>
                <FieldLabel htmlFor="hp-target">Target weight</FieldLabel>
                <InputGroup>
                  <InputGroupInput id="hp-target" inputMode="decimal" placeholder="Optional" {...register("targetWeight")} />
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>{unit}</InputGroupText>
                  </InputGroupAddon>
                </InputGroup>
                <FieldError>{err.targetWeight?.message}</FieldError>
              </Field>
              <Field data-invalid={Boolean(err.targetDate)}>
                <FieldLabel htmlFor="hp-date">By</FieldLabel>
                <Input id="hp-date" type="date" min={today} {...register("targetDate")} />
                <FieldError>{err.targetDate?.message}</FieldError>
              </Field>
            </div>
          ) : null}
        </FieldGroup>
      ) : null}

      {(onboarding && step === 3) || !onboarding ? (
        plan ? (
          <div className="space-y-3">
            {!onboarding ? <FieldLabel>Your plan</FieldLabel> : null}
            <PlanSummary plan={plan} units={units} />
            <MedicalNote />
          </div>
        ) : null
      ) : null}
    </>
  );

  if (!onboarding) {
    return (
      <form noValidate onSubmit={submit} className="space-y-6">
        {sections}
        <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending}>
          {pending ? <Spinner /> : null}
          Save profile
        </Button>
      </form>
    );
  }

  return (
    <form noValidate onSubmit={step === STEPS.length - 1 ? submit : (e) => (e.preventDefault(), void next())} className="space-y-5">
      <div ref={top} className="scroll-mt-20">
        <div className="mb-3 flex gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s.title} className={cn("h-1.5 flex-1 rounded-full transition-colors duration-300", i <= step ? "bg-primary" : "bg-muted")} />
          ))}
        </div>
        <p className="text-xs font-medium text-muted-foreground">
          Step {step + 1} of {STEPS.length}
        </p>
        <h2 className="mt-0.5 text-xl font-semibold tracking-tight" aria-live="polite">
          {STEPS[step].title}
        </h2>
        <p className="text-sm text-muted-foreground">{STEPS[step].description}</p>
      </div>
      <div key={step} className="animate-in fade-in slide-in-from-right-4 duration-300">
        {sections}
      </div>
      <div className="flex gap-2 pt-1">
        {step > 0 ? (
          <Button type="button" variant="outline" size="lg" onClick={() => goTo(step - 1)} disabled={pending}>
            <ArrowLeftIcon aria-hidden /> Back
          </Button>
        ) : null}
        <Button type="submit" size="lg" className="flex-1" disabled={pending}>
          {pending ? <Spinner /> : null}
          {step === STEPS.length - 1 ? "Start Ward Health" : "Continue"}
          {step < STEPS.length - 1 ? <ArrowRightIcon aria-hidden /> : null}
        </Button>
      </div>
    </form>
  );
}
