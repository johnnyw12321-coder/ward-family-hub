import type { Nutrition } from "../types";

/**
 * Built-in food database: common foods plus everyday Trinidad and Tobago
 * dishes. Values are per the serving shown, rounded from standard nutrition
 * tables (USDA FoodData Central and typical recipes for local dishes) —
 * good estimates, not lab measurements.
 */
export const FOOD_CATEGORIES = {
  protein: "Meat, fish & eggs",
  dairy: "Dairy & alternatives",
  grains: "Grains & bread",
  starch: "Provision & starches",
  legumes: "Beans & lentils",
  vegetables: "Vegetables",
  fruit: "Fruit",
  fats: "Nuts, seeds & oils",
  snacks: "Snacks & sweets",
  drinks: "Drinks",
  local: "Local dishes",
  fast_food: "Fast food",
  breakfast: "Breakfast",
} as const;
export type FoodCategory = keyof typeof FOOD_CATEGORIES;

export type CatalogFood = Nutrition & { id: string; name: string; serving: string; category: FoodCategory; aliases?: string };

type Row = [id: string, name: string, serving: string, kcal: number, protein: number, carbs: number, fat: number, aliases?: string];

const group = (category: FoodCategory, rows: Row[]): CatalogFood[] =>
  rows.map(([id, name, serving, calories, proteinG, carbsG, fatG, aliases]) => ({ id, name, serving, calories, proteinG, carbsG, fatG, category, aliases }));

