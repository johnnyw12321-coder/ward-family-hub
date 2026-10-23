"use client";

import { useOptimistic, useTransition } from "react";
import { DropletIcon, Undo2Icon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import type { CalendarDate } from "@/lib/dates";
import { addWater } from "../actions/tracking";
import { formatVolume, waterServings } from "../calc/units";
import type { Units } from "../types";
import { report } from "./celebrate";

/** Water for one day: tap to add a glass or a bottle; the glasses fill as you go. */
export function WaterTracker({ date, totalMl, goalMl, units, compact = false }: { date: CalendarDate; totalMl: number; goalMl: number; units: Units; compact?: boolean }) {
  const [shown, setShown] = useOptimistic(totalMl);
  const [, start] = useTransition();
  const servings = waterServings(units);
  const glasses = Math.max(1, Math.round(goalMl / servings[0].ml));
  const filled = Math.min(glasses, Math.floor(shown / servings[0].ml + 0.001));
  const done = shown >= goalMl;

  const change = (deltaMl: number) =>
    start(async () => {
      setShown(Math.max(0, shown + deltaMl));
      report(await addWater({ onDate: date, deltaMl }), true);
    });

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <div aria-live="polite">
          <span className="text-2xl font-semibold tabular">{formatVolume(shown, units)}</span>
          <span className="ml-1.5 text-sm text-muted-foreground">of {formatVolume(goalMl, units)}</span>
        </div>
        {done ? <span className="text-sm font-medium text-success">Goal reached</span> : null}
      </div>
      {!compact ? (
        <div className="flex flex-wrap gap-1" aria-hidden>
          {Array.from({ length: Math.min(glasses, 16) }, (_, i) => (
            <DropletIcon
              key={i}
              className={cn("size-6 transition-all duration-300", i < filled ? "scale-100 fill-chart-3 text-chart-3" : "scale-90 text-muted-foreground/40")}
            />
          ))}
        </div>
      ) : (
        <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-chart-3 transition-[width] duration-500" style={{ width: `${Math.min(100, (shown / goalMl) * 100)}%` }} />
        </div>
      )}
      <div className="flex gap-2">
        {servings.map((s) => (
          <Button key={s.ml} variant="secondary" className="h-11 flex-1" onClick={() => change(s.ml)} aria-label={`Add ${formatVolume(s.ml, units)} of water`}>
            <DropletIcon aria-hidden /> {s.label}
          </Button>
        ))}
        <Button variant="ghost" size="icon-lg" disabled={shown <= 0} onClick={() => change(-Math.min(shown, servings[0].ml))} aria-label="Undo last glass">
          <Undo2Icon aria-hidden />
        </Button>
      </div>
    </div>
  );
}
