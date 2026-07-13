-- Fair-use window for subscribers. Replaces the token quota.
--
-- A subscription is now ACCESS UNTIL A DATE, not a bucket of reflections. There
-- is no quota to grant, to keep in sync across three files, or to run out of on
-- day 10 of a month someone already paid for.
--
-- This table is the only thing standing between us and abuse, and it is set high
-- enough (50 / rolling 7 days) that a person having a genuinely hard week never
-- meets it. A rolling WEEK, not a day, is deliberate: a daily cap punishes the
-- person having one difficult day, who is precisely who this app exists for.
--
-- Same shape and posture as the other two limiters already in the oracle:
-- service-role only, never read or written by the client.

create table if not exists rate_limit_reflections (
  id          bigserial    primary key,
  user_id     uuid         not null references auth.users(id) on delete cascade,
  created_at  timestamptz  not null default now()
);

create index if not exists rate_limit_reflections_user_time_idx
  on rate_limit_reflections (user_id, created_at desc);

alter table rate_limit_reflections enable row level security;

revoke all on rate_limit_reflections from anon, authenticated;

comment on table rate_limit_reflections is
  'One row per subscriber reflection. Powers the fair-use window (50 / 7 days, 15 / 5 hours) and the Usage view in Settings. Rows older than ~8 days can be purged by a cron.';
