-- =============================================================================
-- Push notifications
--
-- Each member can turn on notifications per phone (a Web Push subscription).
-- Once a day a scheduled job creates that day's reminders for every household
-- (the same rules as the in-app list) and sends what hasn't been pushed yet.
--
-- The job runs without a signed-in user and without the service-role key. It
-- holds one secret token; the two functions it can call check that token
-- (stored here only as a SHA-256 hash) and can do nothing but list today's
-- unsent reminders with their subscriptions, and record what was sent. They
-- live in their own schema, which is the only thing anonymous callers can use.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- The reminder rules, callable without a session. The original body, minus the
-- "caller must be a writer" check, which the in-app entry point keeps.
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
revoke all on function private.generate_household_notifications(uuid, date) from public;

create or replace function private.generate_notifications(p_household_id uuid, p_today date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.household_members
    where household_id = p_household_id and user_id = auth.uid() and role in ('owner', 'adult')
  ) then
    return 0; -- not a writer of this household (read-only members don't generate notifications)
  end if;
  return private.generate_household_notifications(p_household_id, p_today);
end;
$$;
revoke all on function private.generate_notifications(uuid, date) from public;
grant execute on function private.generate_notifications(uuid, date) to authenticated;

-- -----------------------------------------------------------------------------
-- Subscriptions: one per phone/browser. Each member sees and manages only theirs.
-- -----------------------------------------------------------------------------
create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null,
  endpoint     text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh       text not null check (char_length(p256dh) between 20 and 200),
  auth_secret  text not null check (char_length(auth_secret) between 8 and 100),
  user_agent   text check (char_length(user_agent) <= 300),
  last_sent_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null,
  foreign key (household_id, user_id) references public.household_members (household_id, user_id) on delete cascade
);
create index push_subscriptions_user_idx on public.push_subscriptions (household_id, user_id);

alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_own on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid()) and household_id in (select private.member_household_ids()))
  with check (user_id = (select auth.uid()) and household_id in (select private.member_household_ids()));
revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;
create trigger row_meta before insert or update on public.push_subscriptions
  for each row execute function private.tg_row_meta();

