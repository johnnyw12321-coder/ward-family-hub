-- =============================================================================
-- Editable reminders
--
-- Every reminder (bill, task, event, goal, milestone, budget, document,
-- vehicle date, maintenance, warranty, family date) can be adjusted from its
-- notification: how early it starts, turned off, or snoozed. Settings are per
-- item and shared by the household, like the items themselves.
--
-- Bills, events and documents already store how early to remind
-- (reminder_days_before, reminder_minutes, expiry_reminder_days), so changing
-- the timing updates those fields and the item's own form stays accurate.
-- Everything else keeps its timing here. "Off" and "snooze" live here for all.
--
-- A changed setting clears that item's current notifications (for everyone),
-- so the next refresh recreates them under the new rule — or not at all while
-- it's off or snoozed.
-- =============================================================================

create table public.reminder_settings (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  source        text not null check (source in (
                  'bill', 'task', 'event', 'goal', 'milestone', 'budget',
                  'document', 'vehicle', 'maintenance', 'warranty', 'family')),
  item_id       uuid not null,
  lead_days     smallint check (lead_days between 0 and 60),
  muted         boolean not null default false,
  snoozed_until date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id) on delete set null,
  updated_by    uuid references auth.users (id) on delete set null,
  unique (household_id, source, item_id)
);
select private.apply_household_rls('public.reminder_settings');
select private.apply_audit('public.reminder_settings');

-- -----------------------------------------------------------------------------
-- Lookups used by the generators (which run as SECURITY DEFINER).
-- -----------------------------------------------------------------------------
create or replace function private.reminder_on(p_household_id uuid, p_source text, p_item_id uuid, p_today date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select not exists (
    select 1 from public.reminder_settings s
    where s.household_id = p_household_id and s.source = p_source and s.item_id = p_item_id
      and (s.muted or s.snoozed_until > p_today)
  );
$$;

create or replace function private.reminder_lead(p_household_id uuid, p_source text, p_item_id uuid, p_default integer)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select s.lead_days from public.reminder_settings s
     where s.household_id = p_household_id and s.source = p_source and s.item_id = p_item_id),
    p_default);
$$;
revoke all on function private.reminder_on(uuid, text, uuid, date) from public;
revoke all on function private.reminder_lead(uuid, text, uuid, integer) from public;

