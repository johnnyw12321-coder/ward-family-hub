"use client";

import { useState, useTransition } from "react";
import { CheckIcon, CircleIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { formatDate } from "@/lib/dates";
import { currencySymbol, formatMoney } from "@/lib/money";
import type { ActionResult } from "@/lib/actions";
import { addContribution, addMilestone, deleteContribution, deleteMilestone, toggleMilestone, updateManualProgress } from "../actions";

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult<unknown>>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.message);
        after?.();
      }
    });
  return { pending, run };
}

export function Milestones({
  goalId,
  items,
  today,
  canWrite,
}: {
  goalId: string;
  items: { id: string; title: string; due_date: string | null; completed_at: string | null }[];
  today: string;
  canWrite: boolean;
}) {
  const { pending, run } = useRun();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  return (
    <div className="space-y-2">
      {items.length ? (
        <ul className="divide-y rounded-2xl bg-card shadow-card ring-1 ring-border/80">
          {items.map((m) => {
            const overdue = !m.completed_at && m.due_date && m.due_date < today;
            return (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                <button
                  type="button"
                  disabled={!canWrite || pending}
                  onClick={() => run(() => toggleMilestone(m.id, !m.completed_at))}
                  aria-label={m.completed_at ? `Mark ${m.title} as not done` : `Mark ${m.title} as done`}
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors",
                    m.completed_at ? "border-success bg-success text-white" : "text-muted-foreground hover:border-primary",
                  )}
                >
                  {m.completed_at ? <CheckIcon className="size-4" /> : <CircleIcon className="size-4 opacity-0" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={cn("text-sm font-medium", m.completed_at && "text-muted-foreground line-through")}>{m.title}</div>
                  {m.due_date || m.completed_at ? (
                    <div className={cn("text-xs", overdue ? "text-destructive" : "text-muted-foreground")}>
                      {m.completed_at ? `Done ${formatDate(m.completed_at.slice(0, 10))}` : `Due ${formatDate(m.due_date)}${overdue ? " · overdue" : ""}`}
                    </div>
                  ) : null}
                </div>
                {canWrite ? (
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete ${m.title}`} disabled={pending} onClick={() => run(() => deleteMilestone(m.id))}>
                    <Trash2Icon />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No milestones yet. Break the goal into steps you can tick off.</p>
      )}
      {canWrite ? (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addMilestone({ goalId, title, dueDate: due }), () => {
              setTitle("");
              setDue("");
            });
          }}
        >
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New milestone" aria-label="New milestone" className="min-w-40 flex-1" maxLength={160} />
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Milestone due date" className="w-40" />
          <Button type="submit" disabled={pending || !title.trim()}>
            {pending ? <Spinner /> : <PlusIcon data-icon="inline-start" />} Add
          </Button>
        </form>
      ) : null}
    </div>
  );
}

export function Contributions({
  goalId,
  items,
  memberNames,
  today,
  currency,
  canWrite,
}: {
  goalId: string;
  items: { id: string; contributed_on: string; amount_minor: number; note: string | null; created_by: string | null }[];
  memberNames: Record<string, string>;
  today: string;
  currency: string;
  canWrite: boolean;
}) {
  const { pending, run } = useRun();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  return (
    <div className="space-y-2">
      {canWrite ? (
        <form
          className="grid gap-2 rounded-2xl bg-card p-3 shadow-card ring-1 ring-border/80 sm:grid-cols-[1fr_auto_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addContribution({ goalId, amount, date, note }), () => {
              setAmount("");
              setNote("");
            });
          }}
        >
          <InputGroup>
            <InputGroupAddon>
              <InputGroupText>{currencySymbol(currency)}</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Amount (use - for a withdrawal)" aria-label="Contribution amount" className="tabular" />
          </InputGroup>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Contribution date" />
          <Button type="submit" disabled={pending || !amount.trim()}>
            {pending ? <Spinner /> : <PlusIcon data-icon="inline-start" />} Record
          </Button>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" aria-label="Contribution note" className="sm:col-span-3" maxLength={300} />
        </form>
      ) : null}
      {items.length ? (
        <ul className="divide-y rounded-2xl bg-card shadow-card ring-1 ring-border/80">
          {items.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{formatMoney(c.amount_minor, { currency, signDisplay: "exceptZero" })}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {formatDate(c.contributed_on)}
                  {c.created_by && memberNames[c.created_by] ? ` · ${memberNames[c.created_by]}` : ""}
                  {c.note ? ` · ${c.note}` : ""}
                </div>
              </div>
              {canWrite ? (
                <Button variant="ghost" size="icon-sm" aria-label="Delete contribution" disabled={pending} onClick={() => run(() => deleteContribution(c.id))}>
                  <Trash2Icon />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No contributions recorded yet.</p>
      )}
    </div>
  );
}

export function ManualProgress({ goalId, kind, initial, unit, currency }: { goalId: string; kind: "money" | "number"; initial: string; unit: string | null; currency: string }) {
  const { pending, run } = useRun();
  const [value, setValue] = useState(initial);
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updateManualProgress(kind === "money" ? { goalId, amount: value } : { goalId, value }));
      }}
    >
      {kind === "money" ? (
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <InputGroupText>{currencySymbol(currency)}</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" aria-label="Current progress" className="tabular" />
        </InputGroup>
      ) : (
        <Input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" aria-label={`Current progress${unit ? ` in ${unit}` : ""}`} className="flex-1" />
      )}
      <Button type="submit" disabled={pending}>
        {pending ? <Spinner /> : null} Update
      </Button>
    </form>
  );
}
