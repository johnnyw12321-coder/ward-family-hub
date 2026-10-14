# Roadmap

Status key: ✅ built and covered by automated tests · 🟡 built, needs end-to-end
verification against a live Supabase project · ⬜ not started

> **Overall:** Phases 1–3 are built. Typecheck, lint, the production build and
> 136 automated tests pass. **No phase has been verified end-to-end in a browser
> against real Supabase yet** — that requires your Supabase project (or the
> local Docker stack) and is the next step. Until then every UI feature is 🟡.

## Phase 1 — Foundation ✅🟡

- ✅ Next.js 16 + TypeScript strict + Tailwind 4 + shadcn/ui, Cache Components
- ✅ Schema foundation: households, members (roles), profiles, audit log
- ✅ RLS on every table, composite household FKs, anon locked out (tested)
- 🟡 Invite-only auth: sign-in, password reset, invite acceptance, set password, sign-out
- ✅ Provisioning script (service role, local only)
- 🟡 App shell: bottom navigation (Home, Finances, Calendar, Goals, More), desktop sidebar, quick-add, user menu, light/dark/system theme
- 🟡 Home dashboard: month snapshot, cash/savings/owed/net worth, today's agenda, upcoming bills, budget watch, goals, recent activity, getting-started checklist
- ✅ PWA manifest, icons, privacy-first service worker, offline page/banner
- ✅ Security headers (CSP, HSTS, frame denial…)

## Phase 2 — Financial system ✅🟡

- ✅ Double-entry-style ledger with DB-enforced integrity; balances derived from entries
- 🟡 Accounts: cash, chequing, savings, credit cards, loans, mortgage, line of credit, investments; opening balances; archive; reconciliation with adjustment
- 🟡 Transactions: expense/income/transfer, refunds, categories + subcategories, payment method, person, merchant, notes; edit/delete; search, filters, pagination, CSV export
- 🟡 Categories: defaults for T&T households, custom categories/subcategories, archive
- 🟡 Budgets: monthly lines, parent/sub attribution, carry-forward, copy to next month, 80%/100% warnings, pace marker, last-month comparison
- 🟡 Recurring bills and income: schedules, reminders, autopay flag (informational), mark paid/skip, history, undo, pays-down-a-debt option; never auto-paid
- 🟡 Debts: payoff projections (amortisation), principal vs interest payments, highest-rate tip
- 🟡 Reports: period presets/custom/annual, MoM/YoY comparisons, income vs spending chart, categories, net worth trend, CSV, print
- 🟡 Settings: profile, household name/timezone, members, full JSON backup, recent changes (audit)

## Phase 3 — Household organisation ✅🟡

- 🟡 Goals: money/number/milestone goals; progress from manual entry, contributions, a savings account balance, or a debt being paid down; projections and on-track status; milestones; achieved history
- 🟡 Calendar: month/week/day/agenda; recurring events; all-day and multi-day; participants; reminders; per-occurrence completion; bills, tasks, goal deadlines and milestones shown alongside
- 🟡 Tasks: assignment, due dates, priority, areas, recurring chores, checklists, comments (author-only edit), completion history
- 🟡 Shopping: shared lists, quantities and estimated prices, check-off, clear/uncheck, reusable lists
- 🟡 In-app notifications: bills, tasks, events (honouring reminders), goals, milestones, budgets; per-person and private; idempotent

## Phase 4 — Document vault ⬜

Private Storage bucket with household-scoped storage policies; server-side
type/size validation and content sniffing; short-lived signed URLs; categories,
tags, issue/expiry dates, associations (member, asset, account); preview,
download, replace (versioned), archive; expiry reminders; TOTP two-factor and
AAL2 step-up enforced by RLS for sensitive documents; receipt attachments on
transactions; bucket backup.

## Phase 5 — Assets and family ⬜

Property (value history, mortgage link, renovations, maintenance, appliances,
warranties, contractors), vehicles (loan, insurance and registration renewals,
mileage, servicing, repairs), expense linking for total cost of ownership,
family profiles (school/daycare, emergency contacts, important dates,
milestones), child-related spending, protected medical notes, asset values in
net worth.

## Phase 6 — Advanced ⬜

Long-range historical reports, forecasting (cash flow before payday), restore
tool, optional Google Calendar sync, email/push notification channels, AI
assistant per [docs/AI_ASSISTANT.md](docs/AI_ASSISTANT.md), offline transaction
entry, performance work for 10–20 years of data.

## Required external setup (your action)

1. Create the Supabase project, apply migrations, disable sign-ups, set URLs and
   email templates (README → Setup).
2. Put the public URL/key in `.env.local`; keep the service-role key only there.
3. Run `npm run provision` with your real email addresses.
4. (Optional) Deploy to Vercel with the three public environment variables.

## Known limitations

See [docs/SECURITY.md → Known limitations](docs/SECURITY.md#known-limitations).
Also: no end-to-end browser tests yet; reminders are in-app only (no push/email);
recurring events can only be edited as a whole series.
