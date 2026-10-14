-- =============================================================================
-- Ward Family Hub — Property, vehicles and family records
-- =============================================================================

create type public.asset_type as enum ('property', 'vehicle', 'other');

-- -----------------------------------------------------------------------------
-- Assets (one table, type-specific columns are nullable)
-- -----------------------------------------------------------------------------
create table public.assets (
  id                        uuid primary key default gen_random_uuid(),
  household_id              uuid not null references public.households (id) on delete cascade,
  type                      public.asset_type not null,
  name                      text not null check (char_length(name) between 1 and 120),
  purchase_date             date,
  purchase_price_minor      bigint check (purchase_price_minor >= 0),
  currency                  char(3) not null default 'TTD' check (currency ~ '^[A-Z]{3}$'),
  estimated_value_minor     bigint check (estimated_value_minor >= 0),
  value_as_of               date,
  include_in_net_worth      boolean not null default true,
  loan_account_id           uuid,
  notes                     text check (char_length(notes) <= 4000),
  is_archived               boolean not null default false,
  -- property
  address                   text check (char_length(address) <= 300),
  property_kind             text check (property_kind in ('house', 'apartment', 'townhouse', 'land', 'commercial', 'other')),
  -- vehicle
  make                      text check (char_length(make) <= 60),
  model                     text check (char_length(model) <= 60),
  model_year                smallint check (model_year between 1900 and 2100),
  registration_plate        text check (char_length(registration_plate) <= 20),
  vin                       text check (char_length(vin) <= 30),
  colour                    text check (char_length(colour) <= 30),
  mileage_unit              text not null default 'km' check (mileage_unit in ('km', 'mi')),
  current_mileage           integer check (current_mileage >= 0),
  mileage_as_of             date,
  insurance_renewal_date    date,
  registration_renewal_date date,
  next_service_date         date,
  next_service_mileage      integer check (next_service_mileage >= 0),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  created_by                uuid references auth.users (id) on delete set null,
  updated_by                uuid references auth.users (id) on delete set null,
  unique (household_id, id),
  foreign key (household_id, loan_account_id)
    references public.financial_accounts (household_id, id) on delete set null (loan_account_id)
);
create index assets_household_idx on public.assets (household_id, type, is_archived);

-- Valuation history; the latest valuation becomes the asset's current value.
create table public.asset_values (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  asset_id     uuid not null,
  valued_on    date not null,
  value_minor  bigint not null check (value_minor >= 0),
  note         text check (char_length(note) <= 300),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null,
  unique (asset_id, valued_on),
  foreign key (household_id, asset_id) references public.assets (household_id, id) on delete cascade
);

create or replace function private.tg_asset_latest_value()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_asset uuid := coalesce(new.asset_id, old.asset_id);
  v_latest record;
begin
  select valued_on, value_minor into v_latest from public.asset_values
  where asset_id = v_asset order by valued_on desc limit 1;
  update public.assets
     set estimated_value_minor = v_latest.value_minor, value_as_of = v_latest.valued_on
   where id = v_asset and v_latest.valued_on is not null;
  return null;
end;
$$;
create trigger asset_values_latest after insert or update or delete on public.asset_values
  for each row execute function private.tg_asset_latest_value();

create table public.contractors (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 120),
  trade        text check (char_length(trade) <= 60),
  phone        text check (char_length(phone) <= 40),
  email        text check (char_length(email) <= 254),
  rating       smallint check (rating between 1 and 5),
  notes        text check (char_length(notes) <= 2000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null,
  unique (household_id, id)
);

-- Maintenance, repairs, renovations, services and inspections.
create table public.asset_records (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  asset_id       uuid not null,
  kind           text not null check (kind in ('maintenance', 'repair', 'renovation', 'service', 'inspection', 'improvement', 'other')),
  title          text not null check (char_length(title) between 1 and 160),
  performed_on   date not null,
  cost_minor     bigint check (cost_minor >= 0),
  contractor_id  uuid,
  mileage        integer check (mileage >= 0),
  transaction_id uuid,
  next_due_date  date,
  notes          text check (char_length(notes) <= 2000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id) on delete set null,
  updated_by     uuid references auth.users (id) on delete set null,
  foreign key (household_id, asset_id) references public.assets (household_id, id) on delete cascade,
  foreign key (household_id, contractor_id)
    references public.contractors (household_id, id) on delete set null (contractor_id),
  foreign key (household_id, transaction_id)
    references public.transactions (household_id, id) on delete set null (transaction_id)
);
create index asset_records_asset_idx on public.asset_records (asset_id, performed_on desc);