-- -----------------------------------------------------------------------------
-- Household reminders (also used by the daily push job). Same rules as before,
-- plus: off/snoozed items are skipped, and tasks, goals and milestones can
-- start earlier than their defaults.
-- -----------------------------------------------------------------------------
create or replace function private.generate_household_notifications(p_household_id uuid, p_today date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_n integer;
  v_month date := date_trunc('month', p_today)::date;
begin
  -- Bills: due within their reminder window, and overdue.
  insert into public.notifications (household_id, user_id, kind, severity, title, body, link_path, dedupe_key, due_on)
  select r.household_id, m.user_id,
         case when r.next_due_date < p_today then 'bill_overdue' else 'bill_due' end,
         case when r.next_due_date < p_today then 'critical' else 'warning' end,
         case when r.next_due_date < p_today then r.name || ' is overdue'
              when r.next_due_date = p_today then r.name || ' is due today'
              else r.name || ' is due ' || to_char(r.next_due_date, 'DD/MM/YYYY') end,
         'Mark it paid once it has gone through.',
         '/finances/bills/' || r.id,
         'bill:' || r.id || ':' || r.next_due_date || ':' || case when r.next_due_date < p_today then 'overdue' else 'due' end,
         r.next_due_date
  from public.recurring_items r
  join public.household_members m on m.household_id = r.household_id and m.role <> 'viewer'
  where r.household_id = p_household_id
    and r.direction = 'bill'
    and r.is_active
    and r.next_due_date <= p_today + r.reminder_days_before
    and (r.person_user_id is null or r.person_user_id = m.user_id)
    and private.reminder_on(r.household_id, 'bill', r.id, p_today)
  on conflict (household_id, user_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  -- Tasks: on the due date by default (or N days before), and when overdue,
  -- for the assignee (or everyone if shared).
  insert into public.notifications (household_id, user_id, kind, severity, title, link_path, dedupe_key, due_on)
  select t.household_id, m.user_id,
         case when t.due_date < p_today then 'task_overdue' else 'task_due' end,
         case when t.due_date < p_today then 'warning' else 'info' end,
         case when t.due_date < p_today then 'Overdue: '
              when t.due_date = p_today then 'Due today: '
              else 'Due ' || to_char(t.due_date, 'DD/MM') || ': ' end || t.title,
         '/tasks/' || t.id,
         'task:' || t.id || ':' || t.due_date || ':' ||
           case when t.due_date < p_today then 'overdue' when t.due_date = p_today then 'today' else 'soon' end,
         t.due_date
  from public.tasks t
  join public.household_members m on m.household_id = t.household_id and m.role <> 'viewer'
  where t.household_id = p_household_id
    and t.status in ('todo', 'in_progress')
    and t.due_date <= p_today + private.reminder_lead(t.household_id, 'task', t.id, 0)
    and (t.assigned_user_id is null or t.assigned_user_id = m.user_id)
    and private.reminder_on(t.household_id, 'task', t.id, p_today)
  on conflict (household_id, user_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  -- Calendar: events with reminders, from the day of their earliest reminder
  -- (e.g. "1 week before" starts 7 days ahead), for participants (or
  -- everyone when no participants are set).
  insert into public.notifications (household_id, user_id, kind, severity, title, link_path, dedupe_key, due_on)
  select e.household_id, m.user_id, 'event_upcoming', 'info',
         case when o.d = p_today then 'Today: '
              when o.d = p_today + 1 then 'Tomorrow: '
              else to_char(o.d, 'DD/MM') || ': ' end || e.title,
         '/calendar?date=' || o.d,
         'event:' || e.id || ':' || o.d,
         o.d
  from public.calendar_events e
  cross join lateral (
    select case
      when e.recurrence_frequency is null then e.start_date
      else public.next_occurrence_after(e.start_date, e.recurrence_frequency, e.recurrence_interval, p_today - 1)
    end as d
  ) o
  join public.household_members m on m.household_id = e.household_id and m.role <> 'viewer'
  where e.household_id = p_household_id
    and not e.is_completed
    and cardinality(e.reminder_minutes) > 0
    and o.d between p_today and p_today + ceil((select max(x) from unnest(e.reminder_minutes) x) / 1440.0)::integer
    and (e.recurrence_until is null or o.d <= e.recurrence_until)
    and (not exists (select 1 from public.event_participants p where p.event_id = e.id)
         or exists (select 1 from public.event_participants p where p.event_id = e.id and p.user_id = m.user_id))
    and private.reminder_on(e.household_id, 'event', e.id, p_today)
  on conflict (household_id, user_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  -- Goals: target date within 14 days (or the chosen lead) or passed.
  insert into public.notifications (household_id, user_id, kind, severity, title, link_path, dedupe_key, due_on)
  select g.household_id, m.user_id, 'goal_deadline',
         case when g.target_date < p_today then 'warning' else 'info' end,
         case when g.target_date < p_today then 'Goal past its target date: ' || g.name
              else 'Goal deadline approaching: ' || g.name end,
         '/goals/' || g.id,
         'goal:' || g.id || ':' || g.target_date || ':' || case when g.target_date < p_today then 'past' else 'soon' end,
         g.target_date
  from public.goals g
  join public.household_members m on m.household_id = g.household_id and m.role <> 'viewer'
  where g.household_id = p_household_id
    and g.status in ('not_started', 'in_progress')
    and g.target_date <= p_today + private.reminder_lead(g.household_id, 'goal', g.id, 14)
    and (g.assigned_user_id is null or g.assigned_user_id = m.user_id)
    and private.reminder_on(g.household_id, 'goal', g.id, p_today)
  on conflict (household_id, user_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  -- Milestones: once overdue by default, or from N days before.
  insert into public.notifications (household_id, user_id, kind, severity, title, body, link_path, dedupe_key, due_on)
  select g.household_id, m.user_id,
         case when ms.due_date < p_today then 'milestone_overdue' else 'milestone_due' end,
         case when ms.due_date < p_today then 'warning' else 'info' end,
         case when ms.due_date < p_today then 'Milestone overdue: ' else 'Milestone due ' || to_char(ms.due_date, 'DD/MM') || ': ' end || ms.title,
         g.name, '/goals/' || g.id,
         'milestone:' || ms.id || ':' || ms.due_date || case when ms.due_date < p_today then '' else ':soon' end,
         ms.due_date
  from public.goal_milestones ms
  join public.goals g on g.id = ms.goal_id
  join public.household_members m on m.household_id = g.household_id and m.role <> 'viewer'
  where g.household_id = p_household_id
    and g.status in ('not_started', 'in_progress')
    and ms.completed_at is null
    and ms.due_date <= p_today + private.reminder_lead(g.household_id, 'milestone', ms.id, -1)
    and (g.assigned_user_id is null or g.assigned_user_id = m.user_id)
    and private.reminder_on(g.household_id, 'milestone', ms.id, p_today)
  on conflict (household_id, user_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  -- Budgets: this month's lines at 80% and at 100% (settings are per category).
  insert into public.notifications (household_id, user_id, kind, severity, title, link_path, dedupe_key)
  select p_household_id, m.user_id, 'budget_threshold',
         case when b.spent_minor > b.allocated_minor + b.carried_in_minor then 'critical' else 'warning' end,
         case when b.spent_minor > b.allocated_minor + b.carried_in_minor then b.category_name || ' is over budget'
              else b.category_name || ' has used 80% of its budget' end,
         '/finances/budgets',
         'budget:' || b.allocation_id || ':' || v_month || ':' ||
           case when b.spent_minor > b.allocated_minor + b.carried_in_minor then '100' else '80' end
  from public.budget_progress(p_household_id, v_month) b
  join public.household_members m on m.household_id = p_household_id and m.role <> 'viewer'
  where b.allocation_id is not null
    and b.allocated_minor + b.carried_in_minor > 0
    and b.spent_minor * 100 >= (b.allocated_minor + b.carried_in_minor) * 80
    and private.reminder_on(p_household_id, 'budget', b.category_id, p_today)
  on conflict (household_id, user_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  return v_count;
end;
$$;
revoke all on function private.generate_household_notifications(uuid, date) from public;

-- -----------------------------------------------------------------------------
-- Documents: expiry reminders (timing stays on the document).
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
    and private.reminder_on(d.household_id, 'document', d.id, p_today)
  on conflict (household_id, user_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function private.generate_document_notifications(uuid, date) from public;
grant execute on function private.generate_document_notifications(uuid, date) to authenticated;

-- -----------------------------------------------------------------------------
-- Vehicles, maintenance, warranties and family dates, with adjustable leads
-- (defaults as before: 30, 14, 30 and 7 days).
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

  -- Vehicle service, insurance and registration dates (one setting per vehicle).
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
    and d.due is not null
    and d.due between p_today - 14 and p_today + private.reminder_lead(a.household_id, 'vehicle', a.id, 30)
    and private.reminder_on(a.household_id, 'vehicle', a.id, p_today)
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
    and r.next_due_date between p_today - 14 and p_today + private.reminder_lead(r.household_id, 'maintenance', r.id, 14)
    and not exists (
      select 1 from public.asset_records later
      where later.asset_id = r.asset_id and later.kind = r.kind and later.performed_on > r.performed_on
    )
    and private.reminder_on(r.household_id, 'maintenance', r.id, p_today)
  on conflict (household_id, user_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  -- Warranties ending soon.
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
    and i.warranty_expires_on between p_today and p_today + private.reminder_lead(i.household_id, 'warranty', i.id, 30)
    and private.reminder_on(i.household_id, 'warranty', i.id, p_today)
  on conflict (household_id, user_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  -- Birthdays (from date of birth) and annual family dates.
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
  where x.next_date between p_today and p_today + private.reminder_lead(x.household_id, 'family', x.source_id, 7)
    and private.reminder_on(x.household_id, 'family', x.source_id, p_today)
  on conflict (household_id, user_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  return v_count;
end;
$$;
revoke all on function private.generate_asset_family_notifications(uuid, date) from public;
grant execute on function private.generate_asset_family_notifications(uuid, date) to authenticated;

-- -----------------------------------------------------------------------------
-- Clearing an item's notifications (for every member) after its setting
-- changes. SECURITY DEFINER because other members' notifications aren't
-- visible to the caller; it only ever touches one household's rows for one
-- item, and only for a writer of that household.
-- -----------------------------------------------------------------------------
create or replace function private.clear_reminder_notifications(p_household_id uuid, p_source text, p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_household_id not in (select private.writer_household_ids()) then
    raise exception 'You don''t have permission to do that.' using errcode = '42501';
  end if;
  if p_source = 'budget' then
    -- Budget notifications are keyed by the month's allocation; settings by category.
    delete from public.notifications n
    where n.household_id = p_household_id
      and n.dedupe_key like 'budget:%'
      and split_part(n.dedupe_key, ':', 2) in (
        select a.id::text from public.budget_allocations a
        where a.household_id = p_household_id and a.category_id = p_item_id);
  else
    delete from public.notifications n
    where n.household_id = p_household_id
      and n.dedupe_key like p_source || ':' || p_item_id || ':%';
  end if;
end;
$$;
revoke all on function private.clear_reminder_notifications(uuid, text, uuid) from public;
grant execute on function private.clear_reminder_notifications(uuid, text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Change an item's reminder. SECURITY INVOKER: the item and setting writes go
-- through the normal household policies (writers only).
--   p_lead_days: days before to start reminding (null = keep the default)
--   p_muted:     true = no reminders for this item
--   p_snoozed_until: no reminders before this date (null = not snoozed)
-- -----------------------------------------------------------------------------
create or replace function public.set_reminder(
  p_household_id uuid, p_source text, p_item_id uuid, p_lead_days integer, p_muted boolean, p_snoozed_until date)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_found boolean;
begin
  if p_household_id not in (select private.writer_household_ids()) then
    raise exception 'You don''t have permission to do that.' using errcode = '42501';
  end if;
  if p_lead_days is not null and (p_lead_days < 0 or p_lead_days > 60) then
    raise exception 'Choose up to 60 days ahead.' using errcode = '22023';
  end if;

  -- The item must exist in this household; timing for bills, events and
  -- documents is stored on the item itself.
  case p_source
    when 'bill' then
      update public.recurring_items set reminder_days_before = coalesce(p_lead_days, reminder_days_before)
      where household_id = p_household_id and id = p_item_id;
      v_found := found;
    when 'event' then
      if p_lead_days is not null and p_lead_days not in (0, 1, 2, 7) then
        raise exception 'Events can remind on the day, 1 or 2 days before, or a week before.' using errcode = '22023';
      end if;
      update public.calendar_events
      set reminder_minutes = case when p_lead_days is null then reminder_minutes else array[p_lead_days * 1440] end
      where household_id = p_household_id and id = p_item_id;
      v_found := found;
    when 'document' then
      update public.documents set expiry_reminder_days = coalesce(p_lead_days, expiry_reminder_days)
      where household_id = p_household_id and id = p_item_id;
      v_found := found;
    when 'task' then
      v_found := exists (select 1 from public.tasks where household_id = p_household_id and id = p_item_id);
    when 'goal' then
      v_found := exists (select 1 from public.goals where household_id = p_household_id and id = p_item_id);
    when 'milestone' then
      v_found := exists (select 1 from public.goal_milestones where household_id = p_household_id and id = p_item_id);
    when 'budget' then
      v_found := exists (select 1 from public.transaction_categories where household_id = p_household_id and id = p_item_id);
    when 'vehicle' then
      v_found := exists (select 1 from public.assets where household_id = p_household_id and id = p_item_id);
    when 'maintenance' then
      v_found := exists (select 1 from public.asset_records where household_id = p_household_id and id = p_item_id);
    when 'warranty' then
      v_found := exists (select 1 from public.asset_items where household_id = p_household_id and id = p_item_id);
    when 'family' then
      v_found := exists (select 1 from public.family_members where household_id = p_household_id and id = p_item_id)
              or exists (select 1 from public.family_dates where household_id = p_household_id and id = p_item_id);
    else
      raise exception 'Unknown kind of reminder.' using errcode = '22023';
  end case;
  if not v_found then
    raise exception 'That item no longer exists.' using errcode = 'P0002';
  end if;

  insert into public.reminder_settings (household_id, source, item_id, lead_days, muted, snoozed_until)
  values (
    p_household_id, p_source, p_item_id,
    case when p_source in ('bill', 'event', 'document', 'budget') then null else p_lead_days end,
    coalesce(p_muted, false), p_snoozed_until)
  on conflict (household_id, source, item_id) do update
    set lead_days = case when excluded.source in ('bill', 'event', 'document', 'budget') then null
                         else excluded.lead_days end,
        muted = excluded.muted,
        snoozed_until = excluded.snoozed_until;

  perform private.clear_reminder_notifications(p_household_id, p_source, p_item_id);
end;
$$;
revoke all on function public.set_reminder(uuid, text, uuid, integer, boolean, date) from public, anon;
grant execute on function public.set_reminder(uuid, text, uuid, integer, boolean, date) to authenticated;
