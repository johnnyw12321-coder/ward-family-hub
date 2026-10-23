"use client";

import { useState, useTransition } from "react";
import { BookmarkPlusIcon, CopyIcon, EllipsisIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { addDays, type CalendarDate } from "@/lib/dates";
import { copyMeal, deleteFoodLog, saveMealFromLog, updateFoodServings } from "../actions/tracking";
import { sumNutrition, type MacroTargets } from "../calc/macros";
import type { CustomFood, FoodLog, Meal, SavedMeal } from "../types";
import { MEALS } from "../types";
import { report } from "./celebrate";
import { FoodPicker } from "./food-picker";
import { MACRO_COLORS, MACRO_LABELS } from "./macros";
import { ProgressRing } from "./rings";

export const MEAL_LABELS: Record<Meal, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snacks" };

const kcal = (n: number) => Math.round(n).toLocaleString("en-GB");

/** Calories and macros eaten vs targets, as rings. */
export function IntakeRings({ eaten, targets }: { eaten: { calories: number; proteinG: number; carbsG: number; fatG: number }; targets: MacroTargets }) {
  const left = targets.calories - eaten.calories;
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-around">
      <ProgressRing value={eaten.calories} max={targets.calories} size={164} stroke={14} label={`${kcal(eaten.calories)} of ${kcal(targets.calories)} calories eaten`}>
        <span className="text-3xl font-semibold tracking-tight tabular">{kcal(Math.abs(left))}</span>
        <span className="text-xs text-muted-foreground">{left >= 0 ? "kcal left" : "kcal over"}</span>
        <span className="mt-0.5 text-[11px] text-muted-foreground tabular">
          {kcal(eaten.calories)} / {kcal(targets.calories)}
        </span>
      </ProgressRing>
      <div className="grid w-full max-w-sm grid-cols-3 gap-2">
        {(["protein", "carbs", "fat"] as const).map((k) => {
          const g = k === "protein" ? eaten.proteinG : k === "carbs" ? eaten.carbsG : eaten.fatG;
          const t = k === "protein" ? targets.proteinG : k === "carbs" ? targets.carbsG : targets.fatG;
          return (
            <div key={k} className="flex flex-col items-center gap-1">
              <ProgressRing value={g} max={t} size={76} stroke={8} color={MACRO_COLORS[k]} label={`${Math.round(g)} of ${t} grams of ${k}`}>
                <span className="text-sm font-semibold tabular">{Math.round(g)}</span>
                <span className="text-[10px] text-muted-foreground">/ {t} g</span>
              </ProgressRing>
              <span className="text-xs font-medium text-muted-foreground">{MACRO_LABELS[k]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FoodDay({
  date,
  logs,
  customFoods,
  savedMeals,
  recent,
}: {
  date: CalendarDate;
  logs: FoodLog[];
  customFoods: CustomFood[];
  savedMeals: SavedMeal[];
  recent: FoodLog[];
}) {
  const [picking, setPicking] = useState<Meal | null>(null);
  const [editing, setEditing] = useState<FoodLog | null>(null);
  const [savingMeal, setSavingMeal] = useState<Meal | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-3">
      {MEALS.map((meal) => {
        const items = logs.filter((l) => l.meal === meal);
        const total = sumNutrition(items);
        return (
          <section key={meal} aria-labelledby={`meal-${meal}`} className="overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-border/80">
            <header className="flex items-center gap-2 px-4 pt-3 pb-2">
              <h3 id={`meal-${meal}`} className="flex-1 font-semibold">
                {MEAL_LABELS[meal]}
              </h3>
              {items.length ? <span className="text-sm font-medium text-muted-foreground tabular">{kcal(total.calories)} kcal</span> : null}
              <DropdownMenu>
                <DropdownMenuTrigger className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" aria-label={`${MEAL_LABELS[meal]} options`}>
                  <EllipsisIcon className="size-4" aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() =>
                      start(async () => {
                        const r = await copyMeal({ from: addDays(date, -1), to: date, meal });
                        report(r);
                      })
                    }
                  >
                    <CopyIcon aria-hidden /> Same as yesterday
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!items.length} onSelect={() => setSavingMeal(meal)}>
                    <BookmarkPlusIcon aria-hidden /> Save as a meal
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </header>
            {items.length ? (
              <ul className="divide-y border-t">
                {items.map((l) => (
                  <li key={l.id}>
                    <button type="button" onClick={() => setEditing(l)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-muted/50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{l.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {l.source === "quick" ? "Quick add" : `${Number(l.servings.toFixed(2))} serving${l.servings === 1 ? "" : "s"}`} · P {Math.round(l.proteinG)} · C{" "}
                          {Math.round(l.carbsG)} · F {Math.round(l.fatG)}
                        </span>
                      </span>
                      <span className="text-sm tabular">{kcal(l.calories)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="border-t px-2 py-1.5">
              <Button variant="ghost" className="h-11 w-full justify-start text-primary" onClick={() => setPicking(meal)} disabled={pending}>
                {pending ? <Spinner /> : <PlusIcon aria-hidden />}
                Add food
              </Button>
            </div>
          </section>
        );
      })}

      <ResponsiveModal open={picking !== null} onOpenChange={(o) => !o && setPicking(null)} title={picking ? `Add to ${MEAL_LABELS[picking].toLowerCase()}` : "Add food"}>
        {picking ? <FoodPicker onDate={date} meal={picking} customFoods={customFoods} savedMeals={savedMeals} recent={recent} onDone={() => setPicking(null)} /> : null}
      </ResponsiveModal>

      <ResponsiveModal open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={editing?.name ?? "Food"}>
        {editing ? <EditLog log={editing} onDone={() => setEditing(null)} /> : null}
      </ResponsiveModal>

      <ResponsiveModal
        open={savingMeal !== null}
        onOpenChange={(o) => !o && setSavingMeal(null)}
        title="Save as a meal"
        description="Add the same foods again in one tap from the Meals tab."
      >
        {savingMeal ? <SaveMealForm date={date} meal={savingMeal} onDone={() => setSavingMeal(null)} /> : null}
      </ResponsiveModal>
    </div>
  );
}

function EditLog({ log, onDone }: { log: FoodLog; onDone: () => void }) {
  const [servings, setServings] = useState(String(Number(log.servings.toFixed(2))));
  const [pending, start] = useTransition();
  const n = Number(servings.replace(",", "."));
  const valid = Number.isFinite(n) && n > 0 && n <= 50;
  const preview = valid ? Math.round((log.calories / log.servings) * n) : null;
  return (
    <div className="space-y-4">
      {log.source !== "quick" ? (
        <Field>
          <FieldLabel htmlFor="edit-servings">Servings</FieldLabel>
          <div className="flex gap-2">
            {[0.5, 1, 1.5, 2].map((v) => (
              <Button key={v} type="button" variant={n === v ? "default" : "outline"} className="flex-1" onClick={() => setServings(String(v))}>
                {v}
              </Button>
            ))}
          </div>
          <Input id="edit-servings" inputMode="decimal" value={servings} onChange={(e) => setServings(e.target.value)} aria-invalid={!valid} />
          <p className="text-sm text-muted-foreground tabular">{preview !== null ? `${kcal(preview)} kcal` : "Enter a number of servings"}</p>
        </Field>
      ) : (
        <p className="text-sm text-muted-foreground">{kcal(log.calories)} kcal, added with quick add.</p>
      )}
      <div className="flex gap-2">
        <Button
          variant="destructive"
          disabled={pending}
          onClick={() =>
            start(async () => {
              if (report(await deleteFoodLog(log.id))) onDone();
            })
          }
        >
          <Trash2Icon aria-hidden /> Remove
        </Button>
        {log.source !== "quick" ? (
          <Button
            className="flex-1"
            disabled={pending || !valid}
            onClick={() =>
              start(async () => {
                if (report(await updateFoodServings({ id: log.id, servings: n }))) onDone();
              })
            }
          >
            {pending ? <Spinner /> : null}
            Save
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function SaveMealForm({ date, meal, onDone }: { date: CalendarDate; meal: Meal; onDone: () => void }) {
  const [name, setName] = useState(`My ${MEAL_LABELS[meal].toLowerCase()}`);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveMealFromLog({ name, onDate: date, meal });
          if (!r.ok) toast.error(r.error);
          else if (report(r)) onDone();
        });
      }}
    >
      <Field>
        <FieldLabel htmlFor="meal-name">Name</FieldLabel>
        <Input id="meal-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={pending || !name.trim()}>
        {pending ? <Spinner /> : null}
        Save meal
      </Button>
    </form>
  );
}
