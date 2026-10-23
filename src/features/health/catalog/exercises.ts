/**
 * Built-in exercise library. `kind` decides what the logger asks for:
 * weight × reps, reps only (bodyweight), or time.
 */
export const MUSCLE_GROUPS = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  core: "Core",
  full_body: "Full body",
  cardio: "Cardio",
} as const;
export type MuscleGroup = keyof typeof MUSCLE_GROUPS;

export const EQUIPMENT = {
  bodyweight: "Bodyweight",
  dumbbell: "Dumbbells",
  barbell: "Barbell",
  kettlebell: "Kettlebell",
  band: "Resistance band",
  machine: "Machine",
  cable: "Cable",
  bar: "Pull-up bar",
  cardio_machine: "Cardio machine",
} as const;
export type Equipment = keyof typeof EQUIPMENT;

export type ExerciseKind = "weight" | "reps" | "time";

export type Exercise = {
  key: string;
  name: string;
  primary: MuscleGroup;
  secondary: MuscleGroup[];
  equipment: Equipment;
  kind: ExerciseKind;
  /** Lower-body lifts progress in bigger jumps. */
  lower: boolean;
  tips: string[];
};

type Def = [key: string, name: string, primary: MuscleGroup, secondary: MuscleGroup[], equipment: Equipment, kind: ExerciseKind, tips: string[]];

const LOWER: MuscleGroup[] = ["quads", "hamstrings", "glutes", "calves"];

