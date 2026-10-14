-- =============================================================================
-- Ward Family Hub — Household organisation
-- Goals, calendar, tasks, shopping lists and in-app notifications.
-- =============================================================================

create type public.priority_level as enum ('low', 'medium', 'high');
create type public.goal_status as enum ('not_started', 'in_progress', 'on_hold', 'completed', 'cancelled');
create type public.task_status as enum ('todo', 'in_progress', 'done', 'cancelled');
create type public.event_category as enum (
  'family', 'work', 'medical', 'financial', 'school', 'birthday', 'anniversary',
  'home_maintenance', 'personal', 'other'
);

-- -----------------------------------------------------------------------------
-- Goals
-- progress_source decides where "current progress" comes from:
--   manual           current_minor / current_value entered by hand
--   contributions    SUM(goal_contributions.amount_minor)
--   account_balance  balance of linked_account_id (e.g. an emergency fund)
--   debt_payoff      start_minor minus what is still owed on linked_account_id
--   milestones       completed milestones / total milestones
-- -----------------------------------------------------------------------------
create table public.goals (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references public.households (id) on delete cascade,
  name              text not null check (char_length(name) between 1 and 120),
  description       text check (char_length(description) <= 2000),
  category          text not null default 'savings' check (category in (
                      'savings', 'debt', 'purchase', 'home', 'vehicle', 'family', 'health',
                      'education', 'travel', 'career', 'net_worth', 'other')),
  progress_source   text not null default 'manual' check (progress_source in (
                      'manual', 'contributions', 'account_balance', 'debt_payoff', 'milestones')),
  target_minor      bigint check (target_minor > 0),
  target_value      numeric(14, 2) check (target_value > 0),
  unit              text check (char_length(unit) <= 30),
  start_minor       bigint not null default 0,
  current_minor     bigint not null default 0,
  current_value     numeric(14, 2) not null default 0,
  linked_account_id uuid,
  start_date        date not null default current_date,
  target_date       date,
  assigned_user_id  uuid,
  priority          public.priority_level not null default 'medium',
  status            public.goal_status not null default 'in_progress',
  completed_at      timestamptz,
  notes             text check (char_length(notes) <= 4000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references auth.users (id) on delete set null,
  updated_by        uuid references auth.users (id) on delete set null,
  unique (household_id, id),
  foreign key (household_id, linked_account_id)
    references public.financial_accounts (household_id, id) on delete set null (linked_account_id),
  foreign key (household_id, assigned_user_id)
    references public.household_members (household_id, user_id) on delete set null (assigned_user_id),
  check (target_date is null or target_date >= start_date),
  check (progress_source not in ('account_balance', 'debt_payoff') or linked_account_id is not null
         or status in ('completed', 'cancelled')),
  check (progress_source = 'milestones' or target_minor is not null or target_value is not null)
);
create index goals_household_status_idx on public.goals (household_id, status, priority);

create table public.goal_milestones (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  goal_id      uuid not null,
  title        text not null check (char_length(title) between 1 and 160),
  due_date     date,
  completed_at timestamptz,
  completed_by uuid references auth.users (id) on delete set null,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null,
  foreign key (household_id, goal_id) references public.goals (household_id, id) on delete cascade
);
create index goal_milestones_goal_idx on public.goal_milestones (goal_id, sort_order);

create table public.goal_contributions (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  goal_id        uuid not null,
  contributed_on date not null,
  amount_minor   bigint not null check (amount_minor <> 0),
  note           text check (char_length(note) <= 300),
  transaction_id uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id) on delete set null,
  updated_by     uuid references auth.users (id) on delete set null,
  foreign key (household_id, goal_id) references public.goals (household_id, id) on delete cascade,
  foreign key (household_id, transaction_id)
    references public.transactions (household_id, id) on delete set null (transaction_id)
);
create index goal_contributions_goal_idx on public.goal_contributions (goal_id, contributed_on);

