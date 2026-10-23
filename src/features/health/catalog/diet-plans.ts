import type { MacroSplit } from "../calc/macros";
import type { Goal, Meal } from "../types";

/**
 * Built-in diet plans. Calories always come from the person's own target;
 * a plan decides how those calories are split and what a day looks like.
 * Sample-day meals are a share of the day's calories, so they scale.
 */
export type DietPlan = {
  key: string;
  name: string;
  tagline: string;
  description: string;
  macros: MacroSplit;
  suits: string[];
  pros: string[];
  cons: string[];
  goals: Goal[];
  sampleDay: { meal: Meal; name: string; detail: string; share: number }[];
  foods: { eat: string[]; limit: string[] };
  fasting?: boolean;
};

export const DIET_PLANS: DietPlan[] = [
  {
    key: "balanced_deficit",
    name: "Balanced deficit",
    tagline: "A bit less of everything, nothing off limits",
    description:
      "Eat your usual foods in slightly smaller portions, with protein at every meal and plenty of vegetables. The easiest plan to stick to, which makes it the one that most often works.",
    macros: { protein: 30, carbs: 40, fat: 30 },
    suits: ["First-time dieters", "Busy schedules and family meals", "Anyone who dislikes strict rules"],
    pros: ["Flexible: works with home cooking and eating out", "Easy to sustain long-term", "Enough carbs to train well"],
    cons: ["Needs portion awareness — logging helps", "Results are steady rather than dramatic"],
    goals: ["lose_fat", "maintain"],
    sampleDay: [
      { meal: "breakfast", name: "Saltfish buljol & bake", detail: "Small coconut bake, buljol with tomato and cucumber", share: 0.25 },
      { meal: "lunch", name: "Stew chicken plate", detail: "Stew chicken, ½ cup rice, callaloo, side salad", share: 0.35 },
      { meal: "dinner", name: "Grilled fish & provision", detail: "Grilled kingfish, boiled dasheen, steamed bodi", share: 0.3 },
      { meal: "snack", name: "Fruit & yoghurt", detail: "Greek yoghurt with pineapple", share: 0.1 },
    ],
    foods: {
      eat: ["Lean meat, fish, eggs", "Rice, roti, bread and provision in measured portions", "Vegetables at two meals a day", "Fruit", "Low-fat dairy"],
      limit: ["Sweet drinks and juices", "Fried foods most days", "Large second helpings", "Alcohol"],
    },
  },
  {
    key: "high_protein",
    name: "High protein",
    tagline: "Stay full and keep your muscle",
    description:
      "Protein is the most filling macro and protects muscle while you lose fat. Build each meal around a palm-sized (or two) portion of protein, then add vegetables and some carbs.",
    macros: { protein: 40, carbs: 35, fat: 25 },
    suits: ["People who lift weights", "Anyone who gets hungry on a diet", "Fat loss while keeping strength"],
    pros: ["Very filling, fewer cravings", "Protects muscle in a deficit", "Supports recovery from training"],
    cons: ["Protein foods cost more", "Takes some planning to hit the target", "Can feel repetitive"],
    goals: ["lose_fat", "build_muscle", "maintain"],
    sampleDay: [
      { meal: "breakfast", name: "Egg-white omelette", detail: "3 egg whites + 1 egg, spinach, wholewheat toast", share: 0.25 },
      { meal: "lunch", name: "Chicken & rice bowl", detail: "Grilled chicken breast, brown rice, pak choi", share: 0.33 },
      { meal: "dinner", name: "Salmon & sweet potato", detail: "Baked salmon, sweet potato, green beans", share: 0.3 },
      { meal: "snack", name: "Shake or cottage cheese", detail: "Protein shake or cottage cheese with berries", share: 0.12 },
    ],
    foods: {
      eat: ["Chicken, turkey, fish, lean beef", "Eggs and egg whites", "Greek yoghurt, cottage cheese", "Lentils, beans, tofu", "Vegetables at every meal"],
      limit: ["Processed meats (sausages, salami)", "Sugary protein bars", "Fried coatings"],
    },
  },
  {
    key: "keto",
    name: "Low carb / Keto",
    tagline: "Very low carbs, higher fats",
    description:
      "Cut carbs to roughly 20–50 g a day so the body runs mostly on fat. Many people find appetite drops after the first week or two. Most early weight loss is water.",
    macros: { protein: 25, carbs: 5, fat: 70 },
    suits: ["People who prefer meat, fish, eggs and vegetables", "Those whose hunger is driven by carbs", "People who like clear rules"],
    pros: ["Appetite often falls", "Clear rules about what to eat", "Quick early results on the scale"],
    cons: ["Hard to keep up with rice, roti and bread culture", "Can hurt high-intensity training", "'Keto flu' in the first days", "Not suitable for some medical conditions — check with your doctor"],
    goals: ["lose_fat"],
    sampleDay: [
      { meal: "breakfast", name: "Eggs & avocado", detail: "3 scrambled eggs in butter, half an avocado", share: 0.28 },
      { meal: "lunch", name: "Chicken thigh salad", detail: "Chicken thighs, leafy greens, olive oil, cheese", share: 0.32 },
      { meal: "dinner", name: "Steak & greens", detail: "Sirloin steak, garlic bodi, sautéed spinach", share: 0.32 },
      { meal: "snack", name: "Nuts", detail: "A small handful of almonds", share: 0.08 },
    ],
    foods: {
      eat: ["Meat, fish, eggs", "Cheese, butter, cream", "Avocado, olive oil, nuts", "Leafy and green vegetables"],
      limit: ["Rice, bread, roti, pasta, provision", "Sugar, juice, soft drinks", "Most fruit", "Beans and lentils"],
    },
  },
  {
    key: "mediterranean",
    name: "Mediterranean",
    tagline: "Olive oil, fish, vegetables and whole grains",
    description:
      "The best-studied eating pattern for long-term heart health: plenty of vegetables, beans, whole grains, fish and olive oil, with less red meat and sweets.",
    macros: { protein: 20, carbs: 45, fat: 35 },
    suits: ["Long-term health and heart health", "Families eating together", "People who enjoy cooking"],
    pros: ["Strong evidence for heart and overall health", "Lots of variety", "Easy to adapt to Caribbean cooking"],
    cons: ["Calories from oils and nuts add up quickly", "Lower protein than training-focused plans"],
    goals: ["maintain", "lose_fat"],
    sampleDay: [
      { meal: "breakfast", name: "Oats with fruit & nuts", detail: "Oats, banana, walnuts, a drizzle of honey", share: 0.25 },
      { meal: "lunch", name: "Chickpea & tuna salad", detail: "Chickpeas, tuna, tomato, cucumber, olive oil", share: 0.33 },
      { meal: "dinner", name: "Baked fish & vegetables", detail: "Red snapper, roasted vegetables, wholewheat couscous", share: 0.32 },
      { meal: "snack", name: "Hummus & veg", detail: "Hummus with carrot and cucumber sticks", share: 0.1 },
    ],
    foods: {
      eat: ["Vegetables, fruit, beans, lentils", "Fish twice a week", "Olive oil, nuts, seeds", "Whole grains"],
      limit: ["Red and processed meat", "Sweets and pastries", "Refined white flour"],
    },
  },
  {
    key: "intermittent_fasting",
    name: "Intermittent fasting",
    tagline: "Eat within a daily window (16:8 or 18:6)",
    description:
      "Eat all your calories inside a set window — 8 hours (16:8) or 6 hours (18:6) — and only water, black coffee or plain tea outside it. It's a way to eat less, not magic: calories still count.",
    macros: { protein: 30, carbs: 40, fat: 30 },
    suits: ["People who aren't hungry in the morning", "Those who like a simple rule", "Busy mornings"],
    pros: ["Simple structure, fewer decisions", "Fewer meals to plan", "Can reduce late-night snacking"],
    cons: ["Big meals can be hard to fit in", "Not advised if pregnant, diabetic or with a history of disordered eating", "Can clash with early training"],
    goals: ["lose_fat", "maintain"],
    fasting: true,
    sampleDay: [
      { meal: "lunch", name: "Break-fast plate (12:00)", detail: "Chicken, rice and peas, coleslaw", share: 0.4 },
      { meal: "snack", name: "Afternoon snack (15:30)", detail: "Greek yoghurt, an apple", share: 0.15 },
      { meal: "dinner", name: "Last meal (19:30)", detail: "Curry shrimp, small roti, cucumber salad", share: 0.45 },
    ],
    foods: {
      eat: ["Protein first when you break the fast", "Fibre-rich carbs and vegetables", "Water, black coffee, plain tea while fasting"],
      limit: ["Snacking outside the window", "Sweetened drinks (they break the fast)", "Overeating at the first meal"],
    },
  },
  {
    key: "plant_based",
    name: "Vegetarian / Plant-based",
    tagline: "Beans, lentils, tofu and whole foods",
    description:
      "Protein comes from beans, lentils, soy, dairy and eggs (if you eat them). Doubles, dhal, chana and callaloo make this an easy plan in Trinidad and Tobago.",
    macros: { protein: 20, carbs: 55, fat: 25 },
    suits: ["Vegetarians and vegans", "People cutting back on meat", "Budget-conscious cooking"],
    pros: ["High in fibre, filling", "Usually cheaper", "Good for heart health"],
    cons: ["Getting enough protein takes planning", "Watch vitamin B12, iron and omega-3 if vegan"],
    goals: ["lose_fat", "maintain", "build_muscle"],
    sampleDay: [
      { meal: "breakfast", name: "Tofu scramble & toast", detail: "Tofu scrambled with peppers, wholewheat toast", share: 0.25 },
      { meal: "lunch", name: "Dhal, rice & bhaji", detail: "Split-pea dhal, rice, spinach bhaji", share: 0.35 },
      { meal: "dinner", name: "Chana & aloo with salad", detail: "Curried chickpeas and potato, cucumber salad", share: 0.3 },
      { meal: "snack", name: "Peanuts & fruit", detail: "Roasted peanuts and a mango", share: 0.1 },
    ],
    foods: {
      eat: ["Beans, lentils, split peas, chickpeas", "Tofu, tempeh, soy milk", "Eggs and dairy (vegetarian)", "Whole grains, vegetables, fruit, nuts"],
      limit: ["Fried snacks (even plant-based)", "Refined flour and sugar", "Relying on cheese for protein"],
    },
  },
  {
    key: "lean_bulk",
    name: "Lean bulk",
    tagline: "A small surplus for muscle, not fat",
    description:
      "Eat slightly above maintenance with high protein and enough carbs to fuel hard training. Aim to gain roughly 0.25% of your body weight a week, a little more if you're new to lifting.",
    macros: { protein: 30, carbs: 45, fat: 25 },
    suits: ["People lifting 3+ times a week", "Beginners who want to add muscle", "Anyone who wants to gain without much fat"],
    pros: ["Muscle gain with little fat", "Training feels strong", "Easier to transition to a cut later"],
    cons: ["Slow progress on the scale", "Needs consistent training to work"],
    goals: ["build_muscle"],
    sampleDay: [
      { meal: "breakfast", name: "Oats, eggs & banana", detail: "Oats with milk, 2 eggs, a banana", share: 0.25 },
      { meal: "lunch", name: "Chicken pelau", detail: "Chicken pelau with coleslaw", share: 0.3 },
      { meal: "dinner", name: "Beef & rice", detail: "Lean beef stir-fry, rice, mixed vegetables", share: 0.3 },
      { meal: "snack", name: "Shake & peanut butter toast", detail: "Protein shake, toast with peanut butter", share: 0.15 },
    ],
    foods: {
      eat: ["Lean protein at every meal", "Rice, oats, potatoes, provision, fruit", "Milk and yoghurt", "Nuts and nut butter"],
      limit: ["'Dirty bulk' fast food", "Large amounts of alcohol"],
    },
  },
  {
    key: "mass_gain",
    name: "Mass gain",
    tagline: "More food, more often",
    description:
      "For people who struggle to gain weight. A larger surplus spread over 4–6 meals, with calorie-dense foods and drinks that are easy to get down.",
    macros: { protein: 25, carbs: 50, fat: 25 },
    suits: ["Naturally slim people (hard gainers)", "Athletes needing size", "Recovering lost weight (with medical guidance)"],
    pros: ["Fastest weight gain", "Lots of food freedom", "Energy for heavy training"],
    cons: ["Some of the gain will be fat", "Eating this much can feel like a chore"],
    goals: ["gain_weight", "build_muscle"],
    sampleDay: [
      { meal: "breakfast", name: "Big breakfast", detail: "3 eggs, 2 slices toast, avocado, glass of milk", share: 0.25 },
      { meal: "lunch", name: "Double roti", detail: "Chicken roti with extra channa and potato", share: 0.3 },
      { meal: "dinner", name: "Pasta bolognese", detail: "Pasta with beef bolognese and cheese", share: 0.28 },
      { meal: "snack", name: "Mass shake", detail: "Milk, oats, banana, peanut butter, whey", share: 0.17 },
    ],
    foods: {
      eat: ["Calorie-dense foods: nuts, nut butters, cheese, dried fruit", "Milk and smoothies", "Rice, pasta, roti, bread", "Meat, fish, eggs"],
      limit: ["Filling up on water or salad before meals", "Skipping meals"],
    },
  },
];

export const DIET_PLAN_BY_KEY = new Map(DIET_PLANS.map((p) => [p.key, p]));

export function dietPlan(key: string | null | undefined): DietPlan | undefined {
  return key ? DIET_PLAN_BY_KEY.get(key) : undefined;
}

/** A sensible first plan for each goal. */
export const RECOMMENDED_PLAN: Record<Goal, string> = {
  lose_fat: "high_protein",
  build_muscle: "lean_bulk",
  gain_weight: "mass_gain",
  maintain: "mediterranean",
};

/** If no plan is chosen yet, macros follow the recommended plan for the goal. */
export function effectivePlan(key: string | null, goal: Goal): DietPlan {
  return dietPlan(key) ?? DIET_PLAN_BY_KEY.get(RECOMMENDED_PLAN[goal])!;
}

export const FASTING_HOURS = { "16:8": 16, "18:6": 18 } as const;
