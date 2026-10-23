"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckIcon, InfoIcon, LightbulbIcon, MinusIcon, PlusIcon, SearchIcon, TimerIcon, TrophyIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { deleteSet, deleteWorkout, finishWorkout, logSet } from "../actions/workouts";
import type { Suggestion } from "../calc/strength";
import { displayWeight, toKg, weightUnit } from "../calc/units";
import { EQUIPMENT, EXERCISES, MUSCLE_GROUPS, type ExerciseKind } from "../catalog/exercises";
import { searchFoods as searchByName } from "../catalog/foods";
import type { Units } from "../types";
import { celebrate } from "./celebrate";

export type LoggerBlock = {
  /** Stored on each set, so an exercise's sets stay together even if blocks are added or removed. */
  position: number;
  key: string;
  name: string;
  kind: ExerciseKind;
  target: { sets: number; reps: string; restS: number } | null;
  last: { reps: number | null; weightKg: number | null; durationS: number | null }[];
  suggestion: Suggestion | null;
};

export type LoggedSet = {
  id: string;
  exerciseKey: string;
  position: number;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationS: number | null;
  record: boolean;
};

type Draft = { weight: string; reps: string; seconds: string };

const num = (v: string) => Number(v.replace(",", "."));
const describe = (s: { reps: number | null; weightKg: number | null; durationS: number | null }, units: Units) =>
  s.durationS !== null ? `${s.durationS}s` : s.weightKg ? `${displayWeight(s.weightKg, units)} × ${s.reps}` : `${s.reps} reps`;

function useNow(intervalMs: number, active = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, active]);
  return now;
}

