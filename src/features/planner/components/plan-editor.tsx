"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon, CloudOffIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { FitText } from "@/components/shared/fit-text";
import { Money } from "@/components/shared/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { currencySymbol, formatMoney, parseMoney, toDecimalString } from "@/lib/money";
import { deletePlanLine, savePlanLine } from "../actions";
import {
  convertAmount,
  PLAN_FREQUENCIES,
  PLAN_FREQUENCY_LABELS,
  PLAN_PERIOD_LABELS,
  planTotals,
  type PlanFrequency,
  type PlanLine,
  type PlanLineKind,
} from "../calc";

type Row = PlanLine & { amountText: string; persisted: boolean };
type SaveState = "idle" | "saving" | "saved" | "error";

const VIEW_PERIODS: PlanFrequency[] = ["weekly", "fortnightly", "monthly", "yearly"];
const SAVE_DELAY_MS = 600;

function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Older browsers / plain-http dev: RFC 4122 v4 from random bytes.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function toRow(line: PlanLine): Row {
  return { ...line, amountText: line.amount_minor ? toDecimalString(line.amount_minor) : "", persisted: true };
}

/** Empty input means zero; anything unparseable is flagged rather than guessed. */
function amountOf(text: string): number | null {
  if (!text.trim()) return 0;
  const minor = parseMoney(text);
  return minor !== null && minor >= 0 ? minor : null;
}

