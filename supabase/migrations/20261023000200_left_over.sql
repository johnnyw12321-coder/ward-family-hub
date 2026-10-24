-- "Left over" = income - spending - loan and mortgage payments.
--
-- report_summary gains loan_payment_minor: transfers from an asset account
-- into a loan, mortgage, line of credit or other liability. Credit card
-- payments are left out on purpose: card purchases already count as spending
-- when they happen, so taking the payment off as well would count them twice.
-- debt_principal_minor (all liabilities, cards included) is unchanged.
--
-- The return type changes, so the function is dropped and recreated.

drop function public.report_summary(uuid, date, date);

create function public.report_summary(p_household_id uuid, p_from date, p_to date)
returns table (
  income_minor            bigint,
  expense_minor           bigint,
  interest_minor          bigint,
  savings_transfer_minor  bigint,
  debt_principal_minor    bigint,
  transaction_count       bigint,
  loan_payment_minor      bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with tx as (
    select t.id, t.kind, t.category_id
    from public.transactions t
    where t.household_id = p_household_id
      and t.occurred_on between p_from and p_to
      and t.kind in ('expense', 'income', 'transfer')
  ),
  interest_cats as (
    select c.id from public.transaction_categories c
    where c.household_id = p_household_id
      and (c.system_key = 'debt_interest'
           or c.parent_id in (select id from public.transaction_categories
                               where household_id = p_household_id and system_key = 'debt_interest'))
  ),
  flows as (
    select tx.kind, tx.category_id, e.amount_minor, a.type as account_type
    from tx
    join public.transaction_entries e on e.transaction_id = tx.id
    join public.financial_accounts a on a.id = e.account_id
  ),
  transfers as (
    select tx.id,
      max(a.type::text) filter (where e.amount_minor < 0) as src_type,
      max(a.type::text) filter (where e.amount_minor > 0) as dst_type,
      max(e.amount_minor) as amount
    from tx
    join public.transaction_entries e on e.transaction_id = tx.id
    join public.financial_accounts a on a.id = e.account_id
    where tx.kind = 'transfer'
    group by tx.id
  ),
  debt_payments as (
    select dst_type, amount from transfers
    where public.is_liability_type(dst_type::public.account_type)
      and not public.is_liability_type(src_type::public.account_type)
  )
  select
    coalesce((select sum(amount_minor) from flows where kind = 'income'), 0)::bigint,
    coalesce((select -sum(amount_minor) from flows where kind = 'expense'), 0)::bigint,
    coalesce((select -sum(amount_minor) from flows
               where kind = 'expense' and category_id in (select id from interest_cats)), 0)::bigint,
    coalesce((select sum(amount) from transfers
               where dst_type in ('savings', 'investment')
                 and src_type not in ('savings', 'investment')), 0)::bigint,
    coalesce((select sum(amount) from debt_payments), 0)::bigint,
    (select count(*) from tx)::bigint,
    coalesce((select sum(amount) from debt_payments where dst_type <> 'credit_card'), 0)::bigint;
$$;

revoke all on function public.report_summary from public, anon;
grant execute on function public.report_summary to authenticated;
