-- =============================================================================
-- Ward Family Hub — Finance
--
-- Ledger model:
--   transactions         one row per real-world event (header: date, description,
--                        category, who paid, etc.)
--   transaction_entries  the effect on each account, as signed integer minor
--                        units (cents). Balances are always SUM(entries).
--
-- Sign convention: an entry increases (+) or decreases (-) the account balance.
-- Liability accounts (credit cards, loans) therefore carry negative balances:
-- a TT$500 card purchase is an expense entry of -50000 on the card; paying
-- the card is a transfer (-50000 chequing, +50000 card) and is never counted
-- as spending again. Debt principal and savings contributions are transfers;
-- interest is an expense in the system "Debt Interest" category.
--
-- All money is bigint minor units. No floating point anywhere.
-- =============================================================================

create type public.account_type as enum (
  'cash', 'chequing', 'savings', 'credit_card', 'loan', 'mortgage',
  'line_of_credit', 'investment', 'other_asset', 'other_liability'
);
create type public.owner_scope as enum ('shared', 'personal');
create type public.category_kind as enum ('expense', 'income');
create type public.transaction_kind as enum ('expense', 'income', 'transfer', 'opening_balance', 'adjustment');
create type public.payment_method as enum (
  'cash', 'debit_card', 'credit_card', 'bank_transfer', 'cheque',
  'mobile_wallet', 'direct_debit', 'other'
);
create type public.entry_status as enum ('pending', 'cleared', 'reconciled');
create type public.recurrence_frequency as enum ('weekly', 'monthly', 'yearly');
create type public.recurring_direction as enum ('bill', 'income');

create or replace function public.is_liability_type(p_type public.account_type)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_type in ('credit_card', 'loan', 'mortgage', 'line_of_credit', 'other_liability');
$$;

-- -----------------------------------------------------------------------------
-- Accounts
-- -----------------------------------------------------------------------------
create table public.financial_accounts (
  id                    uuid primary key default gen_random_uuid(),
  household_id          uuid not null references public.households (id) on delete cascade,
  name                  text not null check (char_length(name) between 1 and 80),
  type                  public.account_type not null,
  currency              char(3) not null default 'TTD' check (currency ~ '^[A-Z]{3}$'),
  institution           text check (char_length(institution) <= 80),
  last4                 text check (last4 ~ '^[0-9]{4}$'),
  owner_scope           public.owner_scope not null default 'shared',
  owner_user_id         uuid,
  credit_limit_minor    bigint check (credit_limit_minor >= 0),
  interest_rate_apr     numeric(7, 4) check (interest_rate_apr >= 0 and interest_rate_apr < 100),
  minimum_payment_minor bigint check (minimum_payment_minor >= 0),
  payment_due_day       smallint check (payment_due_day between 1 and 31),
  include_in_net_worth  boolean not null default true,
  is_archived           boolean not null default false,
  archived_at           timestamptz,
  sort_order            integer not null default 0,
  notes                 text check (char_length(notes) <= 2000),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references auth.users (id) on delete set null,
  updated_by            uuid references auth.users (id) on delete set null,
  unique (household_id, id),
  foreign key (household_id, owner_user_id)
    references public.household_members (household_id, user_id) on delete set null (owner_user_id),
  check (owner_scope = 'shared' or owner_user_id is not null)
);
create index financial_accounts_household_idx on public.financial_accounts (household_id, is_archived, sort_order);

-- -----------------------------------------------------------------------------
-- Categories (two levels: parent -> subcategory). Never hard-deleted once used;
-- archive instead so historical reports keep their labels.
-- -----------------------------------------------------------------------------
create table public.transaction_categories (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  parent_id    uuid,
  kind         public.category_kind not null,
  name         text not null check (char_length(name) between 1 and 60),
  icon         text check (icon ~ '^[a-z0-9-]{1,40}$'),
  color        text check (color ~ '^[a-z]{3,16}$'),
  system_key   text check (system_key ~ '^[a-z_]{1,40}$'),
  is_archived  boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null,
  unique (household_id, id),
  unique nulls not distinct (household_id, parent_id, name),
  unique (household_id, system_key),
  foreign key (household_id, parent_id)
    references public.transaction_categories (household_id, id) on delete restrict
);
create index transaction_categories_household_idx on public.transaction_categories (household_id, kind, sort_order);

-- Enforce at most two levels and matching kinds.
create or replace function private.tg_category_hierarchy()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent record;
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'A category cannot be its own parent' using errcode = '23514';
    end if;
    select parent_id, kind into v_parent from public.transaction_categories where id = new.parent_id;
    if v_parent.parent_id is not null then
      raise exception 'Subcategories cannot have their own subcategories' using errcode = '23514';
    end if;
    if v_parent.kind <> new.kind then
      raise exception 'Subcategory kind must match its parent' using errcode = '23514';
    end if;
    if exists (select 1 from public.transaction_categories c where c.parent_id = new.id) then
      raise exception 'A category with subcategories cannot become a subcategory' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.system_key is not null and new.system_key is distinct from old.system_key then
    raise exception 'System categories cannot be re-keyed' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger category_hierarchy before insert or update on public.transaction_categories
  for each row execute function private.tg_category_hierarchy();

