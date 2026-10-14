-- =============================================================================
-- Ward Family Hub — Secure document vault
--
--   documents       metadata (category, dates, tags, links to accounts, bills,
--                   transactions, goals); is_sensitive marks especially
--                   private papers (passports, IDs, medical, banking…)
--   document_files  every uploaded version; documents.current_file_id points
--                   at the latest
--   storage bucket  "documents", private; objects live at
--                   {household_id}/{document_id}/{file_id}
--
-- Sensitive documents and their files are only visible to (and changeable by)
-- a session that has completed two-factor verification (JWT aal = aal2).
-- This is enforced by RESTRICTIVE RLS policies, including on storage objects,
-- so signed URLs for sensitive files cannot be created without step-up.
-- =============================================================================

create table public.document_categories (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references public.households (id) on delete cascade,
  name              text not null check (char_length(name) between 1 and 60),
  system_key        text check (system_key ~ '^[a-z_]{1,40}$'),
  sensitive_default boolean not null default false,
  sort_order        integer not null default 0,
  is_archived       boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references auth.users (id) on delete set null,
  updated_by        uuid references auth.users (id) on delete set null,
  unique (household_id, id),
  unique (household_id, name),
  unique (household_id, system_key)
);

create table public.documents (
  id                   uuid primary key default gen_random_uuid(),
  household_id         uuid not null references public.households (id) on delete cascade,
  name                 text not null check (char_length(name) between 1 and 160),
  category_id          uuid not null,
  description          text check (char_length(description) <= 2000),
  tags                 text[] not null default '{}' check (cardinality(tags) <= 12),
  issue_date           date,
  expiry_date          date,
  expiry_reminder_days smallint not null default 30 check (expiry_reminder_days between 0 and 365),
  is_sensitive         boolean not null default false,
  is_archived          boolean not null default false,
  archived_at          timestamptz,
  account_id           uuid,
  transaction_id       uuid,
  recurring_id         uuid,
  goal_id              uuid,
  related_user_id      uuid,
  current_file_id      uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid references auth.users (id) on delete set null,
  updated_by           uuid references auth.users (id) on delete set null,
  unique (household_id, id),
  foreign key (household_id, category_id)
    references public.document_categories (household_id, id) on delete restrict,
  foreign key (household_id, account_id)
    references public.financial_accounts (household_id, id) on delete set null (account_id),
  foreign key (household_id, transaction_id)
    references public.transactions (household_id, id) on delete set null (transaction_id),
  foreign key (household_id, recurring_id)
    references public.recurring_items (household_id, id) on delete set null (recurring_id),
  foreign key (household_id, goal_id)
    references public.goals (household_id, id) on delete set null (goal_id),
  foreign key (household_id, related_user_id)
    references public.household_members (household_id, user_id) on delete set null (related_user_id),
  check (expiry_date is null or issue_date is null or expiry_date >= issue_date)
);
create index documents_household_idx on public.documents (household_id, is_archived, category_id);
create index documents_expiry_idx on public.documents (household_id, expiry_date) where expiry_date is not null;
create index documents_transaction_idx on public.documents (transaction_id) where transaction_id is not null;
create index documents_recurring_idx on public.documents (recurring_id) where recurring_id is not null;

-- Tags: trimmed, lower-case words; no empty strings.
create or replace function private.tg_document_tags()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select coalesce(array_agg(distinct t order by t), '{}') into new.tags
  from (select left(lower(trim(x)), 30) as t from unnest(new.tags) x) s
  where t <> '';
  if new.is_archived and new.archived_at is null then
    new.archived_at := now();
  elsif not new.is_archived then
    new.archived_at := null;
  end if;
  return new;
end;
$$;
create trigger documents_tags before insert or update on public.documents
  for each row execute function private.tg_document_tags();

create table public.document_files (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  document_id  uuid not null,
  version      integer not null check (version >= 1),
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}$'),
  file_name    text not null check (char_length(file_name) between 1 and 200),
  mime_type    text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic')),
  size_bytes   bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  sha256       text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null,
  unique (household_id, id),
  unique (document_id, version),
  foreign key (household_id, document_id) references public.documents (household_id, id) on delete cascade,
  -- The path must belong to this household and document.
  check (storage_path like household_id::text || '/' || document_id::text || '/%')
);

alter table public.documents
  add foreign key (household_id, current_file_id)
    references public.document_files (household_id, id) on delete set null (current_file_id)
    deferrable initially deferred;

-- Files are immutable once recorded (replace = a new version).
create or replace function private.tg_document_file_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Document files cannot be changed; upload a new version instead' using errcode = '42501';
end;
$$;
create trigger document_files_immutable before update on public.document_files
  for each row execute function private.tg_document_file_immutable();

-- -----------------------------------------------------------------------------
-- RLS: standard household policies + RESTRICTIVE two-factor rule for sensitive
-- documents. Auditing stores changed field names only (no values).
-- -----------------------------------------------------------------------------
select private.apply_household_rls('public.document_categories');
select private.apply_household_rls('public.documents');
select private.apply_household_rls('public.document_files');
select private.apply_audit('public.documents', true);
select private.apply_audit('public.document_files', true);

create policy documents_sensitive_requires_aal2 on public.documents as restrictive for all to authenticated
  using (not is_sensitive or (select private.has_aal2()))
  with check (not is_sensitive or (select private.has_aal2()));

-- A file is visible only when its document is (which applies the rule above).
create policy document_files_follow_document on public.document_files as restrictive for all to authenticated
  using (exists (select 1 from public.documents d where d.id = document_files.document_id))
  with check (exists (select 1 from public.documents d where d.id = document_files.document_id));

