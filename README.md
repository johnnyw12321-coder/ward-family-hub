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