-- -----------------------------------------------------------------------------
-- Transactions + entries
-- -----------------------------------------------------------------------------
create table public.transactions (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households (id) on delete cascade,
  kind             public.transaction_kind not null,
  occurred_at      timestamptz not null default now(),
  -- Local calendar date in the household timezone. Always derived by trigger
  -- from occurred_at, so reports group consistently by local day/month.
  occurred_on      date not null,
  currency         char(3) not null default 'TTD' check (currency ~ '^[A-Z]{3}$'),
  description      text not null check (char_length(description) between 1 and 200),
  merchant         text check (char_length(merchant) <= 120),
  notes            text check (char_length(notes) <= 2000),
  category_id      uuid,
  payment_method   public.payment_method,
  person_user_id   uuid,
  group_id         uuid,
  recurring_id     uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references auth.users (id) on delete set null,
  updated_by       uuid references auth.users (id) on delete set null,
  unique (household_id, id),
  foreign key (household_id, category_id)
    references public.transaction_categories (household_id, id) on delete restrict,
  foreign key (household_id, person_user_id)
    references public.household_members (household_id, user_id) on delete set null (person_user_id),
  check ((kind in ('expense', 'income')) = (category_id is not null))
);
create index transactions_household_date_idx on public.transactions (household_id, occurred_on desc, occurred_at desc);
create index transactions_household_kind_date_idx on public.transactions (household_id, kind, occurred_on);
create index transactions_category_idx on public.transactions (household_id, category_id);
create index transactions_group_idx on public.transactions (group_id) where group_id is not null;

create table public.transaction_entries (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  transaction_id uuid not null,
  account_id     uuid not null,
  amount_minor   bigint not null check (amount_minor <> 0),
  status         public.entry_status not null default 'cleared',
  reconciled_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id) on delete set null,
  updated_by     uuid references auth.users (id) on delete set null,
  foreign key (household_id, transaction_id)
    references public.transactions (household_id, id) on delete cascade,
  foreign key (household_id, account_id)
    references public.financial_accounts (household_id, id) on delete restrict
);
create index transaction_entries_tx_idx on public.transaction_entries (transaction_id);
create index transaction_entries_account_idx on public.transaction_entries (account_id, status);

-- Derive the local date from occurred_at in the household's timezone.
create or replace function private.tg_transaction_local_date()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tz text;
begin
  select timezone into v_tz from public.households where id = new.household_id;
  new.occurred_on := (new.occurred_at at time zone coalesce(v_tz, 'UTC'))::date;
  return new;
end;
$$;
create trigger transactions_local_date before insert or update of occurred_at, household_id
  on public.transactions for each row execute function private.tg_transaction_local_date();

-- Deferred integrity check: runs at COMMIT, after all entries are written.
--   transfer        -> exactly 2 entries, 2 different accounts, sum = 0
--   everything else -> exactly 1 entry
--   all entries     -> account currency = transaction currency
--   category kind   -> must match the transaction kind
create or replace function private.tg_check_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tx_id uuid;
  v_tx record;
  v_count integer;
  v_accounts integer;
  v_sum numeric;
  v_currency_ok boolean;
  v_category_kind public.category_kind;
begin
  if tg_table_name = 'transactions' then
    v_tx_id := coalesce(new.id, old.id);
  else
    v_tx_id := coalesce(new.transaction_id, old.transaction_id);
  end if;

  select * into v_tx from public.transactions where id = v_tx_id;
  if not found then
    return null; -- transaction deleted; entries cascade with it
  end if;

  select count(*), count(distinct e.account_id), coalesce(sum(e.amount_minor), 0),
         coalesce(bool_and(a.currency = v_tx.currency), true)
    into v_count, v_accounts, v_sum, v_currency_ok
  from public.transaction_entries e
  join public.financial_accounts a on a.id = e.account_id
  where e.transaction_id = v_tx_id;

  if v_tx.kind = 'transfer' then
    if v_count <> 2 or v_accounts <> 2 or v_sum <> 0 then
      raise exception 'A transfer needs two different accounts and must balance to zero'
        using errcode = '23514';
    end if;
  elsif v_count <> 1 then
    raise exception 'A % transaction must affect exactly one account', v_tx.kind
      using errcode = '23514';
  end if;

  if not v_currency_ok then
    raise exception 'Account currency must match the transaction currency' using errcode = '23514';
  end if;

  if v_tx.category_id is not null then
    select kind into v_category_kind from public.transaction_categories where id = v_tx.category_id;
    if v_category_kind::text <> v_tx.kind::text then
      raise exception 'Category type does not match the transaction type' using errcode = '23514';
    end if;
  end if;

  return null;
end;
$$;
revoke all on function private.tg_check_transaction() from public;

create constraint trigger transactions_integrity
  after insert or update on public.transactions
  deferrable initially deferred
  for each row execute function private.tg_check_transaction();
create constraint trigger transaction_entries_integrity
  after insert or update or delete on public.transaction_entries
  deferrable initially deferred
  for each row execute function private.tg_check_transaction();

-- Entries must belong to the same household as their transaction (also
-- enforced by the composite FK) and may not be moved between transactions.
create or replace function private.tg_entry_immutable_links()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.transaction_id is distinct from old.transaction_id then
    raise exception 'Entries cannot be moved between transactions' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger transaction_entries_links before update on public.transaction_entries
  for each row execute function private.tg_entry_immutable_links();

-- -----------------------------------------------------------------------------
-- Budgets
-- -----------------------------------------------------------------------------
create table public.budgets (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  month        date not null check (extract(day from month) = 1),
  notes        text check (char_length(notes) <= 2000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null,
  unique (household_id, id),
  unique (household_id, month)
);

create table public.budget_allocations (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households (id) on delete cascade,
  budget_id        uuid not null,
  category_id      uuid not null,
  amount_minor     bigint not null check (amount_minor >= 0),
  carried_in_minor bigint not null default 0 check (carried_in_minor >= 0),
  carry_forward    boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references auth.users (id) on delete set null,
  updated_by       uuid references auth.users (id) on delete set null,
  unique (budget_id, category_id),
  foreign key (household_id, budget_id) references public.budgets (household_id, id) on delete cascade,
  foreign key (household_id, category_id)
    references public.transaction_categories (household_id, id) on delete restrict
);
create index budget_allocations_budget_idx on public.budget_allocations (budget_id);

create or replace function private.tg_allocation_expense_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select kind from public.transaction_categories where id = new.category_id) <> 'expense' then
    raise exception 'Budgets can only allocate to expense categories' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger budget_allocations_expense_only before insert or update of category_id
  on public.budget_allocations for each row execute function private.tg_allocation_expense_only();

