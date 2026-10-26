-- =============================================================================
-- Budget rates
--
-- A budget line can be entered as a rate — TT$30 a weekday, TT$200 a week,
-- TT$50 a day — instead of a monthly amount. The month's amount is worked
-- out from the rate for that month's days (21 weekdays in November → 21 × the
-- weekday rate), so everything that reads amount_minor (progress, reports,
-- expected spending, notifications) keeps working unchanged. Copying a budget
-- to another month recalculates rate lines for the new month.
--
-- The same arithmetic lives in TypeScript (src/features/finance/until.ts,
-- rateForMonth) and is tested against the same cases.
-- =============================================================================

alter table public.budget_allocations
  add column rate_minor  bigint check (rate_minor between 0 and 10000000000000),
  add column rate_period text check (rate_period in ('day', 'weekday', 'week')),
  add constraint budget_allocations_rate_pair check ((rate_minor is null) = (rate_period is null));

comment on column public.budget_allocations.rate_minor is
  'When set, amount_minor is derived from this rate for the month (see budget_rate_amount).';

-- A rate expressed as a month's amount: day × days, weekday × Mon–Fri days,
-- week × days ÷ 7 (rounded half-up to the cent).
create or replace function public.budget_rate_amount(p_rate_minor bigint, p_period text, p_month date)
returns bigint
language sql
immutable
set search_path = ''
as $$
  with m as (
    select p_month::date as first_day,
           (date_trunc('month', p_month) + interval '1 month' - interval '1 day')::date as last_day
  )
  select case p_period
    when 'day' then p_rate_minor * (m.last_day - m.first_day + 1)
    when 'weekday' then p_rate_minor * (
      select count(*) from generate_series(m.first_day, m.last_day, interval '1 day') d
      where extract(isodow from d) < 6)
    when 'week' then round(p_rate_minor * (m.last_day - m.first_day + 1) / 7.0)::bigint
    else p_rate_minor
  end
  from m;
$$;
revoke all on function public.budget_rate_amount(bigint, text, date) from public, anon;
grant execute on function public.budget_rate_amount(bigint, text, date) to authenticated;

-- Copy a month's budget into another month. Allocations flagged
-- carry_forward bring their unspent remainder (never negative) along; rate
-- lines keep their rate and get the new month's amount.
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
        rate_period = excluded.rate_period;
  return v_to;
end;
$$;
