"use client";

import { useTransition } from "react";
import { BellOffIcon, MoonIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import { saveReminder } from "../actions";
import { REMINDER_INFO, type ReminderSource } from "../reminders";

type Quiet = { source: ReminderSource; itemId: string; name: string; muted: boolean; snoozedUntil: string | null; leadDays: number | null };

/** Timing for these is kept on the item itself, so "back on" leaves it as it is. */
const NATIVE: ReminderSource[] = ["bill", "event", "document"];

/** Reminders someone turned off or snoozed, with a way back. */
export function QuietReminders({ items, canEdit }: { items: Quiet[]; canEdit: boolean }) {
  const [pending, start] = useTransition();
  return (
    <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-border/80">
      {items.map((q) => (
        <li key={`${q.source}:${q.itemId}`} className="flex min-h-14 items-center gap-3 py-2 pr-2 pl-4">
          {q.muted ? (
            <BellOffIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <MoonIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{q.name}</div>
            <div className="text-xs text-muted-foreground">
              <span className="capitalize">{REMINDER_INFO[q.source].noun}</span> · {q.muted ? "Reminders off" : `Snoozed until ${formatDate(q.snoozedUntil)}`}
            </div>
          </div>
          {canEdit ? (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await saveReminder({
                    source: q.source,
                    itemId: q.itemId,
                    leadDays: NATIVE.includes(q.source) ? null : q.leadDays,
                    muted: false,
                    snoozedUntil: null,
                  });
                  if (r.ok) toast.success("Reminder back on");
                  else toast.error(r.error);
                })
              }
            >
              Turn back on
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