-- Saving a subscription: a phone belongs to whoever is signed in on it now, so
-- an existing row for the same endpoint (e.g. the other person used this phone
-- before) is replaced. Only someone holding the phone's endpoint can do that.
create or replace function private.save_push_subscription(
  p_household_id uuid, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or p_household_id not in (select private.member_household_ids()) then
    raise exception 'You don''t have permission to do that.' using errcode = '42501';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (household_id, user_id, endpoint, p256dh, auth_secret, user_agent)
  values (p_household_id, auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.save_push_subscription(uuid, text, text, text, text) from public;
grant execute on function private.save_push_subscription(uuid, text, text, text, text) to authenticated;

create or replace function public.save_push_subscription(
  p_household_id uuid, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.save_push_subscription(p_household_id, p_endpoint, p_p256dh, p_auth, p_user_agent);
$$;
revoke all on function public.save_push_subscription(uuid, text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(uuid, text, text, text, text) to authenticated;

-- A delivery is recorded once per notification per channel.
create unique index notification_deliveries_once on public.notification_deliveries (notification_id, channel);

-- -----------------------------------------------------------------------------
-- The daily job's two functions, gated by the token.
-- -----------------------------------------------------------------------------
create table private.push_config (
  id         boolean primary key default true check (id),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now()
);

create schema push_dispatch;
revoke all on schema push_dispatch from public;
grant usage on schema push_dispatch to anon, authenticated, service_role;

create or replace function push_dispatch.check_token(p_token text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_token is null or length(p_token) < 32 or not exists (
    select 1 from private.push_config
    where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  ) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
end;
$$;
revoke all on function push_dispatch.check_token(text) from public;

-- Create today's reminders in every household (each in its own time zone),
-- queue the ones not pushed yet for members with a subscription, and return
-- them with the subscriptions to send to. Only reminders from the last two
-- days are pushed, so turning push on doesn't replay an old backlog.
create or replace function push_dispatch.pending(p_token text)
returns table (
  delivery_id uuid, user_id uuid, endpoint text, p256dh text, auth_secret text,
  title text, body text, link_path text, severity text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  h record;
begin
  perform push_dispatch.check_token(p_token);
  for h in select id, timezone from public.households loop
    perform private.generate_household_notifications(h.id, (now() at time zone h.timezone)::date);
  end loop;

  insert into public.notification_deliveries (household_id, notification_id, channel, status)
  select n.household_id, n.id, 'push', 'pending'
  from public.notifications n
  where n.read_at is null and n.dismissed_at is null
    and n.created_at > now() - interval '2 days'
    and exists (select 1 from public.push_subscriptions s where s.user_id = n.user_id and s.household_id = n.household_id)
  on conflict (notification_id, channel) do nothing;

  return query
  select d.id, n.user_id, s.endpoint, s.p256dh, s.auth_secret, n.title, n.body, n.link_path, n.severity
  from public.notification_deliveries d
  join public.notifications n on n.id = d.notification_id
  join public.push_subscriptions s on s.user_id = n.user_id and s.household_id = n.household_id
  where d.channel = 'push' and d.status = 'pending'
    and n.read_at is null and n.dismissed_at is null
  order by n.user_id, n.severity desc, n.created_at;
end;
$$;
revoke all on function push_dispatch.pending(text) from public;
grant execute on function push_dispatch.pending(text) to anon, service_role;

-- Record the outcome: sent/failed deliveries, and subscriptions the push
-- service says are gone (the phone unsubscribed or the app was removed).
create or replace function push_dispatch.record(p_token text, p_sent uuid[], p_failed uuid[], p_gone text[], p_reached text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform push_dispatch.check_token(p_token);
  update public.notification_deliveries set status = 'sent', attempted_at = now(), error = null
   where channel = 'push' and id = any(coalesce(p_sent, '{}'));
  update public.notification_deliveries set status = 'failed', attempted_at = now(), error = 'Could not reach any device'
   where channel = 'push' and id = any(coalesce(p_failed, '{}')) and status = 'pending';
  delete from public.push_subscriptions where endpoint = any(coalesce(p_gone, '{}'));
  update public.push_subscriptions set last_sent_at = now() where endpoint = any(coalesce(p_reached, '{}'));
end;
$$;
revoke all on function push_dispatch.record(text, uuid[], uuid[], text[], text[]) from public;
grant execute on function push_dispatch.record(text, uuid[], uuid[], text[], text[]) to anon, service_role;

-- API entry points (security invoker; the token check happens inside).
create or replace function public.push_pending(p_token text)
returns table (
  delivery_id uuid, user_id uuid, endpoint text, p256dh text, auth_secret text,
  title text, body text, link_path text, severity text)
language sql
security invoker
set search_path = ''
as $$
  select * from push_dispatch.pending(p_token);
$$;
create or replace function public.push_record(p_token text, p_sent uuid[], p_failed uuid[], p_gone text[], p_reached text[])
returns void
language sql
security invoker
set search_path = ''
as $$
  select push_dispatch.record(p_token, p_sent, p_failed, p_gone, p_reached);
$$;
revoke all on function public.push_pending(text) from public;
revoke all on function public.push_record(text, uuid[], uuid[], text[], text[]) from public;
grant execute on function public.push_pending(text) to anon;
grant execute on function public.push_record(text, uuid[], uuid[], text[], text[]) to anon;

-- Set (or rotate) the job's token from the SQL editor:
--   select private.set_push_token_hash('<sha-256 hex of the token>');
create or replace function private.set_push_token_hash(p_hash text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.push_config (id, token_hash) values (true, lower(p_hash))
  on conflict (id) do update set token_hash = excluded.token_hash, updated_at = now();
$$;
revoke all on function private.set_push_token_hash(text) from public;
