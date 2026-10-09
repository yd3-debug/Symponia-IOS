-- An append-only record of what each person agreed to, in which wording.
-- Applied to the live database on 2026-10-09. Additive only.
--
-- A person can add and read their own rows. There is deliberately no UPDATE or
-- DELETE policy, so a record cannot be changed after the fact; the rows go
-- when the account is deleted (ON DELETE CASCADE).

CREATE TABLE IF NOT EXISTS public.consent_records (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('terms_age', 'not_medical', 'ai_processing', 'voice')),
  version text NOT NULL,
  accepted boolean NOT NULL,
  locale text NOT NULL,
  app_version text NOT NULL,
  -- When the person pressed the button, as their device reported it.
  accepted_at timestamptz NOT NULL,
  -- When the server received it. The two differ if consent was given before sign-in.
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consent_records_user_idx ON public.consent_records (user_id, created_at DESC);

ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insert own consent" ON public.consent_records
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "read own consent" ON public.consent_records
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

COMMENT ON TABLE public.consent_records IS
  'Append-only evidence of consent: what was agreed, in which wording version and language. No update or delete from clients.';
