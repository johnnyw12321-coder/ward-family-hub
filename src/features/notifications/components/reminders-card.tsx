"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { setReminder } from "../push-actions";

const REMINDERS = [
  {
    kind: "daily_log",
    title: "Evening reminder to log spending",
    description: "Around 8 p.m., only on days you haven't recorded anything yet.",
  },
  {
    kind: "weekly_checkin",
    title: "Sunday money check-in",
    description: "Sunday around 7 a.m.: compare your bank balances and count your wallet.",
  },
] as const;

/** Per-person habit reminders, sent to the phones where notifications are on. */
export function RemindersCard({ initial }: { initial: Record<string, boolean> }) {
  const [values, setValues] = useState(initial);
  const [pending, start] = useTransition();
  const toggle = (kind: string, on: boolean) => {
    setValues((v) => ({ ...v, [kind]: on }));
    start(async () => {
      const r = await setReminder(kind, on);
      if (!r.ok) {
        setValues((v) => ({ ...v, [kind]: !on }));
        toast.error(r.error);
      }
    });
  };
  return (
    <div className="divide-y rounded-2xl bg-card shadow-card ring-1 ring-border/80">
      {REMINDERS.map((r) => (
        <label key={r.kind} htmlFor={`rem-${r.kind}`} className="flex cursor-pointer items-start justify-between gap-4 p-4">
          <span className="min-w-0">
            <span className="block font-medium">{r.title}</span>
            <span className="block text-sm text-muted-foreground">{r.description}</span>
          </span>
          <Switch id={`rem-${r.kind}`} checked={Boolean(values[r.kind])} disabled={pending} onCheckedChange={(on) => toggle(r.kind, on)} />
        </label>
      ))}
      <p className="px-4 py-3 text-xs text-muted-foreground">Sent to the phones where notifications are turned on above. Each of you sets these for yourself.</p>
    </div>
  );
}
