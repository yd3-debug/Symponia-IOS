-- ============================================================================
-- Symponia — Security hardening for public.profiles + token RPCs
-- Safe to run on the LIVE database: does NOT break the currently-shipped app.
-- Run in Supabase → SQL Editor.
-- ============================================================================

begin;

-- ── HIGH 1: stop clients from changing token / subscription columns ─────────
-- A BEFORE UPDATE guard reverts any client-attempted change to protected
-- columns. The service_role (oracle, Apple webhooks, verify-receipt) is exempt,
-- so legitimate server-side balance updates still work. The shipped app keeps
-- writing name/gender/animals/frequency normally — only the money columns lock.
create or replace function public.profiles_guard_protected_cols()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    new.tokens                  := old.tokens;
    new.subscription_tokens     := old.subscription_tokens;
    new.topup_tokens            := old.topup_tokens;
    new.subscription_expires_at := old.subscription_expires_at;
    new.original_transaction_id := old.original_transaction_id;
    new.tokens_reset_at         := old.tokens_reset_at;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_protected_cols on public.profiles;
create trigger profiles_guard_protected_cols
  before update on public.profiles
  for each row execute function public.profiles_guard_protected_cols();

-- ── HIGH 2: lock down the token-minting RPC ─────────────────────────────────
revoke execute on function public.add_tokens(uuid, integer) from anon, authenticated, public;
revoke execute on function public.add_tokens(text, integer) from anon, authenticated, public;

-- ── MEDIUM 4: trigger function should not be callable as an RPC ─────────────
revoke execute on function public.handle_new_user() from anon, authenticated, public;

-- ── MEDIUM 3: drop over-permissive base grants to anon on profiles ──────────
-- (RLS already blocks anon; this is defense-in-depth. Authenticated keeps the
--  grants it needs; the guard trigger above neutralizes the token columns.)
revoke insert, update, delete on public.profiles from anon;

-- ── LOW 6: pin search_path on SECURITY DEFINER / helper functions ───────────
alter function public.add_tokens(uuid, integer) set search_path = '';
alter function public.add_tokens(text, integer) set search_path = '';
alter function public.set_updated_at()          set search_path = '';

commit;

-- ============================================================================
-- Manual follow-ups (cannot be done in SQL):
--
--  • LOW 7 — Enable leaked-password protection:
--      Dashboard → Authentication → Policies → turn on
--      "Check passwords against HaveIBeenPwned".
--
--  • LOW 5 — (optional) Make oracle token deduction atomic to close a small
--      race: replace the read-then-decrement with a single conditional UPDATE
--      that deducts only when balance > 0 and returns the new balance.
-- ============================================================================

-- ── Verify after running ────────────────────────────────────────────────────
-- Expect: add_tokens / handle_new_user no longer list anon|authenticated in acl,
-- and the guard trigger exists.
-- SELECT proname, proacl::text FROM pg_proc
--   WHERE proname IN ('add_tokens','handle_new_user');
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass;
