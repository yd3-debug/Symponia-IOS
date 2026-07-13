-- Rate limit for the token-free `opening` oracle mode.
--
-- The opening archetype reading is composed server-side in the user's language
-- (English users never call this — they use the deterministic client-side
-- greeting). No token is deducted, so without a limit an authenticated client
-- could spam free inference. Same shape and posture as
-- rate_limit_daily_reflection: service-role only, never touched by the client.

create table if not exists rate_limit_opening (
  id          bigserial    primary key,
  user_id     uuid         not null references auth.users(id) on delete cascade,
  created_at  timestamptz  not null default now()
);

create index if not exists rate_limit_opening_user_time_idx
  on rate_limit_opening (user_id, created_at desc);

-- RLS on, no policies: anon/authenticated get nothing. Only service-role writes.
alter table rate_limit_opening enable row level security;

revoke all on rate_limit_opening from anon, authenticated;