export function WorkoutLogger({
  sessionId,
  name,
  startedAt,
  notes,
  units,
  blocks: initialBlocks,
  logged,
}: {
  sessionId: string;
  name: string;
  startedAt: string;
  notes: string | null;
  units: Units;
  blocks: LoggerBlock[];
  logged: LoggedSet[];
}) {
  const router = useRouter();
  const [blocks, setBlocks] = useState(initialBlocks);
  const [sets, setSets] = useState(logged);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [rest, setRest] = useState<{ endsAt: number; total: number } | null>(null);
  const [adding, setAdding] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [pending, start] = useTransition();
  const now = useNow(30_000);
  const minutes = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 60_000));
  const unit = weightUnit(units);

  const draftFor = (i: number): Draft => {
    if (drafts[i]) return drafts[i];
    const b = blocks[i];
    const mine = sets.filter((s) => s.position === b.position).at(-1);
    const prev = mine ?? b.last[0];
    const sug = !mine ? b.suggestion : null;
    const weightKg = sug?.weightKg ?? prev?.weightKg ?? null;
    return {
      weight: weightKg ? String(displayWeight(weightKg, units)) : "",
      reps: String(sug?.reps ?? prev?.reps ?? ""),
      seconds: String(sug?.durationS ?? prev?.durationS ?? ""),
    };
  };
  const setDraft = (i: number, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [i]: { ...draftFor(i), ...patch } }));

  const log = (i: number) => {
    const b = blocks[i];
    const d = draftFor(i);
    const reps = b.kind === "time" ? null : Math.round(num(d.reps));
    const durationS = b.kind === "time" ? Math.round(num(d.seconds)) : null;
    const weightKg = b.kind === "weight" && d.weight ? toKg(num(d.weight), units) : null;
    if (b.kind === "time" ? !(durationS! > 0) : !(reps! > 0)) {
      toast.error(b.kind === "time" ? "Enter the seconds you held it" : "Enter your reps");
      return;
    }
    if (b.kind === "weight" && d.weight && !(num(d.weight) >= 0)) {
      toast.error("Enter the weight as a number");
      return;
    }
    const setNumber = sets.filter((s) => s.position === b.position).length + 1;
    start(async () => {
      const r = await logSet({ sessionId, exerciseKey: b.key, position: b.position, setNumber, reps, weightKg, durationS, note: null });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setSets((s) => [...s, { id: r.data.id, exerciseKey: b.key, position: b.position, setNumber, reps, weightKg, durationS, record: r.data.records.length > 0 }]);
      for (const rec of r.data.records) {
        toast.success(`New personal record: ${b.name}`, { description: rec.label, icon: <TrophyIcon className="size-4 text-warning" aria-hidden />, duration: 5000 });
      }
      const restS = b.target?.restS ?? 90;
      if (restS > 0) setRest({ endsAt: Date.now() + restS * 1000, total: restS });
    });
  };

  const remove = (set: LoggedSet) =>
    start(async () => {
      const r = await deleteSet(set.id);
      if (!r.ok) toast.error(r.error);
      else setSets((s) => s.filter((x) => x.id !== set.id));
    });

  const done = sets.length;
  const planned = blocks.reduce((n, b) => n + (b.target?.sets ?? 0), 0);

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-muted-foreground">In progress · {minutes} min</div>
          <h1 className="truncate text-lg font-semibold">{name}</h1>
          <div className="text-xs text-muted-foreground tabular">
            {done} {planned ? `of ${planned}` : ""} sets logged
          </div>
        </div>
        <Button size="lg" onClick={() => setFinishing(true)} disabled={pending}>
          <CheckIcon aria-hidden /> Finish
        </Button>
      </div>

      {blocks.map((b, i) => {
        const mine = sets.filter((s) => s.position === b.position);
        const d = draftFor(i);
        return (
          <section key={`${b.key}-${i}`} aria-labelledby={`ex-${i}`} className="overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-border/80 animate-in fade-in">
            <header className="flex items-start gap-2 px-4 pt-3.5">
              <div className="min-w-0 flex-1">
                <h2 id={`ex-${i}`} className="font-semibold">
                  {b.name}
                </h2>
                <div className="text-xs text-muted-foreground">
                  {b.target ? `${b.target.sets} × ${b.target.reps} · rest ${b.target.restS}s` : "Extra exercise"}
                  {b.last.length ? ` · last: ${b.last.map((s) => describe(s, units)).join(", ")}` : ""}
                </div>
              </div>
              <Link href={`/health/workouts/exercises/${b.key}`} className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" aria-label={`How to do ${b.name}`}>
                <InfoIcon className="size-4" aria-hidden />
              </Link>
            </header>
            {b.suggestion && !mine.length ? (
              <p className="mx-4 mt-2 flex gap-2 rounded-xl bg-accent/60 px-3 py-2 text-xs text-accent-foreground">
                <LightbulbIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {b.suggestion.message}
              </p>
            ) : null}
            {mine.length ? (
              <ol className="mt-2 divide-y border-y">
                {mine.map((s) => (
                  <li key={s.id} className="flex min-h-11 items-center gap-3 px-4 text-sm">
                    <span className="w-12 text-xs text-muted-foreground">Set {s.setNumber}</span>
                    <span className="flex-1 font-medium tabular">{describe(s, units)}</span>
                    {s.record ? (
                      <span className="flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning">
                        <TrophyIcon className="size-3" aria-hidden /> PR
                      </span>
                    ) : null}
                    <button type="button" className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" aria-label={`Delete set ${s.setNumber}`} onClick={() => remove(s)} disabled={pending}>
                      <XIcon className="size-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ol>
            ) : null}
            <div className="flex items-end gap-2 p-3">
              <span className="mb-3 w-12 shrink-0 pl-1 text-xs text-muted-foreground">Set {mine.length + 1}</span>
              {b.kind === "weight" ? <Stepper label={unit} value={d.weight} step={units === "imperial" ? 5 : 2.5} onChange={(v) => setDraft(i, { weight: v })} ariaLabel={`Weight for ${b.name}`} /> : null}
              {b.kind === "time" ? (
                <Stepper label="sec" value={d.seconds} step={5} onChange={(v) => setDraft(i, { seconds: v })} ariaLabel={`Seconds for ${b.name}`} />
              ) : (
                <Stepper label="reps" value={d.reps} step={1} onChange={(v) => setDraft(i, { reps: v })} ariaLabel={`Reps for ${b.name}`} />
              )}
              <Button size="icon-lg" onClick={() => log(i)} disabled={pending} aria-label={`Log set ${mine.length + 1} of ${b.name}`} className="shrink-0">
                {pending ? <Spinner /> : <CheckIcon aria-hidden />}
              </Button>
            </div>
          </section>
        );
      })}

      <Button variant="outline" size="lg" className="w-full" onClick={() => setAdding(true)}>
        <PlusIcon aria-hidden /> Add exercise
      </Button>
      <ConfirmAction
        action={() => deleteWorkout(sessionId)}
        redirectTo="/health/workouts"
        variant="ghost"
        className="w-full text-destructive"
        trigger="Discard workout"
        title="Discard this workout?"
        description="Every set logged in this workout will be deleted."
        confirmLabel="Discard"
      />

      <ResponsiveModal open={adding} onOpenChange={setAdding} title="Add an exercise">
        {adding ? (
          <ExercisePicker
            onPick={(key) => {
              const ex = EXERCISES.find((e) => e.key === key)!;
              setBlocks((bs) => [
                ...bs,
                { position: Math.max(-1, ...bs.map((x) => x.position)) + 1, key, name: ex.name, kind: ex.kind, target: null, last: [], suggestion: null },
              ]);
              setAdding(false);
            }}
          />
        ) : null}
      </ResponsiveModal>

      <ResponsiveModal open={finishing} onOpenChange={setFinishing} title="Finish workout" description={`${done} sets in ${minutes} minutes.`}>
        {finishing ? (
          <FinishForm
            initialNotes={notes ?? ""}
            onFinish={(n) =>
              start(async () => {
                const r = await finishWorkout({ id: sessionId, notes: n });
                if (!r.ok) {
                  toast.error(r.error);
                  return;
                }
                toast.success(r.message);
                celebrate(r.data.badges);
                setFinishing(false);
                router.refresh();
              })
            }
            pending={pending}
          />
        ) : null}
      </ResponsiveModal>

      {rest ? <RestTimer rest={rest} onChange={setRest} /> : null}
    </div>
  );
}

function Stepper({ label, value, step, onChange, ariaLabel }: { label: string; value: string; step: number; onChange: (v: string) => void; ariaLabel: string }) {
  const n = num(value || "0");
  const bump = (dir: number) => onChange(String(Math.max(0, Math.round((n + dir * step) * 100) / 100)));
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-center text-[11px] font-medium text-muted-foreground uppercase">{label}</div>
      <InputGroup className="h-12">
        <InputGroupAddon>
          <button type="button" className="flex size-8 items-center justify-center rounded-lg hover:bg-muted" onClick={() => bump(-1)} aria-label={`Less (${ariaLabel})`}>
            <MinusIcon className="size-4" aria-hidden />
          </button>
        </InputGroupAddon>
        <InputGroupInput inputMode="decimal" className="text-center text-base font-semibold tabular" value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel} />
        <InputGroupAddon align="inline-end">
          <button type="button" className="flex size-8 items-center justify-center rounded-lg hover:bg-muted" onClick={() => bump(1)} aria-label={`More (${ariaLabel})`}>
            <PlusIcon className="size-4" aria-hidden />
          </button>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}

