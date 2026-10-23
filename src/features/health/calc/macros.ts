import type { Nutrition } from "../types";

/** Macro split as whole percentages of calories; they always add up to 100. */
export type MacroSplit = { protein: number; carbs: number; fat: number };

export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

export type MacroTargets = { calories: number; proteinG: number; carbsG: number; fatG: number };

/** Protein above this many grams per kg of body weight brings no extra benefit for most people. */
export const MAX_PROTEIN_G_PER_KG = 2.2;

/**
 * Grams of each macro for a calorie target. With a body weight, protein is
 * capped at 2.2 g/kg (a high-protein split on a big calorie target would
 * otherwise ask for far more than is useful); the calories freed up go to
 * carbs and fat in the plan's own ratio.
 */
export function macroTargets(calories: number, split: MacroSplit, weightKg?: number): MacroTargets {
  let proteinKcal = (calories * split.protein) / 100;
  if (weightKg) proteinKcal = Math.min(proteinKcal, weightKg * MAX_PROTEIN_G_PER_KG * KCAL_PER_G.protein);
  const rest = calories - proteinKcal;
  const carbShare = split.carbs + split.fat > 0 ? split.carbs / (split.carbs + split.fat) : 0.5;
  return {
    calories,
    proteinG: Math.round(proteinKcal / KCAL_PER_G.protein),
    carbsG: Math.round((rest * carbShare) / KCAL_PER_G.carbs),
    fatG: Math.round((rest * (1 - carbShare)) / KCAL_PER_G.fat),
  };
}

/** Protein per kilogram of body weight, a useful sanity check (1.6–2.2 g/kg suits most training goals). */
export const proteinPerKg = (proteinG: number, weightKg: number) => proteinG / weightKg;

export function sumNutrition(items: Nutrition[]): Nutrition {
  const total = items.reduce(
    (acc, i) => ({
      calories: acc.calories + i.calories,
      proteinG: acc.proteinG + i.proteinG,
      carbsG: acc.carbsG + i.carbsG,
      fatG: acc.fatG + i.fatG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
  return {
    calories: Math.round(total.calories),
    proteinG: Math.round(total.proteinG * 10) / 10,
    carbsG: Math.round(total.carbsG * 10) / 10,
    fatG: Math.round(total.fatG * 10) / 10,
  };
}

/** Nutrition for a number of servings, rounded the way the log stores it. */
export function scaleNutrition(n: Nutrition, servings: number): Nutrition {
  return {
    calories: Math.round(n.calories * servings),
    proteinG: Math.round(n.proteinG * servings * 10) / 10,
    carbsG: Math.round(n.carbsG * servings * 10) / 10,
    fatG: Math.round(n.fatG * servings * 10) / 10,
  };
}
