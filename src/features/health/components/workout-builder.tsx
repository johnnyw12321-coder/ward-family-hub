"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ListPlusIcon } from "lucide-react";
import { deleteCustomWorkout, saveCustomWorkout } from "../actions/workouts";
import { exercise } from "../catalog/exercises";
import type { CustomWorkout, CustomWorkoutExercise } from "../types";
import { ExercisePicker } from "./workout-logger";

const REST_OPTIONS = [0, 30, 45, 60, 75, 90, 120, 150, 180];

export function WorkoutBuilder({ initial }: { initial?: CustomWorkout }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [items, setItems] = useState<CustomWorkoutExercise[]>(initial?.exercises ?? []);
  const [adding, setAdding] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  const update = (i: number, patch: Partial<CustomWorkoutExercise>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, dir: -1 | 1) =>
    setItems((xs) => {
      const next = [...xs];
      [next[i], next[i + dir]] = [next[i + dir], next[i]];
      return next;
    });

  const save = () =>
    start(async () => {
      const r = await saveCustomWorkout({ id: initial?.id, name, notes, exercises: items });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      router.push("/health/workouts");
    });

  return (
    <div className="space-y-5">
      <div className="space-y-4 rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80 sm:p-5">
        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel htmlFor="cw-name">Name</FieldLabel>
          <Input id="cw-name" placeholder="e.g. Saturday legs" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          <FieldError>{errors.name}</FieldError>
        </Field>
        <Field>
          <FieldLabel htmlFor="cw-notes">Notes</FieldLabel>
          <Textarea id="cw-notes" rows={2} placeholder="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        </Field>
      </div>

      {items.length ? (
        <ol className="space-y-2">
          {items.map((it, i) => (
            <li key={`${it.key}-${i}`} className="rounded-2xl bg-card p-3 shadow-card ring-1 ring-border/80 animate-in fade-in">
              <div className="flex items-center gap-1">
                <span className="w-6 text-center text-xs font-semibold text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{exercise(it.key)?.name}</span>
                <Button variant="ghost" size="icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${exercise(it.key)?.name} up`}>
                  <ArrowUpIcon aria-hidden />
                </Button>
                <Button variant="ghost" size="icon" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${exercise(it.key)?.name} down`}>
                  <ArrowDownIcon aria-hidden />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} aria-label={`Remove ${exercise(it.key)?.name}`}>
                  <XIcon aria-hidden />
                </Button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 pl-7">
                <Field>
                  <FieldLabel htmlFor={`cw-sets-${i}`} className="text-xs">
                    Sets
                  </FieldLabel>
                  <NativeSelect id={`cw-sets-${i}`} value={it.sets} onChange={(e) => update(i, { sets: Number(e.target.value) })}>
                    {Array.from({ length: 10 }, (_, n) => (
                      <option key={n + 1} value={n + 1}>
                        {n + 1}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`cw-reps-${i}`} className="text-xs">
                    {exercise(it.key)?.kind === "time" ? "Time" : "Reps"}
                  </FieldLabel>
                  <Input id={`cw-reps-${i}`} value={it.reps} onChange={(e) => update(i, { reps: e.target.value })} maxLength={12} placeholder="8–12" />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`cw-rest-${i}`} className="text-xs">
                    Rest
                  </FieldLabel>
                  <NativeSelect id={`cw-rest-${i}`} value={it.restS} onChange={(e) => update(i, { restS: Number(e.target.value) })}>
                    {REST_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r ? `${r}s` : "None"}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState icon={ListPlusIcon} title="No exercises yet" description="Add exercises from the library, then set sets, reps and rest for each." />
      )}
      {errors.exercises ? <p className="text-sm text-destructive">{errors.exercises}</p> : null}

      <Button variant="outline" size="lg" className="w-full" onClick={() => setAdding(true)}>
        <PlusIcon aria-hidden /> Add exercise
      </Button>
      <div className="flex flex-wrap gap-2">
        <Button size="lg" className="flex-1" onClick={save} disabled={pending}>
          {pending ? <Spinner /> : null}
          Save workout
        </Button>
        {initial ? (
          <ConfirmAction
            action={() => deleteCustomWorkout(initial.id)}
            redirectTo="/health/workouts"
            size="lg"
            trigger={
              <>
                <Trash2Icon aria-hidden /> Delete
              </>
            }
            title={`Delete ${initial.name}?`}
            description="Workouts you've already logged with it are kept."
            confirmLabel="Delete"
          />
        ) : null}
      </div>

      <ResponsiveModal open={adding} onOpenChange={setAdding} title="Add an exercise">
        {adding ? (
          <ExercisePicker
            exclude={items.map((x) => x.key)}
            onPick={(key) => {
              const ex = exercise(key)!;
              setItems((xs) => [...xs, { key, sets: 3, reps: ex.kind === "time" ? "30 s" : ex.kind === "reps" ? "10–15" : "8–12", restS: ex.kind === "weight" ? 90 : 45 }]);
              setAdding(false);
            }}
          />
        ) : null}
      </ResponsiveModal>
    </div>
  );
}
