-- =============================================================================
-- Logging reminders: an evening "anything to log today?" nudge and a Sunday
-- money check-in, each opt-in per person (notification_preferences.push for
-- kinds 'daily_log' and 'weekly_checkin').
--
-- They aren't reminders about a record, so they don't create notifications;
-- they're sent straight to phones. The evening nudge is skipped for anyone who
-- has already recorded a transaction that day. Each is sent at most once per
-- person per day (private.push_nudges), even if the job runs twice.
-- =============================================================================

create table private.push_nudges (
  user_id uuid not null,
  kind    text not null,
  on_date date not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, on_date)
);
alter table private.push_nudges enable row level security;

create or replace function push_dispatch.nudges(p_token text, p_kind text)
returns table (user_id uuid, endpoint text, p256dh text, auth_secret text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform push_dispatch.check_token(p_token);
  if p_kind not in ('daily_log', 'weekly_checkin') then
    raise exception 'Unknown reminder' using errcode = '22023';
  end if;

  return query
  with due as (
    select p.user_id, (now() at time zone h.timezone)::date as local_day
    from public.notification_preferences p
    join public.households h on h.id = p.household_id
    join public.household_members m on m.household_id = p.household_id and m.user_id = p.user_id
    where p.kind = p_kind and p.push
      -- The check-in goes out on Sundays in the household's own time zone.
      and (p_kind <> 'weekly_checkin' or extract(dow from (now() at time zone h.timezone)) = 0)
      -- No nudge for anyone who already logged something today.
      and (p_kind <> 'daily_log' or not exists (
            select 1 from public.transactions t
            where t.household_id = p.household_id
              and t.created_by = p.user_id
              and (t.created_at at time zone h.timezone)::date = (now() at time zone h.timezone)::date))
  ),
  fresh as (
    insert into private.push_nudges (user_id, kind, on_date)
    select d.user_id, p_kind, d.local_day from due d
    on conflict do nothing
    returning private.push_nudges.user_id
  )
  select s.user_id, s.endpoint, s.p256dh, s.auth_secret
  from fresh f
  join public.push_subscriptions s on s.user_id = f.user_id;
end;
$$;
revoke all on function push_dispatch.nudges(text, text) from public;
grant execute on function push_dispatch.nudges(text, text) to anon, service_role;

create or replace function public.push_nudges(p_token text, p_kind text)
returns table (user_id uuid, endpoint text, p256dh text, auth_secret text)
language sql
security invoker
set search_path = ''
as $$
  select * from push_dispatch.nudges(p_token, p_kind);
$$;
revoke all on function public.push_nudges(text, text) from public;
grant execute on function public.push_nudges(text, text) to anon;