const defs: Def[] = [
  // Chest
  ["barbell_bench_press", "Barbell bench press", "chest", ["triceps", "shoulders"], "barbell", "weight", ["Feet flat, shoulder blades pinched together", "Lower the bar to mid-chest with elbows about 45° from your body", "Press up and slightly back over your shoulders"]],
  ["incline_barbell_press", "Incline barbell press", "chest", ["shoulders", "triceps"], "barbell", "weight", ["Bench at 30–45°", "Touch the bar to your upper chest", "Keep your wrists stacked over your elbows"]],
  ["dumbbell_bench_press", "Dumbbell bench press", "chest", ["triceps", "shoulders"], "dumbbell", "weight", ["Start with the dumbbells over your chest, palms forward", "Lower until your elbows are just below the bench", "Press up and slightly in, without clanking the weights"]],
  ["incline_dumbbell_press", "Incline dumbbell press", "chest", ["shoulders", "triceps"], "dumbbell", "weight", ["Bench at 30–45°", "Lower to the sides of your upper chest", "Keep your back on the bench throughout"]],
  ["dumbbell_floor_press", "Dumbbell floor press", "chest", ["triceps"], "dumbbell", "weight", ["Lie on the floor, knees bent", "Lower until your upper arms touch the floor", "Pause, then press — great when you don't have a bench"]],
  ["dumbbell_fly", "Dumbbell fly", "chest", ["shoulders"], "dumbbell", "weight", ["Keep a soft bend in your elbows", "Open your arms until you feel a stretch across your chest", "Bring the weights together as if hugging a tree"]],
  ["cable_fly", "Cable fly", "chest", ["shoulders"], "cable", "weight", ["Step forward with a staggered stance", "Sweep your hands together in front of your chest", "Control the return; don't let the stack pull you back"]],
  ["machine_chest_press", "Machine chest press", "chest", ["triceps", "shoulders"], "machine", "weight", ["Set the seat so the handles line up with mid-chest", "Press without locking your elbows hard", "Return slowly"]],
  ["pec_deck", "Pec deck", "chest", [], "machine", "weight", ["Elbows slightly bent and level with your shoulders", "Squeeze your chest to bring the pads together", "Let the weight return under control"]],
  ["push_up", "Push-up", "chest", ["triceps", "shoulders", "core"], "bodyweight", "reps", ["Hands just wider than shoulders, body in a straight line", "Lower your chest to a fist's height from the floor", "Keep your hips from sagging"]],
  ["incline_push_up", "Incline push-up", "chest", ["triceps", "shoulders"], "bodyweight", "reps", ["Hands on a bench, table or wall", "The higher the surface, the easier it is", "Keep your body straight from head to heels"]],
  ["decline_push_up", "Decline push-up", "chest", ["shoulders", "triceps"], "bodyweight", "reps", ["Feet on a bench or step", "Lower under control to the floor", "Targets the upper chest more"]],
  ["chest_dip", "Chest dip", "chest", ["triceps", "shoulders"], "bodyweight", "reps", ["Lean your torso forward slightly", "Lower until your shoulders are just below your elbows", "Stop short of any shoulder pain"]],

  // Back
  ["deadlift", "Deadlift", "back", ["hamstrings", "glutes", "forearms"], "barbell", "weight", ["Bar over mid-foot, shins close to the bar", "Brace your core and keep your back flat", "Push the floor away; lock out with your glutes, not your lower back"]],
  ["pull_up", "Pull-up", "back", ["biceps", "forearms"], "bar", "reps", ["Hands just wider than shoulders, palms facing away", "Pull your chest towards the bar", "Lower all the way down each rep"]],
  ["chin_up", "Chin-up", "back", ["biceps"], "bar", "reps", ["Palms facing you, shoulder-width", "Lead with your chest, not your chin", "Use a band for help if needed"]],
  ["lat_pulldown", "Lat pulldown", "back", ["biceps"], "cable", "weight", ["Grip just outside shoulder width", "Pull the bar to your upper chest, elbows down and back", "Don't lean back more than a little"]],
  ["barbell_row", "Barbell row", "back", ["biceps", "hamstrings"], "barbell", "weight", ["Hinge until your torso is about 45°", "Pull the bar to your lower ribs", "Keep your back flat and still"]],
  ["dumbbell_row", "One-arm dumbbell row", "back", ["biceps"], "dumbbell", "weight", ["Support yourself on a bench or your knee", "Pull the dumbbell towards your hip", "Avoid twisting your torso"]],
  ["seated_cable_row", "Seated cable row", "back", ["biceps"], "cable", "weight", ["Sit tall with a slight knee bend", "Pull the handle to your stomach, shoulders back", "Let your shoulder blades stretch forward on the return"]],
  ["t_bar_row", "T-bar row", "back", ["biceps"], "barbell", "weight", ["Chest up, back flat", "Pull the handle to your chest", "Control the lowering"]],
  ["inverted_row", "Inverted row", "back", ["biceps", "core"], "bodyweight", "reps", ["Lie under a sturdy table or low bar", "Pull your chest up to it, body straight", "Bend your knees to make it easier"]],
  ["renegade_row", "Renegade row", "back", ["core", "shoulders"], "dumbbell", "weight", ["Plank on two dumbbells, feet wide", "Row one dumbbell at a time without rotating your hips", "Use light weights to start"]],
  ["dumbbell_pullover", "Dumbbell pullover", "back", ["chest"], "dumbbell", "weight", ["Lie across a bench or on the floor", "Lower the dumbbell behind your head with straight-ish arms", "Pull it back over your chest using your lats"]],
  ["face_pull", "Face pull", "shoulders", ["back"], "cable", "weight", ["Rope at upper-chest height", "Pull towards your face, hands apart", "Finish with your elbows high and thumbs back"]],
  ["straight_arm_pulldown", "Straight-arm pulldown", "back", [], "cable", "weight", ["Arms almost straight", "Sweep the bar down to your thighs", "Feel it in your lats, not your triceps"]],
  ["back_extension", "Back extension", "back", ["glutes", "hamstrings"], "bodyweight", "reps", ["Hinge at the hips over the pad", "Rise until your body is in a straight line", "Don't over-arch at the top"]],
  ["superman", "Superman", "back", ["glutes"], "bodyweight", "reps", ["Lie face down", "Lift your arms, chest and legs together", "Hold for a breath, then lower"]],
  ["band_pull_apart", "Band pull-apart", "shoulders", ["back"], "band", "reps", ["Hold the band at shoulder height, arms straight", "Pull it apart until it touches your chest", "Squeeze your shoulder blades together"]],

  // Shoulders
  ["overhead_press", "Overhead press", "shoulders", ["triceps", "core"], "barbell", "weight", ["Bar on your front shoulders, grip just outside them", "Press straight up, moving your head out of the way", "Squeeze your glutes so your back doesn't arch"]],
  ["dumbbell_shoulder_press", "Dumbbell shoulder press", "shoulders", ["triceps"], "dumbbell", "weight", ["Seated or standing, dumbbells at ear height", "Press up until your arms are straight", "Lower to ear height under control"]],
  ["arnold_press", "Arnold press", "shoulders", ["triceps"], "dumbbell", "weight", ["Start with palms facing you", "Rotate your palms forward as you press", "Reverse the motion on the way down"]],
  ["machine_shoulder_press", "Machine shoulder press", "shoulders", ["triceps"], "machine", "weight", ["Handles at shoulder height", "Press without shrugging", "Return slowly"]],
  ["lateral_raise", "Lateral raise", "shoulders", [], "dumbbell", "weight", ["Slight bend in the elbows", "Raise your arms out to shoulder height", "Lead with your elbows; go light"]],
  ["cable_lateral_raise", "Cable lateral raise", "shoulders", [], "cable", "weight", ["Stand side-on to the cable", "Raise your arm out to shoulder height", "Constant tension — no swinging"]],
  ["front_raise", "Front raise", "shoulders", [], "dumbbell", "weight", ["Raise the weights in front to shoulder height", "Keep your torso still", "Lower slowly"]],
  ["rear_delt_fly", "Rear delt fly", "shoulders", ["back"], "dumbbell", "weight", ["Hinge forward with a flat back", "Raise the dumbbells out to the sides", "Think 'elbows wide', not 'squeeze back'"]],
  ["pike_push_up", "Pike push-up", "shoulders", ["triceps"], "bodyweight", "reps", ["Hips high, body like an upside-down V", "Lower the top of your head towards the floor", "Press back up through your shoulders"]],
  ["upright_row", "Upright row", "shoulders", ["back"], "dumbbell", "weight", ["Pull the weights up along your body", "Stop at chest height", "Skip it if it pinches your shoulders"]],
  ["dumbbell_shrug", "Dumbbell shrug", "back", ["forearms"], "dumbbell", "weight", ["Arms straight by your sides", "Lift your shoulders straight up to your ears", "Pause, then lower — don't roll"]],

  // Arms
  ["barbell_curl", "Barbell curl", "biceps", ["forearms"], "barbell", "weight", ["Elbows pinned to your sides", "Curl to your shoulders without leaning back", "Lower all the way"]],
  ["dumbbell_curl", "Dumbbell curl", "biceps", ["forearms"], "dumbbell", "weight", ["Palms forward, elbows still", "Curl up and squeeze", "Lower slowly"]],
  ["hammer_curl", "Hammer curl", "biceps", ["forearms"], "dumbbell", "weight", ["Palms facing each other", "Curl without swinging", "Works the forearm too"]],
  ["incline_curl", "Incline dumbbell curl", "biceps", [], "dumbbell", "weight", ["Lie back on an incline bench, arms hanging", "Curl without moving your upper arms", "A big stretch at the bottom"]],
  ["preacher_curl", "Preacher curl", "biceps", [], "machine", "weight", ["Upper arms flat on the pad", "Curl up, then lower until almost straight", "Don't let the weight drop"]],
  ["cable_curl", "Cable curl", "biceps", ["forearms"], "cable", "weight", ["Stand close to the pulley", "Curl with elbows fixed", "Constant tension through the rep"]],
  ["concentration_curl", "Concentration curl", "biceps", [], "dumbbell", "weight", ["Seated, elbow braced on your inner thigh", "Curl slowly and squeeze at the top", "One arm at a time"]],
  ["band_curl", "Band curl", "biceps", [], "band", "reps", ["Stand on the band", "Curl your hands to your shoulders", "Resist on the way down"]],
  ["close_grip_bench", "Close-grip bench press", "triceps", ["chest"], "barbell", "weight", ["Hands about shoulder-width", "Elbows tucked close to your body", "Touch the bar to your lower chest"]],
  ["tricep_pushdown", "Tricep pushdown", "triceps", [], "cable", "weight", ["Elbows pinned to your sides", "Push down until your arms are straight", "Only your forearms move"]],
  ["overhead_tricep_extension", "Overhead tricep extension", "triceps", [], "dumbbell", "weight", ["Hold one dumbbell overhead with both hands", "Lower it behind your head, elbows pointing up", "Extend back to the top"]],
  ["skull_crusher", "Skull crusher", "triceps", [], "barbell", "weight", ["Lie on a bench holding an EZ bar over your face", "Bend at the elbows to lower it towards your forehead", "Keep your upper arms still"]],
  ["bench_dip", "Bench dip", "triceps", ["chest", "shoulders"], "bodyweight", "reps", ["Hands on a bench behind you", "Lower until your elbows are at 90°", "Bend your knees to make it easier"]],
  ["tricep_kickback", "Tricep kickback", "triceps", [], "dumbbell", "weight", ["Hinge forward, upper arm parallel to the floor", "Straighten your arm back", "Squeeze, then return"]],
  ["diamond_push_up", "Diamond push-up", "triceps", ["chest"], "bodyweight", "reps", ["Hands together under your chest, forming a diamond", "Lower with elbows close to your body", "Drop to your knees to make it easier"]],
  ["wrist_curl", "Wrist curl", "forearms", [], "dumbbell", "weight", ["Forearms on your thighs, palms up", "Curl your wrists up", "Use a light weight and full range"]],

  // Legs
  ["back_squat", "Back squat", "quads", ["glutes", "hamstrings", "core"], "barbell", "weight", ["Bar on your upper back, feet shoulder-width", "Sit down and back until your thighs are at least parallel", "Drive up with your chest tall and knees tracking your toes"]],
  ["front_squat", "Front squat", "quads", ["glutes", "core"], "barbell", "weight", ["Bar on your front shoulders, elbows high", "Squat down with an upright torso", "Keep your elbows up as you stand"]],
  ["goblet_squat", "Goblet squat", "quads", ["glutes", "core"], "dumbbell", "weight", ["Hold a dumbbell or kettlebell at your chest", "Squat between your knees, chest up", "Push your knees out as you go down"]],
  ["bodyweight_squat", "Bodyweight squat", "quads", ["glutes"], "bodyweight", "reps", ["Feet shoulder-width, arms forward", "Sit back as if onto a chair", "Stand up through your whole foot"]],
  ["jump_squat", "Jump squat", "quads", ["glutes", "calves", "cardio"], "bodyweight", "reps", ["Squat to about parallel", "Jump explosively", "Land softly and go straight into the next rep"]],
  ["leg_press", "Leg press", "quads", ["glutes", "hamstrings"], "machine", "weight", ["Feet shoulder-width in the middle of the platform", "Lower until your knees reach about 90°", "Don't let your lower back lift off the seat"]],
  ["hack_squat", "Hack squat", "quads", ["glutes"], "machine", "weight", ["Shoulders under the pads, feet mid-platform", "Lower under control", "Drive up without locking your knees hard"]],
  ["leg_extension", "Leg extension", "quads", [], "machine", "weight", ["Pad on your lower shins", "Straighten your legs and squeeze", "Lower slowly"]],
  ["walking_lunge", "Walking lunge", "quads", ["glutes", "hamstrings"], "dumbbell", "weight", ["Take a long step forward", "Lower your back knee towards the floor", "Push through your front heel into the next step"]],
  ["reverse_lunge", "Reverse lunge", "quads", ["glutes"], "bodyweight", "reps", ["Step back and lower your back knee", "Keep your front shin fairly upright", "Easier on the knees than forward lunges"]],
  ["bulgarian_split_squat", "Bulgarian split squat", "quads", ["glutes"], "dumbbell", "weight", ["Back foot on a bench", "Lower straight down until your front thigh is parallel", "Most of the weight on your front leg"]],
  ["split_squat", "Split squat", "quads", ["glutes"], "bodyweight", "reps", ["Staggered stance, both feet on the floor", "Lower straight down", "Keep your torso upright"]],
  ["step_up", "Step-up", "quads", ["glutes"], "dumbbell", "weight", ["Whole foot on a sturdy box or step", "Drive up through the top leg", "Lower under control"]],
  ["wall_sit", "Wall sit", "quads", [], "bodyweight", "time", ["Back flat on the wall", "Thighs parallel to the floor", "Breathe and hold"]],
  ["romanian_deadlift", "Romanian deadlift", "hamstrings", ["glutes", "back"], "barbell", "weight", ["Soft knees, push your hips back", "Slide the bar down your thighs until you feel a stretch", "Stand up by squeezing your glutes"]],
  ["dumbbell_romanian_deadlift", "Dumbbell Romanian deadlift", "hamstrings", ["glutes", "back"], "dumbbell", "weight", ["Dumbbells in front of your thighs", "Hinge back, keeping your back flat", "Stop when your hamstrings are stretched"]],
  ["single_leg_rdl", "Single-leg Romanian deadlift", "hamstrings", ["glutes", "core"], "dumbbell", "weight", ["Balance on one leg, slight knee bend", "Hinge forward as your back leg lifts behind", "Keep your hips square to the floor"]],
  ["sumo_deadlift", "Sumo deadlift", "glutes", ["quads", "hamstrings", "back"], "barbell", "weight", ["Wide stance, toes out, hands inside your knees", "Push your knees out and chest up", "Drive through the floor to stand"]],
  ["leg_curl", "Leg curl", "hamstrings", [], "machine", "weight", ["Pad just above your heels", "Curl your heels towards your glutes", "Lower slowly"]],
  ["nordic_curl", "Nordic curl", "hamstrings", [], "bodyweight", "reps", ["Kneel with your ankles anchored", "Lower your body forward as slowly as you can", "Catch yourself with your hands and push back up"]],
  ["good_morning", "Good morning", "hamstrings", ["back", "glutes"], "barbell", "weight", ["Bar on your upper back, soft knees", "Hinge forward with a flat back", "Use a light weight"]],
  ["hip_thrust", "Hip thrust", "glutes", ["hamstrings"], "barbell", "weight", ["Upper back on a bench, bar over your hips", "Drive your hips up until your body is flat", "Tuck your chin and squeeze at the top"]],
  ["glute_bridge", "Glute bridge", "glutes", ["hamstrings"], "bodyweight", "reps", ["Lie on your back, knees bent", "Push through your heels to lift your hips", "Squeeze your glutes at the top"]],
  ["single_leg_glute_bridge", "Single-leg glute bridge", "glutes", ["hamstrings"], "bodyweight", "reps", ["One foot planted, the other leg straight", "Lift your hips level", "Don't let your hips tilt"]],
  ["kettlebell_swing", "Kettlebell swing", "glutes", ["hamstrings", "back", "cardio"], "kettlebell", "weight", ["Hike the bell back between your legs", "Snap your hips forward to float it to chest height", "It's a hip hinge, not a squat or a front raise"]],
  ["cable_pull_through", "Cable pull-through", "glutes", ["hamstrings"], "cable", "weight", ["Face away from a low cable, rope between your legs", "Hinge back, then drive your hips forward", "Squeeze your glutes to finish"]],
  ["hip_abduction", "Hip abduction", "glutes", [], "machine", "weight", ["Sit tall in the machine", "Push your knees out against the pads", "Return slowly"]],
  ["banded_lateral_walk", "Banded lateral walk", "glutes", [], "band", "reps", ["Band around your knees or ankles", "Half-squat and step sideways", "Keep tension in the band the whole time"]],
  ["standing_calf_raise", "Standing calf raise", "calves", [], "machine", "weight", ["Balls of your feet on the edge", "Rise as high as you can", "Lower until you feel a stretch"]],
  ["seated_calf_raise", "Seated calf raise", "calves", [], "machine", "weight", ["Knees under the pad", "Press up onto your toes", "Pause at the top and bottom"]],
  ["single_leg_calf_raise", "Single-leg calf raise", "calves", [], "bodyweight", "reps", ["Stand on one foot on a step", "Hold something for balance", "Full range, slow lowering"]],

  // Core
  ["plank", "Plank", "core", ["shoulders"], "bodyweight", "time", ["Forearms under shoulders", "Body straight from head to heels", "Squeeze your glutes and brace your stomach"]],
  ["side_plank", "Side plank", "core", [], "bodyweight", "time", ["Elbow under your shoulder", "Hips lifted in a straight line", "Swap sides halfway"]],
  ["crunch", "Crunch", "core", [], "bodyweight", "reps", ["Knees bent, hands by your ears", "Curl your shoulders off the floor", "Don't pull on your neck"]],
  ["bicycle_crunch", "Bicycle crunch", "core", [], "bodyweight", "reps", ["Bring opposite elbow to knee", "Extend the other leg", "Slow and controlled beats fast"]],
  ["hanging_leg_raise", "Hanging leg raise", "core", ["forearms"], "bar", "reps", ["Hang from a bar", "Raise your knees or legs without swinging", "Curl your pelvis up at the top"]],
  ["lying_leg_raise", "Lying leg raise", "core", [], "bodyweight", "reps", ["Lower back pressed into the floor", "Lower your straight legs slowly", "Stop before your back arches"]],
  ["russian_twist", "Russian twist", "core", [], "bodyweight", "reps", ["Lean back slightly, feet up or down", "Rotate your torso side to side", "Hold a weight to make it harder"]],
  ["mountain_climber", "Mountain climbers", "core", ["cardio", "shoulders"], "bodyweight", "time", ["Start in a high plank", "Drive your knees to your chest one at a time", "Keep your hips low"]],
  ["dead_bug", "Dead bug", "core", [], "bodyweight", "reps", ["Lie on your back, arms and knees up", "Lower opposite arm and leg slowly", "Keep your lower back on the floor"]],
  ["ab_wheel", "Ab wheel rollout", "core", ["shoulders"], "bodyweight", "reps", ["Start on your knees", "Roll out as far as you can with a flat back", "Pull back with your abs"]],
  ["cable_crunch", "Cable crunch", "core", [], "cable", "weight", ["Kneel facing the cable, rope by your head", "Crunch down by curling your spine", "Don't just bend at the hips"]],
  ["pallof_press", "Pallof press", "core", [], "cable", "weight", ["Stand side-on to the cable", "Press the handle straight out from your chest", "Resist the twist"]],
  ["hollow_hold", "Hollow hold", "core", [], "bodyweight", "time", ["Lower back glued to the floor", "Arms and legs extended, slightly raised", "Bend your knees to make it easier"]],
  ["v_up", "V-up", "core", [], "bodyweight", "reps", ["Lie flat, arms overhead", "Lift arms and legs to meet in the middle", "Lower with control"]],
  ["farmer_carry", "Farmer's carry", "full_body", ["forearms", "core", "back"], "dumbbell", "time", ["Heavy dumbbells at your sides", "Walk tall with your shoulders back", "Short, quick steps"]],

  // Full body and power
  ["burpee", "Burpee", "full_body", ["cardio", "chest", "quads"], "bodyweight", "reps", ["Squat, kick back to a plank", "Chest to the floor (optional), then jump your feet in", "Jump up with your arms overhead"]],
  ["thruster", "Dumbbell thruster", "full_body", ["quads", "shoulders"], "dumbbell", "weight", ["Dumbbells at your shoulders", "Squat, then drive up and press overhead in one move", "Use the leg drive to help the press"]],
  ["clean_and_press", "Dumbbell clean and press", "full_body", ["shoulders", "glutes"], "dumbbell", "weight", ["Hinge and pull the dumbbells to your shoulders", "Press overhead", "Lower back to the start under control"]],
  ["box_jump", "Box jump", "quads", ["glutes", "calves", "cardio"], "bodyweight", "reps", ["Swing your arms and jump onto the box", "Land softly with bent knees", "Step down, don't jump down"]],
  ["skater_jump", "Skater jumps", "glutes", ["quads", "cardio"], "bodyweight", "reps", ["Leap sideways from one foot to the other", "Land softly and balance", "Swing your arms for rhythm"]],
  ["bear_crawl", "Bear crawl", "full_body", ["core", "shoulders"], "bodyweight", "time", ["Hands and feet on the floor, knees just off it", "Move opposite hand and foot together", "Keep your back flat"]],
  ["kettlebell_goblet_clean", "Kettlebell clean", "full_body", ["glutes", "back"], "kettlebell", "weight", ["Hinge and swing the bell between your legs", "Pull it up close to your body into the rack", "Let it rest on your forearm, not slam into it"]],

  // Cardio
  ["jumping_jacks", "Jumping jacks", "cardio", ["calves"], "bodyweight", "time", ["Jump your feet out as your arms go up", "Stay light on your toes", "Step them out for a low-impact version"]],
  ["high_knees", "High knees", "cardio", ["core", "quads"], "bodyweight", "time", ["Run on the spot", "Drive your knees to hip height", "Pump your arms"]],
  ["jump_rope", "Jump rope", "cardio", ["calves"], "bodyweight", "time", ["Small jumps on the balls of your feet", "Turn the rope from your wrists", "Start with short bursts"]],
  ["run", "Run / jog", "cardio", ["quads", "calves"], "bodyweight", "time", ["Easy pace: you can still talk", "Land under your hips with short strides", "Build time gradually"]],
  ["brisk_walk", "Brisk walk", "cardio", [], "bodyweight", "time", ["Walk fast enough to breathe harder", "Swing your arms", "A great daily habit"]],
  ["treadmill_incline_walk", "Incline treadmill walk", "cardio", ["glutes", "calves"], "cardio_machine", "time", ["Set an incline of 8–12%", "Don't hold the rails", "Steady pace you can keep"]],
  ["cycling", "Cycling / stationary bike", "cardio", ["quads"], "cardio_machine", "time", ["Seat at hip height", "Keep a smooth cadence", "Add resistance for intervals"]],
  ["rowing_machine", "Rowing machine", "cardio", ["back", "quads"], "cardio_machine", "time", ["Legs, then body, then arms", "Reverse on the way back", "Most power comes from your legs"]],
  ["stair_climber", "Stair climber", "cardio", ["glutes", "quads"], "cardio_machine", "time", ["Stand tall, light hands on the rails", "Whole foot on each step", "Steady rhythm"]],
  ["elliptical", "Elliptical", "cardio", ["quads"], "cardio_machine", "time", ["Upright posture", "Push and pull the handles", "Low impact on your joints"]],
  ["battle_ropes", "Battle ropes", "cardio", ["shoulders", "core"], "bodyweight", "time", ["Athletic stance, knees bent", "Make fast alternating waves", "Short intervals, full effort"]],
  ["swimming", "Swimming", "cardio", ["back", "shoulders"], "bodyweight", "time", ["Any stroke counts", "Relax and breathe rhythmically", "Easy on the joints"]],
];

export const EXERCISES: Exercise[] = defs.map(([key, name, primary, secondary, equipment, kind, tips]) => ({
  key,
  name,
  primary,
  secondary,
  equipment,
  kind,
  lower: LOWER.includes(primary) || (primary === "full_body" && secondary.includes("quads")),
  tips,
}));

export const EXERCISE_BY_KEY = new Map(EXERCISES.map((e) => [e.key, e]));

export function exercise(key: string): Exercise | undefined {
  return EXERCISE_BY_KEY.get(key);
}

/** Equipment you can reasonably have at home. */
export const HOME_EQUIPMENT: Equipment[] = ["bodyweight", "dumbbell", "kettlebell", "band"];
