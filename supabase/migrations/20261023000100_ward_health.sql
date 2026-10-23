-- =============================================================================
-- Ward Health
--
-- A personal fitness module: profile and targets, weigh-ins, food and water,
-- body measurements, workouts, and achievements. Everything here belongs to
-- one person, not the household: each row carries household_id + user_id and
-- is visible only to that user (even other adults in the household can't see
-- it). Rows reference the member through (household_id, user_id), so leaving a
-- household removes that person's Ward Health data with them.
--
-- The tables are deliberately not audited: audit_logs is household-visible and
-- would reveal someone's weight or food log to the rest of the household.
-- Progress photos never leave the phone (IndexedDB), so there's no table.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Owner-only policies, applied identically to every Ward Health table.
-- -----------------------------------------------------------------------------
create or replace function private.tg_lock_health_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id or new.household_id is distinct from old.household_id then
    raise exception 'Ward Health records cannot change owner' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.apply_health_rls(p_table regclass)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format('alter table %s enable row level security', p_table);
  execute format(
    'create policy health_own on %s for all to authenticated
       using (user_id = (select auth.uid()) and household_id in (select private.member_household_ids()))
       with check (user_id = (select auth.uid()) and household_id in (select private.member_household_ids()))', p_table);
  execute format('revoke all on %s from anon', p_table);
  execute format('grant select, insert, update, delete on %s to authenticated', p_table);
  execute format('create trigger row_meta before insert or update on %s
                    for each row execute function private.tg_row_meta()', p_table);
  execute format('create trigger lock_owner before update on %s
                    for each row execute function private.tg_lock_health_owner()', p_table);
end;
$$;
revoke all on function private.apply_health_rls(regclass) from public;

-- -----------------------------------------------------------------------------
-- Profile: body stats, goal, chosen diet plan and workout program, settings.
-- Weights are kilograms, lengths centimetres, volumes millilitres; the units
-- preference only changes how they're shown and entered.
-- -----------------------------------------------------------------------------
create table public.health_profiles (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null,
  user_id            uuid not null default auth.uid(),
  sex                text not null check (sex in ('male', 'female', 'unspecified')),
  age_years          smallint not null check (age_years between 13 and 100),
  age_set_on         date not null default current_date,
  height_cm          numeric(5,1) not null check (height_cm between 100 and 250),
  activity_level     text not null check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  units              text not null default 'metric' check (units in ('metric', 'imperial')),
  goal               text not null check (goal in ('lose_fat', 'build_muscle', 'gain_weight', 'maintain')),
  start_weight_kg    numeric(5,2) not null check (start_weight_kg between 30 and 350),
  start_date         date not null default current_date,
  target_weight_kg   numeric(5,2) check (target_weight_kg between 30 and 350),
  target_date        date,
  diet_plan          text check (diet_plan ~ '^[a-z_]{2,40}$'),
  fasting_protocol   text check (fasting_protocol in ('16:8', '18:6')),
  fast_started_at    timestamptz,
  water_goal_ml      integer not null default 2500 check (water_goal_ml between 500 and 8000),
  active_program     text check (active_program ~ '^[a-z0-9_]{2,80}$'),
  program_started_on date,
  reminders          jsonb not null default '{}' check (jsonb_typeof(reminders) = 'object'),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references auth.users (id) on delete set null,
  updated_by         uuid references auth.users (id) on delete set null,
  unique (household_id, user_id),
  check (target_date is null or target_date > start_date),
  foreign key (household_id, user_id) references public.household_members (household_id, user_id) on delete cascade
);
select private.apply_health_rls('public.health_profiles');

-- -----------------------------------------------------------------------------
-- Weigh-ins: one per day (a second entry the same day replaces the first).
-- -----------------------------------------------------------------------------
create table public.health_weigh_ins (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  user_id      uuid not null default auth.uid(),
  on_date      date not null,
  weight_kg    numeric(5,2) not null check (weight_kg between 30 and 350),
  note         text check (char_length(note) <= 200),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null,
  unique (household_id, user_id, on_date),
  foreign key (household_id, user_id) references public.household_members (household_id, user_id) on delete cascade
);
select private.apply_health_rls('public.health_weigh_ins');

-- -----------------------------------------------------------------------------
-- Food: the person's own foods, saved meals (a list of items), and the log.
-- Log rows keep a snapshot of the nutrition so editing or removing a custom
-- food never rewrites history.
-- -----------------------------------------------------------------------------
create table public.health_foods (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  user_id      uuid not null default auth.uid(),
  name         text not null check (char_length(name) between 1 and 80),
  serving      text not null check (char_length(serving) between 1 and 40),
  calories     integer not null check (calories between 0 and 5000),
  protein_g    numeric(6,1) not null default 0 check (protein_g between 0 and 500),
  carbs_g      numeric(6,1) not null default 0 check (carbs_g between 0 and 1000),
  fat_g        numeric(6,1) not null default 0 check (fat_g between 0 and 500),
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null,
  foreign key (household_id, user_id) references public.household_members (household_id, user_id) on delete cascade
);
select private.apply_health_rls('public.health_foods');

create table public.health_saved_meals (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  user_id      uuid not null default auth.uid(),
  name         text not null check (char_length(name) between 1 and 80),
  items        jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 30),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null,
  foreign key (household_id, user_id) references public.household_members (household_id, user_id) on delete cascade
);
select private.apply_health_rls('public.health_saved_meals');

create table public.health_food_logs (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  user_id      uuid not null default auth.uid(),
  on_date      date not null,
  meal         text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  name         text not null check (char_length(name) between 1 and 120),
  source       text not null check (source in ('catalog', 'custom', 'quick')),
  food_ref     text check (char_length(food_ref) <= 80),
  servings     numeric(5,2) not null default 1 check (servings > 0 and servings <= 50),
  calories     integer not null check (calories between 0 and 10000),
  protein_g    numeric(6,1) not null default 0 check (protein_g between 0 and 1000),
  carbs_g      numeric(6,1) not null default 0 check (carbs_g between 0 and 2000),
  fat_g        numeric(6,1) not null default 0 check (fat_g between 0 and 1000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null,
  foreign key (household_id, user_id) references public.household_members (household_id, user_id) on delete cascade
);
create index health_food_logs_day_idx on public.health_food_logs (user_id, on_date);
select private.apply_health_rls('public.health_food_logs');

-- Water: one running total per day.
create table public.health_water (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  user_id      uuid not null default auth.uid(),
  on_date      date not null,
  total_ml     integer not null check (total_ml between 0 and 20000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null,
  unique (household_id, user_id, on_date),
  foreign key (household_id, user_id) references public.household_members (household_id, user_id) on delete cascade
);
select private.apply_health_rls('public.health_water');

-- Body measurements: any subset, one set per day.
create table public.health_measurements (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  user_id      uuid not null default auth.uid(),
  on_date      date not null,
  waist_cm     numeric(5,1) check (waist_cm between 20 and 300),
  chest_cm     numeric(5,1) check (chest_cm between 20 and 300),
  hips_cm      numeric(5,1) check (hips_cm between 20 and 300),
  arm_cm       numeric(5,1) check (arm_cm between 10 and 100),
  thigh_cm     numeric(5,1) check (thigh_cm between 10 and 150),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null,
  unique (household_id, user_id, on_date),
  check (num_nonnulls(waist_cm, chest_cm, hips_cm, arm_cm, thigh_cm) > 0),
  foreign key (household_id, user_id) references public.household_members (household_id, user_id) on delete cascade
);
select private.apply_health_rls('public.health_measurements');

-- -----------------------------------------------------------------------------
-- Workouts. Exercises and programs are a built-in catalogue in the app, so rows
-- refer to them by key. A custom workout is an ordered list of exercises.
-- -----------------------------------------------------------------------------
create table public.health_custom_workouts (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  user_id      uuid not null default auth.uid(),
  name         text not null check (char_length(name) between 1 and 80),
  notes        text check (char_length(notes) <= 1000),
  exercises    jsonb not null check (jsonb_typeof(exercises) = 'array' and jsonb_array_length(exercises) between 1 and 30),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null,
  foreign key (household_id, user_id) references public.household_members (household_id, user_id) on delete cascade
);
select private.apply_health_rls('public.health_custom_workouts');

create table public.health_workout_sessions (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null,
  user_id           uuid not null default auth.uid(),
  on_date           date not null,
  name              text not null check (char_length(name) between 1 and 120),
  program_key       text check (program_key ~ '^[a-z0-9_]{2,80}$'),
  program_day       smallint check (program_day between 0 and 13),
  custom_workout_id uuid,
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  notes             text check (char_length(notes) <= 2000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references auth.users (id) on delete set null,
  updated_by        uuid references auth.users (id) on delete set null,
  unique (user_id, id),
  check (finished_at is null or finished_at >= started_at),
  foreign key (household_id, user_id) references public.household_members (household_id, user_id) on delete cascade
);
create index health_workout_sessions_day_idx on public.health_workout_sessions (user_id, on_date);
select private.apply_health_rls('public.health_workout_sessions');

-- A set always belongs to a session of the same person.
create table public.health_workout_sets (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  user_id      uuid not null default auth.uid(),
  session_id   uuid not null,
  exercise_key text not null check (exercise_key ~ '^[a-z0-9_]{2,60}$'),
  position     smallint not null check (position between 0 and 59),
  set_number   smallint not null check (set_number between 1 and 30),
  reps         smallint check (reps between 0 and 1000),
  weight_kg    numeric(6,2) check (weight_kg between 0 and 1000),
  duration_s   integer check (duration_s between 0 and 86400),
  note         text check (char_length(note) <= 200),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null,
  check (num_nonnulls(reps, duration_s) > 0),
  foreign key (user_id, session_id) references public.health_workout_sessions (user_id, id) on delete cascade,
  foreign key (household_id, user_id) references public.household_members (household_id, user_id) on delete cascade
);
create index health_workout_sets_session_idx on public.health_workout_sets (session_id);
create index health_workout_sets_exercise_idx on public.health_workout_sets (user_id, exercise_key);
select private.apply_health_rls('public.health_workout_sets');

-- Badges earned; seen_at is set once the celebration has been shown.
create table public.health_achievements (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  user_id      uuid not null default auth.uid(),
  badge_key    text not null check (badge_key ~ '^[a-z0-9_]{2,60}$'),
  earned_on    date not null,
  seen_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null,
  unique (household_id, user_id, badge_key),
  foreign key (household_id, user_id) references public.household_members (household_id, user_id) on delete cascade
);
select private.apply_health_rls('public.health_achievements');

-- -----------------------------------------------------------------------------
-- Reset and import. SECURITY INVOKER: RLS limits both to the caller's own rows,
-- so neither can reach anyone else's data or anything outside Ward Health.
-- -----------------------------------------------------------------------------
create or replace function public.health_reset(p_household_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or p_household_id not in (select private.member_household_ids()) then
    raise exception 'You don''t have permission to do that.' using errcode = '42501';
  end if;
  delete from public.health_workout_sets where household_id = p_household_id and user_id = v_user;
  delete from public.health_workout_sessions where household_id = p_household_id and user_id = v_user;
  delete from public.health_custom_workouts where household_id = p_household_id and user_id = v_user;
  delete from public.health_food_logs where household_id = p_household_id and user_id = v_user;
  delete from public.health_saved_meals where household_id = p_household_id and user_id = v_user;
  delete from public.health_foods where household_id = p_household_id and user_id = v_user;
  delete from public.health_water where household_id = p_household_id and user_id = v_user;
  delete from public.health_measurements where household_id = p_household_id and user_id = v_user;
  delete from public.health_weigh_ins where household_id = p_household_id and user_id = v_user;
  delete from public.health_achievements where household_id = p_household_id and user_id = v_user;
  delete from public.health_profiles where household_id = p_household_id and user_id = v_user;
end;
$$;
revoke all on function public.health_reset(uuid) from public, anon;
grant execute on function public.health_reset(uuid) to authenticated;

-- Replaces the caller's Ward Health data with an export (all or nothing).
-- Records get new ids, so an export can be imported into any account; links
-- between them (sets → sessions, logs → custom foods, sessions → custom
-- workouts) are carried across.
create or replace function public.health_import(p_household_id uuid, p_data jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_sessions jsonb;
  v_foods jsonb;
  v_workouts jsonb;
begin
  if jsonb_typeof(p_data) is distinct from 'object' then
    raise exception 'That file isn''t a Ward Health export.' using errcode = '22023';
  end if;
  perform public.health_reset(p_household_id);

  if jsonb_typeof(p_data -> 'profile') = 'object' then
    insert into public.health_profiles (
      household_id, user_id, sex, age_years, age_set_on, height_cm, activity_level, units, goal, start_weight_kg,
      start_date, target_weight_kg, target_date, diet_plan, fasting_protocol, water_goal_ml, active_program,
      program_started_on, reminders)
    select p_household_id, v_user, x.sex, x.age_years, coalesce(x.age_set_on, current_date), x.height_cm, x.activity_level,
           coalesce(x.units, 'metric'), x.goal, x.start_weight_kg, coalesce(x.start_date, current_date), x.target_weight_kg,
           x.target_date, x.diet_plan, x.fasting_protocol, coalesce(x.water_goal_ml, 2500), x.active_program,
           x.program_started_on, coalesce(x.reminders, '{}')
    from jsonb_to_record(p_data -> 'profile') as x(
      sex text, age_years smallint, age_set_on date, height_cm numeric, activity_level text, units text, goal text,
      start_weight_kg numeric, start_date date, target_weight_kg numeric, target_date date, diet_plan text,
      fasting_protocol text, water_goal_ml integer, active_program text, program_started_on date, reminders jsonb);
  end if;

  insert into public.health_weigh_ins (household_id, user_id, on_date, weight_kg, note)
  select p_household_id, v_user, x.on_date, x.weight_kg, x.note
  from jsonb_to_recordset(coalesce(p_data -> 'weigh_ins', '[]')) as x(on_date date, weight_kg numeric, note text);

  select coalesce(jsonb_object_agg(x ->> 'id', gen_random_uuid()), '{}') into v_foods
  from jsonb_array_elements(coalesce(p_data -> 'foods', '[]')) x;
  insert into public.health_foods (id, household_id, user_id, name, serving, calories, protein_g, carbs_g, fat_g, archived_at)
  select (v_foods ->> x.id)::uuid, p_household_id, v_user, x.name, x.serving, x.calories, coalesce(x.protein_g, 0),
         coalesce(x.carbs_g, 0), coalesce(x.fat_g, 0), x.archived_at
  from jsonb_to_recordset(coalesce(p_data -> 'foods', '[]')) as x(
    id text, name text, serving text, calories integer, protein_g numeric, carbs_g numeric, fat_g numeric, archived_at timestamptz);

  insert into public.health_saved_meals (household_id, user_id, name, items)
  select p_household_id, v_user, x.name, x.items
  from jsonb_to_recordset(coalesce(p_data -> 'saved_meals', '[]')) as x(name text, items jsonb);

  insert into public.health_food_logs (household_id, user_id, on_date, meal, name, source, food_ref, servings, calories, protein_g, carbs_g, fat_g)
  select p_household_id, v_user, x.on_date, x.meal, x.name, x.source,
         case when x.source = 'custom' then coalesce(v_foods ->> x.food_ref, x.food_ref) else x.food_ref end,
         coalesce(x.servings, 1), x.calories, coalesce(x.protein_g, 0), coalesce(x.carbs_g, 0), coalesce(x.fat_g, 0)
  from jsonb_to_recordset(coalesce(p_data -> 'food_logs', '[]')) as x(
    on_date date, meal text, name text, source text, food_ref text, servings numeric, calories integer,
    protein_g numeric, carbs_g numeric, fat_g numeric);

  insert into public.health_water (household_id, user_id, on_date, total_ml)
  select p_household_id, v_user, x.on_date, x.total_ml
  from jsonb_to_recordset(coalesce(p_data -> 'water', '[]')) as x(on_date date, total_ml integer);

  insert into public.health_measurements (household_id, user_id, on_date, waist_cm, chest_cm, hips_cm, arm_cm, thigh_cm)
  select p_household_id, v_user, x.on_date, x.waist_cm, x.chest_cm, x.hips_cm, x.arm_cm, x.thigh_cm
  from jsonb_to_recordset(coalesce(p_data -> 'measurements', '[]')) as x(
    on_date date, waist_cm numeric, chest_cm numeric, hips_cm numeric, arm_cm numeric, thigh_cm numeric);

  select coalesce(jsonb_object_agg(x ->> 'id', gen_random_uuid()), '{}') into v_workouts
  from jsonb_array_elements(coalesce(p_data -> 'custom_workouts', '[]')) x;
  insert into public.health_custom_workouts (id, household_id, user_id, name, notes, exercises)
  select (v_workouts ->> x.id)::uuid, p_household_id, v_user, x.name, x.notes, x.exercises
  from jsonb_to_recordset(coalesce(p_data -> 'custom_workouts', '[]')) as x(id text, name text, notes text, exercises jsonb);

  select coalesce(jsonb_object_agg(x ->> 'id', gen_random_uuid()), '{}') into v_sessions
  from jsonb_array_elements(coalesce(p_data -> 'workout_sessions', '[]')) x;
  insert into public.health_workout_sessions (
    id, household_id, user_id, on_date, name, program_key, program_day, custom_workout_id, started_at, finished_at, notes)
  select (v_sessions ->> x.id)::uuid, p_household_id, v_user, x.on_date, x.name, x.program_key, x.program_day,
         (v_workouts ->> x.custom_workout_id)::uuid, coalesce(x.started_at, x.on_date::timestamptz), x.finished_at, x.notes
  from jsonb_to_recordset(coalesce(p_data -> 'workout_sessions', '[]')) as x(
    id text, on_date date, name text, program_key text, program_day smallint, custom_workout_id text,
    started_at timestamptz, finished_at timestamptz, notes text);

  if exists (
    select 1 from jsonb_array_elements(coalesce(p_data -> 'workout_sets', '[]')) x
    where not v_sessions ? coalesce(x ->> 'session_id', '')
  ) then
    raise exception 'Some workout sets don''t belong to a workout in the file.' using errcode = '22023';
  end if;
  insert into public.health_workout_sets (
    household_id, user_id, session_id, exercise_key, position, set_number, reps, weight_kg, duration_s, note)
  select p_household_id, v_user, (v_sessions ->> x.session_id)::uuid, x.exercise_key, x.position, x.set_number,
         x.reps, x.weight_kg, x.duration_s, x.note
  from jsonb_to_recordset(coalesce(p_data -> 'workout_sets', '[]')) as x(
    session_id text, exercise_key text, position smallint, set_number smallint, reps smallint, weight_kg numeric,
    duration_s integer, note text);

  insert into public.health_achievements (household_id, user_id, badge_key, earned_on, seen_at)
  select p_household_id, v_user, x.badge_key, x.earned_on, coalesce(x.seen_at, now())
  from jsonb_to_recordset(coalesce(p_data -> 'achievements', '[]')) as x(badge_key text, earned_on date, seen_at timestamptz);
end;
$$;
revoke all on function public.health_import(uuid, jsonb) from public, anon;
grant execute on function public.health_import(uuid, jsonb) to authenticated;
