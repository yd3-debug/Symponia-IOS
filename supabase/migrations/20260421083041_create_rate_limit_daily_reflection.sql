-- Rate limiting table for daily-reflection oracle calls.
-- Tracks one row per call. The rolling 24-hour window is computed at query time.
-- Rows older than 48 hours are safe to purge by a scheduled cron (not built here).

create table if not exists rate_limit_daily_reflection (
  id          bigserial    primary key,
  user_id     uuid         not null references auth.users(id) on delete cascade,
  created_at  timestamptz  not null default now()
);

create index if not exists rate_limit_daily_reflection_user_time_idx
  on rate_limit_daily_reflection (user_id, created_at desc);

-- RLS: users never read or write this table directly; only service-role does.
alter table rate_limit_daily_reflection enable row level security;
