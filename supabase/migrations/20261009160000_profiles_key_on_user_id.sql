-- Identify a profile by its account id instead of its email, so an account can
-- exist before it has an email (a silent, temporary account that is linked to
-- Apple, Google or an email address later).
-- Applied to the live database on 2026-10-09.
--
-- Safe for the shipped app: email stays UNIQUE, so its upserts with
-- onConflict 'email' keep working, and every server function already looks
-- profiles up by user_id.
--
-- Checked before applying: 9 profiles, none without a user_id, no duplicates,
-- one profile per auth user, no foreign keys pointing at profiles.
-- Checked after, inside a transaction that was rolled back: an email sign-up
-- gets a profile; two accounts with no email each get one; linking an email
-- updates the same row and keeps its data; ON CONFLICT (email) still works;
-- deleting an account removes its profile.
--
-- To undo (only possible while no profile has an empty email):
--   ALTER TABLE public.profiles ALTER COLUMN email SET NOT NULL;
--   ALTER TABLE public.profiles DROP CONSTRAINT profiles_pkey;
--   ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
--   ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY USING INDEX profiles_email_key;
--   and restore ON CONFLICT (email) in handle_new_user.

ALTER TABLE public.profiles ADD CONSTRAINT profiles_email_key UNIQUE (email);
ALTER TABLE public.profiles DROP CONSTRAINT profiles_pkey;

ALTER TABLE public.profiles ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY USING INDEX profiles_user_id_key;

ALTER TABLE public.profiles ALTER COLUMN email DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (email, user_id, topup_tokens)
  VALUES (NEW.email, NEW.id, 10)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;

-- When a temporary account is linked, or an email changes, the profile follows.
CREATE OR REPLACE FUNCTION public.handle_user_email_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    BEGIN
      UPDATE public.profiles SET email = NEW.email WHERE user_id = NEW.id;
    EXCEPTION WHEN unique_violation THEN
      -- Another profile already holds this email. Never block sign-in over it.
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.handle_user_email_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
CREATE TRIGGER on_auth_user_email_changed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_email_change();

NOTIFY pgrst, 'reload schema';
