import { cn } from "cn";
import { KCAL_PER_G, type MacroSplit, type MacroTargets } from "../calc/macros";

/** Macro colours: chart tokens validated for colour-vision deficiency in both themes. */
export const MACRO_COLORS = {
  protein: "var(--chart-3)",
  carbs: "var(--chart-4)",
  fat: "var(--chart-2)",
} as const;

export const MACRO_LABELS = { protein: "Protein", carbs: "Carbs", fat: "Fat" } as const;

/** Horizontal split bar with a legend; percentages are shown as text, not only colour. */
export function MacroSplitBar({ split: planned, targets, className }: { split: MacroSplit; targets?: MacroTargets; className?: string }) {
  const grams = targets ? { protein: targets.proteinG, carbs: targets.carbsG, fat: targets.fatG } : null;
  // With targets, show the split the grams actually give (protein may be capped by body weight).
  const split: MacroSplit =
    grams && targets!.calories > 0
      ? {
          protein: Math.round((grams.protein * KCAL_PER_G.protein * 100) / targets!.calories),
          carbs: Math.round((grams.carbs * KCAL_PER_G.carbs * 100) / targets!.calories),
          fat: Math.round((grams.fat * KCAL_PER_G.fat * 100) / targets!.calories),
        }
      : planned;
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        {(Object.keys(MACRO_COLORS) as (keyof MacroSplit)[]).map((k) => (
          <span key={k} style={{ width: `${split[k]}%`, background: MACRO_COLORS[k] }} className="h-full first:rounded-l-full last:rounded-r-full" />
        ))}
      </div>
      <dl className="grid grid-cols-3 gap-2 text-xs">
        {(Object.keys(MACRO_COLORS) as (keyof MacroSplit)[]).map((k) => (
          <div key={k}>
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: MACRO_COLORS[k] }} aria-hidden />
              {MACRO_LABELS[k]}
            </dt>
            <dd className="font-medium tabular">
              {grams ? `${grams[k]} g` : null}
              <span className={cn(grams && "ml-1 font-normal text-muted-foreground")}>{grams ? `(${split[k]}%)` : `${split[k]}%`}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
