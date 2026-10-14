"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { PencilIcon, PlusIcon } from "lucide-react";
import { Controller, useForm, useWatch, type FieldValues, type Path, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { cn } from "cn";
import { MEMBER_COLORS, memberColorClass } from "@/components/shared/member-color";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { FormModal } from "@/features/assets/components/asset-forms";
import type { ActionResult } from "@/lib/actions";
import { saveContact, saveFamilyDate, saveFamilyHealth, saveFamilyMember } from "../actions";
import {
  BLOOD_TYPES,
  RELATIONSHIPS,
  RELATIONSHIP_LABELS,
  contactSchema,
  familyDateSchema,
  healthSchema,
  memberSchema,
  type ContactInput,
  type FamilyDateInput,
  type HealthInput,
  type MemberInput,
} from "../schemas";

function useSubmit<T extends FieldValues>(form: UseFormReturn<T>, action: (v: T) => Promise<ActionResult<unknown>>, onDone: (data: unknown) => void) {
  const [pending, start] = useTransition();
  const submit = form.handleSubmit((values) =>
    start(async () => {
      const r = await action(values);
      if (!r.ok) {
        for (const [k, m] of Object.entries(r.fieldErrors ?? {})) form.setError(k as Path<T>, { message: m });
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "Saved");
      onDone(r.data);
    }),
  );
  return { pending, submit };
}

function TextField<T extends FieldValues>({ form, name, label, type = "text", placeholder, inputMode }: { form: UseFormReturn<T>; name: Path<T>; label: string; type?: string; placeholder?: string; inputMode?: "tel" | "email" }) {
  const error = form.getFieldState(name, form.formState).error;
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={`fm-${name}`}>{label}</FieldLabel>
      <Input id={`fm-${name}`} type={type} placeholder={placeholder} inputMode={inputMode} {...form.register(name)} />
      <FieldError>{error?.message}</FieldError>
    </Field>
  );
}

function AreaField<T extends FieldValues>({ form, name, label, placeholder }: { form: UseFormReturn<T>; name: Path<T>; label: string; placeholder?: string }) {
  return (
    <Field>
      <FieldLabel htmlFor={`fm-${name}`}>{label}</FieldLabel>
      <Textarea id={`fm-${name}`} rows={2} placeholder={placeholder} {...form.register(name)} />
    </Field>
  );
}