-- Appliances, fixtures and components, with warranties.
create table public.asset_items (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references public.households (id) on delete cascade,
  asset_id            uuid not null,
  name                text not null check (char_length(name) between 1 and 120),
  brand               text check (char_length(brand) <= 60),
  model               text check (char_length(model) <= 60),
  serial_number       text check (char_length(serial_number) <= 60),
  purchase_date       date,
  price_minor         bigint check (price_minor >= 0),
  warranty_expires_on date,
  notes               text check (char_length(notes) <= 2000),
  is_archived         boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references auth.users (id) on delete set null,
  updated_by          uuid references auth.users (id) on delete set null,
  foreign key (household_id, asset_id) references public.assets (household_id, id) on delete cascade
);
create index asset_items_asset_idx on public.asset_items (asset_id);

-- -----------------------------------------------------------------------------
-- Family
-- -----------------------------------------------------------------------------
create table public.family_members (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households (id) on delete cascade,
  user_id          uuid,
  full_name        text not null check (char_length(full_name) between 1 and 120),
  preferred_name   text check (char_length(preferred_name) <= 60),
  relationship     text not null default 'child' check (relationship in ('self', 'partner', 'child', 'parent', 'sibling', 'grandparent', 'other')),
  date_of_birth    date,
  school_or_care   text check (char_length(school_or_care) <= 160),
  school_details   text check (char_length(school_details) <= 2000),
  notes            text check (char_length(notes) <= 4000),
  colour           text not null default 'sky' check (colour ~ '^[a-z]{3,16}$'),
  is_archived      boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references auth.users (id) on delete set null,
  updated_by       uuid references auth.users (id) on delete set null,
  unique (household_id, id),
  unique (household_id, user_id),
  foreign key (household_id, user_id)
    references public.household_members (household_id, user_id) on delete set null (user_id)
);