-- -----------------------------------------------------------------------------
-- Calendar
-- Times are stored as instants; all-day events store local midnight of the
-- first day and of the last day. Recurring events are expanded in the app
-- (src/lib/recurrence.ts). external_* columns reserve space for a future
-- Google Calendar sync without changing the schema.
-- -----------------------------------------------------------------------------
create table public.calendar_events (
  id                   uuid primary key default gen_random_uuid(),
  household_id         uuid not null references public.households (id) on delete cascade,
  title                text not null check (char_length(title) between 1 and 160),
  description          text check (char_length(description) <= 4000),
  location             text check (char_length(location) <= 200),
  category             public.event_category not null default 'family',
  all_day              boolean not null default false,
  starts_at            timestamptz not null,
  ends_at              timestamptz not null,
  start_date           date not null,
  recurrence_frequency public.recurrence_frequency,
  recurrence_interval  smallint not null default 1 check (recurrence_interval between 1 and 24),
  recurrence_until     date,
  reminder_minutes     integer[] not null default '{}'
                         check (reminder_minutes <@ array[0, 15, 30, 60, 120, 1440, 2880, 10080]),
  is_completed         boolean not null default false,
  completed_at         timestamptz,
  external_source      text check (external_source in ('google')),
  external_id          text,
  external_etag        text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid references auth.users (id) on delete set null,
  updated_by           uuid references auth.users (id) on delete set null,
  unique (household_id, id),
  unique (household_id, external_source, external_id),
  check (ends_at >= starts_at),
  check (recurrence_until is null or recurrence_until >= start_date)
);
create index calendar_events_household_start_idx on public.calendar_events (household_id, starts_at);
create index calendar_events_recurring_idx on public.calendar_events (household_id)
  where recurrence_frequency is not null;

-- start_date is the local calendar date of starts_at in the household timezone.
create or replace function private.tg_event_local_date()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tz text;
begin
  select timezone into v_tz from public.households where id = new.household_id;
  new.start_date := (new.starts_at at time zone coalesce(v_tz, 'UTC'))::date;
  if new.is_completed and new.completed_at is null then
    new.completed_at := now();
  elsif not new.is_completed then
    new.completed_at := null;
  end if;
  return new;
end;
$$;
create trigger calendar_events_local_date before insert or update on public.calendar_events
  for each row execute function private.tg_event_local_date();

create table public.event_participants (
  household_id uuid not null references public.households (id) on delete cascade,
  event_id     uuid not null,
  user_id      uuid not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null,
  primary key (event_id, user_id),
  foreign key (household_id, event_id) references public.calendar_events (household_id, id) on delete cascade,
  foreign key (household_id, user_id) references public.household_members (household_id, user_id) on delete cascade
);

-- Completion of a single occurrence of a recurring event.
create table public.event_completions (
  household_id    uuid not null references public.households (id) on delete cascade,
  event_id        uuid not null,
  occurrence_date date not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id) on delete set null,
  updated_by      uuid references auth.users (id) on delete set null,
  primary key (event_id, occurrence_date),
  foreign key (household_id, event_id) references public.calendar_events (household_id, id) on delete cascade
);

-- -----------------------------------------------------------------------------
-- Tasks
-- -----------------------------------------------------------------------------
create table public.tasks (
  id                   uuid primary key default gen_random_uuid(),
  household_id         uuid not null references public.households (id) on delete cascade,
  title                text not null check (char_length(title) between 1 and 200),
  description          text check (char_length(description) <= 4000),
  area                 text not null default 'home' check (area in ('home', 'finance', 'family', 'errands', 'vehicle', 'garden', 'other')),
  assigned_user_id     uuid,
  due_date             date,
  priority             public.priority_level not null default 'medium',
  status               public.task_status not null default 'todo',
  recurrence_frequency public.recurrence_frequency,
  recurrence_interval  smallint not null default 1 check (recurrence_interval between 1 and 24),
  recurrence_anchor    date,
  completed_at         timestamptz,
  completed_by         uuid references auth.users (id) on delete set null,
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid references auth.users (id) on delete set null,
  updated_by           uuid references auth.users (id) on delete set null,
  unique (household_id, id),
  foreign key (household_id, assigned_user_id)
    references public.household_members (household_id, user_id) on delete set null (assigned_user_id),
  check (recurrence_frequency is null or (due_date is not null and recurrence_anchor is not null))
);
create index tasks_household_status_due_idx on public.tasks (household_id, status, due_date);