// ---------------------------------------------------------------------------
export function MemberForm({ initial, accounts, onDone }: { initial?: Partial<MemberInput>; accounts: { user_id: string; display_name: string }[]; onDone: (id: string) => void }) {
  const form = useForm<MemberInput>({
    resolver: zodResolver(memberSchema),
    defaultValues: { fullName: "", preferredName: "", relationship: "child", dateOfBirth: "", schoolOrCare: "", schoolDetails: "", notes: "", colour: "sky", userId: "", ...initial },
  });
  const { pending, submit } = useSubmit(form, saveFamilyMember, (d) => onDone((d as { id: string }).id));
  const relationship = useWatch({ control: form.control, name: "relationship" });
  return (
    <form noValidate onSubmit={submit} className="space-y-5">
      <FieldGroup className="gap-4">
        <TextField form={form} name="fullName" label="Full name" />
        <div className="grid grid-cols-2 gap-3">
          <TextField form={form} name="preferredName" label="Goes by" />
          <Field>
            <FieldLabel htmlFor="fm-rel">Relationship</FieldLabel>
            <NativeSelect id="fm-rel" {...form.register("relationship")}>
              {RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>
                  {RELATIONSHIP_LABELS[r]}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <TextField form={form} name="dateOfBirth" label="Date of birth" type="date" />
        {relationship === "child" ? (
          <>
            <TextField form={form} name="schoolOrCare" label="School or daycare" />
            <AreaField form={form} name="schoolDetails" label="School details" placeholder="Class, teacher, hours, pick-up arrangements, uniform days…" />
          </>
        ) : null}
        {accounts.length && (relationship === "self" || relationship === "partner") ? (
          <Field>
            <FieldLabel htmlFor="fm-user">Linked app account</FieldLabel>
            <NativeSelect id="fm-user" {...form.register("userId")}>
              <option value="">None</option>
              {accounts.map((a) => (
                <option key={a.user_id} value={a.user_id}>
                  {a.display_name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : null}
        <Controller
          control={form.control}
          name="colour"
          render={({ field }) => (
            <Field>
              <FieldLabel id="fm-colour">Colour</FieldLabel>
              <div role="radiogroup" aria-labelledby="fm-colour" className="flex flex-wrap gap-2">
                {MEMBER_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={field.value === c}
                    aria-label={c}
                    onClick={() => field.onChange(c)}
                    className={cn("size-9 rounded-full ring-offset-2 ring-offset-card", memberColorClass(c), field.value === c && "ring-2 ring-foreground")}
                  />
                ))}
              </div>
            </Field>
          )}
        />
        <AreaField form={form} name="notes" label="Notes" placeholder="Clothing sizes, likes, routines… (medical details go in the protected health section)" />
      </FieldGroup>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : null} {initial?.id ? "Save changes" : "Add family member"}
      </Button>
    </form>
  );
}

export function NewMemberButton({ accounts }: { accounts: { user_id: string; display_name: string }[] }) {
  const router = useRouter();
  return (
    <FormModal
      label={
        <>
          <PlusIcon data-icon="inline-start" /> Person
        </>
      }
      title="Add family member"
      variant="default"
    >
      {(close) => (
        <MemberForm
          accounts={accounts}
          onDone={(id) => {
            close();
            router.push(`/family/${id}`);
          }}
        />
      )}
    </FormModal>
  );
}

export function EditMemberButton({ accounts, initial }: { accounts: { user_id: string; display_name: string }[]; initial: Partial<MemberInput> }) {
  return (
    <FormModal
      label={
        <>
          <PencilIcon data-icon="inline-start" /> Edit
        </>
      }
      title="Edit profile"
    >
      {(close) => <MemberForm accounts={accounts} initial={initial} onDone={close} />}
    </FormModal>
  );
}

// ---------------------------------------------------------------------------
export function HealthForm({ initial, onDone }: { initial: Partial<HealthInput> & { familyMemberId: string }; onDone: () => void }) {
  const form = useForm<HealthInput>({
    resolver: zodResolver(healthSchema),
    defaultValues: { bloodType: "", allergies: "", conditions: "", medications: "", doctor: "", healthInsurance: "", notes: "", ...initial },
  });
  const { pending, submit } = useSubmit(form, saveFamilyHealth, onDone);
  return (
    <form noValidate onSubmit={submit} className="space-y-5">
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="fm-blood">Blood type</FieldLabel>
          <NativeSelect id="fm-blood" {...form.register("bloodType")}>
            <option value="">Not recorded</option>
            {BLOOD_TYPES.map((b) => (
              <option key={b} value={b}>
                {b === "unknown" ? "Unknown" : b}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <AreaField form={form} name="allergies" label="Allergies" />
        <AreaField form={form} name="conditions" label="Conditions" />
        <AreaField form={form} name="medications" label="Medications" />
        <TextField form={form} name="doctor" label="Doctor / paediatrician" />
        <TextField form={form} name="healthInsurance" label="Health insurance" placeholder="Provider and member number" />
        <AreaField form={form} name="notes" label="Other notes" />
      </FieldGroup>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : null} Save health details
      </Button>
    </form>
  );
}

export function EditHealthButton({ initial }: { initial: Partial<HealthInput> & { familyMemberId: string } }) {
  return (
    <FormModal
      label={
        <>
          <PencilIcon data-icon="inline-start" /> Edit health details
        </>
      }
      title="Health details"
    >
      {(close) => <HealthForm initial={initial} onDone={close} />}
    </FormModal>
  );
}

// ---------------------------------------------------------------------------
export function ContactForm({ initial, onDone }: { initial?: Partial<ContactInput>; onDone: () => void }) {
  const form = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: { familyMemberId: "", name: "", relationship: "", phone: "", email: "", isEmergency: true, notes: "", ...initial },
  });
  const { pending, submit } = useSubmit(form, saveContact, onDone);
  return (
    <form noValidate onSubmit={submit} className="space-y-5">
      <FieldGroup className="gap-4">
        <TextField form={form} name="name" label="Name" />
        <div className="grid grid-cols-2 gap-3">
          <TextField form={form} name="relationship" label="Relationship" placeholder="Grandmother, neighbour…" />
          <TextField form={form} name="phone" label="Phone" type="tel" inputMode="tel" />
        </div>
        <TextField form={form} name="email" label="Email" type="email" inputMode="email" />
        <Controller
          control={form.control}
          name="isEmergency"
          render={({ field }) => (
            <Field orientation="horizontal">
              <Checkbox id="fm-emergency" checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
              <FieldLabel htmlFor="fm-emergency" className="font-normal">
                Emergency contact
              </FieldLabel>
            </Field>
          )}
        />
        <AreaField form={form} name="notes" label="Notes" placeholder="Authorised for school pick-up, has a spare key…" />
      </FieldGroup>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : null} {initial?.id ? "Save changes" : "Add contact"}
      </Button>
    </form>
  );
}

export function AddContactButton({ familyMemberId }: { familyMemberId?: string }) {
  return (
    <FormModal
      label={
        <>
          <PlusIcon data-icon="inline-start" /> Contact
        </>
      }
      title="New contact"
    >
      {(close) => <ContactForm initial={{ familyMemberId: familyMemberId ?? "" }} onDone={close} />}
    </FormModal>
  );
}

export function EditContactButton({ initial }: { initial: Partial<ContactInput> }) {
  return (
    <FormModal label={<PencilIcon aria-label={`Edit ${initial.name}`} />} title="Edit contact" variant="ghost">
      {(close) => <ContactForm initial={initial} onDone={close} />}
    </FormModal>
  );
}

// ---------------------------------------------------------------------------
export function FamilyDateForm({ initial, onDone }: { initial: Partial<FamilyDateInput> & { familyMemberId: string }; onDone: () => void }) {
  const form = useForm<FamilyDateInput>({
    resolver: zodResolver(familyDateSchema),
    defaultValues: { kind: "milestone", title: "", onDate: "", isAnnual: false, notes: "", ...initial },
  });
  const kind = useWatch({ control: form.control, name: "kind" });
  const { pending, submit } = useSubmit(form, saveFamilyDate, onDone);
  return (
    <form noValidate onSubmit={submit} className="space-y-5">
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="fm-kind">Type</FieldLabel>
          <NativeSelect id="fm-kind" {...form.register("kind")}>
            <option value="milestone">Milestone (first steps, first day of school…)</option>
            <option value="important_date">Important date (anniversary, check-up due…)</option>
          </NativeSelect>
        </Field>
        <TextField form={form} name="title" label="What" />
        <TextField form={form} name="onDate" label="Date" type="date" />
        {kind === "important_date" ? (
          <Controller
            control={form.control}
            name="isAnnual"
            render={({ field }) => (
              <Field orientation="horizontal">
                <Checkbox id="fm-annual" checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                <div>
                  <FieldLabel htmlFor="fm-annual" className="font-normal">
                    Every year
                  </FieldLabel>
                  <FieldDescription>Shows on the calendar and sends a reminder a week before.</FieldDescription>
                </div>
              </Field>
            )}
          />
        ) : null}
        <AreaField form={form} name="notes" label="Notes" />
      </FieldGroup>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : null} Save
      </Button>
    </form>
  );
}

export function AddFamilyDateButton({ familyMemberId }: { familyMemberId: string }) {
  return (
    <FormModal
      label={
        <>
          <PlusIcon data-icon="inline-start" /> Add
        </>
      }
      title="Milestone or date"
    >
      {(close) => <FamilyDateForm initial={{ familyMemberId }} onDone={close} />}
    </FormModal>
  );
}