-- -----------------------------------------------------------------------------
-- Recurring bills and recurring income
-- Occurrences are computed from anchor_date (anchor + k * step), so monthly
-- bills on the 31st land on the last day of shorter months without drifting.
-- A bill is only ever marked paid by an explicit user action.
-- -----------------------------------------------------------------------------
create table public.recurring_items (
  id                   uuid primary key default gen_random_uuid(),
  household_id         uuid not null references public.households (id) on delete cascade,
  direction            public.recurring_direction not null default 'bill',
  name                 text not null check (char_length(name) between 1 and 80),
  bill_type            text not null default 'other' check (bill_type in (
                         'mortgage', 'rent', 'car_loan', 'loan', 'utility', 'insurance',
                         'daycare', 'school', 'subscription', 'credit_card', 'salary',
                         'business', 'other')),
  amount_minor         bigint not null check (amount_minor >= 0),
  is_variable_amount   boolean not null default false,
  currency             char(3) not null default 'TTD' check (currency ~ '^[A-Z]{3}$'),
  frequency            public.recurrence_frequency not null default 'monthly',
  interval_count       smallint not null default 1 check (interval_count between 1 and 24),
  anchor_date          date not null,
  next_due_date        date not null,
  end_date             date,
  account_id           uuid,
  category_id          uuid,
  liability_account_id uuid,
  payee                text check (char_length(payee) <= 120),
  person_user_id       uuid,
  autopay              boolean not null default false,
  reminder_days_before smallint not null default 3 check (reminder_days_before between 0 and 60),
  is_active            boolean not null default true,
  notes                text check (char_length(notes) <= 2000),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid references auth.users (id) on delete set null,
  updated_by           uuid references auth.users (id) on delete set null,
  unique (household_id, id),
  foreign key (household_id, account_id)
    references public.financial_accounts (household_id, id) on delete set null (account_id),
  foreign key (household_id, liability_account_id)
    references public.financial_accounts (household_id, id) on delete set null (liability_account_id),
  foreign key (household_id, category_id)
    references public.transaction_categories (household_id, id) on delete set null (category_id),
  foreign key (household_id, person_user_id)
    references public.household_members (household_id, user_id) on delete set null (person_user_id),
  check (end_date is null or end_date >= anchor_date),
  check (next_due_date >= anchor_date)
);
create index recurring_items_due_idx on public.recurring_items (household_id, is_active, next_due_date);

alter table public.transactions
  add foreign key (household_id, recurring_id)
    references public.recurring_items (household_id, id) on delete set null (recurring_id);

create table public.recurring_payments (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  recurring_id   uuid not null,
  due_date       date not null,
  status         text not null default 'paid' check (status in ('paid', 'skipped')),
  paid_on        date,
  amount_minor   bigint check (amount_minor >= 0),
  transaction_id uuid,
  notes          text check (char_length(notes) <= 500),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id) on delete set null,
  updated_by     uuid references auth.users (id) on delete set null,
  unique (recurring_id, due_date),
  foreign key (household_id, recurring_id)
    references public.recurring_items (household_id, id) on delete cascade,
  foreign key (household_id, transaction_id)
    references public.transactions (household_id, id) on delete set null (transaction_id),
  check (status = 'skipped' or (paid_on is not null and amount_minor is not null))
);
create index recurring_payments_item_idx on public.recurring_payments (recurring_id, due_date desc);

-- Occurrence math (mirrors src/lib/recurrence.ts; both are tested against the
-- same cases).
create or replace function public.recurrence_step(
  p_frequency public.recurrence_frequency, p_interval integer)
returns interval
language sql
immutable
set search_path = ''
as $$
  select case p_frequency
    when 'weekly'  then make_interval(weeks => p_interval)
    when 'monthly' then make_interval(months => p_interval)
    when 'yearly'  then make_interval(years => p_interval)
  end;
$$;

create or replace function public.next_occurrence_after(
  p_anchor date, p_frequency public.recurrence_frequency, p_interval integer, p_after date)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_step interval := public.recurrence_step(p_frequency, p_interval);
  v_k integer := 0;
  v_candidate date := p_anchor;
begin
  if p_anchor > p_after then
    return p_anchor;
  end if;
  -- Jump close to the target first, then walk forward.
  if p_frequency = 'weekly' then
    v_k := greatest(0, ((p_after - p_anchor) / (7 * p_interval)) - 1);
  elsif p_frequency = 'monthly' then
    v_k := greatest(0, (((extract(year from p_after) - extract(year from p_anchor)) * 12
                        + extract(month from p_after) - extract(month from p_anchor))::integer
                        / p_interval) - 1);
  else
    v_k := greatest(0, ((extract(year from p_after) - extract(year from p_anchor))::integer
                        / p_interval) - 1);
  end if;
  loop
    v_candidate := (p_anchor + v_step * v_k)::date;
    exit when v_candidate > p_after;
    v_k := v_k + 1;
  end loop;
  return v_candidate;
end;
$$;

