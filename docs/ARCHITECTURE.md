# Architecture

## Overview

```
Browser (PWA)
  │  React Server Components stream HTML; Client Components handle forms
  ▼
Next.js 16 on Vercel (Node runtime)
  ├─ proxy.ts ............ refreshes the Supabase session cookie, optimistic redirect to /login
  ├─ Server Components ... read data as the signed-in user (RLS applies)
  ├─ Server Actions ...... validate with Zod, write via RPCs/tables as the user
  └─ Route handlers ...... CSV/JSON exports, email-link verification
  ▼
Supabase
  ├─ Postgres ........ all data; RLS on every table; ledger integrity in triggers/functions
  ├─ Auth ............ invite-only email/password (MFA TOTP available for Phase 4 step-up)
  └─ Storage ......... private buckets (Phase 4)
```

There is no separate API server. The browser never talks to Supabase for data:
all reads and writes go through Server Components and Server Actions, which use
the user's own session — so Postgres RLS is the authorization boundary and the
app code is defence in depth.

## Rendering model (Cache Components)

`cacheComponents` and `partialPrefetching` are enabled. Each route has a static
shell (navigation, headers) that renders instantly and is prefetched; anything
that depends on the session or URL streams in behind `<Suspense>` with a
skeleton fallback. Household data is **never** placed in a server-side cache
(`'use cache'` is not used for private data); after a mutation, Server Actions
call `refresh()` so the current view re-renders with fresh data.

Navigation components read the pathname inside their own Suspense boundary with
an identical fallback, so the shell stays static on dynamic routes.

## Modules

Each module lives in `src/features/<module>/`:

| File | Responsibility |
| --- | --- |
| `schemas.ts` | Zod schemas shared by client forms and server actions |
| `queries.ts` | `server-only` reads; take the `HouseholdContext` and always filter by `household_id` |
| `actions.ts` | `"use server"` mutations; re-validate, resolve context, return `ActionResult` |
| `components/` | UI for the module |
| pure modules (`progress.ts`, `expand.ts`, `period.ts`, `bills.ts`) | calculations with unit tests |

`src/features/registry.ts` and `module-status.ts` are the only places that say
which modules are live, so new modules plug into quick-add and the More menu
without touching the shell. Modules not yet built show an honest "planned" page
with no controls.

## Data access layer

`src/lib/auth/context.ts` resolves, once per request (React `cache`):
verified JWT claims (`getClaims`), the active household (`current_household_id()`),
members and the caller's role. Pages call `requireHousehold()` (redirects);
actions and route handlers call `getActionContext()` (returns an error instead).

## Money

- Stored as `bigint` minor units (cents) everywhere, with a `currency` column.
- In TypeScript, amounts are safe integers; `src/lib/money.ts` parses input
  strings without floats, formats by passing exact decimal strings to `Intl`,
  and uses `decimal.js` for rates. TTD displays as `TT$`.
- Totals are computed in SQL from ledger entries, never from cached sums.

## Ledger

```
transactions (header: date, kind, description, category, who, merchant…)
  └─ transaction_entries (account_id, signed amount_minor)   balance = SUM(entries)
```

| Kind | Entries | Counts as |
| --- | --- | --- |
| expense | 1: −amount (refund: +amount) | spending |
| income | 1: +amount | income |
| transfer | 2: −amount from, +amount to (sum 0) | neither |
| opening_balance / adjustment | 1: signed | neither |

Liabilities (cards, loans, mortgage) carry negative balances. A card purchase is
an expense on the card; paying the card is a transfer — so it is never counted
twice. Debt payments split into a principal transfer and an interest expense
(system category *Debt Interest*). Reports separate spending, income, transfers
to savings, debt principal and interest (`report_summary`).

Integrity is enforced in the database: a deferred constraint trigger checks at
commit that transfers balance and every other kind has exactly one entry,
currencies match, and category kinds match. Writes go through
`save_transaction` (SECURITY INVOKER — RLS still applies).

`occurred_on` (local date in the household timezone) is derived by trigger from
`occurred_at`, so reports group by the local day and month consistently.

## Recurrence

Occurrence *k* = anchor + *k* × step, always computed from the anchor (a bill
due on the 31st lands on the last day of shorter months and returns to the 31st
after). Implemented identically in SQL (`next_occurrence_after`) and TypeScript
(`src/lib/recurrence.ts`) and tested against the same cases. Bills advance only
when a person settles them (`settle_recurring`) — never because a date passed.

## Dates and time

Instants are `timestamptz`; calendar dates (due dates, budget months) are plain
`date`. The household timezone (default `America/Port_of_Spain`) is used for all
display and for converting form input to instants. Displayed as DD/MM/YYYY.

## Notifications

`refresh_notifications(household, today)` is idempotent (per-recipient
`dedupe_key`) and runs when the header loads for a writer. It generates in-app
notifications for due/overdue bills, due/overdue tasks, events with reminders,
goal deadlines, overdue milestones and budget thresholds (80%/100%). Generation
runs as a scoped SECURITY DEFINER function in the non-exposed `private` schema
because it writes notifications for members the caller cannot read.

`notification_preferences` and `notification_deliveries` exist for future email
and push channels; nothing sends email or push today.

## Calendar

Events are stored once; recurring series are expanded for the visible range in
`src/features/calendar/expand.ts`, together with outstanding bill due dates,
open tasks, goal deadlines and milestones. Completing one occurrence of a
recurring event is recorded in `event_completions`. `external_source /
external_id / external_etag` columns reserve space for a later Google Calendar
sync without schema changes.

## Document vault

`documents` (metadata) → `document_files` (immutable versions) →
Storage object `{household}/{document}/{file}`. Upload is three steps so large
files never pass through a Vercel function (4.5 MB body limit):

1. `startUpload` (server) checks the document is visible and writable, picks the
   path, and returns a signed upload URL.
2. The browser uploads directly to Storage (bucket enforces size and declared type).
3. `finishUpload` (server) downloads the object, sniffs the real type, hashes it,
   records the version and makes it current — or deletes it.

Sensitive documents are filtered by RESTRICTIVE RLS requiring `aal2`, so the
same queries simply return fewer rows until the session is verified at
`/verify` (TOTP via Supabase Auth MFA).

## PWA and offline

`app/manifest.ts` + PNG/maskable icons make the app installable. `public/sw.js`
caches only hashed build assets, icons and the static `/offline` page; pages,
RSC payloads, actions and Supabase requests are never cached, so no financial
data is stored on the device. An offline banner explains that changes can't be
saved until reconnection. Offline entry is a future release.

## Extending

1. Add a migration: tables with `household_id`, composite `(household_id, id)`
   FKs for cross-references, then `select private.apply_household_rls('public.x')`
   and `private.apply_audit('public.x')` (use `true` to redact sensitive values).
   The catalog test fails if any public table lacks RLS.
2. Add DB tests in `tests/db/`.
3. Add `src/features/<module>/` and pages under `src/app/(app)/`.
4. Register quick-add links / module status; add tables to `backup-tables.ts`.