export const FOODS: CatalogFood[] = [
  ...group("protein", [
    ["egg", "Egg, large", "1 egg (50 g)", 72, 6.3, 0.4, 4.8, "boiled fried"],
    ["egg_white", "Egg white", "1 large white", 17, 3.6, 0.2, 0.1],
    ["chicken_breast", "Chicken breast, grilled", "100 g", 165, 31, 0, 3.6],
    ["chicken_thigh", "Chicken thigh, skinless, roasted", "100 g", 209, 26, 0, 10.9],
    ["chicken_wings", "Chicken wings, baked", "100 g", 254, 24, 0, 17],
    ["turkey_breast", "Turkey breast, roasted", "100 g", 135, 30, 0, 1],
    ["lean_mince", "Lean minced beef (90%), cooked", "100 g", 217, 26, 0, 12, "ground beef"],
    ["sirloin", "Sirloin steak, grilled", "100 g", 206, 30, 0, 9, "beef"],
    ["pork_chop", "Pork chop, grilled", "100 g", 231, 27, 0, 13],
    ["lamb", "Lamb, roasted", "100 g", 258, 25, 0, 17],
    ["ham", "Ham, sliced", "2 slices (56 g)", 61, 9.5, 1.5, 1.5],
    ["bacon", "Bacon", "2 slices (16 g)", 86, 6, 0.2, 6.7],
    ["sausage", "Pork sausage", "1 link (45 g)", 150, 7, 1, 13],
    ["hot_dog", "Hot dog (frank)", "1 frank (45 g)", 150, 5, 2, 13],
    ["salmon", "Salmon, baked", "100 g", 206, 22, 0, 12, "fish"],
    ["tuna_can", "Tuna in water, drained", "1 can (120 g)", 140, 31, 0, 1, "fish"],
    ["kingfish", "Kingfish, grilled", "100 g", 134, 26, 0, 2.6, "fish king mackerel"],
    ["red_snapper", "Red snapper, baked", "100 g", 128, 26, 0, 1.7, "fish"],
    ["tilapia", "Tilapia, baked", "100 g", 128, 26, 0, 2.7, "fish"],
    ["shrimp", "Shrimp, cooked", "100 g", 99, 24, 0.2, 0.3, "prawns"],
    ["saltfish", "Saltfish (salt cod), soaked & cooked", "100 g", 130, 28, 0, 1, "cod"],
    ["sardines", "Sardines in oil, drained", "1 can (92 g)", 191, 23, 0, 10.5, "fish"],
    ["tofu", "Tofu, firm", "100 g", 144, 17, 3, 9, "soy"],
    ["tempeh", "Tempeh", "100 g", 192, 20, 8, 11, "soy"],
    ["whey", "Whey protein powder", "1 scoop (30 g)", 120, 24, 3, 1.5, "shake"],
  ]),
  ...group("dairy", [
    ["milk_whole", "Whole milk", "1 cup (240 ml)", 149, 7.7, 11.7, 8],
    ["milk_low_fat", "Low-fat milk (2%)", "1 cup (240 ml)", 122, 8, 12, 4.8],
    ["milk_skim", "Skim milk", "1 cup (240 ml)", 83, 8.3, 12.2, 0.2],
    ["greek_yoghurt", "Greek yoghurt, plain non-fat", "170 g pot", 100, 17, 6, 0.7, "yogurt"],
    ["fruit_yoghurt", "Fruit yoghurt", "150 g pot", 150, 6, 25, 2.5, "yogurt"],
    ["cottage_cheese", "Cottage cheese, low-fat", "½ cup (113 g)", 92, 12, 5, 2.6],
    ["cheddar", "Cheddar cheese", "1 slice (28 g)", 113, 7, 0.4, 9.3, "cheese"],
    ["mozzarella", "Mozzarella, part-skim", "28 g", 72, 7, 0.8, 4.5, "cheese"],
    ["cream_cheese", "Cream cheese", "1 tbsp (15 g)", 50, 0.9, 0.8, 5],
    ["butter", "Butter", "1 tbsp (14 g)", 102, 0.1, 0, 11.5],
    ["soy_milk", "Soy milk, unsweetened", "1 cup (240 ml)", 80, 7, 4, 4],
    ["almond_milk", "Almond milk, unsweetened", "1 cup (240 ml)", 30, 1, 1, 2.5],
    ["condensed_milk", "Sweetened condensed milk", "1 tbsp (20 g)", 64, 1.6, 10.8, 1.7],
    ["ice_cream", "Ice cream, vanilla", "½ cup (66 g)", 137, 2.3, 16, 7.3],
  ]),
  ...group("grains", [
    ["white_rice", "White rice, cooked", "1 cup (158 g)", 205, 4.3, 44.5, 0.4],
    ["brown_rice", "Brown rice, cooked", "1 cup (195 g)", 216, 5, 45, 1.8],
    ["oats", "Rolled oats, dry", "½ cup (40 g)", 150, 5, 27, 2.5, "oatmeal"],
    ["white_bread", "White bread", "1 slice (28 g)", 75, 2.6, 14, 1, "toast"],
    ["wholewheat_bread", "Wholewheat bread", "1 slice (32 g)", 81, 4, 13.8, 1.1, "toast whole wheat"],
    ["hops_bread", "Hops bread", "1 roll (60 g)", 165, 5, 31, 2, "roll"],
    ["pasta", "Pasta, cooked", "1 cup (140 g)", 221, 8, 43, 1.3, "spaghetti macaroni"],
    ["wholewheat_pasta", "Wholewheat pasta, cooked", "1 cup (140 g)", 174, 7.5, 37, 0.8],
    ["bagel", "Bagel, plain", "1 medium (105 g)", 277, 11, 55, 1.4],
    ["tortilla", "Flour tortilla / wrap", "1 medium (45 g)", 140, 3.7, 23.5, 3.5],
    ["couscous", "Couscous, cooked", "1 cup (157 g)", 176, 6, 36.5, 0.3],
    ["quinoa", "Quinoa, cooked", "1 cup (185 g)", 222, 8, 39, 3.6],
    ["cornflakes", "Cornflakes", "1 cup (28 g)", 100, 2, 24, 0.1, "cereal"],
    ["granola", "Granola", "½ cup (60 g)", 270, 6, 38, 11, "cereal"],
    ["crackers", "Cream crackers", "4 crackers (24 g)", 110, 2, 17, 3.5, "crix biscuits"],
    ["popcorn", "Popcorn, air-popped", "3 cups (24 g)", 93, 3, 19, 1.1],
  ]),
  ...group("starch", [
    ["potato", "Potato, boiled", "1 medium (173 g)", 150, 3.2, 34, 0.2, "aloo"],
    ["sweet_potato", "Sweet potato, baked", "1 medium (114 g)", 103, 2.3, 24, 0.2],
    ["dasheen", "Dasheen (taro), boiled", "1 cup (132 g)", 187, 0.7, 46, 0.1, "provision"],
    ["cassava", "Cassava, boiled", "1 cup (137 g)", 205, 1.7, 49, 0.4, "provision yuca"],
    ["yam", "Yam, boiled", "1 cup (136 g)", 158, 2, 37.5, 0.2, "provision"],
    ["green_fig", "Green fig (green banana), boiled", "2 figs (200 g)", 180, 2, 46, 0.4, "provision"],
    ["breadfruit", "Breadfruit, boiled", "1 cup (220 g)", 227, 2.4, 60, 0.5, "provision"],
    ["plantain_ripe_fried", "Ripe plantain, fried", "½ plantain (75 g)", 175, 1, 28, 7],
    ["plantain_green", "Green plantain, boiled", "1 cup (154 g)", 179, 1.2, 48, 0.3],
    ["corn_cob", "Corn on the cob", "1 ear (90 g)", 88, 3.3, 19, 1.4],
  ]),
  ...group("legumes", [
    ["black_beans", "Black beans, cooked", "1 cup (172 g)", 227, 15, 41, 0.9],
    ["red_beans", "Red kidney beans, cooked", "1 cup (177 g)", 225, 15, 40, 0.9],
    ["chickpeas", "Chickpeas (channa), cooked", "1 cup (164 g)", 269, 14.5, 45, 4.2, "chana garbanzo"],
    ["lentils", "Lentils, cooked", "1 cup (198 g)", 230, 18, 40, 0.8],
    ["split_peas", "Split peas, cooked", "1 cup (196 g)", 231, 16, 41, 0.8],
    ["pigeon_peas", "Pigeon peas, cooked", "1 cup (168 g)", 203, 11, 39, 0.6, "gungo"],
    ["edamame", "Edamame", "1 cup (155 g)", 188, 18.5, 14, 8, "soy"],
    ["hummus", "Hummus", "2 tbsp (30 g)", 70, 2, 4, 5],
    ["baked_beans", "Baked beans", "½ cup (130 g)", 155, 7, 27, 0.6],
  ]),
  ...group("vegetables", [
    ["broccoli", "Broccoli, steamed", "1 cup (156 g)", 55, 3.7, 11, 0.6],
    ["spinach", "Spinach, cooked", "1 cup (180 g)", 41, 5.3, 6.8, 0.5],
    ["bodi", "Bodi (long beans), steamed", "1 cup (104 g)", 49, 2.7, 9.5, 0.1, "string beans"],
    ["pak_choi", "Pak choi, cooked", "1 cup (170 g)", 20, 2.7, 3, 0.3, "bok choy"],
    ["green_beans", "Green beans", "1 cup (125 g)", 44, 2.4, 10, 0.4],
    ["carrot", "Carrot", "1 medium (61 g)", 25, 0.6, 6, 0.1],
    ["cucumber", "Cucumber", "1 cup sliced (104 g)", 16, 0.7, 3.8, 0.1],
    ["tomato", "Tomato", "1 medium (123 g)", 22, 1.1, 4.8, 0.2],
    ["salad_leaves", "Lettuce / mixed salad leaves", "2 cups (70 g)", 12, 1, 2.3, 0.2, "salad"],
    ["cabbage", "Cabbage, raw", "1 cup (89 g)", 22, 1.1, 5.2, 0.1],
    ["pumpkin", "Pumpkin, cooked", "1 cup (245 g)", 49, 1.8, 12, 0.2],
    ["christophene", "Christophene (chayote), cooked", "1 cup (160 g)", 38, 1, 8, 0.8],
    ["sweet_pepper", "Sweet pepper", "1 medium (119 g)", 31, 1, 7, 0.4, "bell pepper"],
    ["onion", "Onion", "1 medium (110 g)", 44, 1.2, 10, 0.1],
    ["mushrooms", "Mushrooms, cooked", "1 cup (156 g)", 44, 3.4, 8, 0.7],
    ["okra", "Ochro (okra), cooked", "1 cup (160 g)", 35, 3, 7, 0.3],
    ["melongene", "Melongene (eggplant), cooked", "1 cup (99 g)", 35, 0.8, 8.6, 0.2, "baigan aubergine"],
    ["avocado", "Avocado (zaboca)", "½ medium (100 g)", 160, 2, 8.5, 14.7],
    ["coleslaw", "Coleslaw", "½ cup (90 g)", 150, 1, 13, 10],
  ]),
  ...group("fruit", [
    ["banana", "Banana", "1 medium (118 g)", 105, 1.3, 27, 0.4, "fig"],
    ["apple", "Apple", "1 medium (182 g)", 95, 0.5, 25, 0.3],
    ["orange", "Orange", "1 medium (131 g)", 62, 1.2, 15.4, 0.2],
    ["portugal", "Portugal (mandarin)", "1 medium (88 g)", 47, 0.7, 11.7, 0.3, "tangerine"],
    ["mango", "Mango", "1 cup sliced (165 g)", 99, 1.4, 24.7, 0.6, "julie"],
    ["pineapple", "Pineapple", "1 cup chunks (165 g)", 82, 0.9, 21.6, 0.2],
    ["papaya", "Papaya (pawpaw)", "1 cup (145 g)", 62, 0.7, 15.7, 0.4],
    ["watermelon", "Watermelon", "1 cup (152 g)", 46, 0.9, 11.5, 0.2],
    ["grapes", "Grapes", "1 cup (151 g)", 104, 1.1, 27, 0.2],
    ["strawberries", "Strawberries", "1 cup (152 g)", 49, 1, 11.7, 0.5],
    ["blueberries", "Blueberries", "1 cup (148 g)", 84, 1.1, 21.4, 0.5],
    ["guava", "Guava", "1 fruit (55 g)", 37, 1.4, 7.9, 0.5],
    ["sapodilla", "Sapodilla (chennet-sapote)", "1 fruit (170 g)", 141, 0.7, 34, 1.9, "sapote"],
    ["pear", "Pear", "1 medium (178 g)", 101, 0.6, 27, 0.2],
    ["kiwi", "Kiwi", "1 fruit (69 g)", 42, 0.8, 10, 0.4],
    ["dates", "Dates (medjool)", "1 date (24 g)", 66, 0.4, 18, 0],
    ["raisins", "Raisins", "small box (43 g)", 129, 1.3, 34, 0.2],
  ]),
  ...group("fats", [
    ["almonds", "Almonds", "28 g (23 nuts)", 164, 6, 6, 14, "nuts"],
    ["peanuts", "Peanuts, roasted", "28 g", 166, 7, 6, 14, "nuts"],
    ["cashews", "Cashews", "28 g", 157, 5, 8.6, 12.4, "nuts"],
    ["walnuts", "Walnuts", "28 g", 185, 4.3, 3.9, 18.5, "nuts"],
    ["peanut_butter", "Peanut butter", "2 tbsp (32 g)", 190, 7, 7, 16],
    ["chia", "Chia seeds", "1 tbsp (12 g)", 58, 2, 5, 3.7],
    ["olive_oil", "Olive oil", "1 tbsp (14 g)", 119, 0, 0, 13.5],
    ["cooking_oil", "Vegetable / coconut oil", "1 tbsp (14 g)", 120, 0, 0, 14],
    ["mayonnaise", "Mayonnaise", "1 tbsp (14 g)", 94, 0.1, 0.1, 10.3, "mayo"],
    ["coconut_milk", "Coconut milk (canned)", "¼ cup (60 ml)", 138, 1.4, 2, 14.3],
  ]),
  ...group("snacks", [
    ["dark_chocolate", "Dark chocolate (70%)", "28 g", 170, 2.2, 13, 12],
    ["milk_chocolate", "Milk chocolate bar", "1 bar (43 g)", 235, 3.4, 26, 13, "candy"],
    ["chips", "Potato chips", "1 small bag (28 g)", 152, 2, 15, 10, "crisps"],
    ["cookies", "Cookies / sweet biscuits", "2 cookies (30 g)", 140, 1.5, 20, 6],
    ["protein_bar", "Protein bar", "1 bar (60 g)", 220, 20, 23, 7],
    ["granola_bar", "Granola bar", "1 bar (24 g)", 100, 2, 17, 3.5],
    ["rice_cake", "Rice cake", "1 cake (9 g)", 35, 0.7, 7.3, 0.3],
    ["doughnut", "Doughnut, glazed", "1 medium (64 g)", 269, 3.7, 31, 15, "donut"],
    ["cake", "Cake, frosted", "1 slice (80 g)", 300, 3, 45, 13],
    ["kurma", "Kurma", "½ cup (40 g)", 190, 2.5, 27, 8],
    ["sugar", "Sugar", "1 tsp (4 g)", 16, 0, 4, 0],
    ["honey", "Honey", "1 tbsp (21 g)", 64, 0.1, 17, 0],
    ["jam", "Jam", "1 tbsp (20 g)", 56, 0.1, 14, 0, "jelly"],
  ]),
  ...group("drinks", [
    ["water", "Water", "1 glass", 0, 0, 0, 0],
    ["orange_juice", "Orange juice", "1 cup (240 ml)", 112, 1.7, 26, 0.5],
    ["cola", "Soft drink (cola)", "1 can (355 ml)", 140, 0, 39, 0, "soda pop"],
    ["diet_soda", "Diet soft drink", "1 can (355 ml)", 0, 0, 0, 0, "soda"],
    ["coconut_water", "Coconut water", "1 cup (240 ml)", 46, 1.7, 9, 0.5],
    ["beer", "Beer (lager)", "1 bottle (275 ml)", 120, 1, 10, 0, "carib stag"],
    ["rum", "Rum (40%)", "1 shot (44 ml)", 97, 0, 0, 0],
    ["wine", "Red wine", "1 glass (150 ml)", 125, 0.1, 3.8, 0],
    ["black_coffee", "Black coffee", "1 cup", 2, 0.3, 0, 0],
    ["coffee_milk_sugar", "Coffee with milk & sugar", "1 mug", 70, 1.5, 10, 2],
    ["latte", "Latte", "Medium (350 ml)", 190, 13, 19, 7],
    ["tea", "Tea, unsweetened", "1 cup", 2, 0, 0.5, 0],
    ["cocoa_tea", "Cocoa tea (with milk)", "1 cup", 190, 7, 25, 7, "hot chocolate"],
    ["sorrel", "Sorrel drink", "1 cup (240 ml)", 120, 0, 30, 0],
    ["mauby", "Mauby", "1 cup (240 ml)", 100, 0, 25, 0],
    ["malt", "Malt drink", "1 bottle (296 ml)", 165, 1, 39, 0, "malta"],
    ["sports_drink", "Sports drink", "1 bottle (591 ml)", 140, 0, 36, 0, "gatorade"],
    ["smoothie", "Fruit smoothie", "1 cup (240 ml)", 150, 2, 35, 0.5],
  ]),
  ...group("local", [
    ["doubles", "Doubles", "1 doubles", 280, 8, 38, 11],
    ["chicken_roti", "Chicken roti (dhalpuri)", "1 roti", 700, 35, 80, 26, "wrap"],
    ["dhalpuri", "Dhalpuri skin", "1 skin", 330, 9, 50, 10, "roti"],
    ["sada_roti", "Sada roti", "1 roti (110 g)", 300, 8, 56, 5],
    ["buss_up_shut", "Paratha (buss-up-shut)", "1 piece (120 g)", 400, 8, 52, 18, "roti"],
    ["pelau", "Chicken pelau", "1 cup (250 g)", 410, 20, 52, 13],
    ["callaloo", "Callaloo", "1 cup (245 g)", 180, 5, 9, 14],
    ["bake_and_shark", "Bake and shark", "1 sandwich", 650, 30, 60, 32],
    ["coconut_bake", "Coconut bake", "1 slice (80 g)", 290, 5, 38, 13],
    ["fried_bake", "Fried bake (float)", "1 bake (60 g)", 220, 4, 28, 10],
    ["buljol", "Saltfish buljol", "½ cup (120 g)", 180, 20, 4, 9],
    ["stew_chicken", "Stew chicken", "1 cup (200 g)", 380, 34, 8, 23],
    ["curry_chicken", "Curry chicken", "1 cup (200 g)", 360, 32, 7, 22],
    ["curry_goat", "Curry goat", "1 cup (200 g)", 330, 36, 5, 18],
    ["curry_channa", "Curry channa & aloo", "1 cup (240 g)", 300, 11, 45, 9, "chana potato"],
    ["dhal", "Dhal (split peas)", "1 cup (240 g)", 200, 12, 33, 3],
    ["macaroni_pie", "Macaroni pie", "1 slice (150 g)", 330, 13, 34, 16],
    ["rice_and_peas", "Rice and peas", "1 cup (190 g)", 280, 7, 50, 5],
    ["oil_down", "Oil down", "1 cup (250 g)", 400, 12, 50, 18],
    ["corn_soup", "Corn soup", "1 bowl (350 ml)", 300, 11, 45, 9],
    ["pholourie", "Pholourie with chutney", "6 pieces (90 g)", 300, 6, 36, 15],
    ["aloo_pie", "Aloo pie", "1 pie (110 g)", 320, 6, 40, 15],
    ["bhaji", "Bhaji (spinach)", "1 cup (180 g)", 110, 5, 8, 7],
    ["geera_pork", "Geera pork", "1 cup (200 g)", 420, 34, 4, 30],
    ["pastelle", "Pastelle", "1 pastelle (150 g)", 300, 12, 30, 15],
    ["coo_coo", "Coo coo", "1 slice (150 g)", 220, 4, 30, 10],
    ["fried_rice", "Fried rice", "1 cup (200 g)", 330, 9, 50, 10, "chinese"],
    ["chow_mein", "Chow mein", "1 cup (200 g)", 310, 12, 40, 11, "chinese noodles"],
  ]),
  ...group("fast_food", [
    ["cheeseburger", "Cheeseburger", "1 burger", 300, 15, 33, 12],
    ["quarter_pounder", "Quarter-pound cheeseburger", "1 burger", 520, 30, 42, 26],
    ["fried_chicken", "Fried chicken", "2 pieces", 500, 40, 16, 31, "kfc"],
    ["french_fries", "French fries", "Medium (117 g)", 365, 4, 48, 17, "chips"],
    ["pizza", "Pizza, pepperoni", "1 slice (107 g)", 298, 13, 34, 12],
    ["turkey_sub", "Turkey sub (6-inch)", "1 sub", 280, 18, 46, 3.5, "sandwich subway"],
    ["chicken_burrito", "Chicken burrito", "1 burrito", 600, 35, 70, 20],
    ["nuggets", "Chicken nuggets", "6 pieces", 260, 14, 16, 16],
    ["shawarma", "Chicken shawarma wrap", "1 wrap", 550, 35, 50, 22, "gyro"],
  ]),
  ...group("breakfast", [
    ["pancakes", "Pancakes", "2 medium (76 g)", 175, 5, 22, 7],
    ["oatmeal", "Oatmeal, made with water", "1 cup (234 g)", 158, 6, 27, 3.2, "porridge"],
    ["cornmeal_porridge", "Cornmeal porridge", "1 cup", 250, 6, 40, 7],
    ["omelette", "Cheese omelette (2 eggs)", "1 omelette", 260, 17, 1.5, 20],
  ]),
];

export const FOOD_BY_ID = new Map(FOODS.map((f) => [f.id, f]));

const normalise = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ");

/** Every word typed must appear in the name, category or aliases; names starting with the query rank first. */
export function searchFoods<T extends { name: string; aliases?: string; category?: string }>(foods: T[], query: string, limit = 40): T[] {
  const words = normalise(query).split(/\s+/).filter(Boolean);
  if (!words.length) return foods.slice(0, limit);
  const scored: { food: T; score: number }[] = [];
  for (const food of foods) {
    const name = normalise(food.name);
    const haystack = `${name} ${normalise(food.aliases ?? "")} ${food.category ? normalise(food.category) : ""}`;
    if (!words.every((w) => haystack.includes(w))) continue;
    const score = (name.startsWith(words[0]) ? 0 : name.includes(` ${words[0]}`) ? 1 : 2) + name.length / 1000;
    scored.push({ food, score });
  }
  return scored.sort((a, b) => a.score - b.score).slice(0, limit).map((s) => s.food);
}
