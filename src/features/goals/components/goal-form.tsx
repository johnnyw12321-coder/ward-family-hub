"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { PencilIcon, PlusIcon } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { isLiability, type AccountType } from "@/lib/finance/calculations";
import { currencySymbol } from "@/lib/money";
import { saveGoal } from "../actions";
import { GOAL_CATEGORY_LABELS, GOAL_SOURCE_LABELS } from "../progress";
import { GOAL_CATEGORIES, GOAL_SOURCES, goalSchema, type GoalInput } from "../schemas";

type Props = {
  accounts: { id: string; name: string; type: AccountType }[];
  members: { user_id: string; display_name: string }[];
  currency: string;
  today: string;
  initial?: Partial<GoalInput>;
  onSaved: (id: string) => void;
};

function GoalForm({ accounts, members, currency, today, initial, onSaved }: Props) {
  const [pending, start] = useTransition();
  const editing = Boolean(initial?.id);
  const form = useForm<GoalInput>({
    resolver: zodResolver(goalSchema),
    defaultValues: {
      name: "",
      description: "",
      category: "savings",
      progressSource: "manual",
      measure: "money",
      targetAmount: "",
      targetValue: "",
      unit: "",
      linkedAccountId: "",
      startDate: today,
      targetDate: "",
      assignedUserId: "",
      priority: "medium",
      notes: "",
      ...initial,
    },
  });
  const { register, control, formState } = form;
  const err = formState.errors;
  const source = useWatch({ control, name: "progressSource" });
  const measure = useWatch({ control, name: "measure" });
  const accountOptions = accounts.filter((a) => (source === "debt_payoff" ? isLiability(a.type) : !isLiability(a.type)));
  const money = source === "contributions" || source === "account_balance" || (source === "manual" && measure === "money");

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={form.handleSubmit((v) =>
        start(async () => {
          const r = await saveGoal(v);
          if (!r.ok) {
            for (const [k, m] of Object.entries(r.fieldErrors ?? {})) form.setError(k as keyof GoalInput, { message: m });
            toast.error(r.error);
            return;
          }
          toast.success(r.message);
          onSaved(r.data.id);
        }),
      )}
    >
      <FieldGroup className="gap-4">
        <Field data-invalid={Boolean(err.name)}>
          <FieldLabel htmlFor="g-name">Goal</FieldLabel>
          <Input id="g-name" placeholder="e.g. Six-month emergency fund" {...register("name")} />
          <FieldError>{err.name?.message}</FieldError>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="g-cat">Category</FieldLabel>
            <NativeSelect id="g-cat" {...register("category")}>
              {GOAL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {GOAL_CATEGORY_LABELS[c]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="g-priority">Priority</FieldLabel>
            <NativeSelect id="g-priority" {...register("priority")}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </NativeSelect>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="g-source">How is progress measured?</FieldLabel>
          {editing ? (
            <>
              <p className="text-sm font-medium">{GOAL_SOURCE_LABELS[source]}</p>
              <FieldDescription>The progress source can&apos;t change after creation.</FieldDescription>
            </>
          ) : (
            <NativeSelect id="g-source" {...register("progressSource")}>
              {GOAL_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {GOAL_SOURCE_LABELS[s]}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>

        {source === "manual" ? (
          <Field>
            <FieldLabel htmlFor="g-measure">Target is</FieldLabel>
            <NativeSelect id="g-measure" {...register("measure")}>
              <option value="money">An amount of money</option>
              <option value="number">A number of something (e.g. books, kg, km)</option>
            </NativeSelect>
          </Field>
        ) : null}

        {source === "account_balance" || source === "debt_payoff" ? (
          <Field data-invalid={Boolean(err.linkedAccountId)}>
            <FieldLabel htmlFor="g-account">{source === "debt_payoff" ? "Debt to pay off" : "Savings account"}</FieldLabel>
            {editing ? (
              <p className="text-sm font-medium">{accounts.find((a) => a.id === initial?.linkedAccountId)?.name ?? "—"}</p>
            ) : (
              <NativeSelect id="g-account" {...register("linkedAccountId")}>
                <option value="">Choose…</option>
                {accountOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </NativeSelect>
            )}
            {source === "debt_payoff" ? <FieldDescription>Progress is the amount paid down since the goal started.</FieldDescription> : null}
            <FieldError>{err.linkedAccountId?.message}</FieldError>
          </Field>
        ) : null}

        {source !== "milestones" && source !== "debt_payoff" ? (
          money ? (
            <Field data-invalid={Boolean(err.targetAmount)}>
              <FieldLabel htmlFor="g-target">Target amount</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <InputGroupText>{currencySymbol(currency)}</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput id="g-target" inputMode="decimal" className="tabular" {...register("targetAmount")} />
              </InputGroup>
              <FieldError>{err.targetAmount?.message}</FieldError>
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field data-invalid={Boolean(err.targetValue)}>
                <FieldLabel htmlFor="g-value">Target</FieldLabel>
                <Input id="g-value" inputMode="decimal" {...register("targetValue")} />
                <FieldError>{err.targetValue?.message}</FieldError>
              </Field>
              <Field>
                <FieldLabel htmlFor="g-unit">Unit</FieldLabel>
                <Input id="g-unit" placeholder="e.g. books" {...register("unit")} />
              </Field>
            </div>
          )
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="g-start">Start</FieldLabel>
            <Input id="g-start" type="date" {...register("startDate")} />
          </Field>
          <Field data-invalid={Boolean(err.targetDate)}>
            <FieldLabel htmlFor="g-due">Target date</FieldLabel>
            <Input id="g-due" type="date" {...register("targetDate")} />
            <FieldError>{err.targetDate?.message}</FieldError>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="g-owner">Who&apos;s leading it</FieldLabel>
          <NativeSelect id="g-owner" {...register("assignedUserId")}>
            <option value="">Both of us</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="g-desc">Why it matters (optional)</FieldLabel>
          <Textarea id="g-desc" rows={2} {...register("description")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="g-notes">Notes (optional)</FieldLabel>
          <Textarea id="g-notes" rows={2} {...register("notes")} />
        </Field>
      </FieldGroup>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : null}
        {editing ? "Save changes" : "Create goal"}
      </Button>
    </form>
  );
}

export function NewGoalButton(props: Omit<Props, "onSaved" | "initial">) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon data-icon="inline-start" /> Goal
      </Button>
      <ResponsiveModal open={open} onOpenChange={setOpen} title="New goal">
        {open ? (
          <GoalForm
            {...props}
            onSaved={(id) => {
              setOpen(false);
              router.push(`/goals/${id}`);
            }}
          />
        ) : null}
      </ResponsiveModal>
    </>
  );
}

export function EditGoalButton(props: Omit<Props, "onSaved">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <PencilIcon data-icon="inline-start" /> Edit
      </Button>
      <ResponsiveModal open={open} onOpenChange={setOpen} title="Edit goal">
        {open ? <GoalForm {...props} onSaved={() => setOpen(false)} /> : null}
      </ResponsiveModal>
    </>
  );
}
