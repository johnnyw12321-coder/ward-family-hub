"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { CopyIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { cn } from "cn";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { ModalButton } from "@/components/shared/modal-button";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { createPlan, deletePlan, duplicatePlan, updatePlan } from "../actions";

const START_OPTIONS = [
  {
    value: "actual",
    title: "Start from our real numbers",
    description: "Copies your active bills, income and this month's budgets. Change anything — the real ones stay as they are.",
  },
  { value: "starter", title: "Common household list", description: "Salaries, rent, groceries, fuel, utilities and more, ready for amounts." },
  { value: "blank", title: "Blank", description: "An empty plan to fill in yourself." },
] as const;

const createForm = z.object({
  name: z.string().trim().min(1, "Give the plan a name").max(80),
  start: z.enum(["actual", "starter", "blank"]),
});
type CreateValues = z.infer<typeof createForm>;

function CreatePlanForm({ onDone, defaultName }: { onDone: () => void; defaultName: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const form = useForm<CreateValues>({ resolver: zodResolver(createForm), defaultValues: { name: defaultName, start: "actual" } });
  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={form.handleSubmit((v) =>
        start(async () => {
          const r = await createPlan(v);
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          toast.success(v.start === "actual" ? `Plan created with ${r.data.imported} lines from your real numbers` : r.message);
          onDone();
          router.push(`/finances/planner/${r.data.id}`);
        }),
      )}
    >
      <FieldGroup className="gap-4">
        <Field data-invalid={Boolean(form.formState.errors.name)}>
          <FieldLabel htmlFor="plan-name">Name</FieldLabel>
          <Input id="plan-name" autoFocus maxLength={80} {...form.register("name")} />
          <FieldDescription>For example &ldquo;2027 budget&rdquo; or &ldquo;If we buy the new car&rdquo;.</FieldDescription>
          <FieldError>{form.formState.errors.name?.message}</FieldError>
        </Field>
        <Controller
          control={form.control}
          name="start"
          render={({ field }) => (
            <Field>
              <FieldLabel id="plan-start">Start with</FieldLabel>
              <div role="radiogroup" aria-labelledby="plan-start" className="grid gap-2">
                {START_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={field.value === o.value}
                    onClick={() => field.onChange(o.value)}
                    className={cn(
                      "rounded-xl p-3 text-left ring-1 transition-colors",
                      field.value === o.value ? "bg-accent text-accent-foreground ring-2 ring-primary" : "ring-border hover:bg-muted/60",
                    )}
                  >
                    <span className="block text-sm font-medium">{o.title}</span>
                    <span className={cn("mt-0.5 block text-xs", field.value === o.value ? "text-accent-foreground/80" : "text-muted-foreground")}>
                      {o.description}
                    </span>
                  </button>
                ))}
              </div>
            </Field>
          )}
        />
      </FieldGroup>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : null} Create plan
      </Button>
    </form>
  );
}

export function NewPlanButton({ defaultName, label = "New plan" }: { defaultName: string; label?: string }) {
  return (
    <ModalButton
      label={
        <>
          <PlusIcon aria-hidden /> {label}
        </>
      }
      title="New plan"
      description="Plans are a playground: nothing here changes your real accounts, budgets or bills."
    >
      {(close) => <CreatePlanForm onDone={close} defaultName={defaultName} />}
    </ModalButton>
  );
}

const editForm = z.object({ name: z.string().trim().min(1, "Give the plan a name").max(80), notes: z.string().max(4000) });
type EditValues = z.infer<typeof editForm>;

function EditPlanForm({ id, initial, onDone }: { id: string; initial: EditValues; onDone: () => void }) {
  const [pending, start] = useTransition();
  const form = useForm<EditValues>({ resolver: zodResolver(editForm), defaultValues: initial });
  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={form.handleSubmit((v) =>
        start(async () => {
          const r = await updatePlan({ id, ...v });
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          toast.success(r.message);
          onDone();
        }),
      )}
    >
      <FieldGroup className="gap-4">
        <Field data-invalid={Boolean(form.formState.errors.name)}>
          <FieldLabel htmlFor="plan-edit-name">Name</FieldLabel>
          <Input id="plan-edit-name" maxLength={80} {...form.register("name")} />
          <FieldError>{form.formState.errors.name?.message}</FieldError>
        </Field>
        <Field>
          <FieldLabel htmlFor="plan-edit-notes">Notes</FieldLabel>
          <Textarea id="plan-edit-notes" rows={4} maxLength={4000} placeholder="Assumptions, ideas, what you're trying out…" {...form.register("notes")} />
        </Field>
      </FieldGroup>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : null} Save
      </Button>
    </form>
  );
}

export function PlanActions({ id, name, notes }: { id: string; name: string; notes: string | null }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-wrap gap-2">
      <ModalButton
        variant="outline"
        size="sm"
        label={
          <>
            <PencilIcon aria-hidden /> Rename
          </>
        }
        title="Plan details"
      >
        {(close) => <EditPlanForm id={id} initial={{ name, notes: notes ?? "" }} onDone={close} />}
      </ModalButton>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await duplicatePlan(id);
            if (!r.ok) {
              toast.error(r.error);
              return;
            }
            toast.success("Copy created — try your what-if there");
            router.push(`/finances/planner/${r.data.id}`);
          })
        }
      >
        {pending ? <Spinner /> : <CopyIcon aria-hidden />} Make a copy
      </Button>
      <ConfirmAction
        action={() => deletePlan(id)}
        trigger={
          <>
            <Trash2Icon aria-hidden /> Delete
          </>
        }
        title={`Delete "${name}"?`}
        description="The plan and all its lines are removed. Your real accounts, budgets and bills are not affected."
        confirmLabel="Delete plan"
        redirectTo="/finances/planner"
        size="sm"
      />
    </div>
  );
}