-- -----------------------------------------------------------------------------
-- Policies, auditing
-- -----------------------------------------------------------------------------
select private.apply_household_rls('public.financial_accounts');
select private.apply_household_rls('public.transaction_categories');
select private.apply_household_rls('public.transactions');
select private.apply_household_rls('public.transaction_entries');
select private.apply_household_rls('public.budgets');
select private.apply_household_rls('public.budget_allocations');
select private.apply_household_rls('public.recurring_items');
select private.apply_household_rls('public.recurring_payments');

select private.apply_audit('public.financial_accounts');
select private.apply_audit('public.transaction_categories');
select private.apply_audit('public.transactions');
select private.apply_audit('public.transaction_entries');
select private.apply_audit('public.budget_allocations');
select private.apply_audit('public.recurring_items');
select private.apply_audit('public.recurring_payments');

-- =============================================================================
-- Views (security_invoker: RLS of the caller applies)
-- =============================================================================
create view public.account_balances with (security_invoker = true) as
select
  a.id as account_id,
  a.household_id,
  coalesce(sum(e.amount_minor), 0)::bigint as balance_minor,
  coalesce(sum(e.amount_minor) filter (where e.status <> 'pending'), 0)::bigint as cleared_balance_minor,
  coalesce(sum(e.amount_minor) filter (where e.status = 'reconciled'), 0)::bigint as reconciled_balance_minor,
  count(e.id)::bigint as entry_count
from public.financial_accounts a
left join public.transaction_entries e on e.account_id = a.id
group by a.id, a.household_id;

-- Flattened, display-friendly transactions. amount_minor is the absolute
-- transaction amount; signed_amount_minor is the household-level effect
-- (negative = money out for expenses, positive for income, 0 for transfers).
create view public.transaction_details with (security_invoker = true) as
select
  t.id,
  t.household_id,
  t.kind,
  t.occurred_at,
  t.occurred_on,
  t.currency,
  t.description,
  t.merchant,
  t.notes,
  t.category_id,
  c.name as category_name,
  c.parent_id as category_parent_id,
  pc.name as category_parent_name,
  t.payment_method,
  t.person_user_id,
  t.group_id,
  t.recurring_id,
  t.created_by,
  t.updated_by,
  t.created_at,
  t.updated_at,
  case when t.kind = 'transfer' then src.account_id else e1.account_id end as account_id,
  case when t.kind = 'transfer' then src_a.name else a1.name end as account_name,
  case when t.kind = 'transfer' then dst.account_id end as to_account_id,
  case when t.kind = 'transfer' then dst_a.name end as to_account_name,
  case when t.kind = 'transfer' then abs(src.amount_minor) else abs(e1.amount_minor) end::bigint as amount_minor,
  case
    when t.kind = 'transfer' then 0
    else e1.amount_minor
  end::bigint as signed_amount_minor
from public.transactions t
left join public.transaction_categories c on c.id = t.category_id
left join public.transaction_categories pc on pc.id = c.parent_id
left join lateral (
  select e.account_id, e.amount_minor from public.transaction_entries e
  where e.transaction_id = t.id and t.kind <> 'transfer' limit 1
) e1 on true
left join public.financial_accounts a1 on a1.id = e1.account_id
left join lateral (
  select e.account_id, e.amount_minor from public.transaction_entries e
  where e.transaction_id = t.id and t.kind = 'transfer' and e.amount_minor < 0 limit 1
) src on true
left join public.financial_accounts src_a on src_a.id = src.account_id
left join lateral (
  select e.account_id, e.amount_minor from public.transaction_entries e
  where e.transaction_id = t.id and t.kind = 'transfer' and e.amount_minor > 0 limit 1
) dst on true
left join public.financial_accounts dst_a on dst_a.id = dst.account_id;

revoke all on public.account_balances from anon;
revoke all on public.transaction_details from anon;
grant select on public.account_balances to authenticated;
grant select on public.transaction_details to authenticated;

-- =============================================================================
-- Write API (SECURITY INVOKER: every statement is checked by RLS as the caller)
-- =============================================================================