-- -----------------------------------------------------------------------------
-- Storage: private bucket and object policies
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 26214400,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Parse "{household}/{document}/{file}" safely (null for anything else).
create or replace function private.storage_path_part(p_name text, p_index integer)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}$'
      then (string_to_array(p_name, '/'))[p_index]::uuid
  end;
$$;
revoke all on function private.storage_path_part(text, integer) from public;
grant execute on function private.storage_path_part(text, integer) to authenticated, service_role;

-- Note: "name" is always qualified as objects.name — inside the subqueries an
-- unqualified name would bind to documents.name.

-- Upload: a writer may create an object only inside a document that exists in
-- their household and that they can see (so sensitive uploads need aal2).
create policy documents_bucket_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and private.storage_path_part(objects.name, 1) in (select private.writer_household_ids())
    and exists (
      select 1 from public.documents d
      where d.id = private.storage_path_part(objects.name, 2)
        and d.household_id = private.storage_path_part(objects.name, 1)
    )
  );

-- Read (download / signed URLs): the object must be a recorded file of a
-- document the caller can see — or, during upload finalisation, an object in
-- a visible document that has not been recorded yet.
create policy documents_bucket_select on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and private.storage_path_part(objects.name, 1) in (select private.member_household_ids())
    and exists (
      select 1 from public.documents d
      where d.id = private.storage_path_part(objects.name, 2)
        and d.household_id = private.storage_path_part(objects.name, 1)
    )
  );

create policy documents_bucket_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and private.storage_path_part(objects.name, 1) in (select private.writer_household_ids())
    and exists (
      select 1 from public.documents d
      where d.id = private.storage_path_part(objects.name, 2)
        and d.household_id = private.storage_path_part(objects.name, 1)
    )
  );
-- No update policy: objects are immutable.

-- -----------------------------------------------------------------------------
-- Default document categories
-- -----------------------------------------------------------------------------
create or replace function private.seed_document_categories(p_household_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.document_categories (household_id, name, system_key, sensitive_default, sort_order)
  values
    (p_household_id, 'Identification',    'identification',   true,  1),
    (p_household_id, 'Birth certificates','birth_certificates',true,  2),
    (p_household_id, 'Passports',         'passports',        true,  3),
    (p_household_id, 'Property',          'property',         false, 4),
    (p_household_id, 'Mortgage',          'mortgage',         false, 5),
    (p_household_id, 'Vehicles',          'vehicles',         false, 6),
    (p_household_id, 'Insurance',         'insurance',        false, 7),
    (p_household_id, 'Banking',           'banking',          true,  8),
    (p_household_id, 'Legal',             'legal',            true,  9),
    (p_household_id, 'Medical',           'medical',          true,  10),
    (p_household_id, 'Education',         'education',        false, 11),
    (p_household_id, 'Employment',        'employment',       false, 12),
    (p_household_id, 'Taxes',             'taxes',            true,  13),
    (p_household_id, 'Receipts',          'receipts',         false, 14),
    (p_household_id, 'Warranties',        'warranties',       false, 15),
    (p_household_id, 'Other',             'other',            false, 16)
  on conflict (household_id, name) do nothing;
$$;
revoke all on function private.seed_document_categories(uuid) from public;

create or replace function private.tg_household_document_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_document_categories(new.id);
  return null;
end;
$$;
revoke all on function private.tg_household_document_defaults() from public;
create trigger households_seed_document_categories after insert on public.households
  for each row execute function private.tg_household_document_defaults();

-- Households that already exist get the defaults too.
select private.seed_document_categories(id) from public.households;

-- -----------------------------------------------------------------------------
-- Expiry reminders join the notification generator. The title never reveals
-- the name of a sensitive document.
-- -----------------------------------------------------------------------------
create or replace function private.generate_document_notifications(p_household_id uuid, p_today date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if not exists (
    select 1 from public.household_members
    where household_id = p_household_id and user_id = auth.uid() and role in ('owner', 'adult')
  ) then
    return 0;
  end if;
  insert into public.notifications (household_id, user_id, kind, severity, title, body, link_path, dedupe_key, due_on)
  select d.household_id, m.user_id, 'document_expiry',
         case when d.expiry_date < p_today then 'warning' else 'info' end,
         case when d.is_sensitive then 'A sensitive document ' ||
                case when d.expiry_date < p_today then 'has expired' else 'expires ' || to_char(d.expiry_date, 'DD/MM/YYYY') end
              else d.name || case when d.expiry_date < p_today then ' has expired'
                                  else ' expires ' || to_char(d.expiry_date, 'DD/MM/YYYY') end
         end,
         case when d.is_sensitive then 'Verify with two-factor to see which one.' end,
         '/documents/' || d.id,
         'document:' || d.id || ':' || d.expiry_date || ':' || case when d.expiry_date < p_today then 'expired' else 'soon' end,
         d.expiry_date
  from public.documents d
  join public.household_members m on m.household_id = d.household_id and m.role <> 'viewer'
  where d.household_id = p_household_id
    and not d.is_archived
    and d.expiry_date is not null
    and d.expiry_date <= p_today + d.expiry_reminder_days
    and d.expiry_date >= p_today - 30
  on conflict (household_id, user_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function private.generate_document_notifications(uuid, date) from public;
grant execute on function private.generate_document_notifications(uuid, date) to authenticated;

create or replace function public.refresh_notifications(p_household_id uuid, p_today date)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.generate_notifications(p_household_id, p_today)
       + private.generate_document_notifications(p_household_id, p_today);
$$;
revoke all on function public.refresh_notifications from public, anon;
grant execute on function public.refresh_notifications to authenticated;
