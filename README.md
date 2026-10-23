# Ward Family Hub

A private, mobile-first household operating system for Jonathan and Adanna:
finances, budgets, bills, debts, goals, calendar, tasks and shopping — with a
document vault, property, vehicles and family records to follow.

Built with Next.js 16 (App Router, Cache Components), TypeScript (strict),
Tailwind CSS 4, shadcn/ui, Supabase (Postgres, Auth, Storage, Row Level
Security), Recharts, React Hook Form and Zod.

- **Roadmap and status:** [ROADMAP.md](ROADMAP.md)
- **Architecture:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Security model and what's tested:** [docs/SECURITY.md](docs/SECURITY.md)
- **Backups and recovery:** [docs/BACKUP_AND_RECOVERY.md](docs/BACKUP_AND_RECOVERY.md)
- **AI assistant design (future):** [docs/AI_ASSISTANT.md](docs/AI_ASSISTANT.md)

---

## Setup

You need Node.js 20.9+ (22 recommended) and a Supabase account. Nothing is
stored anywhere until you connect your own Supabase project.

### 1. Install

```bash
npm install
```

### 2. Create the Supabase project (your action)

1. Create a project at [supabase.com](https://supabase.com). Choose a region near
   Trinidad and Tobago (e.g. `us-east-1`).
2. **Apply the migrations** in `supabase/migrations/` in filename order. Either:
   - with the CLI: `npx supabase link --project-ref <ref>` then `npx supabase db push`, or
   - paste each file into the SQL editor, in order.
3. **Turn off public sign-ups:** Authentication → Sign In / Providers → disable
   "Allow new users to sign up". (The app has no sign-up page either, and RLS
   gives a non-member nothing — this is defence in depth.)
4. **URL configuration:** Authentication → URL Configuration → set Site URL to your
   app URL (e.g. `https://ward-hub.vercel.app`) and add
   `https://<your-domain>/auth/confirm` to Redirect URLs (plus
   `http://localhost:3000/auth/confirm` for local development).
5. **Email templates:** Authentication → Email Templates → replace the *Invite user*
   and *Reset password* bodies with `supabase/templates/invite.html` and
   `recovery.html`. They use the `token_hash` link format that the app's
   `/auth/confirm` route verifies on the server.
6. **Password policy:** Authentication → Policies → minimum length 12, require
   letters and digits.

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
`NEXT_PUBLIC_SITE_URL`. Add `SUPABASE_SERVICE_ROLE_KEY` **only** in `.env.local`
on your own computer, for the provisioning and backup scripts. The web app never
reads it, and it must never be added to Vercel.

### 4. Provision the household and accounts

```bash
npm run provision -- --household "Ward Family" --member "jonathan@example.com:Jonathan:owner" --member "adanna@example.com:Adanna:adult"
```

Use your real email addresses. Each person receives a Supabase invite email,
follows the link, and chooses a password (at least 12 characters). Default
spending and income categories are created with the household. Add `--dry-run`
to preview without changing anything.

### 5. Run

```bash
npm run dev
```

Open <http://localhost:3000>. On Android, use Chrome's menu → *Install app* (or
*Add to Home screen*) once deployed over HTTPS.

## Deploying to Vercel (your action)

1. Push the repository to GitHub and import it in Vercel.
2. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
   `NEXT_PUBLIC_SITE_URL` in Project → Settings → Environment Variables.
   **Do not add the service-role key.**
3. Deploy, then update the Supabase Site URL and Redirect URLs to the
   production domain.

## Local Supabase (optional)

With Docker running you can use a local stack instead of a hosted project:

```bash
npx supabase start      # applies migrations; prints local URL and keys
npx supabase status     # shows them again
```

Invite and reset emails appear in the local inbox at <http://localhost:54324>.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (strict) |
| `npm test` | Unit tests + database tests (migrations, RLS, ledger) on in-process Postgres |
| `npm run check` | All of the above |
| `npm run provision` | Create the household and invite members (service role, local only) |
| `npm run backup` | Export every household table to `backups/` (service role, local only) |

## Testing