function RestTimer({ rest, onChange }: { rest: { endsAt: number; total: number }; onChange: (r: { endsAt: number; total: number } | null) => void }) {
  const now = useNow(250);
  const left = Math.max(0, Math.ceil((rest.endsAt - now) / 1000));
  const buzzed = useRef(false);
  useEffect(() => {
    if (left > 0) {
      buzzed.current = false;
      return;
    }
    if (buzzed.current) return;
    buzzed.current = true;
    navigator.vibrate?.([200, 100, 200]);
    const id = setTimeout(() => onChange(null), 4000);
    return () => clearTimeout(id);
  }, [left, onChange]);
  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 px-4 pb-3 lg:bottom-4 lg:left-64 animate-in slide-in-from-bottom-4">
      <div className="mx-auto flex max-w-xl items-center gap-3 overflow-hidden rounded-2xl bg-foreground px-4 py-3 text-background shadow-float" role="timer" aria-live="off" aria-label="Rest timer">
        <TimerIcon className="size-5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-xs opacity-75">{left > 0 ? "Rest" : "Rest done — next set!"}</div>
          <div className="text-xl font-semibold tabular">
            {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-background/20" aria-hidden>
            <div className="h-full bg-background transition-[width] duration-200" style={{ width: `${(left / rest.total) * 100}%` }} />
          </div>
        </div>
        <button type="button" className="h-10 rounded-lg px-2 text-sm font-medium hover:bg-background/10" onClick={() => onChange({ ...rest, endsAt: rest.endsAt - 15_000 })}>
          −15
        </button>
        <button type="button" className="h-10 rounded-lg px-2 text-sm font-medium hover:bg-background/10" onClick={() => onChange({ endsAt: Math.max(Date.now(), rest.endsAt) + 15_000, total: rest.total + 15 })}>
          +15
        </button>
        <button type="button" className="h-10 rounded-lg px-2.5 text-sm font-semibold hover:bg-background/10" onClick={() => onChange(null)}>
          Skip
        </button>
      </div>
    </div>
  );
}

function FinishForm({ initialNotes, onFinish, pending }: { initialNotes: string; onFinish: (notes: string) => void; pending: boolean }) {
  const [notes, setNotes] = useState(initialNotes);
  return (
    <div className="space-y-4">
      <Field>
        <FieldLabel htmlFor="wk-notes">Notes</FieldLabel>
        <Textarea id="wk-notes" rows={3} maxLength={2000} placeholder="How did it feel? Anything to remember next time?" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Button size="lg" className="w-full" onClick={() => onFinish(notes)} disabled={pending}>
        {pending ? <Spinner /> : <CheckIcon aria-hidden />}
        Save workout
      </Button>
    </div>
  );
}

/** Search the exercise library by name, muscle or equipment. */
export function ExercisePicker({ onPick, exclude = [] }: { onPick: (key: string) => void; exclude?: string[] }) {
  const [q, setQ] = useState("");
  const items = useMemo(
    () => EXERCISES.filter((e) => !exclude.includes(e.key)).map((e) => ({ ...e, aliases: `${MUSCLE_GROUPS[e.primary]} ${EQUIPMENT[e.equipment]}` })),
    [exclude],
  );
  const results = useMemo(() => searchByName(items, q, 80), [items, q]);
  return (
    <div className="space-y-2">
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon aria-hidden />
        </InputGroupAddon>
        <InputGroupInput autoFocus type="search" placeholder="Search, e.g. squat, chest, dumbbell" aria-label="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} />
      </InputGroup>
      <ul className="max-h-[55dvh] divide-y overflow-y-auto rounded-xl ring-1 ring-border/80">
        {results.map((e) => (
          <li key={e.key}>
            <button type="button" onClick={() => onPick(e.key)} className={cn("flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/60")}>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{e.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {MUSCLE_GROUPS[e.primary]} · {EQUIPMENT[e.equipment]}
                </span>
              </span>
              <PlusIcon className="size-4 text-primary" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