-- Create or update a transaction and its entries atomically.
--   expense:  amount > 0; entry = -amount (or +amount when p_is_refund)
--   income:   amount > 0; entry = +amount
--   transfer: amount > 0; from -amount, to +amount
--   opening_balance / adjustment: signed amount, non-zero
create or replace function public.save_transaction(
  p_household_id   uuid,
  p_kind           public.transaction_kind,
  p_amount_minor   bigint,
  p_account_id     uuid,
  p_occurred_at    timestamptz,
  p_description    text,
  p_transaction_id uuid default null,
  p_to_account_id  uuid default null,
  p_category_id    uuid default null,
  p_payment_method public.payment_method default null,
  p_person_user_id uuid default null,
  p_merchant       text default null,
  p_notes          text default null,
  p_is_refund      boolean default false,
  p_recurring_id   uuid default null,
  p_group_id       uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_currency char(3);
  v_to_currency char(3);
  v_from_archived boolean;
begin
  if p_amount_minor is null or p_amount_minor = 0 then
    raise exception 'Amount must not be zero' using errcode = '22023';
  end if;
  if p_kind in ('expense', 'income', 'transfer') and p_amount_minor < 0 then
    raise exception 'Amount must be positive' using errcode = '22023';
  end if;

  select currency, is_archived into v_currency, v_from_archived
  from public.financial_accounts
  where id = p_account_id and household_id = p_household_id;
  if not found then
    raise exception 'Account not found' using errcode = 'P0002';
  end if;
  if v_from_archived and p_transaction_id is null then
    raise exception 'Archived accounts cannot receive new transactions' using errcode = '22023';
  end if;

  if p_kind = 'transfer' then
    if p_to_account_id is null or p_to_account_id = p_account_id then
      raise exception 'Choose two different accounts for a transfer' using errcode = '22023';
    end if;
    select currency into v_to_currency from public.financial_accounts
    where id = p_to_account_id and household_id = p_household_id;
    if not found then
      raise exception 'Destination account not found' using errcode = 'P0002';
    end if;
  end if;

  if p_transaction_id is null then
    insert into public.transactions (
      household_id, kind, occurred_at, occurred_on, currency, description, merchant, notes,
      category_id, payment_method, person_user_id, recurring_id, group_id)
    values (
      p_household_id, p_kind, p_occurred_at, p_occurred_at::date, v_currency, trim(p_description),
      nullif(trim(p_merchant), ''), nullif(trim(p_notes), ''),
      case when p_kind in ('expense', 'income') then p_category_id end,
      p_payment_method, p_person_user_id, p_recurring_id, p_group_id)
    returning id into v_id;
  else
    update public.transactions set
      kind = p_kind,
      occurred_at = p_occurred_at,
      currency = v_currency,
      description = trim(p_description),
      merchant = nullif(trim(p_merchant), ''),
      notes = nullif(trim(p_notes), ''),
      category_id = case when p_kind in ('expense', 'income') then p_category_id end,
      payment_method = p_payment_method,
      person_user_id = p_person_user_id
    where id = p_transaction_id and household_id = p_household_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Transaction not found' using errcode = 'P0002';
    end if;
    delete from public.transaction_entries where transaction_id = v_id;
  end if;

  if p_kind = 'expense' then
    insert into public.transaction_entries (household_id, transaction_id, account_id, amount_minor)
    values (p_household_id, v_id, p_account_id,
            case when p_is_refund then p_amount_minor else -p_amount_minor end);
  elsif p_kind = 'income' then
    insert into public.transaction_entries (household_id, transaction_id, account_id, amount_minor)
    values (p_household_id, v_id, p_account_id, p_amount_minor);
  elsif p_kind = 'transfer' then
    insert into public.transaction_entries (household_id, transaction_id, account_id, amount_minor)
    values (p_household_id, v_id, p_account_id, -p_amount_minor),
           (p_household_id, v_id, p_to_account_id, p_amount_minor);
  else
    insert into public.transaction_entries (household_id, transaction_id, account_id, amount_minor)
    values (p_household_id, v_id, p_account_id, p_amount_minor);
  end if;

  return v_id;
end;
$$;

-- Create an account and (optionally) its opening balance in one step.
-- p_opening_balance_minor is the signed balance: negative for money owed.
create or replace function public.create_account(
  p_household_id          uuid,
  p_name                  text,
  p_type                  public.account_type,
  p_currency              char(3) default 'TTD',
  p_opening_balance_minor bigint default 0,
  p_opening_date          timestamptz default now(),
  p_institution           text default null,
  p_last4                 text default null,
  p_owner_scope           public.owner_scope default 'shared',
  p_owner_user_id         uuid default null,
  p_credit_limit_minor    bigint default null,
  p_interest_rate_apr     numeric default null,
  p_minimum_payment_minor bigint default null,
  p_payment_due_day       smallint default null,
  p_include_in_net_worth  boolean default true,
  p_notes                 text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.financial_accounts (
    household_id, name, type, currency, institution, last4, owner_scope, owner_user_id,
    credit_limit_minor, interest_rate_apr, minimum_payment_minor, payment_due_day,
    include_in_net_worth, notes)
  values (
    p_household_id, trim(p_name), p_type, upper(p_currency), nullif(trim(p_institution), ''),
    nullif(p_last4, ''), p_owner_scope,
    case when p_owner_scope = 'personal' then p_owner_user_id end,
    p_credit_limit_minor, p_interest_rate_apr, p_minimum_payment_minor, p_payment_due_day,
    p_include_in_net_worth, nullif(trim(p_notes), ''))
  returning id into v_id;

  if coalesce(p_opening_balance_minor, 0) <> 0 then
    perform public.save_transaction(
      p_household_id => p_household_id,
      p_kind => 'opening_balance',
      p_amount_minor => p_opening_balance_minor,
      p_account_id => v_id,
      p_occurred_at => coalesce(p_opening_date, now()),
      p_description => 'Opening balance');
  end if;
  return v_id;
end;
$$;

-- Set an account's balance to a known value (e.g. from a statement) by
-- posting an adjustment for the difference. Optionally marks all cleared
-- entries up to the statement date as reconciled.
create or replace function public.reconcile_account(
  p_household_id          uuid,
  p_account_id            uuid,
  p_statement_balance_minor bigint,
  p_statement_date        timestamptz,
  p_mark_reconciled       boolean default true
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_balance bigint;
  v_diff bigint;
begin
  select coalesce(sum(e.amount_minor), 0) into v_balance
  from public.transaction_entries e
  join public.transactions t on t.id = e.transaction_id
  where e.account_id = p_account_id
    and e.household_id = p_household_id
    and t.occurred_at <= p_statement_date;

  if not exists (select 1 from public.financial_accounts
                 where id = p_account_id and household_id = p_household_id) then
    raise exception 'Account not found' using errcode = 'P0002';
  end if;

  v_diff := p_statement_balance_minor - v_balance;
  if v_diff <> 0 then
    perform public.save_transaction(
      p_household_id => p_household_id,
      p_kind => 'adjustment',
      p_amount_minor => v_diff,
      p_account_id => p_account_id,
      p_occurred_at => p_statement_date,
      p_description => 'Balance adjustment (reconciliation)');
  end if;

  if p_mark_reconciled then
    update public.transaction_entries e
       set status = 'reconciled', reconciled_at = now()
      from public.transactions t
     where t.id = e.transaction_id
       and e.account_id = p_account_id
       and e.household_id = p_household_id
       and e.status <> 'reconciled'
       and t.occurred_at <= p_statement_date;
  end if;
  return v_diff;
end;
$$;

-- Record a debt payment: principal as a transfer to the liability account and
-- interest (if any) as an expense in the system Debt Interest category. Both
-- share a group_id so the UI can show them together.
create or replace function public.record_debt_payment(
  p_household_id      uuid,
  p_from_account_id   uuid,
  p_debt_account_id   uuid,
  p_principal_minor   bigint,
  p_interest_minor    bigint,
  p_occurred_at       timestamptz,
  p_description       text default 'Debt payment',
  p_person_user_id    uuid default null,
  p_recurring_id      uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_group uuid := gen_random_uuid();
  v_interest_category uuid;
begin
  if coalesce(p_principal_minor, 0) < 0 or coalesce(p_interest_minor, 0) < 0
     or coalesce(p_principal_minor, 0) + coalesce(p_interest_minor, 0) = 0 then
    raise exception 'Enter a principal and/or interest amount' using errcode = '22023';
  end if;

  if not public.is_liability_type(
       (select type from public.financial_accounts
         where id = p_debt_account_id and household_id = p_household_id)) then
    raise exception 'Choose a loan, mortgage or credit account' using errcode = '22023';
  end if;

  if p_principal_minor > 0 then
    perform public.save_transaction(
      p_household_id => p_household_id, p_kind => 'transfer', p_amount_minor => p_principal_minor,
      p_account_id => p_from_account_id, p_to_account_id => p_debt_account_id,
      p_occurred_at => p_occurred_at, p_description => p_description || ' — principal',
      p_person_user_id => p_person_user_id, p_recurring_id => p_recurring_id, p_group_id => v_group);
  end if;

  if p_interest_minor > 0 then
    select id into v_interest_category from public.transaction_categories
    where household_id = p_household_id and system_key = 'debt_interest';
    perform public.save_transaction(
      p_household_id => p_household_id, p_kind => 'expense', p_amount_minor => p_interest_minor,
      p_account_id => p_from_account_id, p_category_id => v_interest_category,
      p_occurred_at => p_occurred_at, p_description => p_description || ' — interest',
      p_payment_method => 'bank_transfer',
      p_person_user_id => p_person_user_id, p_recurring_id => p_recurring_id, p_group_id => v_group);
  end if;
  return v_group;
end;
$$;

-- Mark one occurrence of a recurring item as paid/received (optionally
-- recording the ledger transaction) or skipped, then advance next_due_date.
create or replace function public.settle_recurring(
  p_household_id      uuid,
  p_recurring_id      uuid,
  p_due_date          date,
  p_status            text,
  p_paid_on           date default null,
  p_amount_minor      bigint default null,
  p_record_transaction boolean default true,
  p_account_id        uuid default null,
  p_notes             text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item public.recurring_items;
  v_tx uuid;
  v_payment uuid;
  v_tz text;
  v_account uuid;
  v_next date;
begin
  select * into v_item from public.recurring_items
  where id = p_recurring_id and household_id = p_household_id
  for update;
  if not found then
    raise exception 'Recurring item not found' using errcode = 'P0002';
  end if;
  if p_status not in ('paid', 'skipped') then
    raise exception 'Unknown status' using errcode = '22023';
  end if;

  if p_status = 'paid' and p_record_transaction then
    v_account := coalesce(p_account_id, v_item.account_id);
    if v_account is null then
      raise exception 'Choose the account used for this payment' using errcode = '22023';
    end if;
    select timezone into v_tz from public.households where id = p_household_id;
    -- Use noon local time so the local date never shifts.
    if v_item.direction = 'bill' and v_item.liability_account_id is not null then
      v_tx := public.save_transaction(
        p_household_id => p_household_id, p_kind => 'transfer',
        p_amount_minor => coalesce(p_amount_minor, v_item.amount_minor),
        p_account_id => v_account, p_to_account_id => v_item.liability_account_id,
        p_occurred_at => (coalesce(p_paid_on, current_date) + time '12:00') at time zone v_tz,
        p_description => v_item.name, p_recurring_id => v_item.id,
        p_person_user_id => v_item.person_user_id);
    else
      if v_item.category_id is null then
        raise exception 'Set a category on this item before recording a transaction' using errcode = '22023';
      end if;
      v_tx := public.save_transaction(
        p_household_id => p_household_id,
        p_kind => case when v_item.direction = 'bill' then 'expense'::public.transaction_kind
                       else 'income'::public.transaction_kind end,
        p_amount_minor => coalesce(p_amount_minor, v_item.amount_minor),
        p_account_id => v_account, p_category_id => v_item.category_id,
        p_occurred_at => (coalesce(p_paid_on, current_date) + time '12:00') at time zone v_tz,
        p_description => v_item.name, p_merchant => v_item.payee,
        p_payment_method => case when v_item.direction = 'bill' then
          (case when v_item.autopay then 'direct_debit' else 'bank_transfer' end)::public.payment_method end,
        p_recurring_id => v_item.id, p_person_user_id => v_item.person_user_id);
    end if;
  end if;

  insert into public.recurring_payments (
    household_id, recurring_id, due_date, status, paid_on, amount_minor, transaction_id, notes)
  values (
    p_household_id, v_item.id, p_due_date, p_status,
    case when p_status = 'paid' then coalesce(p_paid_on, current_date) end,
    case when p_status = 'paid' then coalesce(p_amount_minor, v_item.amount_minor) end,
    v_tx, nullif(trim(p_notes), ''))
  returning id into v_payment;

  -- Advance past this occurrence (never backwards).
  if p_due_date >= v_item.next_due_date then
    v_next := public.next_occurrence_after(v_item.anchor_date, v_item.frequency,
                                           v_item.interval_count, p_due_date);
    update public.recurring_items
       set next_due_date = v_next,
           is_active = case when v_item.end_date is not null and v_next > v_item.end_date
                            then false else is_active end
     where id = v_item.id;
  end if;
  return v_payment;
end;
$$;

-- Copy a month's budget into another month. Allocations flagged
-- carry_forward bring their unspent remainder (never negative) along.
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
                                         carry_forward, carried_in_minor)
  select p_household_id, v_to, bp.category_id, bp.allocated_minor, bp.carry_forward,
         case when bp.carry_forward and p_to_month > p_from_month
              then greatest(0, bp.allocated_minor + bp.carried_in_minor - bp.spent_minor)
              else 0 end
  from public.budget_progress(p_household_id, p_from_month) bp
  where bp.allocation_id is not null
  on conflict (budget_id, category_id) do update
    set amount_minor = excluded.amount_minor,
        carry_forward = excluded.carry_forward,
        carried_in_minor = excluded.carried_in_minor;
  return v_to;
end;
$$;

-- =============================================================================
-- Read API / reports (SECURITY INVOKER, STABLE)
-- =============================================================================

-- Budget progress for a month. Spending is attributed to the most specific
-- budgeted category: the subcategory if it has an allocation, otherwise its
-- parent if that has one, otherwise it is "unbudgeted" (allocation_id null).
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
  spend as (
    select
      case
        when exists (select 1 from alloc where alloc.category_id = c.id) then c.id
        when c.parent_id is not null
             and exists (select 1 from alloc where alloc.category_id = c.parent_id) then c.parent_id
        else null
      end as target_category_id,
      -sum(e.amount_minor) as amount
    from public.transactions t
    join public.transaction_entries e on e.transaction_id = t.id
    join public.transaction_categories c on c.id = t.category_id
    where t.household_id = p_household_id
      and t.kind = 'expense'
      and t.occurred_on >= p_month
      and t.occurred_on < (p_month + interval '1 month')::date
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

-- Period summary distinguishing spending, income, transfers to savings, debt
-- principal and interest. Opening balances and adjustments are excluded.
create or replace function public.report_summary(p_household_id uuid, p_from date, p_to date)
returns table (
  income_minor            bigint,
  expense_minor           bigint,
  interest_minor          bigint,
  savings_transfer_minor  bigint,
  debt_principal_minor    bigint,
  transaction_count       bigint
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
  )
  select
    coalesce((select sum(amount_minor) from flows where kind = 'income'), 0)::bigint,
    coalesce((select -sum(amount_minor) from flows where kind = 'expense'), 0)::bigint,
    coalesce((select -sum(amount_minor) from flows
               where kind = 'expense' and category_id in (select id from interest_cats)), 0)::bigint,
    coalesce((select sum(amount) from transfers
               where dst_type in ('savings', 'investment')
                 and src_type not in ('savings', 'investment')), 0)::bigint,
    coalesce((select sum(amount) from transfers
               where public.is_liability_type(dst_type::public.account_type)
                 and not public.is_liability_type(src_type::public.account_type)), 0)::bigint,
    (select count(*) from tx)::bigint;
$$;

-- Month-by-month income and spending.
create or replace function public.report_monthly(p_household_id uuid, p_from date, p_to date)
returns table (month date, income_minor bigint, expense_minor bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with months as (
    select generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month')::date as month
  ),
  agg as (
    select date_trunc('month', t.occurred_on)::date as month,
      sum(e.amount_minor) filter (where t.kind = 'income') as income,
      -sum(e.amount_minor) filter (where t.kind = 'expense') as expense
    from public.transactions t
    join public.transaction_entries e on e.transaction_id = t.id
    where t.household_id = p_household_id
      and t.occurred_on between p_from and p_to
      and t.kind in ('income', 'expense')
    group by 1
  )
  select m.month, coalesce(a.income, 0)::bigint, coalesce(a.expense, 0)::bigint
  from months m left join agg a on a.month = m.month
  order by m.month;
$$;

-- Spending by category, rolled up to the top-level category when p_rollup.
create or replace function public.report_category_totals(
  p_household_id uuid, p_from date, p_to date,
  p_kind public.category_kind default 'expense', p_rollup boolean default true)
returns table (category_id uuid, category_name text, total_minor bigint, transaction_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    case when p_rollup then coalesce(pc.id, c.id) else c.id end,
    case when p_rollup then coalesce(pc.name, c.name) else c.name end,
    (case when p_kind = 'expense' then -sum(e.amount_minor) else sum(e.amount_minor) end)::bigint,
    count(distinct t.id)::bigint
  from public.transactions t
  join public.transaction_entries e on e.transaction_id = t.id
  join public.transaction_categories c on c.id = t.category_id
  left join public.transaction_categories pc on pc.id = c.parent_id
  where t.household_id = p_household_id
    and t.kind::text = p_kind::text
    and t.occurred_on between p_from and p_to
  group by 1, 2
  order by 3 desc;
$$;

-- Month-end balances of assets and liabilities (ledger accounts only) for the
-- net worth trend. Asset values from the asset register are added by the
-- assets migration's report_net_worth function.
create or replace function public.report_account_history(p_household_id uuid, p_from date, p_to date)
returns table (month date, assets_minor bigint, liabilities_minor bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  -- Aggregate to one delta per (month, asset/liability) first, so the cost
  -- grows with the number of months rather than the number of entries.
  with months as (
    select generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month')::date as month
  ),
  deltas as (
    select date_trunc('month', t.occurred_on)::date as month,
      public.is_liability_type(a.type) as is_liability,
      sum(e.amount_minor) as delta
    from public.transaction_entries e
    join public.transactions t on t.id = e.transaction_id
    join public.financial_accounts a on a.id = e.account_id
    where e.household_id = p_household_id
      and a.include_in_net_worth
      and t.occurred_on <= (date_trunc('month', p_to) + interval '1 month' - interval '1 day')::date
    group by 1, 2
  )
  select m.month,
    coalesce((select sum(d.delta) from deltas d where not d.is_liability and d.month <= m.month), 0)::bigint,
    coalesce(-(select sum(d.delta) from deltas d where d.is_liability and d.month <= m.month), 0)::bigint
  from months m
  order by m.month;
$$;

-- =============================================================================
-- Default categories for new households
-- =============================================================================
create or replace function private.seed_household_defaults(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent uuid;
  r record;
  child text;
  v_order integer := 0;
begin
  for r in
    select * from (values
      ('Housing',       'house',          'clay',   array['Mortgage / Rent', 'Property Tax', 'Repairs & Maintenance', 'Furnishings'], null),
      ('Food',          'shopping-basket','sage',   array['Groceries', 'Dining Out', 'Lunches & Snacks'], null),
      ('Transport',     'car',            'slate',  array['Fuel', 'Vehicle Maintenance', 'Parking & Tolls', 'Taxi & Rideshare'], null),
      ('Utilities',     'plug',           'amber',  array['Electricity', 'Water', 'Internet & Phone', 'Cooking Gas'], null),
      ('Family',        'users',          'rose',   array['Childcare & Daycare', 'Clothing', 'Gifts', 'Personal Care'], null),
      ('Insurance',     'shield',         'teal',   array['Health Insurance', 'Vehicle Insurance', 'Home Insurance', 'Life Insurance'], null),
      ('Recreation',    'palmtree',       'sky',    array['Entertainment', 'Travel', 'Subscriptions', 'Hobbies'], null),
      ('Healthcare',    'heart-pulse',    'rose',   array['Doctor & Dental', 'Pharmacy'], null),
      ('Education',     'graduation-cap', 'violet', array['School Fees', 'Books & Supplies', 'Courses'], null),
      ('Debt Payments', 'landmark',       'stone',  array['Loan Payments', 'Bank Fees'], null),
      ('Miscellaneous', 'shapes',         'stone',  array[]::text[], 'uncategorized_expense')
    ) as v(name, icon, color, children, system_key)
  loop
    v_order := v_order + 1;
    insert into public.transaction_categories (household_id, kind, name, icon, color, system_key, sort_order)
    values (p_household_id, 'expense', r.name, r.icon, r.color, r.system_key, v_order)
    returning id into v_parent;
    foreach child in array r.children loop
      insert into public.transaction_categories (household_id, kind, name, parent_id, sort_order)
      values (p_household_id, 'expense', child, v_parent, v_order);
    end loop;
    if r.name = 'Debt Payments' then
      insert into public.transaction_categories (household_id, kind, name, parent_id, system_key, sort_order)
      values (p_household_id, 'expense', 'Debt Interest', v_parent, 'debt_interest', v_order);
    end if;
  end loop;

  insert into public.transaction_categories (household_id, kind, name, icon, color, system_key, sort_order)
  values
    (p_household_id, 'income', 'Employment Income', 'briefcase',   'sage',  'employment_income', 1),
    (p_household_id, 'income', 'Business Income',   'store',       'teal',  'business_income', 2),
    (p_household_id, 'income', 'Commissions',       'percent',     'amber', null, 3),
    (p_household_id, 'income', 'Bonuses',           'gift',        'violet', null, 4),
    (p_household_id, 'income', 'Interest Earned',   'piggy-bank',  'sky',   null, 5),
    (p_household_id, 'income', 'Other Income',      'circle-plus', 'stone', 'other_income', 6);
end;
$$;
revoke all on function private.seed_household_defaults(uuid) from public;

create or replace function private.tg_household_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_household_defaults(new.id);
  return null;
end;
$$;
revoke all on function private.tg_household_defaults() from public;
create trigger households_seed_defaults after insert on public.households
  for each row execute function private.tg_household_defaults();

-- =============================================================================
-- Function privileges: authenticated only, never anon.
-- =============================================================================
revoke all on function public.save_transaction from public, anon;
revoke all on function public.create_account from public, anon;
revoke all on function public.reconcile_account from public, anon;
revoke all on function public.record_debt_payment from public, anon;
revoke all on function public.settle_recurring from public, anon;
revoke all on function public.copy_budget from public, anon;
revoke all on function public.budget_progress from public, anon;
revoke all on function public.report_summary from public, anon;
revoke all on function public.report_monthly from public, anon;
revoke all on function public.report_category_totals from public, anon;
revoke all on function public.report_account_history from public, anon;
grant execute on function public.save_transaction to authenticated;
grant execute on function public.create_account to authenticated;
grant execute on function public.reconcile_account to authenticated;
grant execute on function public.record_debt_payment to authenticated;
grant execute on function public.settle_recurring to authenticated;
grant execute on function public.copy_budget to authenticated;
grant execute on function public.budget_progress to authenticated;
grant execute on function public.report_summary to authenticated;
grant execute on function public.report_monthly to authenticated;
grant execute on function public.report_category_totals to authenticated;
grant execute on function public.report_account_history to authenticated;
