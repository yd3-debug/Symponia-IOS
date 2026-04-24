-- API usage log — one row per Anthropic exchange.
-- Used for per-user cost visibility and cache-hit verification.

create table if not exists public.api_usage (
  id                           bigserial primary key,
  user_id                      uuid        not null references auth.users (id) on delete cascade,
  model                        text        not null,
  input_tokens                 integer     not null default 0,
  output_tokens                integer     not null default 0,
  cache_creation_input_tokens  integer     not null default 0,
  cache_read_input_tokens      integer     not null default 0,
  created_at                   timestamptz not null default now()
);

-- Index for per-user queries and cost roll-ups.
create index if not exists api_usage_user_id_idx on public.api_usage (user_id, created_at desc);

-- Service role inserts; users can only read their own rows.
alter table public.api_usage enable row level security;

create policy "Users can read own usage"
  on public.api_usage for select
  using (auth.uid() = user_id);

-- Inserts are done by the oracle Edge Function using the service role key,
-- which bypasses RLS — no insert policy needed for the client.
