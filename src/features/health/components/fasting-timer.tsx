"use client";

import { useEffect, useState, useTransition } from "react";
import { MoonIcon, UtensilsIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { setFastingProtocol, toggleFast } from "../actions/diet";
import { FASTING_HOURS } from "../catalog/diet-plans";
import type { FastingProtocol } from "../types";
import { Segmented } from "./choice-cards";
import { ProgressRing } from "./rings";

const hm = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 60_000));
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}m`;
};

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/** Intermittent-fasting timer: start a fast, watch the ring fill, end it to open the eating window. */
export function FastingTimer({ protocol, startedAt }: { protocol: FastingProtocol; startedAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  const [pending, start] = useTransition();
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [startedAt]);

  const goalMs = FASTING_HOURS[protocol] * 3_600_000;
  const elapsed = startedAt ? now - new Date(startedAt).getTime() : 0;
  const done = startedAt !== null && elapsed >= goalMs;
  const endsAt = startedAt ? new Date(new Date(startedAt).getTime() + goalMs).toISOString() : null;

  const run = (begin: boolean) =>
    start(async () => {
      const r = await toggleFast(begin);
      if (!r.ok) toast.error(r.error);
      else {
        setNow(Date.now());
        toast.success(r.message);
      }
    });

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <ProgressRing
        value={elapsed}
        max={goalMs}
        size={152}
        stroke={12}
        color={done ? "var(--success)" : "var(--primary)"}
        label={startedAt ? `Fasting for ${hm(elapsed)} of ${FASTING_HOURS[protocol]} hours` : "Not fasting"}
      >
        {startedAt ? (
          <>
            <span className="text-xs text-muted-foreground">{done ? "Complete" : "Fasting"}</span>
            <span className="text-xl font-semibold tabular">{hm(elapsed)}</span>
            <span className="text-xs text-muted-foreground">of {FASTING_HOURS[protocol]}h</span>
          </>
        ) : (
          <>
            <UtensilsIcon className="size-6 text-muted-foreground" aria-hidden />
            <span className="mt-1 text-xs text-muted-foreground">Eating window</span>
          </>
        )}
      </ProgressRing>
      <div className="flex w-full flex-1 flex-col gap-3">
        <Segmented
          label="Fasting protocol"
          value={protocol}
          onChange={(p) =>
            start(async () => {
              const r = await setFastingProtocol({ protocol: p });
              if (!r.ok) toast.error(r.error);
            })
          }
          options={[
            { value: "16:8", label: "16:8" },
            { value: "18:6", label: "18:6" },
          ]}
        />
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {startedAt
            ? done
              ? "You've reached your fasting goal. Your eating window is open whenever you're ready."
              : `Started at ${clock(startedAt)} · ${hm(goalMs - elapsed)} to go (until ${clock(endsAt!)}).`
            : `Fast for ${FASTING_HOURS[protocol]} hours, then eat within ${24 - FASTING_HOURS[protocol]}. Start the timer after your last meal.`}
        </p>
        <Button size="lg" variant={startedAt ? (done ? "default" : "outline") : "default"} onClick={() => run(!startedAt)} disabled={pending}>
          {pending ? <Spinner /> : startedAt ? <UtensilsIcon aria-hidden /> : <MoonIcon aria-hidden />}
          {startedAt ? "End fast" : "Start fasting"}
        </Button>
      </div>
    </div>
  );
}