-- Medical details live in their own table so they can be protected separately:
-- visible only to a two-factor-verified session, audited without values.
create table public.family_health (
  family_member_id uuid primary key,
  household_id     uuid not null references public.households (id) on delete cascade,
  blood_type       text check (blood_type in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown')),
  allergies        text check (char_length(allergies) <= 2000),
  conditions       text check (char_length(conditions) <= 2000),
  medications      text check (char_length(medications) <= 2000),
  doctor           text check (char_length(doctor) <= 300),
  health_insurance text check (char_length(health_insurance) <= 300),
  notes            text check (char_length(notes) <= 4000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references auth.users (id) on delete set null,
  updated_by       uuid references auth.users (id) on delete set null,
  foreign key (household_id, family_member_id) references public.family_members (household_id, id) on delete cascade
);

create table public.family_contacts (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households (id) on delete cascade,
  family_member_id uuid,
  name             text not null check (char_length(name) between 1 and 120),
  relationship     text check (char_length(relationship) <= 60),
  phone            text check (char_length(phone) <= 40),
  email            text check (char_length(email) <= 254),
  is_emergency     boolean not null default false,
  notes            text check (char_length(notes) <= 1000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references auth.users (id) on delete set null,
  updated_by       uuid references auth.users (id) on delete set null,
  foreign key (household_id, family_member_id)
    references public.family_members (household_id, id) on delete cascade
);

create table public.family_dates (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households (id) on delete cascade,
  family_member_id uuid,
  kind             text not null default 'milestone' check (kind in ('milestone', 'important_date')),
  title            text not null check (char_length(title) between 1 and 160),
  on_date          date not null,
  is_annual        boolean not null default false,
  notes            text check (char_length(notes) <= 2000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references auth.users (id) on delete set null,
  updated_by       uuid references auth.users (id) on delete set null,
  foreign key (household_id, family_member_id)
    references public.family_members (household_id, id) on delete cascade
);
create index family_dates_member_idx on public.family_dates (household_id, family_member_id, on_date);

-- -----------------------------------------------------------------------------
-- Links from existing modules
-- -----------------------------------------------------------------------------
alter table public.transactions
  add column asset_id uuid,
  add column family_member_id uuid,
  add foreign key (household_id, asset_id)
    references public.assets (household_id, id) on delete set null (asset_id),
  add foreign key (household_id, family_member_id)
    references public.family_members (household_id, id) on delete set null (family_member_id);
create index transactions_asset_idx on public.transactions (household_id, asset_id) where asset_id is not null;
create index transactions_family_idx on public.transactions (household_id, family_member_id) where family_member_id is not null;

alter table public.documents
  add column asset_id uuid,
  add column family_member_id uuid,
  add foreign key (household_id, asset_id)
    references public.assets (household_id, id) on delete set null (asset_id),
  add foreign key (household_id, family_member_id)
    references public.family_members (household_id, id) on delete set null (family_member_id);

alter table public.calendar_events
  add column family_member_id uuid,
  add column asset_id uuid,
  add foreign key (household_id, family_member_id)
    references public.family_members (household_id, id) on delete set null (family_member_id),
  add foreign key (household_id, asset_id)
    references public.assets (household_id, id) on delete set null (asset_id);

-- -----------------------------------------------------------------------------
-- Policies and auditing
-- -----------------------------------------------------------------------------
select private.apply_household_rls('public.assets');
select private.apply_household_rls('public.asset_values');
select private.apply_household_rls('public.contractors');
select private.apply_household_rls('public.asset_records');
select private.apply_household_rls('public.asset_items');
select private.apply_household_rls('public.family_members');
select private.apply_household_rls('public.family_health');
select private.apply_household_rls('public.family_contacts');
select private.apply_household_rls('public.family_dates');

create policy family_health_requires_aal2 on public.family_health as restrictive for all to authenticated
  using ((select private.has_aal2()))
  with check ((select private.has_aal2()));

select private.apply_audit('public.assets');
select private.apply_audit('public.asset_values');
select private.apply_audit('public.asset_records');
select private.apply_audit('public.family_members', true);
select private.apply_audit('public.family_health', true);
select private.apply_audit('public.family_contacts', true);

-- -----------------------------------------------------------------------------
-- Write API: save_transaction gains asset and family links. The old signature
-- is dropped so PostgREST never sees two overloads.
-- -----------------------------------------------------------------------------
drop function public.save_transaction(
  uuid, public.transaction_kind, bigint, uuid, timestamptz, text, uuid, uuid, uuid,
  public.payment_method, uuid, text, text, boolean, uuid, uuid);

create or replace function public.save_transaction(
  p_household_id     uuid,
  p_kind             public.transaction_kind,
  p_amount_minor     bigint,
  p_account_id       uuid,
  p_occurred_at      timestamptz,
  p_description      text,
  p_transaction_id   uuid default null,
  p_to_account_id    uuid default null,
  p_category_id      uuid default null,
  p_payment_method   public.payment_method default null,
  p_person_user_id   uuid default null,
  p_merchant         text default null,
  p_notes            text default null,
  p_is_refund        boolean default false,
  p_recurring_id     uuid default null,
  p_group_id         uuid default null,
  p_asset_id         uuid default null,
  p_family_member_id uuid default null
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
      category_id, payment_method, person_user_id, recurring_id, group_id, asset_id, family_member_id)
    values (
      p_household_id, p_kind, p_occurred_at, p_occurred_at::date, v_currency, trim(p_description),
      nullif(trim(p_merchant), ''), nullif(trim(p_notes), ''),
      case when p_kind in ('expense', 'income') then p_category_id end,
      p_payment_method, p_person_user_id, p_recurring_id, p_group_id, p_asset_id, p_family_member_id)
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
      person_user_id = p_person_user_id,
      asset_id = p_asset_id,
      family_member_id = p_family_member_id
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
revoke all on function public.save_transaction from public, anon;
grant execute on function public.save_transaction to authenticated;

-- transaction_details gains the new links (appended, so existing columns keep their order).
create or replace view public.transaction_details with (security_invoker = true) as
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
  end::bigint as signed_amount_minor,
  t.asset_id,
  t.family_member_id
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

-- -----------------------------------------------------------------------------
-- Reports
-- -----------------------------------------------------------------------------
-- Cost of ownership per asset: spending recorded in the ledger against the
-- asset, plus costs logged on maintenance records that have no ledger
-- transaction (kept separate so nothing is counted twice).
create or replace function public.report_asset_costs(p_household_id uuid, p_from date, p_to date)
returns table (asset_id uuid, ledger_minor bigint, logged_minor bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with ledger as (
    select t.asset_id, -sum(e.amount_minor) as amount
    from public.transactions t
    join public.transaction_entries e on e.transaction_id = t.id
    where t.household_id = p_household_id and t.kind = 'expense' and t.asset_id is not null
      and t.occurred_on between p_from and p_to
    group by t.asset_id
  ),
  logged as (
    select r.asset_id, sum(r.cost_minor) as amount
    from public.asset_records r
    where r.household_id = p_household_id and r.transaction_id is null and r.cost_minor is not null
      and r.performed_on between p_from and p_to
    group by r.asset_id
  )
  select a.id, coalesce(l.amount, 0)::bigint, coalesce(g.amount, 0)::bigint
  from public.assets a
  left join ledger l on l.asset_id = a.id
  left join logged g on g.asset_id = a.id
  where a.household_id = p_household_id;
$$;

-- Value of assets included in net worth at each month end (latest valuation on
-- or before that date; assets bought later count from their purchase month).
create or replace function public.report_asset_values(p_household_id uuid, p_from date, p_to date)
returns table (month date, value_minor bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with months as (
    select generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month')::date as month
  )
  select m.month,
    coalesce((
      select sum(v.value_minor)
      from public.assets a
      cross join lateral (
        select av.value_minor from public.asset_values av
        where av.asset_id = a.id
          and av.valued_on <= (m.month + interval '1 month' - interval '1 day')::date
        order by av.valued_on desc limit 1
      ) v
      where a.household_id = p_household_id and a.include_in_net_worth and not a.is_archived
    ), 0)::bigint
  from months m
  order by m.month;
$$;

revoke all on function public.report_asset_costs from public, anon;
revoke all on function public.report_asset_values from public, anon;
grant execute on function public.report_asset_costs to authenticated;
grant execute on function public.report_asset_values to authenticated;

-- -----------------------------------------------------------------------------
-- Notifications for vehicles, maintenance, warranties and family dates
-- -----------------------------------------------------------------------------
create or replace function private.generate_asset_family_notifications(p_household_id uuid, p_today date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_n integer;
begin
  if not exists (
    select 1 from public.household_members
    where household_id = p_household_id and user_id = auth.uid() and role in ('owner', 'adult')
  ) then
    return 0;
  end if;

  -- Vehicle service, insurance and registration dates (30 days ahead, 14 days after).
  insert into public.notifications (household_id, user_id, kind, severity, title, link_path, dedupe_key, due_on)
  select a.household_id, m.user_id, 'vehicle_' || d.what,
         case when d.due < p_today then 'warning' else 'info' end,
         a.name || ': ' || d.label || case when d.due < p_today then ' overdue (' else ' due ' end
           || to_char(d.due, 'DD/MM/YYYY') || case when d.due < p_today then ')' else '' end,
         '/vehicles/' || a.id,
         'vehicle:' || a.id || ':' || d.what || ':' || d.due,
         d.due
  from public.assets a
  cross join lateral (values
    ('service', 'service', a.next_service_date),
    ('insurance', 'insurance renewal', a.insurance_renewal_date),
    ('registration', 'registration renewal', a.registration_renewal_date)
  ) as d(what, label, due)
  join public.household_members m on m.household_id = a.household_id and m.role <> 'viewer'
  where a.household_id = p_household_id and a.type = 'vehicle' and not a.is_archived
    and d.due is not null and d.due between p_today - 14 and p_today + 30
  on conflict (household_id, user_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  -- Follow-up maintenance due on any asset.
  insert into public.notifications (household_id, user_id, kind, severity, title, link_path, dedupe_key, due_on)
  select r.household_id, m.user_id, 'maintenance_due',
         case when r.next_due_date < p_today then 'warning' else 'info' end,
         a.name || ': ' || r.title || ' due ' || to_char(r.next_due_date, 'DD/MM/YYYY'),
         case when a.type = 'vehicle' then '/vehicles/' else '/property/' end || a.id,
         'maintenance:' || r.id || ':' || r.next_due_date,
         r.next_due_date
  from public.asset_records r
  join public.assets a on a.id = r.asset_id
  join public.household_members m on m.household_id = r.household_id and m.role <> 'viewer'
  where r.household_id = p_household_id and not a.is_archived
    and r.next_due_date between p_today - 14 and p_today + 14
    and not exists (
      select 1 from public.asset_records later
      where later.asset_id = r.asset_id and later.kind = r.kind and later.performed_on > r.performed_on
    )
  on conflict (household_id, user_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  -- Warranties ending within 30 days.
  insert into public.notifications (household_id, user_id, kind, severity, title, link_path, dedupe_key, due_on)
  select i.household_id, m.user_id, 'warranty_expiry', 'info',
         i.name || ' warranty ends ' || to_char(i.warranty_expires_on, 'DD/MM/YYYY'),
         case when a.type = 'vehicle' then '/vehicles/' else '/property/' end || a.id,
         'warranty:' || i.id || ':' || i.warranty_expires_on,
         i.warranty_expires_on
  from public.asset_items i
  join public.assets a on a.id = i.asset_id
  join public.household_members m on m.household_id = i.household_id and m.role <> 'viewer'
  where i.household_id = p_household_id and not i.is_archived
    and i.warranty_expires_on between p_today and p_today + 30
  on conflict (household_id, user_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  -- Birthdays (from date of birth) and annual family dates within 7 days.
  insert into public.notifications (household_id, user_id, kind, severity, title, link_path, dedupe_key, due_on)
  select x.household_id, m.user_id, 'family_date', 'info',
         case when x.next_date = p_today then 'Today: ' else to_char(x.next_date, 'DD/MM') || ': ' end || x.title,
         '/family/' || x.member_id,
         'family:' || x.source_id || ':' || x.next_date,
         x.next_date
  from (
    select f.household_id, f.id as member_id, f.id as source_id,
           coalesce(f.preferred_name, f.full_name) || '''s birthday' as title,
           public.next_occurrence_after(f.date_of_birth, 'yearly', 1, p_today - 1) as next_date
    from public.family_members f
    where f.household_id = p_household_id and not f.is_archived and f.date_of_birth is not null
    union all
    select d.household_id, d.family_member_id, d.id, d.title,
           case when d.is_annual then public.next_occurrence_after(d.on_date, 'yearly', 1, p_today - 1) else d.on_date end
    from public.family_dates d
    where d.household_id = p_household_id and d.kind = 'important_date' and d.family_member_id is not null
  ) x
  join public.household_members m on m.household_id = x.household_id and m.role <> 'viewer'
  where x.next_date between p_today and p_today + 7
  on conflict (household_id, user_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  return v_count;
end;
$$;
revoke all on function private.generate_asset_family_notifications(uuid, date) from public;
grant execute on function private.generate_asset_family_notifications(uuid, date) to authenticated;

create or replace function public.refresh_notifications(p_household_id uuid, p_today date)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.generate_notifications(p_household_id, p_today)
       + private.generate_document_notifications(p_household_id, p_today)
       + private.generate_asset_family_notifications(p_household_id, p_today);
$$;
revoke all on function public.refresh_notifications from public, anon;
grant execute on function public.refresh_notifications to authenticated;
