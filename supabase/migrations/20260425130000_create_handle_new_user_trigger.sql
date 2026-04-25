-- Creates a trigger that inserts a minimal profiles row whenever a new user
-- signs up via any path (app onboarding, dashboard, OAuth, etc.).
-- The onboarding upsert still runs and fills in name/gender/animals/frequency;
-- this trigger is the safety net so profile rows always exist.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (email, user_id, tokens)
  VALUES (NEW.email, NEW.id, 25)
  ON CONFLICT (email) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
