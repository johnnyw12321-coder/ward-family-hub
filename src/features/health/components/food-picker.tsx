"use client";

import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { BookmarkIcon, HistoryIcon, MinusIcon, PlusIcon, SearchIcon, SparklesIcon, Trash2Icon, XIcon, ZapIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import type { CalendarDate } from "@/lib/dates";
import { archiveCustomFood, deleteSavedMeal, logFoods, quickAddCalories, saveCustomFood } from "../actions/tracking";
import { scaleNutrition, sumNutrition } from "../calc/macros";
import { FOODS, searchFoods } from "../catalog/foods";
import { customFoodSchema, quickAddSchema, type CustomFoodInput, type QuickAddInput } from "../schemas";
import type { CustomFood, FoodLog, FoodSource, Meal, Nutrition, SavedMeal } from "../types";
import { report } from "./celebrate";

type Pickable = Nutrition & { key: string; name: string; serving: string; source: FoodSource; foodRef: string | null; mine?: boolean };
type BasketItem = Pickable & { servings: number };

const STEP = 0.25;
const fmtServ = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));

type Tab = "search" | "recent" | "saved" | "quick" | "create";

export function FoodPicker({
  onDate,
  meal,
  customFoods,
  savedMeals,
  recent,
  onDone,
}: {
  onDate: CalendarDate;
  meal: Meal;
  customFoods: CustomFood[];
  savedMeals: SavedMeal[];
  recent: FoodLog[];
  onDone: () => void;
}) {
  const [tab, setTab] = useState<Tab>("search");
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [pending, start] = useTransition();

  const all = useMemo<Pickable[]>(
    () => [
      ...customFoods.map((f) => ({ ...f, key: `custom:${f.id}`, source: "custom" as const, foodRef: f.id, mine: true })),
      ...FOODS.map((f) => ({ ...f, key: `catalog:${f.id}`, source: "catalog" as const, foodRef: f.id })),
    ],
    [customFoods],
  );
  const results = useMemo(() => searchFoods(all, deferred, 60), [all, deferred]);
  const recentItems = useMemo<(Pickable & { servings: number })[]>(
    () =>
      recent.map((l) => ({
        ...scaleNutrition(l, 1 / l.servings),
        key: `${l.source}:${l.foodRef ?? l.name}`,
        name: l.name,
        serving: `last time ${fmtServ(l.servings)}×`,
        source: l.source,
        foodRef: l.foodRef,
        servings: l.servings,
      })),
    [recent],
  );

  const add = (item: Pickable, servings = 1) =>
    setBasket((b) => {
      const existing = b.find((x) => x.key === item.key);
      if (existing) return b.map((x) => (x.key === item.key ? { ...x, servings: Math.min(50, x.servings + servings) } : x));
      return [...b, { ...item, servings }];
    });
  const setServings = (key: string, servings: number) =>
    setBasket((b) => (servings <= 0 ? b.filter((x) => x.key !== key) : b.map((x) => (x.key === key ? { ...x, servings: Math.min(50, servings) } : x))));

  const total = sumNutrition(basket.map((b) => scaleNutrition(b, b.servings)));

  const logBasket = () =>
    start(async () => {
      const r = await logFoods({
        onDate,
        meal,
        items: basket.map((b) => ({ name: b.name, source: b.source, foodRef: b.foodRef, servings: b.servings, ...scaleNutrition(b, b.servings) })),
      });
      if (report(r)) onDone();
    });

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "search", label: "Search", icon: <SearchIcon className="size-4" aria-hidden /> },
    { id: "recent", label: "Recent", icon: <HistoryIcon className="size-4" aria-hidden /> },
    { id: "saved", label: "Meals", icon: <BookmarkIcon className="size-4" aria-hidden /> },
    { id: "quick", label: "Quick add", icon: <ZapIcon className="size-4" aria-hidden /> },
    { id: "create", label: "New food", icon: <SparklesIcon className="size-4" aria-hidden /> },
  ];

  return (
    <div className="flex min-h-[60dvh] flex-col">
      <div role="tablist" aria-label="Ways to add food" className="mb-3 flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors",
              tab === t.id ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1">
        {tab === "search" ? (
          <div className="space-y-2">
            <InputGroup>
              <InputGroupAddon>
                <SearchIcon aria-hidden />
              </InputGroupAddon>
              <InputGroupInput
                autoFocus
                type="search"
                placeholder="Search foods, e.g. roti, chicken, banana"
                aria-label="Search foods"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </InputGroup>
            {results.length ? (
              <ul className="max-h-[42dvh] divide-y overflow-y-auto rounded-xl ring-1 ring-border/80">
                {results.map((f) => (
                  <FoodRow key={f.key} food={f} onAdd={() => add(f)} inBasket={basket.some((b) => b.key === f.key)} />
                ))}
              </ul>
            ) : (
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                No foods match &ldquo;{query}&rdquo;.{" "}
                <button type="button" className="font-medium text-primary" onClick={() => setTab("create")}>
                  Add it as your own food
                </button>{" "}
                or use{" "}
                <button type="button" className="font-medium text-primary" onClick={() => setTab("quick")}>
                  quick add
                </button>
                .
              </div>
            )}
          </div>
        ) : null}

        {tab === "recent" ? (
          recentItems.length ? (
            <ul className="max-h-[48dvh] divide-y overflow-y-auto rounded-xl ring-1 ring-border/80">
              {recentItems.map((f) => (
                <FoodRow key={f.key} food={f} onAdd={() => add(f, f.servings)} inBasket={basket.some((b) => b.key === f.key)} />
              ))}
            </ul>
          ) : (
            <Empty>Foods you log appear here for one-tap re-logging.</Empty>
          )
        ) : null}

        {tab === "saved" ? (
          savedMeals.length ? (
            <ul className="space-y-2">
              {savedMeals.map((m) => {
                const n = sumNutrition(m.items);
                return (
                  <li key={m.id} className="flex items-center gap-2 rounded-xl p-3 ring-1 ring-border/80">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        for (const i of m.items)
                          add(
                            { ...scaleNutrition(i, 1 / i.servings), key: `${i.source}:${i.foodRef ?? i.name}`, name: i.name, serving: "", source: i.source, foodRef: i.foodRef },
                            i.servings,
                          );
                        toast.success(`${m.name} added to the list`);
                      }}
                    >
                      <span className="block font-medium">{m.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {m.items.map((i) => i.name).join(", ")} · {n.calories} kcal
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete saved meal ${m.name}`}
                      onClick={() => start(async () => void report(await deleteSavedMeal(m.id)))}
                    >
                      <Trash2Icon aria-hidden />
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>Save a meal from your log (the ⋯ on any meal) to add it again in one tap.</Empty>
          )
        ) : null}

        {tab === "quick" ? <QuickAddForm onDate={onDate} meal={meal} onDone={onDone} /> : null}
        {tab === "create" ? (
          <div className="space-y-5">
            <CustomFoodForm
              initialName={query}
              onSaved={(food) => {
                add({ ...food, key: `custom:${food.id}`, source: "custom", foodRef: food.id, mine: true });
                setTab("search");
                setQuery("");
              }}
            />
            {customFoods.length ? (
              <div>
                <h3 className="mb-1.5 text-sm font-medium">Your foods</h3>
                <ul className="divide-y rounded-xl ring-1 ring-border/80">
                  {customFoods.map((f) => (
                    <li key={f.id} className="flex items-center gap-2 py-1 pr-1 pl-3 text-sm">
                      <span className="min-w-0 flex-1 truncate">
                        {f.name} <span className="text-muted-foreground">· {f.serving} · {f.calories} kcal</span>
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${f.name} from your foods`}
                        disabled={pending}
                        onClick={() => start(async () => void report(await archiveCustomFood(f.id)))}
                      >
                        <Trash2Icon aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {basket.length && (tab === "search" || tab === "recent" || tab === "saved") ? (
        <div className="sticky bottom-0 -mx-4 mt-3 space-y-2 border-t bg-background/95 px-4 pt-3 pb-1 backdrop-blur animate-in slide-in-from-bottom-2">
          <ul className="max-h-40 space-y-1.5 overflow-y-auto" aria-label="Foods to log">
            {basket.map((b) => (
              <li key={b.key} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{b.name}</span>
                <span className="w-16 text-right text-xs text-muted-foreground tabular">{Math.round(b.calories * b.servings)} kcal</span>
                <div className="flex items-center rounded-lg bg-muted">
                  <button type="button" className="flex size-9 items-center justify-center" aria-label={`Less ${b.name}`} onClick={() => setServings(b.key, b.servings - STEP * 2)}>
                    {b.servings <= STEP * 2 ? <XIcon className="size-3.5" aria-hidden /> : <MinusIcon className="size-3.5" aria-hidden />}
                  </button>
                  <input
                    className="w-11 bg-transparent text-center text-sm tabular outline-none"
                    inputMode="decimal"
                    aria-label={`Servings of ${b.name}`}
                    value={fmtServ(b.servings)}
                    onChange={(e) => {
                      const v = Number(e.target.value.replace(",", "."));
                      if (Number.isFinite(v) && v >= 0) setServings(b.key, v || STEP);
                    }}
                  />
                  <button type="button" className="flex size-9 items-center justify-center" aria-label={`More ${b.name}`} onClick={() => setServings(b.key, b.servings + STEP * 2)}>
                    <PlusIcon className="size-3.5" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <Button size="lg" className="w-full" onClick={logBasket} disabled={pending}>
            {pending ? <Spinner /> : null}
            Log {basket.length} {basket.length === 1 ? "food" : "foods"} · {total.calories} kcal
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function FoodRow({ food, onAdd, inBasket }: { food: Pickable; onAdd: () => void; inBasket: boolean }) {
  return (
    <li>
      <button type="button" onClick={onAdd} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/60">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <span className="truncate">{food.name}</span>
            {food.mine ? <Badge variant="secondary">Yours</Badge> : null}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {food.serving ? `${food.serving} · ` : ""}P {Math.round(food.proteinG)} · C {Math.round(food.carbsG)} · F {Math.round(food.fatG)}
          </span>
        </span>
        <span className="text-sm font-medium tabular">{food.calories}</span>
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-full transition-colors",
            inBasket ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground",
          )}
          aria-hidden
        >
          <PlusIcon className="size-4" />
        </span>
        <span className="sr-only">Add {food.name}</span>
      </button>
    </li>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</div>;
}

function QuickAddForm({ onDate, meal, onDone }: { onDate: CalendarDate; meal: Meal; onDone: () => void }) {
  const [pending, start] = useTransition();
  const form = useForm<QuickAddInput>({
    resolver: zodResolver(quickAddSchema),
    defaultValues: { onDate, meal, name: "", calories: "", protein: "", carbs: "", fat: "" },
  });
  const err = form.formState.errors;
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit((v) =>
        start(async () => {
          const r = await quickAddCalories(v);
          if (!r.ok) for (const [k, m] of Object.entries(r.fieldErrors ?? {})) form.setError(k as keyof QuickAddInput, { message: m });
          if (report(r)) onDone();
        }),
      )}
    >
      <p className="text-sm text-muted-foreground">For when you know the calories but not the food — a restaurant meal, say.</p>
      <FieldGroup className="gap-4">
        <Field data-invalid={Boolean(err.calories)}>
          <FieldLabel htmlFor="qa-kcal">Calories</FieldLabel>
          <InputGroup>
            <InputGroupInput id="qa-kcal" inputMode="numeric" autoFocus {...form.register("calories")} />
            <InputGroupAddon align="inline-end">
              <InputGroupText>kcal</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
          <FieldError>{err.calories?.message}</FieldError>
        </Field>
        <Field>
          <FieldLabel htmlFor="qa-name">Description (optional)</FieldLabel>
          <Input id="qa-name" placeholder="e.g. Lunch at work" {...form.register("name")} />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          {(["protein", "carbs", "fat"] as const).map((k) => (
            <Field key={k} data-invalid={Boolean(err[k])}>
              <FieldLabel htmlFor={`qa-${k}`} className="capitalize">
                {k}
              </FieldLabel>
              <InputGroup>
                <InputGroupInput id={`qa-${k}`} inputMode="decimal" placeholder="—" {...form.register(k)} />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>g</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <FieldError>{err[k]?.message}</FieldError>
            </Field>
          ))}
        </div>
      </FieldGroup>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : null}
        Add calories
      </Button>
    </form>
  );
}

function CustomFoodForm({ initialName, onSaved }: { initialName: string; onSaved: (f: CustomFood) => void }) {
  const [pending, start] = useTransition();
  const form = useForm<CustomFoodInput>({
    resolver: zodResolver(customFoodSchema),
    defaultValues: { name: initialName, serving: "1 serving", calories: "", protein: "", carbs: "", fat: "" },
  });
  const err = form.formState.errors;
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit((v) =>
        start(async () => {
          const r = await saveCustomFood(v);
          if (!r.ok) {
            for (const [k, m] of Object.entries(r.fieldErrors ?? {})) form.setError(k as keyof CustomFoodInput, { message: m });
            toast.error(r.error);
            return;
          }
          toast.success(r.message);
          const g = (s: string) => (s ? Number(s.replace(",", ".")) : 0);
          onSaved({ id: r.data.id, name: v.name, serving: v.serving, calories: Number(v.calories), proteinG: g(v.protein), carbsG: g(v.carbs), fatG: g(v.fat), archivedAt: null });
        }),
      )}
    >
      <p className="text-sm text-muted-foreground">Save a food you eat often — a family recipe or something from the label — to find it in search.</p>
      <FieldGroup className="gap-4">
        <Field data-invalid={Boolean(err.name)}>
          <FieldLabel htmlFor="cf-name">Name</FieldLabel>
          <Input id="cf-name" placeholder="e.g. Mum's pelau" {...form.register("name")} />
          <FieldError>{err.name?.message}</FieldError>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field data-invalid={Boolean(err.serving)}>
            <FieldLabel htmlFor="cf-serving">One serving is</FieldLabel>
            <Input id="cf-serving" placeholder="1 cup" {...form.register("serving")} />
            <FieldError>{err.serving?.message}</FieldError>
          </Field>
          <Field data-invalid={Boolean(err.calories)}>
            <FieldLabel htmlFor="cf-kcal">Calories</FieldLabel>
            <InputGroup>
              <InputGroupInput id="cf-kcal" inputMode="numeric" {...form.register("calories")} />
              <InputGroupAddon align="inline-end">
                <InputGroupText>kcal</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
            <FieldError>{err.calories?.message}</FieldError>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(["protein", "carbs", "fat"] as const).map((k) => (
            <Field key={k} data-invalid={Boolean(err[k])}>
              <FieldLabel htmlFor={`cf-${k}`} className="capitalize">
                {k}
              </FieldLabel>
              <InputGroup>
                <InputGroupInput id={`cf-${k}`} inputMode="decimal" placeholder="0" {...form.register(k)} />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>g</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <FieldError>{err[k]?.message}</FieldError>
            </Field>
          ))}
        </div>
      </FieldGroup>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : null}
        Save and add
      </Button>
    </form>
  );
}
