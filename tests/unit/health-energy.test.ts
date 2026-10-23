import { describe, expect, it } from "vitest";
import { bmi, bmr, CALORIE_FLOOR, currentAge, energyPlan, tdee, type PlanInput } from "@/features/health/calc/energy";
import { macroTargets, scaleNutrition, sumNutrition } from "@/features/health/calc/macros";
import {
  cmToFeetInches,
  feetInchesToCm,
  formatHeight,
  formatVolume,
  formatWeight,
  kgToLb,
  lbToKg,
  toCm,
  toKg,
} from "@/features/health/calc/units";
import { DIET_PLANS, effectivePlan } from "@/features/health/catalog/diet-plans";

const base: PlanInput = {
  sex: "male",
  ageYears: 38,
  heightCm: 180,
  activityLevel: "moderate",
  goal: "maintain",
  currentWeightKg: 90,
  targetWeightKg: null,
  targetDate: null,
  today: "2026-10-23",
};

describe("BMR and TDEE (Mifflin-St Jeor)", () => {
  it("matches the published formula for men and women", () => {
    // 10×90 + 6.25×180 − 5×38 + 5 = 1840
    expect(bmr({ sex: "male", weightKg: 90, heightCm: 180, ageYears: 38 })).toBe(1840);
    // 10×60 + 6.25×165 − 5×30 − 161 = 1320.25
    expect(bmr({ sex: "female", weightKg: 60, heightCm: 165, ageYears: 30 })).toBeCloseTo(1320.25);
  });

  it("uses the midpoint when sex is unspecified", () => {
    const m = bmr({ sex: "male", weightKg: 70, heightCm: 170, ageYears: 40 });
    const f = bmr({ sex: "female", weightKg: 70, heightCm: 170, ageYears: 40 });
    expect(bmr({ sex: "unspecified", weightKg: 70, heightCm: 170, ageYears: 40 })).toBeCloseTo((m + f) / 2);
  });

  it("multiplies by the activity factor", () => {
    const stats = { sex: "male" as const, weightKg: 90, heightCm: 180, ageYears: 38 };
    expect(tdee(stats, "sedentary")).toBeCloseTo(1840 * 1.2);
    expect(tdee(stats, "moderate")).toBeCloseTo(1840 * 1.55);
    expect(tdee(stats, "very_active")).toBeCloseTo(1840 * 1.9);
  });

  it("ages the profile over time", () => {
    expect(currentAge({ ageYears: 38, ageSetOn: "2025-10-01" }, "2026-10-23")).toBe(39);
    expect(currentAge({ ageYears: 38, ageSetOn: "2026-06-01" }, "2026-10-23")).toBe(38);
  });

  it("computes BMI", () => {
    expect(bmi(81, 180)).toBeCloseTo(25);
  });
});

