-- =============================================================================
-- Ward Family Hub — Foundation
-- Households, membership, profiles, audit logging and the shared security
-- helpers that every later migration relies on.
--
-- Security model (summary — see docs/SECURITY.md):
--   * Every household-owned row carries household_id.
--   * RLS policies allow access only when household_id is one of the caller's
--     memberships (private.member_household_ids()).
--   * Writes additionally require a writer role (owner/adult). 'viewer' is
--     reserved for future read-only members.
--   * Cross-table references use composite (household_id, id) foreign keys so
--     a row can never point at another household's data, even by mistake.
--   * The anon role has no access to anything.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.household_role as enum ('owner', 'adult', 'viewer');

-- -----------------------------------------------------------------------------
-- Generic row metadata trigger: timestamps and actor tracking.
-- created_* are immutable after insert; updated_* always reflect the caller.
-- -----------------------------------------------------------------------------
create or replace function private.tg_row_meta()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.updated_by := coalesce(auth.uid(), new.created_by);
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end;
$$;

-- Prevent rows from being moved between households.
create or replace function private.tg_lock_household()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.household_id is distinct from old.household_id then
    raise exception 'household_id cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Households and membership
-- -----------------------------------------------------------------------------
create table public.households (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 120),
  base_currency char(3) not null default 'TTD' check (base_currency ~ '^[A-Z]{3}$'),
  timezone      text not null default 'America/Port_of_Spain',
  locale        text not null default 'en-TT',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id) on delete set null,
  updated_by    uuid references auth.users (id) on delete set null
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         public.household_role not null default 'adult',
  display_name text not null check (char_length(display_name) between 1 and 60),
  color        text not null default 'sage' check (color ~ '^[a-z]{3,16}$'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null,
  primary key (household_id, user_id)
);
create index household_members_user_idx on public.household_members (user_id);

create table public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  display_name         text not null check (char_length(display_name) between 1 and 60),
  default_household_id uuid references public.households (id) on delete set null,
  theme                text not null default 'system' check (theme in ('system', 'light', 'dark')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid references auth.users (id) on delete set null,
  updated_by           uuid references auth.users (id) on delete set null
);

create trigger households_meta before insert or update on public.households
  for each row execute function private.tg_row_meta();
create trigger household_members_meta before insert or update on public.household_members
  for each row execute function private.tg_row_meta();
create trigger household_members_lock before update on public.household_members
  for each row execute function private.tg_lock_household();
create trigger profiles_meta before insert or update on public.profiles
  for each row execute function private.tg_row_meta();

-- -----------------------------------------------------------------------------
-- Membership helpers. SECURITY DEFINER so policies on household_members do not
-- recurse; they only ever answer questions about the calling user.
-- Used as `household_id in (select ...)` inside policies so Postgres evaluates
-- them once per statement (hashed subplan) instead of once per row.
-- -----------------------------------------------------------------------------
create or replace function private.member_household_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.household_id
  from public.household_members m
  where m.user_id = auth.uid();
$$;

create or replace function private.writer_household_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.household_id
  from public.household_members m
  where m.user_id = auth.uid()
    and m.role in ('owner', 'adult');
$$;

create or replace function private.is_household_member(p_household_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = p_household_id and m.user_id = p_user_id
  );
$$;

-- True when the current session has completed a second factor (Supabase MFA).
-- Used to gate especially sensitive records.
create or replace function private.has_aal2()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

