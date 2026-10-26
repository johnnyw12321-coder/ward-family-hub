"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalculatorIcon, CalendarClockIcon, ChevronRightIcon, RotateCcwIcon } from "lucide-react";
import { cn } from "cn";
import { Money } from "@/components/shared/money";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { addDays, dayHeading, monthLabel, type CalendarDate } from "@/lib/dates";
import { evaluate } from "@/lib/calc";
import { currencySymbol, formatMoney, type Minor } from "@/lib/money";
import { needUntil, quickDates, type UntilLine } from "../until";
import type { UntilData } from "../until-data";
import { Calculator } from "./calculator";

const PER: Record<UntilLine["period"], string> = { day: "a day", weekday: "a weekday", week: "a week", month: "a month" };

function explain(l: UntilLine, currency: string): string {
  const rate = formatMoney(l.rateMinor, { currency, trimZeroCents: true });
  // Different budgets in the months the window covers: say so, month by month.
  const byMonth = l.monthRates
    ? `${l.monthRates.map((m, i) => `${formatMoney(m.rateMinor, { currency, trimZeroCents: true })}${i === 0 ? ` ${PER[l.period]}` : ""} in ${monthLabel(m.month).split(" ")[0]}`).join(", ")} · ${l.units} ${l.period === "weekday" ? "weekdays" : "days"}`
    : null;
  const base =
    byMonth ??
    (l.period === "weekday"
      ? `${rate} × ${l.units} weekday${l.units === 1 ? "" : "s"}`
      : l.period === "day"
        ? `${rate} × ${l.units} day${l.units === 1 ? "" : "s"}`
        : l.period === "week"
          ? `${rate} a week × ${l.units} day${l.units === 1 ? "" : "s"} ÷ 7`
          : l.monthDays
            ? `${rate} a month × ${l.units} of ${l.monthDays} days`
            : `${rate} a month, spread over ${l.units} days`);
  if (!l.bills.length) return base;
  const names = l.bills.map((b) => `${b.name} ${dayHeading(b.date).split(" ").slice(1).join(" ")}`).join(", ");
  return l.amountMinor > l.fromBudgetMinor ? `Bills: ${names} (more than the budget share of ${formatMoney(l.fromBudgetMinor, { currency, trimZeroCents: true })})` : `${base} · incl. ${names}`;
}