describe("goal-adjusted calorie target", () => {
  it("maintenance equals TDEE (rounded to 10)", () => {
    const p = energyPlan(base);
    expect(p.tdee).toBe(2852);
    expect(p.target).toBe(2850);
    expect(p.warnings).toEqual([]);
  });

  it("defaults fat loss to about 0.5% of body weight a week", () => {
    const p = energyPlan({ ...base, goal: "lose_fat" });
    // 0.45 kg/week × 7700 / 7 = 495 kcal/day
    expect(p.target).toBe(2360);
    expect(p.weeklyChangeKg).toBeCloseTo(-0.45, 1);
    expect(p.warnings).toEqual([]);
  });

  it("follows the target date when it is a sensible pace", () => {
    // 6 kg in 20 weeks = 0.3 kg/week
    const p = energyPlan({ ...base, goal: "lose_fat", targetWeightKg: 84, targetDate: "2027-03-12" });
    expect(p.weeklyChangeKg).toBeCloseTo(-0.3, 1);
    expect(p.projectedDate).toBe("2027-03-12");
    expect(p.warnings).toEqual([]);
  });

  it("warns on losing more than 1% a week and uses a safer pace", () => {
    // 20 kg in 8 weeks = 2.5 kg/week (2.8%)
    const p = energyPlan({ ...base, goal: "lose_fat", targetWeightKg: 70, targetDate: "2026-12-18" });
    expect(p.warnings.some((w) => w.level === "caution" && /aggressive/.test(w.message))).toBe(true);
    expect(p.weeklyChangePct).toBeGreaterThanOrEqual(-0.01 - 1e-9);
  });

  it("caps the deficit at 25% of TDEE", () => {
    const p = energyPlan({ ...base, goal: "lose_fat", currentWeightKg: 140, targetWeightKg: 100, targetDate: "2027-01-01" });
    expect(p.adjustment).toBeGreaterThanOrEqual(-Math.round(p.tdee * 0.25) - 10);
    expect(p.warnings.some((w) => /capped/.test(w.message))).toBe(true);
  });

  it("never goes below the calorie floor", () => {
    const small: PlanInput = { ...base, sex: "female", ageYears: 60, heightCm: 150, currentWeightKg: 48, activityLevel: "sedentary", goal: "lose_fat" };
    const p = energyPlan(small);
    expect(p.target).toBe(CALORIE_FLOOR.female);
    expect(p.floorApplied).toBe(true);
    expect(p.warnings.some((w) => /minimum/.test(w.message))).toBe(true);
    expect(energyPlan({ ...small, sex: "male" }).target).toBeGreaterThanOrEqual(CALORIE_FLOOR.male);
  });

  it("adds a small surplus for muscle and a bigger one for weight gain", () => {
    expect(energyPlan({ ...base, goal: "build_muscle" }).adjustment).toBe(250 - 2);
    const gain = energyPlan({ ...base, goal: "gain_weight" });
    expect(gain.target).toBe(3350);
    expect(gain.weeklyChangeKg).toBeGreaterThan(0);
  });

  it("warns when weight gain is planned too fast", () => {
    const p = energyPlan({ ...base, goal: "gain_weight", targetWeightKg: 100, targetDate: "2026-12-01" });
    expect(p.warnings.some((w) => w.level === "caution")).toBe(true);
    expect(p.adjustment).toBeLessThanOrEqual(750);
  });

  it("flags targets on the wrong side of the current weight", () => {
    expect(energyPlan({ ...base, goal: "lose_fat", targetWeightKg: 95 }).warnings[0].message).toMatch(/isn't below/);
    expect(energyPlan({ ...base, goal: "gain_weight", targetWeightKg: 85 }).warnings[0].message).toMatch(/isn't above/);
  });

  it("flags a target date in the past", () => {
    const p = energyPlan({ ...base, goal: "lose_fat", targetWeightKg: 85, targetDate: "2026-01-01" });
    expect(p.warnings.some((w) => /passed/.test(w.message))).toBe(true);
  });
});

describe("macros", () => {
  it("converts a split into grams", () => {
    expect(macroTargets(2000, { protein: 30, carbs: 40, fat: 30 })).toEqual({ calories: 2000, proteinG: 150, carbsG: 200, fatG: 67 });
    expect(macroTargets(1800, { protein: 25, carbs: 5, fat: 70 })).toEqual({ calories: 1800, proteinG: 113, carbsG: 23, fatG: 140 });
  });

  it("caps protein at 2.2 g/kg and gives the rest to carbs and fat", () => {
    // 40% of 2,540 kcal would be 254 g — about 2.9 g/kg at 87.5 kg.
    const m = macroTargets(2540, { protein: 40, carbs: 35, fat: 25 }, 87.5);
    expect(m.proteinG).toBe(193);
    expect(m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9).toBeCloseTo(2540, -1);
    expect(m.carbsG / (m.fatG * 9 / 4)).toBeCloseTo(35 / 25, 1);
    // Under the cap nothing changes.
    expect(macroTargets(2000, { protein: 30, carbs: 40, fat: 30 }, 90)).toEqual({ calories: 2000, proteinG: 150, carbsG: 200, fatG: 67 });
  });

  it("every plan's split adds up to 100%", () => {
    for (const p of DIET_PLANS) expect(p.macros.protein + p.macros.carbs + p.macros.fat, p.key).toBe(100);
  });

  it("every plan's sample day adds up to the whole day", () => {
    for (const p of DIET_PLANS) expect(p.sampleDay.reduce((s, m) => s + m.share, 0), p.key).toBeCloseTo(1);
  });

  it("falls back to the goal's recommended plan", () => {
    expect(effectivePlan(null, "lose_fat").key).toBe("high_protein");
    expect(effectivePlan("keto", "lose_fat").key).toBe("keto");
    expect(effectivePlan("nope", "gain_weight").key).toBe("mass_gain");
  });

  it("scales and sums nutrition", () => {
    const egg = { calories: 72, proteinG: 6.3, carbsG: 0.4, fatG: 4.8 };
    expect(scaleNutrition(egg, 2)).toEqual({ calories: 144, proteinG: 12.6, carbsG: 0.8, fatG: 9.6 });
    expect(sumNutrition([egg, egg, egg]).calories).toBe(216);
  });
});

describe("units", () => {
  it("converts weight both ways", () => {
    expect(kgToLb(100)).toBeCloseTo(220.462, 2);
    expect(lbToKg(220.462)).toBeCloseTo(100, 2);
    expect(toKg(200, "imperial")).toBe(90.72);
    expect(toKg(90.5, "metric")).toBe(90.5);
  });

  it("converts height to feet and inches", () => {
    expect(cmToFeetInches(180)).toEqual({ feet: 5, inches: 11 });
    expect(feetInchesToCm(6, 0)).toBeCloseTo(182.88);
    expect(formatHeight(180, "imperial")).toBe("5′11″");
    expect(formatHeight(180, "metric")).toBe("180 cm");
  });

  it("formats in the person's units", () => {
    expect(formatWeight(90, "metric")).toBe("90 kg");
    expect(formatWeight(90, "imperial")).toBe("198.4 lb");
    expect(formatWeight(-0.5, "metric", { signed: true })).toBe("-0.5 kg");
    expect(formatVolume(1750, "metric")).toBe("1.75 L");
    expect(formatVolume(250, "metric")).toBe("250 ml");
    expect(formatVolume(2000, "imperial")).toBe("68 fl oz");
    expect(toCm(34, "imperial")).toBe(86.4);
  });
});
