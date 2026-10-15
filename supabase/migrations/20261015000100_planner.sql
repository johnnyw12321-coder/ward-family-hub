-- =============================================================================
-- Planner: what-if spending plans
--
-- A plan is a scratchpad of expected income and expenses, each with its own
-- frequency, used to work out what is left over. Plans never touch the ledger:
-- nothing here affects balances, budgets or reports.
-- =============================================================================

create table public.spending_plans (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  notes        text check (char_length(notes) <= 4000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null,
  unique (household_id, id)
);
create index spending_plans_household_idx on public.spending_plans (household_id, updated_at desc);

create table public.spending_plan_lines (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  plan_id      uuid not null,
  kind         text not null check (kind in ('income', 'expense')),
  label        text not null default '' check (char_length(label) <= 80),
  -- Up to TT$100 billion; plenty for a household, and safe as a JS integer.
  amount_minor bigint not null default 0 check (amount_minor between 0 and 10000000000000),
  frequency    text not null default 'monthly'
                 check (frequency in ('weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly')),
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null,
  foreign key (household_id, plan_id) references public.spending_plans (household_id, id) on delete cascade
);
create index spending_plan_lines_plan_idx on public.spending_plan_lines (plan_id, kind, sort_order);

-- Editing a line counts as editing its plan, so the plan list sorts by real activity.
create or replace function private.tg_touch_spending_plan()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.spending_plans
     set updated_at = now()
   where id = coalesce(new.plan_id, old.plan_id);
  return null;
end;
$$;
revoke all on function private.tg_touch_spending_plan() from public;

create trigger touch_plan after insert or update or delete on public.spending_plan_lines
  for each row execute function private.tg_touch_spending_plan();

select private.apply_household_rls('public.spending_plans');
select private.apply_household_rls('public.spending_plan_lines');