export function PlanEditor({
  planId,
  lines,
  currency,
  canWrite,
}: {
  planId: string;
  lines: PlanLine[];
  currency: string;
  canWrite: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() => lines.map(toRow));
  const [per, setPer] = useState<PlanFrequency>("monthly");
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const rowsRef = useRef(rows);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inFlight = useRef(0);
  const focusNext = useRef<string | null>(null);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  // A newly added line's description box takes focus as soon as it mounts.
  const registerInput = useCallback((id: string, el: HTMLInputElement | null) => {
    if (el && focusNext.current === id) {
      focusNext.current = null;
      el.focus();
    }
  }, []);

  const persist = useCallback(
    async (id: string) => {
      timers.current.delete(id);
      const row = rowsRef.current.find((r) => r.id === id);
      if (!row) return;
      const amount = amountOf(row.amountText);
      if (amount === null) return; // invalid amount: wait for a fix
      inFlight.current += 1;
      setSaveState("saving");
      const r = await savePlanLine({
        id: row.id,
        planId,
        kind: row.kind,
        label: row.label,
        amountMinor: amount,
        frequency: row.frequency,
        sortOrder: row.sort_order,
      });
      inFlight.current -= 1;
      if (!r.ok) {
        setSaveState("error");
        toast.error(r.error);
        return;
      }
      setRows((all) => all.map((x) => (x.id === id ? { ...x, persisted: true } : x)));
      if (inFlight.current === 0 && timers.current.size === 0) setSaveState("saved");
    },
    [planId],
  );

  const schedule = useCallback(
    (id: string) => {
      const existing = timers.current.get(id);
      if (existing) clearTimeout(existing);
      timers.current.set(
        id,
        setTimeout(() => void persist(id), SAVE_DELAY_MS),
      );
      setSaveState("saving");
    },
    [persist],
  );

  // Leaving the page saves whatever is still waiting.
  useEffect(() => {
    const pending = timers.current;
    const flush = () => {
      for (const [id, t] of pending) {
        clearTimeout(t);
        void persist(id);
      }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [persist]);

  const update = (id: string, patch: Partial<Pick<Row, "label" | "amountText" | "frequency">>) => {
    setRows((all) =>
      all.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch };
        const amount = amountOf(next.amountText);
        return amount === null ? next : { ...next, amount_minor: amount };
      }),
    );
    schedule(id);
  };

  const add = (kind: PlanLineKind) => {
    const id = newId();
    const order = Math.max(0, ...rows.filter((r) => r.kind === kind).map((r) => r.sort_order)) + 1;
    setRows((all) => [...all, { id, kind, label: "", amount_minor: 0, frequency: "monthly", sort_order: order, amountText: "", persisted: false }]);
    focusNext.current = id;
  };

  const remove = async (row: Row) => {
    const timer = timers.current.get(row.id);
    if (timer) clearTimeout(timer);
    timers.current.delete(row.id);
    setRows((all) => all.filter((r) => r.id !== row.id));
    // Never saved and nothing on its way to the server: nothing to delete.
    if (!row.persisted && inFlight.current === 0) return;
    const r = await deletePlanLine(row.id);
    if (!r.ok) {
      toast.error(r.error);
      setRows((all) => [...all, row].sort((a, b) => a.sort_order - b.sort_order));
    }
  };

  const totals = useMemo(() => planTotals(rows, per), [rows, per]);
  const income = rows.filter((r) => r.kind === "income");
  const expenses = rows.filter((r) => r.kind === "expense");
  const periodLabel = PLAN_PERIOD_LABELS[per];
  const short = totals.leftOver < 0;

  return (
    <div className="space-y-6">
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 bg-background/90 px-4 pt-1 pb-3 backdrop-blur-lg lg:mx-0 lg:px-0">
        <div className="flex items-center justify-between gap-3 pb-2">
          <div role="radiogroup" aria-label="Show amounts per" className="flex gap-1 rounded-full bg-card p-1 ring-1 ring-border">
            {VIEW_PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={per === p}
                onClick={() => setPer(p)}
                className={cn(
                  "h-8 rounded-full px-3 text-xs font-medium capitalize transition-colors sm:text-sm",
                  per === p ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {PLAN_PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          <SaveStatus state={saveState} />
        </div>
        <section
          aria-label={`Totals per ${periodLabel}`}
          className={cn("rounded-2xl p-4 shadow-card ring-1", short ? "bg-danger-soft ring-destructive/25" : "bg-primary text-primary-foreground ring-primary")}
        >
          <div className="grid grid-cols-3 gap-3">
            <Total label="Income" value={totals.income} short={short} />
            <Total label="Expenses" value={totals.expenses} short={short} />
            <Total label={short ? "Short by" : "Left over"} value={Math.abs(totals.leftOver)} short={short} strong />
          </div>
          <SpendBar percent={totals.spentPercent} short={short} />
          <p className={cn("mt-2 text-xs", short ? "text-destructive" : "text-primary-foreground/80")}>
            {totals.spentPercent === null
              ? "Add income to see what's left."
              : short
                ? `Spending is ${totals.spentPercent}% of income. Trim expenses or add income to balance the plan.`
                : `Expenses use ${totals.spentPercent}% of income${
                    per !== "weekly" ? ` · about ${formatMoney(convertAmount(totals.leftOver, per, "weekly"), { currency, trimZeroCents: true })} a week spare` : ""
                  }.`}
          </p>
        </section>
      </div>

      <LineSection
        title="Income"
        kind="income"
        rows={income}
        per={per}
        currency={currency}
        canWrite={canWrite}
        total={totals.income}
        onAdd={add}
        onChange={update}
        onRemove={remove}
        registerInput={registerInput}
      />
      <LineSection
        title="Expenses"
        kind="expense"
        rows={expenses}
        per={per}
        currency={currency}
        canWrite={canWrite}
        total={totals.expenses}
        onAdd={add}
        onChange={update}
        onRemove={remove}
        registerInput={registerInput}
      />

      <Breakdown rows={expenses} per={per} income={totals.income} />
    </div>
  );
}

function SaveStatus({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  return (
    <span role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {state === "saving" ? (
        <>
          <Spinner className="size-3.5" /> Saving…
        </>
      ) : state === "saved" ? (
        <>
          <CheckIcon className="size-3.5" aria-hidden /> Saved
        </>
      ) : (
        <span className="flex items-center gap-1.5 text-destructive">
          <CloudOffIcon className="size-3.5" aria-hidden /> Not saved
        </span>
      )}
    </span>
  );
}

function Total({ label, value, short, strong }: { label: string; value: number; short: boolean; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <div className={cn("text-xs font-medium", short ? "text-muted-foreground" : "text-primary-foreground/80")}>{label}</div>
      <FitText className={cn("mt-0.5 font-semibold tracking-tight tabular", strong ? "text-xl" : "text-lg", short && strong && "text-destructive")}>
        <Money minor={value} trimZeroCents />
      </FitText>
    </div>
  );
}

function SpendBar({ percent, short }: { percent: number | null; short: boolean }) {
  if (percent === null) return null;
  return (
    <div
      className={cn("mt-3 h-2 overflow-hidden rounded-full", short ? "bg-destructive/15" : "bg-primary-foreground/20")}
      role="meter"
      aria-label="Share of income spent"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(percent, 100)}
    >
      <div className={cn("h-full rounded-full", short ? "bg-destructive" : "bg-primary-foreground")} style={{ width: `${Math.min(percent, 100)}%` }} />
    </div>
  );
}

function LineSection({
  title,
  kind,
  rows,
  per,
  currency,
  canWrite,
  total,
  onAdd,
  onChange,
  onRemove,
  registerInput,
}: {
  title: string;
  kind: PlanLineKind;
  rows: Row[];
  per: PlanFrequency;
  currency: string;
  canWrite: boolean;
  total: number;
  onAdd: (kind: PlanLineKind) => void;
  onChange: (id: string, patch: Partial<Pick<Row, "label" | "amountText" | "frequency">>) => void;
  onRemove: (row: Row) => void;
  registerInput: (id: string, el: HTMLInputElement | null) => void;
}) {
  return (
    <section aria-labelledby={`plan-${kind}`}>
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h2 id={`plan-${kind}`} className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          {title}
        </h2>
        <span className="text-sm font-medium tabular">
          <Money minor={total} trimZeroCents /> <span className="text-muted-foreground">/ {PLAN_PERIOD_LABELS[per]}</span>
        </span>
      </div>
      <div className="overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-border/80">
        {rows.length ? (
          <ul className="divide-y">
            {rows.map((row) => (
              <LineRow
                key={row.id}
                row={row}
                per={per}
                currency={currency}
                canWrite={canWrite}
                onChange={onChange}
                onRemove={onRemove}
                registerInput={registerInput}
              />
            ))}
          </ul>
        ) : (
          <p className="px-4 py-5 text-sm text-muted-foreground">
            {kind === "income" ? "No income yet — add salaries, side work or anything coming in." : "No expenses yet — add bills, groceries, fuel, fun…"}
          </p>
        )}
        {canWrite ? (
          <div className="border-t p-2">
            <Button type="button" variant="ghost" className="w-full justify-start text-primary" onClick={() => onAdd(kind)}>
              <PlusIcon aria-hidden /> Add {kind === "income" ? "income" : "expense"}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function LineRow({
  row,
  per,
  currency,
  canWrite,
  onChange,
  onRemove,
  registerInput,
}: {
  row: Row;
  per: PlanFrequency;
  currency: string;
  canWrite: boolean;
  onChange: (id: string, patch: Partial<Pick<Row, "label" | "amountText" | "frequency">>) => void;
  onRemove: (row: Row) => void;
  registerInput: (id: string, el: HTMLInputElement | null) => void;
}) {
  const invalid = amountOf(row.amountText) === null;
  const name = row.label || (row.kind === "income" ? "income" : "expense");
  return (
    <li className="grid grid-cols-[1fr_auto] gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_9.5rem_8.5rem_auto] sm:items-center">
      <Input
        ref={(el) => registerInput(row.id, el)}
        value={row.label}
        onChange={(e) => onChange(row.id, { label: e.target.value })}
        placeholder={row.kind === "income" ? "e.g. Salary" : "e.g. Groceries"}
        aria-label="Description"
        maxLength={80}
        disabled={!canWrite}
        className="sm:col-start-1"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Remove ${name}`}
        disabled={!canWrite}
        onClick={() => onRemove(row)}
        className="text-muted-foreground hover:text-destructive sm:col-start-4 sm:row-start-1"
      >
        <Trash2Icon aria-hidden />
      </Button>
      <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-2 sm:col-start-2 sm:row-start-1">
        <InputGroup data-invalid={invalid || undefined}>
          <InputGroupAddon>
            <InputGroupText>{currencySymbol(currency)}</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            value={row.amountText}
            onChange={(e) => onChange(row.id, { amountText: e.target.value })}
            inputMode="decimal"
            placeholder="0.00"
            aria-label={`Amount for ${name}`}
            aria-invalid={invalid || undefined}
            disabled={!canWrite}
            className="tabular"
          />
        </InputGroup>
        <NativeSelect
          value={row.frequency}
          onChange={(e) => onChange(row.id, { frequency: e.target.value as PlanFrequency })}
          aria-label={`How often for ${name}`}
          disabled={!canWrite}
        >
          {PLAN_FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {PLAN_FREQUENCY_LABELS[f]}
            </option>
          ))}
        </NativeSelect>
      </div>
      {invalid ? (
        <p className="col-span-2 text-xs text-destructive sm:col-span-4">Enter an amount like 1250 or 1,250.50</p>
      ) : row.frequency !== per && row.amount_minor > 0 ? (
        <p className="col-span-2 text-xs text-muted-foreground sm:col-span-4">
          ≈ <Money minor={convertAmount(row.amount_minor, row.frequency, per)} /> per {PLAN_PERIOD_LABELS[per]}
        </p>
      ) : null}
    </li>
  );
}

function Breakdown({ rows, per, income }: { rows: Row[]; per: PlanFrequency; income: number }) {
  const items = rows
    .map((r) => ({ id: r.id, label: r.label || "Untitled", amount: convertAmount(r.amount_minor, r.frequency, per) }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  if (items.length < 2) return null;
  const total = items.reduce((s, r) => s + r.amount, 0);
  const max = items[0].amount;
  return (
    <section aria-labelledby="plan-breakdown">
      <h2 id="plan-breakdown" className="mb-2 px-1 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        Where the money goes
      </h2>
      <ul className="space-y-3 rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
        {items.map((item) => {
          const share = Math.round(((income > 0 ? item.amount / income : item.amount / total) * 1000)) / 10;
          return (
            <li key={item.id} title={`${item.label}: ${share}% of ${income > 0 ? "income" : "expenses"}`}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{item.label}</span>
                <span className="shrink-0 tabular">
                  <Money minor={item.amount} trimZeroCents /> <span className="text-xs text-muted-foreground">{share}%</span>
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, (item.amount / max) * 100)}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 px-1 text-xs text-muted-foreground">Percentages are each expense&apos;s share of {income > 0 ? "income" : "total expenses"}.</p>
    </section>
  );
}