revoke all on function private.member_household_ids() from public;
revoke all on function private.writer_household_ids() from public;
revoke all on function private.is_household_member(uuid, uuid) from public;
revoke all on function private.has_aal2() from public;
grant execute on function private.member_household_ids() to authenticated, service_role;
grant execute on function private.writer_household_ids() to authenticated, service_role;
grant execute on function private.is_household_member(uuid, uuid) to authenticated, service_role;
grant execute on function private.has_aal2() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Standard household policies. Applied to every household-owned table so the
-- rules are identical everywhere and auditable in one place.
-- -----------------------------------------------------------------------------
create or replace function private.apply_household_rls(p_table regclass)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format('alter table %s enable row level security', p_table);
  execute format(
    'create policy household_select on %s for select to authenticated
       using (household_id in (select private.member_household_ids()))', p_table);
  execute format(
    'create policy household_insert on %s for insert to authenticated
       with check (household_id in (select private.writer_household_ids()))', p_table);
  execute format(
    'create policy household_update on %s for update to authenticated
       using (household_id in (select private.writer_household_ids()))
       with check (household_id in (select private.writer_household_ids()))', p_table);
  execute format(
    'create policy household_delete on %s for delete to authenticated
       using (household_id in (select private.writer_household_ids()))', p_table);
  execute format('revoke all on %s from anon', p_table);
  execute format('grant select, insert, update, delete on %s to authenticated', p_table);
  execute format('create trigger row_meta before insert or update on %s
                    for each row execute function private.tg_row_meta()', p_table);
  execute format('create trigger lock_household before update on %s
                    for each row execute function private.tg_lock_household()', p_table);
end;
$$;
revoke all on function private.apply_household_rls(regclass) from public;

-- households: members read; writers may rename/configure. Creation and deletion
-- happen only through provisioning (service role).
alter table public.households enable row level security;
create policy households_select on public.households for select to authenticated
  using (id in (select private.member_household_ids()));
create policy households_update on public.households for update to authenticated
  using (id in (select private.writer_household_ids()))
  with check (id in (select private.writer_household_ids()));
revoke all on public.households from anon, authenticated;
grant select on public.households to authenticated;
grant update (name, timezone, locale) on public.households to authenticated;

-- household_members: members see each other; each user may edit only their own
-- display name and colour. Roles and membership are managed by provisioning.
alter table public.household_members enable row level security;
create policy household_members_select on public.household_members for select to authenticated
  using (household_id in (select private.member_household_ids()));
create policy household_members_update_self on public.household_members for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.household_members from anon, authenticated;
grant select on public.household_members to authenticated;
grant update (display_name, color) on public.household_members to authenticated;

-- profiles: a user sees their own profile and those of people they share a
-- household with; they can only edit their own.
alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.household_members m
      where m.user_id = profiles.id
        and m.household_id in (select private.member_household_ids())
    )
  );
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and (default_household_id is null
         or default_household_id in (select private.member_household_ids()))
  );
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, default_household_id, theme) on public.profiles to authenticated;

-- Create a profile automatically for every provisioned auth user.
-- user_metadata is only used for a display-name default, never for authorization.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
                  split_part(coalesce(new.email, 'member'), '@', 1)), 60)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- Audit log. Append-only from the client's point of view: rows are written by
-- a SECURITY DEFINER trigger and there are no insert/update/delete grants.
-- For sensitive tables the trigger is created with the 'redact' argument and
-- only the names of changed fields are stored, never their values.
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id             bigint generated always as identity primary key,
  household_id   uuid not null references public.households (id) on delete cascade,
  actor_id       uuid references auth.users (id) on delete set null,
  table_name     text not null,
  record_id      uuid,
  action         text not null check (action in ('insert', 'update', 'delete')),
  changed_fields text[] not null default '{}',
  old_data       jsonb,
  new_data       jsonb,
  created_at     timestamptz not null default now()
);
create index audit_logs_household_created_idx on public.audit_logs (household_id, created_at desc);
create index audit_logs_record_idx on public.audit_logs (record_id);

alter table public.audit_logs enable row level security;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (household_id in (select private.member_household_ids()));
revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;

create or replace function private.tg_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changed text[] := '{}';
  v_redact boolean := coalesce(tg_argv[0], '') = 'redact';
  v_ignore text[] := array['updated_at', 'updated_by', 'created_at', 'created_by'];
begin
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(k order by k), '{}') into v_changed
    from jsonb_object_keys(v_new) k
    where not (k = any (v_ignore))
      and v_new -> k is distinct from v_old -> k;
    if cardinality(v_changed) = 0 then
      return null;
    end if;
    -- Keep only the fields that changed (plus nothing else) to minimise data.
    select jsonb_object_agg(k, v_old -> k) into v_old from unnest(v_changed) k;
    select jsonb_object_agg(k, v_new -> k) into v_new from unnest(v_changed) k;
  end if;

  insert into public.audit_logs (household_id, actor_id, table_name, record_id, action,
                                 changed_fields, old_data, new_data)
  values (
    (v_row ->> 'household_id')::uuid,
    auth.uid(),
    tg_table_name,
    nullif(v_row ->> 'id', '')::uuid,
    lower(tg_op),
    v_changed,
    case when v_redact then null else v_old end,
    case when v_redact then null else v_new end
  );
  return null;
end;
$$;
revoke all on function private.tg_audit() from public;

create or replace function private.apply_audit(p_table regclass, p_redact boolean default false)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format(
    'create trigger audit after insert or update or delete on %s
       for each row execute function private.tg_audit(%L)',
    p_table, case when p_redact then 'redact' else 'full' end);
end;
$$;
revoke all on function private.apply_audit(regclass, boolean) from public;

select private.apply_audit('public.household_members');

-- Helper used by the app to resolve the caller's active household.
create or replace function public.current_household_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select p.default_household_id from public.profiles p
      where p.id = auth.uid()
        and p.default_household_id in (select private.member_household_ids())),
    (select m.household_id from public.household_members m
      where m.user_id = auth.uid()
      order by m.created_at
      limit 1)
  );
$$;
revoke all on function public.current_household_id() from public, anon;
grant execute on function public.current_household_id() to authenticated;