`npm test` runs without Docker or a Supabase project. Database tests start an
in-process PostgreSQL ([PGlite](https://pglite.dev)), recreate the parts of
Supabase the migrations depend on (roles, default grants, `auth.uid()`,
`auth.jwt()`, a storage schema), apply every migration and then act as
different users to prove the security rules. See [docs/SECURITY.md](docs/SECURITY.md#what-is-tested).

## Ward Health

A personal fitness hub inside Ward Hub. Open it from **More → Switch to Ward
Health** (or the bottom of the sidebar on desktop). It has its own navigation —
Dashboard, Diet, Track, Workouts, Profile — and a **Ward Hub** button to switch
back. The app remembers which one you were last in on each device: opening the
app at its start page (`/`) goes back to Ward Health if that's where you left
off.

**What's in it**

- **Profile and targets:** height, weight, age, sex, activity level, metric or
  imperial (converted everywhere), and a goal (lose fat, build muscle, gain
  weight, maintain) with an optional target weight and date. BMR uses
  Mifflin-St Jeor, TDEE applies the activity factor, and the calorie target
  adjusts for the goal. It never suggests less than 1,200 kcal (women) /
  1,500 kcal (men), caps deficits at 25% of TDEE, and warns when the pace is
  aggressive (losing more than 1% of body weight a week). General guidance,
  not medical advice.
- **Diet plans:** balanced deficit, high protein, low carb/keto, Mediterranean,
  intermittent fasting (16:8 / 18:6 with a fasting timer), vegetarian/plant-based,
  lean bulk and mass gain, each with a macro split (in grams, from your
  target), who it suits, pros and cons, a sample day and a food list.
- **Tracking:** weigh-ins with a 7-day moving average and goal line; food
  logging from a built-in database of 190+ foods (including local dishes),
  your own foods, saved meals, recent foods and quick-add calories; calorie
  and macro rings; water; body measurements with charts; progress photos
  (kept on the device only); streaks, badges and milestone celebrations.
- **Workouts:** 72 built-in programs (fat loss, muscle, mass gain, general
  fitness × home or gym × beginner/intermediate/advanced × 3/4/5 days a week)
  built from 120+ exercises with form tips; a workout logger with a rest
  timer, notes, automatic personal-record detection and progressive-overload
  suggestions; strength charts per exercise; a custom workout builder.
- **Dashboard:** today's calories and macros remaining, today's workout,
  water, weight trend, current streak, reminders, and a weekly summary with
  insights (e.g. average protein this week).
- **Data:** export everything as JSON (re-importable), weight and workouts as
  CSV; import a backup (replaces your Ward Health data in one transaction);
  **Load demo data** to preview the charts; reset Ward Health without
  touching the rest of Ward Hub.

**Privacy.** Ward Health data is personal: every row carries `household_id`
and `user_id`, and RLS lets only that person read or write it — other
household members (even owners) can't see it. The tables aren't audited
(the audit log is household-visible) and aren't in the household backup; use
Ward Health's own export. Read-only household members can still keep their own
Ward Health data.

**Setup.** Apply `supabase/migrations/20261023000100_ward_health.sql` like the
other migrations. Nothing else is needed: the food, exercise, program and diet
catalogues ship with the app.

**Code.** Everything lives in `src/features/health/` (routes in `src/app/health/`
and `src/app/api/health/`):

```
src/features/health/
  calc/          pure, unit-tested maths: energy (BMR/TDEE/targets), macros,
                 units, trend, streaks, strength (1RM, PRs, overload), badges, insights
  catalog/       foods, exercises, programs (generated from movement patterns), diet plans
  repository.ts  HealthRepository: every read/write Ward Health makes
  supabase-repository.ts   the Supabase implementation (swap storage here)
  context.ts     picks the repository; page/action context helpers
  queries.ts     overview, targets, badge sync, workout history
  actions/       Server Actions (profile, diet, tracking, workouts, data)
  components/    UI
  demo.ts        sample data, generated in the export format
  mode.ts        Ward Hub ↔ Ward Health mode cookie
```

Tests: `tests/unit/health-energy.test.ts` (calorie and macro calculations,
units), `tests/unit/health-progress.test.ts` (trend, streaks, PRs, overload,
catalogues, weekly summary) and `tests/db/health.test.ts` (privacy, import,
reset, demo data).

## Project layout

```
src/
  app/                 routes (App Router)
    (auth)/            sign-in, password reset, set password
    (app)/             authenticated pages (layout = shell + navigation)
    api/export/        CSV and JSON exports (authenticated route handlers)
    auth/confirm/      email link verification
  components/          ui/ (shadcn), layout/ (navigation, quick add), shared/
  features/            one folder per module: schemas, queries, actions, components
  lib/                 money, dates, recurrence, finance calculations, auth context, supabase clients
supabase/migrations/   schema, RLS policies and database functions
tests/                 unit/ and db/ (RLS + ledger + organisation)
scripts/               provisioning and backup (run locally)
docs/                  architecture, security, backup, AI assistant design
```