create table public.task_checklist_items (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  task_id      uuid not null,
  title        text not null check (char_length(title) between 1 and 200),
  is_done      boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null,
  foreign key (household_id, task_id) references public.tasks (household_id, id) on delete cascade
);
create index task_checklist_task_idx on public.task_checklist_items (task_id, sort_order);

create table public.task_comments (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  task_id      uuid not null,
  body         text not null check (char_length(body) between 1 and 2000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null,
  foreign key (household_id, task_id) references public.tasks (household_id, id) on delete cascade
);
create index task_comments_task_idx on public.task_comments (task_id, created_at);

create table public.task_completions (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  task_id      uuid not null,
  due_date     date,
  completed_on date not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null,
  foreign key (household_id, task_id) references public.tasks (household_id, id) on delete cascade
);
create index task_completions_task_idx on public.task_completions (task_id, completed_on desc);

-- Complete a task. Recurring tasks log the completion, move to their next due
-- date and reset their checklist; one-off tasks are marked done.
create or replace function public.complete_task(p_household_id uuid, p_task_id uuid, p_completed_on date)
returns date
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_task public.tasks;
  v_next date;
begin
  select * into v_task from public.tasks where id = p_task_id and household_id = p_household_id for update;
  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;
  if v_task.status in ('done', 'cancelled') then
    raise exception 'This task is already closed' using errcode = '22023';
  end if;

  insert into public.task_completions (household_id, task_id, due_date, completed_on)
  values (p_household_id, p_task_id, v_task.due_date, p_completed_on);

  if v_task.recurrence_frequency is not null then
    v_next := public.next_occurrence_after(
      v_task.recurrence_anchor, v_task.recurrence_frequency, v_task.recurrence_interval,
      greatest(v_task.due_date, p_completed_on));
    update public.tasks set due_date = v_next, status = 'todo' where id = p_task_id;
    update public.task_checklist_items set is_done = false where task_id = p_task_id;
    return v_next;
  end if;

  update public.tasks set status = 'done', completed_at = now(), completed_by = auth.uid() where id = p_task_id;
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Shopping lists
-- -----------------------------------------------------------------------------
create table public.shopping_lists (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  is_template  boolean not null default false,
  is_archived  boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null,
  unique (household_id, id)
);

create table public.shopping_items (
  id                    uuid primary key default gen_random_uuid(),
  household_id          uuid not null references public.households (id) on delete cascade,
  list_id               uuid not null,
  name                  text not null check (char_length(name) between 1 and 120),
  quantity              text check (char_length(quantity) <= 40),
  estimated_price_minor bigint check (estimated_price_minor >= 0),
  is_checked            boolean not null default false,
  checked_at            timestamptz,
  checked_by            uuid references auth.users (id) on delete set null,
  sort_order            integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references auth.users (id) on delete set null,
  updated_by            uuid references auth.users (id) on delete set null,
  foreign key (household_id, list_id) references public.shopping_lists (household_id, id) on delete cascade
);
create index shopping_items_list_idx on public.shopping_items (list_id, is_checked, sort_order);

create or replace function private.tg_shopping_checked()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_checked and (tg_op = 'INSERT' or not old.is_checked) then
    new.checked_at := now();
    new.checked_by := auth.uid();
  elsif not new.is_checked then
    new.checked_at := null;
    new.checked_by := null;
  end if;
  return new;
end;
$$;
create trigger shopping_items_checked before insert or update of is_checked on public.shopping_items
  for each row execute function private.tg_shopping_checked();

-- Start a new list from an existing one (e.g. the "Weekly groceries" template).
create or replace function public.copy_shopping_list(p_household_id uuid, p_list_id uuid, p_name text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_new uuid;
begin
  if not exists (select 1 from public.shopping_lists where id = p_list_id and household_id = p_household_id) then
    raise exception 'List not found' using errcode = 'P0002';
  end if;
  insert into public.shopping_lists (household_id, name) values (p_household_id, trim(p_name)) returning id into v_new;
  insert into public.shopping_items (household_id, list_id, name, quantity, estimated_price_minor, sort_order)
  select p_household_id, v_new, name, quantity, estimated_price_minor, sort_order
  from public.shopping_items where list_id = p_list_id;
  return v_new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Notifications (in-app). One row per recipient. dedupe_key makes generation
-- idempotent: re-running refresh_notifications never duplicates, and a
-- dismissed notification stays dismissed.
-- notification_preferences and notification_deliveries exist so email/push
-- channels can be added later without schema changes; nothing sends email or
-- push today.
-- -----------------------------------------------------------------------------
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null,
  kind         text not null check (kind ~ '^[a-z_]{1,40}$'),
  severity     text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  title        text not null check (char_length(title) between 1 and 200),
  body         text check (char_length(body) <= 500),
  link_path    text check (link_path ~ '^/[A-Za-z0-9/_\-?=&.%]*$'),
  dedupe_key   text not null check (char_length(dedupe_key) <= 200),
  due_on       date,
  read_at      timestamptz,
  dismissed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null,
  unique (household_id, user_id, dedupe_key),
  foreign key (household_id, user_id) references public.household_members (household_id, user_id) on delete cascade
);
create index notifications_inbox_idx on public.notifications (user_id, household_id, dismissed_at, created_at desc);

create table public.notification_preferences (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null,
  kind         text not null check (kind ~ '^[a-z_]{1,40}$'),
  in_app       boolean not null default true,
  email        boolean not null default false,
  push         boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null,
  primary key (household_id, user_id, kind),
  foreign key (household_id, user_id) references public.household_members (household_id, user_id) on delete cascade
);

create table public.notification_deliveries (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households (id) on delete cascade,
  notification_id uuid not null references public.notifications (id) on delete cascade,
  channel         text not null check (channel in ('email', 'push')),
  status          text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempted_at    timestamptz,
  error           text check (char_length(error) <= 500),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id) on delete set null,
  updated_by      uuid references auth.users (id) on delete set null
);

