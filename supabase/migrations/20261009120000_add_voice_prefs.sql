-- Voice: consent, usage metering and a one-time self-test.
-- Applied to the live database on 2026-10-09. Additive only.

-- 1. Consent and choice. Voice is opt-in: the speak function refuses anyone
--    whose voice_enabled is not true, the same way oracle refuses anyone whose
--    ai_consent is not true. Existing rows default to "not agreed".
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS voice_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voice_kind text CHECK (voice_kind IN ('woman', 'man'));

COMMENT ON COLUMN public.profiles.voice_enabled IS
  'True only after the person agreed on the voice consent screen. Speech is never generated for false.';
COMMENT ON COLUMN public.profiles.voice_kind IS
  'Which of the two cloud voices they chose. NULL until they choose.';

-- 2. Metering. One row per spoken reply, holding only its length. The speak
--    function sums these to enforce the per-person cap. No text is stored.
CREATE TABLE IF NOT EXISTS public.voice_usage (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  characters integer NOT NULL CHECK (characters > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS voice_usage_user_created_idx ON public.voice_usage (user_id, created_at DESC);
ALTER TABLE public.voice_usage ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.voice_usage IS
  'Length of each spoken reply, for the per-person voice cap. Service role only: RLS is on with no policies.';

-- 3. Self-test. A token placed here by a database admin lets the speak function
--    check, once, that the speech provider key and both voices work, without a
--    user session. Single use, short-lived, returns status codes only.
CREATE TABLE IF NOT EXISTS public.voice_selftest_tokens (
  token text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
ALTER TABLE public.voice_selftest_tokens ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.voice_selftest_tokens IS
  'One-time tokens for the speak function self-test. Service role only: RLS is on with no policies.';
