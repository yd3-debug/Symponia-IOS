-- A ceiling on temporary (anonymous) accounts.
-- Applied to the live database on 2026-10-09.
--
-- Each temporary account carries free trial messages that cost real money, and
-- anyone holding the app's public key can ask for one. Supabase already limits
-- them per IP address per hour (30); this adds a limit on the total per day,
-- across all addresses, so a distributed script cannot run up a bill overnight.
--
-- The number lives in a table so it can be raised as the app grows:
--   UPDATE public.app_limits SET value = 500, updated_at = now()
--   WHERE key = 'anon_accounts_per_day';
-- When the ceiling is reached, new temporary accounts are refused and the app
-- must fall back to ordinary sign-in. Sign-ups with email, Apple or Google are
-- never affected.
--
-- Tested in a rolled-back transaction with the ceiling at 2: accounts 1 and 2
-- were created, 3 and 4 refused, and an email sign-up still succeeded.

CREATE TABLE IF NOT EXISTS public.app_limits (
  key text PRIMARY KEY,
  value integer NOT NULL CHECK (value >= 0),
  note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_limits ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.app_limits IS
  'Operational ceilings read by database functions. Service role only: RLS is on with no policies.';

INSERT INTO public.app_limits (key, value, note)
VALUES ('anon_accounts_per_day', 50, 'Temporary accounts that may be created in any rolling 24 hours. Raise before marketing pushes.')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ceiling integer;
  recent integer;
BEGIN
  IF NEW.is_anonymous IS TRUE THEN
    SELECT value INTO ceiling FROM public.app_limits WHERE key = 'anon_accounts_per_day';
    IF ceiling IS NOT NULL THEN
      -- This row is already in the table (AFTER INSERT), so it counts itself.
      SELECT count(*) INTO recent
      FROM auth.users
      WHERE is_anonymous IS TRUE AND created_at > now() - interval '24 hours';
      IF recent > ceiling THEN
        RAISE EXCEPTION 'Temporary accounts are paused for today' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.profiles (email, user_id, topup_tokens)
  VALUES (NEW.email, NEW.id, 10)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;