-- -----------------------------------------------------------------------------
-- Policies and auditing
-- -----------------------------------------------------------------------------
select private.apply_household_rls('public.goals');
select private.apply_household_rls('public.goal_milestones');
select private.apply_household_rls('public.goal_contributions');
select private.apply_household_rls('public.calendar_events');
select private.apply_household_rls('public.event_participants');
select private.apply_household_rls('public.event_completions');
select private.apply_household_rls('public.tasks');
select private.apply_household_rls('public.task_checklist_items');
select private.apply_household_rls('public.task_comments');
select private.apply_household_rls('public.task_completions');
select private.apply_household_rls('public.shopping_lists');
select private.apply_household_rls('public.shopping_items');

select private.apply_audit('public.goals');
select private.apply_audit('public.goal_contributions');
select private.apply_audit('public.calendar_events');
select private.apply_audit('public.tasks');

-- Comments can only be edited or deleted by their author.
create policy task_comments_author_update on public.task_comments as restrictive for update to authenticated
  using (created_by = (select auth.uid()));
create policy task_comments_author_delete on public.task_comments as restrictive for delete to authenticated
  using (created_by = (select auth.uid()));

-- Notifications: each member sees and manages only their own. Writers may
-- create notifications for any member of their household (the generator
-- below runs as the caller).
alter table public.notifications enable row level security;
create policy notifications_select_own on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) and household_id in (select private.member_household_ids()));
create policy notifications_insert on public.notifications for insert to authenticated
  with check (household_id in (select private.writer_household_ids())
              and private.is_household_member(household_id, user_id));
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = (select auth.uid()) and household_id in (select private.member_household_ids()))
  with check (user_id = (select auth.uid()));
create policy notifications_delete_own on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()) and household_id in (select private.member_household_ids()));
revoke all on public.notifications from anon, authenticated;
grant select, insert, delete on public.notifications to authenticated;
grant update (read_at, dismissed_at) on public.notifications to authenticated;
create trigger row_meta before insert or update on public.notifications
  for each row execute function private.tg_row_meta();

alter table public.notification_preferences enable row level security;
create policy notification_preferences_own on public.notification_preferences for all to authenticated
  using (user_id = (select auth.uid()) and household_id in (select private.member_household_ids()))
  with check (user_id = (select auth.uid()) and household_id in (select private.member_household_ids()));
revoke all on public.notification_preferences from anon, authenticated;
grant select, insert, update, delete on public.notification_preferences to authenticated;
create trigger row_meta before insert or update on public.notification_preferences
  for each row execute function private.tg_row_meta();

