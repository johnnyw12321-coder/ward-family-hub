"use client";

import { useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { cn } from "cn";
import { MEMBER_COLORS, memberColorClass } from "@/components/shared/member-color";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { updateHousehold, updateProfile } from "./actions";

const profileForm = z.object({ displayName: z.string().trim().min(1, "Enter a name").max(60), color: z.enum(MEMBER_COLORS) });
type ProfileValues = z.infer<typeof profileForm>;

export function ProfileForm({ initial }: { initial: ProfileValues }) {
  const [pending, start] = useTransition();
  const form = useForm<ProfileValues>({ resolver: zodResolver(profileForm), defaultValues: initial });
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit((v) =>
        start(async () => {
          const r = await updateProfile(v);
          if (r.ok) toast.success(r.message);
          else toast.error(r.error);
        }),
      )}
    >
      <FieldGroup className="gap-4">
        <Field data-invalid={Boolean(form.formState.errors.displayName)}>
          <FieldLabel htmlFor="pf-name">Your name</FieldLabel>
          <Input id="pf-name" {...form.register("displayName")} />
          <FieldError>{form.formState.errors.displayName?.message}</FieldError>
        </Field>
        <Controller
          control={form.control}
          name="color"
          render={({ field }) => (
            <Field>
              <FieldLabel id="pf-color">Colour</FieldLabel>
              <div role="radiogroup" aria-labelledby="pf-color" className="flex flex-wrap gap-2">
                {MEMBER_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={field.value === c}
                    aria-label={c}
                    onClick={() => field.onChange(c)}
                    className={cn(
                      "flex size-10 items-center justify-center rounded-full ring-offset-2 ring-offset-card transition-shadow",
                      memberColorClass(c),
                      field.value === c && "ring-2 ring-foreground",
                    )}
                  >
                    {field.value === c ? <CheckIcon className="size-4" aria-hidden /> : null}
                  </button>
                ))}
              </div>
            </Field>
          )}
        />
      </FieldGroup>
      <Button type="submit" disabled={pending}>
        {pending ? <Spinner /> : null} Save profile
      </Button>
    </form>
  );
}

const householdForm = z.object({ name: z.string().trim().min(1, "Enter a name").max(120), timezone: z.string().min(1) });
type HouseholdValues = z.infer<typeof householdForm>;

export function HouseholdForm({ initial, timezones, disabled }: { initial: HouseholdValues; timezones: string[]; disabled: boolean }) {
  const [pending, start] = useTransition();
  const form = useForm<HouseholdValues>({ resolver: zodResolver(householdForm), defaultValues: initial });
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit((v) =>
        start(async () => {
          const r = await updateHousehold(v);
          if (r.ok) toast.success(r.message);
          else toast.error(r.error);
        }),
      )}
    >
      <FieldGroup className="gap-4">
        <Field data-invalid={Boolean(form.formState.errors.name)}>
          <FieldLabel htmlFor="hh-name">Household name</FieldLabel>
          <Input id="hh-name" disabled={disabled} {...form.register("name")} />
          <FieldError>{form.formState.errors.name?.message}</FieldError>
        </Field>
        <Field>
          <FieldLabel htmlFor="hh-tz">Timezone</FieldLabel>
          <NativeSelect id="hh-tz" disabled={disabled} {...form.register("timezone")}>
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace(/_/g, " ")}
              </option>
            ))}
          </NativeSelect>
          <FieldDescription>
            Dates are shown in this timezone. Transactions keep the local date they were recorded with if you change it.
          </FieldDescription>
        </Field>
      </FieldGroup>
      {!disabled ? (
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner /> : null} Save household
        </Button>
      ) : null}
    </form>
  );
}
