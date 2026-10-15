# Roadmap

Status key: ✅ built and covered by automated tests · 🟡 built, needs end-to-end
verification against a live Supabase project · ⬜ not started

> **Overall:** Phases 1–5 are built, plus the first Phase 6 forecasting feature.
> Typecheck, lint, the production build and 165 automated tests pass. **No phase has been verified end-to-end in a browser
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
- 🟢 Planner: what-if income & spending plans (weekly/fortnightly/monthly/quarterly/yearly lines, totals per week/fortnight/month/year, autosave, start from real bills/income/budgets, copy to compare). Never touches the ledger.
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

## Phase 4 — Document vault ✅🟡

- ✅ Private bucket, household-scoped storage policies, immutable versioned files (tested)
- ✅ Sensitive documents gated by two-factor (AAL2) in RLS, including storage objects (tested)
- ✅ Server-side validation: content sniffing, type match, size limit, SHA-256 (tested)
- 🟡 Upload (choose file or take photo), categories, tags, issue/expiry dates, belongs-to, links to accounts/bills/goals/transactions
- 🟡 Search and category filters, needs-attention list, archive, permanent delete
- 🟡 Preview (images), open/download via 60-second links, replace with version history
- 🟡 TOTP setup in Settings, per-session verification page, turn off
- 🟡 Receipts on transactions; documents on bills and accounts; expiry dates on the calendar; expiry notifications
- ✅ Owner-run backup downloads every stored file

## Phase 5 — Assets and family ✅🟡

- ✅ Schema with RLS and composite links; health details gated by two-factor and audited without values (tested)
- ✅ Cost of ownership: ledger spending linked to an asset vs costs logged only on records, never double counted (tested)
- ✅ Valuation history drives current value and month-end net worth (tested)
- 🟡 Home & property: details, value history, mortgage link and equity, maintenance/renovation records (optionally posted as an expense), appliances and warranties, contractors
- 🟡 Vehicles: make/model/plate/VIN, odometer (kept current from service records), service/insurance/registration dates, service history, parts and warranties, loan link
- 🟡 Family: profiles, school/daycare details, contacts (emergency, call/email), milestones and annual dates, protected health details, documents, child-related spending, upcoming appointments
- 🟡 Links: transactions, events and documents can be "for" a home/vehicle or family member
- 🟡 Calendar shows birthdays, family dates, vehicle dates and warranty ends; reminders for all of them
- 🟡 Net worth everywhere includes home and vehicle values; Reports show home & vehicle costs

## Phase 6 — Advanced (in progress)

- ✅ Forecasting: "safe to spend until payday" on Home (tested)
- ✅ Historical reports over any range/year, CSV exports, full JSON + file backups (from earlier phases)
- ✅ AI assistant design: [docs/AI_ASSISTANT.md](docs/AI_ASSISTANT.md) (no AI service connected)
- ⬜ Scripted restore tool
- ⬜ Google Calendar sync (schema columns reserved)
- ⬜ Email and push notification delivery (tables reserved; nothing is sent today)
- ⬜ Offline transaction entry
- ⬜ Performance work for 10–20 years of data (indexes are in place; pagination on transactions)

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
