-- Set trial to 10 topup_tokens (oracle-readable column) instead of 25 legacy tokens.
-- Apply directly in Supabase SQL editor — do not use supabase db push.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (email, user_id, topup_tokens)
  VALUES (NEW.email, NEW.id, 10)
  ON CONFLICT (email) DO NOTHING;
  RETURN NEW;
END;
$$;
