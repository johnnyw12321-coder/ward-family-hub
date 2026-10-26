-- =============================================================================
-- Budget lines for the rest of a month
--
-- A rate line (TT$30 a day, TT$200 a week) added part-way through a month can
-- start on a given day: its amount then covers only that day to the month's
-- end, and spending in the category before that day doesn't count against it
-- (it shows as unbudgeted). Copying a budget to another month gives the copy
-- the whole month again.
--
-- The amount itself is worked out in TypeScript (src/features/finance/until.ts,
-- rateForMonth with a start day).
-- =============================================================================

alter table public.budget_allocations
  add column starts_on date,
  add constraint budget_allocations_starts_on_rate check (starts_on is null or rate_period is not null);

comment on column public.budget_allocations.starts_on is
  'For a rate line that covers only part of its month: the first day it counts. Null means the whole month.';

-- The start day must fall inside the budget's month.
create or replace function private.tg_budget_allocation_start()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_month date;
begin
  if new.starts_on is not null then
    select month into v_month from public.budgets where id = new.budget_id;
    if date_trunc('month', new.starts_on)::date <> v_month then
      raise exception 'The start day must be in the budget''s month' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger budget_allocation_start before insert or update of starts_on, budget_id on public.budget_allocations
  for each row execute function private.tg_budget_allocation_start();

-- Budget progress for a month. Spending is attributed to the most specific
-- budgeted category: the subcategory if it has an allocation, otherwise its
-- parent if that has one, otherwise it is "unbudgeted" (allocation_id null).
-- Spending before a line's start day is unbudgeted too.
create or replace function public.budget_progress(p_household_id uuid, p_month date)
returns table (
  allocation_id     uuid,
  category_id       uuid,
  category_name     text,
  parent_id         uuid,
  allocated_minor   bigint,
  carried_in_minor  bigint,
  spent_minor       bigint,
  carry_forward     boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with b as (
    select id from public.budgets where household_id = p_household_id and month = p_month
  ),
  alloc as (
    select a.* from public.budget_allocations a join b on b.id = a.budget_id
  ),
  tx as (
    select
      case
        when exists (select 1 from alloc where alloc.category_id = c.id) then c.id
        when c.parent_id is not null
             and exists (select 1 from alloc where alloc.category_id = c.parent_id) then c.parent_id
        else null
      end as target_category_id,
      t.occurred_on,
      -e.amount_minor as amount
    from public.transactions t
    join public.transaction_entries e on e.transaction_id = t.id
    join public.transaction_categories c on c.id = t.category_id
    where t.household_id = p_household_id
      and t.kind = 'expense'
      and t.occurred_on >= p_month
      and t.occurred_on < (p_month + interval '1 month')::date
  ),
  spend as (
    select
      case when tx.occurred_on >= coalesce(a.starts_on, p_month) then tx.target_category_id end as target_category_id,
      sum(tx.amount) as amount
    from tx
    left join alloc a on a.category_id = tx.target_category_id
    group by 1
  )
  select a.id, a.category_id, c.name, c.parent_id, a.amount_minor, a.carried_in_minor,
         coalesce(s.amount, 0)::bigint, a.carry_forward
  from alloc a
  join public.transaction_categories c on c.id = a.category_id
  left join spend s on s.target_category_id = a.category_id
  union all
  select null, null, 'Unbudgeted', null, 0, 0, coalesce(sum(s.amount), 0)::bigint, false
  from spend s where s.target_category_id is null
  having coalesce(sum(s.amount), 0) <> 0;
$$;

-- Copy a month's budget into another month. As before (see
-- 20261026000100_budget_rates.sql), and the copy covers the whole month.
create or replace function public.copy_budget(
  p_household_id uuid,
  p_from_month   date,
  p_to_month     date
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_from uuid;
  v_to uuid;
begin
  if extract(day from p_from_month) <> 1 or extract(day from p_to_month) <> 1 then
    raise exception 'Months must be the first day of the month' using errcode = '22023';
  end if;
  if p_from_month = p_to_month then
    raise exception 'Choose a different month' using errcode = '22023';
  end if;
  select id into v_from from public.budgets where household_id = p_household_id and month = p_from_month;
  if v_from is null then
    raise exception 'There is no budget for the source month' using errcode = 'P0002';
  end if;

  insert into public.budgets (household_id, month) values (p_household_id, p_to_month)
  on conflict (household_id, month) do nothing;
  select id into v_to from public.budgets where household_id = p_household_id and month = p_to_month;

  insert into public.budget_allocations (household_id, budget_id, category_id, amount_minor,
                                         carry_forward, carried_in_minor, rate_minor, rate_period)
  select p_household_id, v_to, bp.category_id,
         case when a.rate_period is not null
              then public.budget_rate_amount(a.rate_minor, a.rate_period, p_to_month)
              else bp.allocated_minor end,
         bp.carry_forward,
         case when bp.carry_forward and p_to_month > p_from_month
              then greatest(0, bp.allocated_minor + bp.carried_in_minor - bp.spent_minor)
              else 0 end,
         a.rate_minor, a.rate_period
  from public.budget_progress(p_household_id, p_from_month) bp
  join public.budget_allocations a on a.id = bp.allocation_id
  where bp.allocation_id is not null
  on conflict (budget_id, category_id) do update
    set amount_minor = excluded.amount_minor,
        carry_forward = excluded.carry_forward,
        carried_in_minor = excluded.carried_in_minor,
        rate_minor = excluded.rate_minor,
        rate_period = excluded.rate_period,
        starts_on = null;
  return v_to;
end;
$$;