-- Deliveries are written only by a future server-side worker (service role).
alter table public.notification_deliveries enable row level security;
create policy notification_deliveries_select on public.notification_deliveries for select to authenticated
  using (household_id in (select private.member_household_ids()));
revoke all on public.notification_deliveries from anon, authenticated;
grant select on public.notification_deliveries to authenticated;

-- -----------------------------------------------------------------------------
-- Notification generator. Idempotent; run on page load by the app. Each
-- source is a separate statement so modules can extend it in later
-- migrations (documents, vehicles, maintenance).
-- -----------------------------------------------------------------------------
-- Generation is a system process: it writes rows for every member, including
-- ones the caller cannot read, so it runs as the owner (SECURITY DEFINER) in
-- the non-exposed private schema and is scoped to one household that the
-- caller must be a writer of. The public wrapper below is SECURITY INVOKER.
create or replace function private.generate_notifications(p_household_id uuid, p_today date)
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
  if not exists (
    select 1 from public.household_members
    where household_id = p_household_id and user_id = auth.uid() and role in ('owner', 'adult')
  ) then
    return 0; -- not a writer of this household (read-only members don't generate notifications)
  end if;

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
  on conflict (household_id, user_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  -- Tasks: due today or overdue, for the assignee (or everyone if shared).
  insert into public.notifications (household_id, user_id, kind, severity, title, link_path, dedupe_key, due_on)
  select t.household_id, m.user_id,
         case when t.due_date < p_today then 'task_overdue' else 'task_due' end,
         case when t.due_date < p_today then 'warning' else 'info' end,
         case when t.due_date < p_today then 'Overdue: ' || t.title else 'Due today: ' || t.title end,
         '/tasks/' || t.id,
         'task:' || t.id || ':' || t.due_date || ':' || case when t.due_date < p_today then 'overdue' else 'today' end,
         t.due_date
  from public.tasks t
  join public.household_members m on m.household_id = t.household_id and m.role <> 'viewer'
  where t.household_id = p_household_id
    and t.status in ('todo', 'in_progress')
    and t.due_date <= p_today
    and (t.assigned_user_id is null or t.assigned_user_id = m.user_id)
  on conflict (household_id, user_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  -- Calendar: events with reminders, from the day of their earliest reminder
  -- (e.g. "1 week before" starts 7 days ahead), for participants (or
  -- everyone when no participants are set). In-app only: reminders are
  -- day-granular until push delivery exists.
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
  on conflict (household_id, user_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  -- Goals: target date within 14 days or passed; overdue milestones.
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
    and g.target_date <= p_today + 14
    and (g.assigned_user_id is null or g.assigned_user_id = m.user_id)
  on conflict (household_id, user_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  insert into public.notifications (household_id, user_id, kind, severity, title, body, link_path, dedupe_key, due_on)
  select g.household_id, m.user_id, 'milestone_overdue', 'warning',
         'Milestone overdue: ' || ms.title, g.name, '/goals/' || g.id,
         'milestone:' || ms.id || ':' || ms.due_date, ms.due_date
  from public.goal_milestones ms
  join public.goals g on g.id = ms.goal_id
  join public.household_members m on m.household_id = g.household_id and m.role <> 'viewer'
  where g.household_id = p_household_id
    and g.status in ('not_started', 'in_progress')
    and ms.completed_at is null
    and ms.due_date < p_today
    and (g.assigned_user_id is null or g.assigned_user_id = m.user_id)
  on conflict (household_id, user_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  -- Budgets: this month's lines at 80% and at 100%.
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
  on conflict (household_id, user_id, dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  return v_count;
end;
$$;
revoke all on function private.generate_notifications(uuid, date) from public;
grant execute on function private.generate_notifications(uuid, date) to authenticated;

create or replace function public.refresh_notifications(p_household_id uuid, p_today date)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.generate_notifications(p_household_id, p_today);
$$;

revoke all on function public.complete_task from public, anon;
revoke all on function public.copy_shopping_list from public, anon;
revoke all on function public.refresh_notifications from public, anon;
grant execute on function public.complete_task to authenticated;
grant execute on function public.copy_shopping_list to authenticated;
grant execute on function public.refresh_notifications to authenticated;
