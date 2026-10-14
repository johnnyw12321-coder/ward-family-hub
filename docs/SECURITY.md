# Security model

This app holds private household financial and personal information. This
document describes the controls, what is verified by automated tests, and what
has **not** been verified yet. It does not claim the system is production-secure:
see [Not yet verified](#not-yet-verified).

## Identity

- Supabase Auth, email + password (minimum 12 characters, letters and digits).
- **Invitation only.** There is no sign-up page; accounts are created by
  `npm run provision` (service role, run locally), which sends Supabase invite
  emails. Public sign-ups must also be disabled in the Supabase dashboard
  (README step 2.3).
- Email links (invite, reset) are verified on the server at `/auth/confirm`
  (`verifyOtp` with `token_hash`, or PKCE code exchange). Redirect targets are
  restricted to same-origin relative paths (`safeNextPath`).
- Sign-in errors never reveal whether an account exists. Supabase applies auth
  rate limits.
- Sessions live in HTTP cookies managed by `@supabase/ssr`; identity on the
  server comes from verified JWT claims (`getClaims`), never from unverified
  session data or user-editable `user_metadata`.

## Authorization

**Postgres Row Level Security is the boundary.** All data access runs as the
signed-in user; the app never uses the service-role key.

- Every household-owned table has `household_id` and the same four policies
  (`private.apply_household_rls`): members can read; owners/adults can write;
  `viewer` (reserved for future members) is read-only.
- Membership helpers (`private.member_household_ids()`, `writer_household_ids()`)
  are SECURITY DEFINER in a schema PostgREST does not expose, and are evaluated
  once per statement.
- **Composite foreign keys** `(household_id, x_id)` make it impossible for a row
  to reference another household's account, category, goal, etc., even if
  application code were wrong.
- `household_id` can't be changed after insert (trigger).
- Membership and roles can't be changed by clients (column-level grants); users
  can edit only their own display name and colour.
- Notifications are private per person, even between the two adults.
- Task comments can be edited or deleted only by their author.
- The `anon` role has no privileges on any table or function.
- All views are `security_invoker`; no SECURITY DEFINER function is exposed in
  the `public` (API) schema.

## Document vault

- Files live in the private `documents` bucket at
  `{household_id}/{document_id}/{file_id}`; the server chooses every path.
- Storage policies allow upload, read (signed URLs) and delete only for objects
  inside a document the caller can see in their own household; malformed or
  foreign paths are rejected. Objects are never updated in place.
- **Sensitive documents** (passports, IDs, medical, banking, legal, taxes…) are
  protected by RESTRICTIVE RLS policies that require the session's JWT to be at
  `aal2` (two-factor verified) — for the metadata, the file records and the
  storage objects, so signed links can't be created without step-up. Expiry
  notifications for sensitive documents never include their names.
- Two-factor uses Supabase Auth TOTP (authenticator apps). Verification is per
  session; turning it off requires a verified session.
- **Upload validation on the server:** the browser uploads directly to Storage
  with a short-lived signed upload URL (bucket limits: 25 MB, PDF/JPEG/PNG/WebP/HEIC),
  then the server downloads the stored object, checks its real type from its
  leading bytes (SVG, HTML, Office files and executables are refused), rejects
  mismatched declared types, records size and SHA-256, and deletes anything that
  fails.
- Links to files are created on demand, valid for 60 seconds (image previews:
  120 seconds), and never routed through the image optimiser or cached by the
  service worker.
- Document auditing is redacted (changed field names only, no values).

## Family records

Children's and adults' profiles are household-scoped like everything else.
Medical details (allergies, conditions, medications, doctor, insurance) live in
a separate `family_health` table with a RESTRICTIVE two-factor (aal2) policy
for every operation, and its audit trail records only which fields changed.

## Integrity and audit

- Money is integer minor units; ledger rules are enforced by deferred
  constraint triggers (transfers balance, one entry otherwise, currencies and
  category kinds match).
- `created_by` / `updated_by` / timestamps are set by trigger from `auth.uid()`
  (clients can't spoof them).
- `audit_logs` records inserts, updates (changed fields only) and deletes for
  financial and organisational tables. It is append-only for clients (no insert,
  update or delete grants). Sensitive modules will use redacted auditing (field
  names only, no values).

## Application layer (defence in depth)

- Every Server Action re-validates input with Zod and resolves the household
  itself; client validation is for UX only.
- Database error details are logged server-side without request payloads; users
  see friendly messages.
- Search text is escaped and quoted before reaching PostgREST filters; ids are
  validated as UUIDs.
- CSV exports neutralise spreadsheet formulas (CSV injection).
- Security headers: CSP (`frame-ancestors 'none'`, `object-src 'none'`, network
  limited to the app and the Supabase project), `X-Frame-Options: DENY`,
  `nosniff`, `Referrer-Policy: same-origin`, HSTS, restrictive
  Permissions-Policy, `Cache-Control: private, no-store` on pages.
- The service worker never caches pages, data or Supabase traffic.
- `robots: noindex`.

## Secrets

- Only `NEXT_PUBLIC_SUPABASE_URL` and the publishable/anon key reach the browser;
  both are safe to publish because of RLS.
- `SUPABASE_SERVICE_ROLE_KEY` is read only by `scripts/provision.ts` and
  `scripts/backup.ts`. It must never be set in Vercel. `.env*` files are
  git-ignored (except `.env.example`, which holds no values).
- Never store banking passwords, PINs or recovery codes in notes, documents or
  any field — the UI reminds users of this on note fields.

## What is tested

`npm test` (165 tests) includes, against real PostgreSQL (PGlite) with Supabase's
roles and default grants recreated:

- every public table has RLS enabled; every view is `security_invoker`; no
  SECURITY DEFINER functions in the API schema
- `anon` is denied on every table and on write functions
- an outsider sees zero rows of another household in every table, view and report;
  cannot insert, update, delete or post via the write API
- composite FKs block cross-household references
- rows cannot move between households; viewers cannot write; members cannot change
  roles or add members; profiles can't point at foreign households
- audit trail records the actor and changed fields; clients can't forge or erase
  audit entries or spoof `created_by`
- notifications are private to each member; only read/dismissed state is writable;
  generation is idempotent and does nothing for viewers or outsiders
- documents: shared within the household only; sensitive documents, their file
  records and their storage objects are invisible and unchangeable without aal2;
  a session without two-factor can't mark a document sensitive; uploads outside
  the caller's household/document, malformed paths and read-only members are
  refused; file records are tied to their path and immutable; disallowed MIME
  types are rejected; expiry notifications don't reveal sensitive names
- file validation: magic-byte sniffing (including disguised SVG/HTML/EXE/ZIP),
  filename sanitising, hashing
- family: children's records invisible to other households; health details
  unreadable and unwritable without aal2, audited without values
- assets: cross-household asset links rejected; cost-of-ownership and valuation
  reports
- ledger: balances, credit-card double counting, refunds, transfer balancing,
  validation errors, atomic edits, timezone-local dates, report classification,
  reconciliation, budget attribution and carry-forward, recurrence and bill
  settlement (no double settlement)
- unit tests: money parsing/formatting/rounding, dates and timezone conversion,
  recurrence, budgets, debt amortisation (verified independently), goals,
  report periods, calendar expansion

## Not yet verified

These need a running Supabase project (or the local Docker stack) and are the
next verification step:

- End-to-end flows in a browser against real Supabase Auth, PostgREST and
  Storage (sign-in, invite, reset, every page and action).
- The migrations on Supabase's own Postgres build (they are written for and
  tested on PostgreSQL 18 via PGlite; Supabase runs 15/17).
- Supabase dashboard settings (sign-ups disabled, URL allow-list, templates).

## Known limitations

- CSP allows `'unsafe-inline'` scripts (required by Next.js streaming without
  per-request nonces). Moving to nonces would force fully dynamic rendering.
- Accounts marked "personal" are attributed to one person but visible to both
  adults (household finances are shared by design).
- Category renames change the label in past reports (amounts never change).
  Archive instead of rename if the old label matters.
- `npm audit` reports a high-severity advisory in a dev-only ESLint dependency
  (`braces` via `eslint-config-next`); it does not ship to the browser or server.
- Two-factor is optional for signing in; it is required (per session) only to
  add, open or change sensitive documents.
