"use client";

import { useState, useTransition } from "react";
import { BellOffIcon, BellRingIcon, MoonIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { addDays, formatDate, type CalendarDate } from "@/lib/dates";
import { saveReminder } from "../actions";
import { REMINDER_INFO, SNOOZE_OPTIONS, type ReminderState } from "../reminders";

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "flex min-h-11 items-center rounded-full px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        selected ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** Adjust one item's reminder: how early, snooze, or off. Shared with the household. */
export function ReminderEditor({ state, today, onDone }: { state: ReminderState; today: CalendarDate; onDone: () => void }) {
  const info = REMINDER_INFO[state.source];
  const [on, setOn] = useState(!state.muted);
  const [lead, setLead] = useState<number | null>(state.leadDays);
  const snoozed = state.snoozedUntil && state.snoozedUntil > today ? state.snoozedUntil : null;
  const [snooze, setSnooze] = useState<CalendarDate | null>(snoozed);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const r = await saveReminder({
        source: state.source,
        itemId: state.itemId,
        leadDays: info.leads ? lead : null,
        muted: !on,
        snoozedUntil: on ? snooze : null,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      onDone();
    });

  return (
    <div className="space-y-5">
      <label className="flex min-h-12 items-center gap-3 rounded-xl bg-muted/50 px-3">
        {on ? <BellRingIcon className="size-5 text-primary" aria-hidden /> : <BellOffIcon className="size-5 text-muted-foreground" aria-hidden />}
        <span className="flex-1 text-sm font-medium">Remind us about this {info.noun}</span>
        <Switch checked={on} onCheckedChange={setOn} aria-label={`Reminders for this ${info.noun}`} />
      </label>

      {on && info.leads ? (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">When to start reminding</legend>
          <div role="radiogroup" aria-label="When to start reminding" className="flex flex-wrap gap-2">
            {info.leads.map((o) => (
              <Chip key={String(o.value)} selected={lead === o.value} onClick={() => setLead(o.value)}>
                {o.label}
              </Chip>
            ))}
          </div>
        </fieldset>
      ) : null}

      {on ? (
        <fieldset className="space-y-2">
          <legend className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            <MoonIcon className="size-4 text-muted-foreground" aria-hidden /> Snooze
          </legend>
          <div role="radiogroup" aria-label="Snooze" className="flex flex-wrap gap-2">
            <Chip selected={snooze === null} onClick={() => setSnooze(null)}>
              Don&apos;t snooze
            </Chip>
            {SNOOZE_OPTIONS.map((o) => {
              const until = addDays(today, o.days);
              return (
                <Chip key={o.days} selected={snooze === until} onClick={() => setSnooze(until)}>
                  {o.label}
                </Chip>
              );
            })}
            {snooze && !SNOOZE_OPTIONS.some((o) => addDays(today, o.days) === snooze) ? (
              <Chip selected onClick={() => undefined}>
                Until {formatDate(snooze)}
              </Chip>
            ) : null}
          </div>
          {snooze ? <p className="text-xs text-muted-foreground">Quiet until {formatDate(snooze)}, then it reminds you again.</p> : null}
        </fieldset>
      ) : (
        <p className="text-sm text-muted-foreground">No more reminders for this {info.noun} until you turn them back on.</p>
      )}

      <p className="flex gap-2 text-xs text-muted-foreground">
        <UsersIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Changes apply to everyone in the household.
      </p>

      <Button size="lg" className="w-full" onClick={save} disabled={pending}>
        {pending ? <Spinner /> : null}
        Save reminder
      </Button>
    </div>
  );
}