/** "How much do we need until…?": pick a date, see the total and why. */
export function NeedUntil({ data }: { data: UntilData }) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const quick = quickDates(data.today);
  const [until, setUntil] = useState<CalendarDate>(quick.friday);
  const [overrides, setOverrides] = useState<Map<string, Minor>>(new Map());
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [calc, setCalc] = useState(false);

  // The home-screen shortcut opens straight into the sheet (/?until=1).
  useEffect(() => {
    if (params.get("until") !== "1") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opening from a link is a one-off sync with the URL
    setOpen(true);
    router.replace("/", { scroll: false });
  }, [params, router]);

  const parentOf = useMemo(() => new Map(data.parents), [data.parents]);
  const r = useMemo(
    () => needUntil({ today: data.today, until, budget: data.budget, recurring: data.recurring, parentOf, availableCashMinor: data.cashMinor, overrides }),
    [data, until, parentOf, overrides],
  );

  const chips: { label: string; date: CalendarDate }[] = [
    { label: "This Friday", date: quick.friday },
    ...(data.payday && data.payday !== quick.friday ? [{ label: "Next payday", date: data.payday }] : []),
    ...(quick.monthEnd !== quick.friday && quick.monthEnd !== data.payday ? [{ label: "End of month", date: quick.monthEnd }] : []),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const money = (m: Minor) => <Money minor={m} trimZeroCents />;
  const saveDraft = (categoryId: string) => {
    const v = evaluate(draft);
    if (v !== null && v >= 0) setOverrides((o) => new Map(o).set(categoryId, Math.round(v * 100)));
    setEditing(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl bg-card p-4 text-left shadow-card ring-1 ring-border/80 transition-colors hover:bg-muted/50"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <CalendarClockIcon className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">How much do we need until…?</span>
          <span className="block text-sm text-muted-foreground">Pick a date to see the total for bills and everyday spending</span>
        </span>
        <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
      </button>

      <ResponsiveModal open={open} onOpenChange={setOpen} title={calc ? "Calculator" : "How much do we need until…?"}>
        {calc ? (
          <div className="space-y-3">
            <Calculator />
            <Button variant="outline" size="lg" className="w-full" onClick={() => setCalc(false)}>
              Back to the total
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <div role="radiogroup" aria-label="Until" className="flex flex-wrap gap-2">
                {chips.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    role="radio"
                    aria-checked={until === c.date}
                    onClick={() => setUntil(c.date)}
                    className={cn(
                      "flex min-h-11 flex-col items-start justify-center rounded-xl px-3.5 py-1.5 text-left text-sm font-medium transition-colors",
                      until === c.date ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {c.label}
                    <span className={cn("text-[11px] font-normal", until === c.date ? "text-background/75" : "text-muted-foreground")}>{dayHeading(c.date)}</span>
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Or pick a date</span>
                <Input
                  type="date"
                  className="h-11 w-auto"
                  value={until}
                  min={data.today}
                  max={addDays(data.today, 366)}
                  onChange={(e) => e.target.value && setUntil(e.target.value)}
                  aria-label="Until date"
                />
              </label>
            </div>

            <div className="rounded-2xl bg-primary p-4 text-primary-foreground">
              <div className="text-sm text-primary-foreground/80">
                Today to {dayHeading(r.until)} · {r.days} {r.days === 1 ? "day" : "days"}
              </div>
              <div className="text-3xl font-semibold tracking-tight tabular" aria-live="polite">
                {money(r.totalMinor)}
              </div>
              <div className="text-sm text-primary-foreground/80">needed for bills and everyday spending</div>
            </div>

            {r.lines.length ? (
              <section aria-label="Everyday spending">
                <h3 className="mb-1.5 text-sm font-semibold">Everyday spending</h3>
                <ul className="divide-y rounded-xl ring-1 ring-border/80">
                  {r.lines.map((l) => (
                    <li key={l.categoryId} className="px-3 py-2.5">
                      {editing === l.categoryId ? (
                        <form
                          className="flex flex-wrap items-center gap-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            saveDraft(l.categoryId);
                          }}
                        >
                          <span className="basis-full text-sm font-medium">{l.name}: try a different amount</span>
                          <InputGroup className="min-w-0 flex-1">
                            <InputGroupAddon>
                              <InputGroupText>{currencySymbol(data.currency)}</InputGroupText>
                            </InputGroupAddon>
                            <InputGroupInput autoFocus inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={`${l.name} ${PER[l.period]}`} />
                          </InputGroup>
                          <span className="text-xs text-muted-foreground">{PER[l.period]}</span>
                          <Button type="submit" size="sm">
                            OK
                          </Button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          className="flex w-full items-start gap-3 text-left"
                          onClick={() => {
                            setEditing(l.categoryId);
                            setDraft(String(l.rateMinor / 100));
                          }}
                          aria-label={`${l.name}: ${formatMoney(l.amountMinor, { currency: data.currency })}. Tap to try a different amount`}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 text-sm font-medium">
                              {l.name}
                              {l.overridden ? <span className="rounded-full bg-warning-soft px-1.5 text-[10px] font-semibold text-warning">what-if</span> : null}
                            </span>
                            <span className="block text-xs text-muted-foreground">{explain(l, data.currency)}</span>
                          </span>
                          <span className="text-sm font-semibold tabular">{money(l.amountMinor)}</span>
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
                  <span>Tap a line to try a different amount. Nothing is saved.</span>
                  {overrides.size ? (
                    <button type="button" className="flex items-center gap-1 font-medium text-primary" onClick={() => setOverrides(new Map())}>
                      <RotateCcwIcon className="size-3" aria-hidden /> Undo what-ifs
                    </button>
                  ) : null}
                </div>
              </section>
            ) : (
              <p className="rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">
                No budget yet. Add everyday spending in Budgets, like gas at TT$200 a week or travel at TT$30 a weekday, and it shows up here.
              </p>
            )}

            {r.bills.length ? (
              <section aria-label="Bills due">
                <h3 className="mb-1.5 text-sm font-semibold">Bills due</h3>
                <ul className="divide-y rounded-xl ring-1 ring-border/80">
                  {r.bills.map((b) => (
                    <li key={`${b.id}-${b.date}`} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{b.name}</span>
                        <span className={cn("block text-xs", b.overdue ? "text-destructive" : "text-muted-foreground")}>
                          {b.overdue ? `Overdue since ${dayHeading(b.date)}` : dayHeading(b.date)}
                        </span>
                      </span>
                      <span className="font-semibold tabular">{money(b.amountMinor)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {r.cardBillsLeftOut ? (
              <p className="-mt-3 px-1 text-xs text-muted-foreground">
                {r.cardBillsLeftOut} {r.cardBillsLeftOut === 1 ? "bill is" : "bills are"} charged to a credit card, so not counted here.
              </p>
            ) : null}

            <section aria-label="Compared with what we have" className="space-y-1.5 rounded-xl bg-muted/50 p-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Cash and chequing now</span>
                <span className="tabular">{money(r.cashMinor)}</span>
              </div>
              {r.income.map((i) => (
                <div key={`${i.id}-${i.date}`} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">
                    + {i.name}, {dayHeading(i.date)}
                  </span>
                  <span className="tabular">{money(i.amountMinor)}</span>
                </div>
              ))}
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">− Needed</span>
                <span className="tabular">{money(r.totalMinor)}</span>
              </div>
              <div className="flex justify-between gap-3 border-t pt-1.5 font-semibold">
                <span>{r.leftOverMinor >= 0 ? "To spare" : "Short by"}</span>
                <span className={cn("tabular", r.leftOverMinor < 0 ? "text-destructive" : "text-success")}>{money(Math.abs(r.leftOverMinor))}</span>
              </div>
            </section>

            <Button variant="outline" size="lg" className="w-full" onClick={() => setCalc(true)}>
              <CalculatorIcon aria-hidden /> Calculator
            </Button>
          </div>
        )}
      </ResponsiveModal>
    </>
  );
}
