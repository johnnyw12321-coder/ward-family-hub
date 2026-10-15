-- =============================================================================
-- Wishlists: shared gift ideas
--
-- Each household member keeps a list of things they'd like; family profiles
-- without an account (e.g. a child) have lists the adults manage together.
-- Others claim items for an occasion. Two things stay secret, enforced here
-- rather than in the UI:
--   * claims on your own list are invisible to you, and
--   * "surprise" ideas someone adds to your list are invisible to you.
-- Neither table is audited: the audit log is readable by every member and
-- would give the surprises away.
-- =============================================================================

create table public.wish_items (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households (id) on delete cascade,
  -- Whose list: a member's own list, or a family profile managed by the adults.
  owner_user_id    uuid,
  family_member_id uuid,
  title            text not null check (char_length(title) between 1 and 120),
  details          text check (char_length(details) <= 1000),
  link_url         text check (char_length(link_url) <= 2000 and link_url ~* '^https?://'),
  store            text check (char_length(store) <= 160),
  price_minor      bigint check (price_minor between 0 and 100000000000),
  priority         text not null default 'like' check (priority in ('love', 'like')),
  -- Added by someone else to a member's list; hidden from that member.
  is_surprise      boolean not null default false,
  received_on      date,
  -- Removing keeps the row so anyone who already claimed it still sees it.
  removed_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references auth.users (id) on delete set null,
  updated_by       uuid references auth.users (id) on delete set null,
  unique (household_id, id),
  check ((owner_user_id is null) <> (family_member_id is null)),
  check (not is_surprise or owner_user_id is not null),
  foreign key (household_id, owner_user_id)
    references public.household_members (household_id, user_id) on delete cascade,
  foreign key (household_id, family_member_id)
    references public.family_members (household_id, id) on delete cascade
);
create index wish_items_owner_idx on public.wish_items (household_id, owner_user_id, family_member_id);

create table public.wish_claims (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households (id) on delete cascade,
  item_id          uuid not null,
  occasion         text not null default 'birthday' check (occasion in (
                     'birthday', 'christmas', 'anniversary', 'mothers_day', 'fathers_day', 'valentines', 'other')),
  status           text not null default 'planned' check (status in ('planned', 'bought', 'given')),
  price_paid_minor bigint check (price_paid_minor between 0 and 100000000000),
  note             text check (char_length(note) <= 500),
  given_on         date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- The person who claimed it (set by the row-meta trigger).
  created_by       uuid references auth.users (id) on delete set null,
  updated_by       uuid references auth.users (id) on delete set null,
  unique (item_id, created_by),
  foreign key (household_id, item_id) references public.wish_items (household_id, id) on delete cascade
);
create index wish_claims_item_idx on public.wish_claims (item_id);

select private.apply_household_rls('public.wish_items');
select private.apply_household_rls('public.wish_claims');

-- Surprises on your own list are invisible to you.
create policy wish_items_hide_surprises on public.wish_items as restrictive for select to authenticated
  using (not (is_surprise and owner_user_id = (select auth.uid())));

-- Your own list: you add and edit your items. Someone else's list: they may
-- only add (and edit) surprises. Family-profile lists are open to all writers.
create policy wish_items_who_writes on public.wish_items as restrictive for insert to authenticated
  with check (
    owner_user_id is null
    or (owner_user_id = (select auth.uid()) and not is_surprise)
    or (owner_user_id <> (select auth.uid()) and is_surprise));
create policy wish_items_who_updates on public.wish_items as restrictive for update to authenticated
  using (
    owner_user_id is null
    or (owner_user_id = (select auth.uid()) and not is_surprise)
    or (owner_user_id <> (select auth.uid()) and is_surprise))
  with check (
    owner_user_id is null
    or (owner_user_id = (select auth.uid()) and not is_surprise)
    or (owner_user_id <> (select auth.uid()) and is_surprise));
create policy wish_items_who_deletes on public.wish_items as restrictive for delete to authenticated
  using (
    owner_user_id is null
    or (owner_user_id = (select auth.uid()) and not is_surprise)
    or (owner_user_id <> (select auth.uid()) and is_surprise));

-- Every item on the caller's own list, surprises included. It must bypass
-- RLS: through RLS a surprise is invisible to its owner, so claims on it would
-- slip past the policy below and give the surprise away.
create or replace function private.own_wish_item_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.wish_items where owner_user_id = auth.uid();
$$;
revoke all on function private.own_wish_item_ids() from public;
grant execute on function private.own_wish_item_ids() to authenticated, service_role;

-- Claims on your own list are invisible to you, and you can't claim from it.
create policy wish_claims_not_on_own_list on public.wish_claims as restrictive for all to authenticated
  using (item_id not in (select private.own_wish_item_ids()))
  with check (item_id not in (select private.own_wish_item_ids()));

-- Only the person who claimed something can change or drop the claim.
create policy wish_claims_own_update on public.wish_claims as restrictive for update to authenticated
  using (created_by = (select auth.uid()));
create policy wish_claims_own_delete on public.wish_claims as restrictive for delete to authenticated
  using (created_by = (select auth.uid()));
