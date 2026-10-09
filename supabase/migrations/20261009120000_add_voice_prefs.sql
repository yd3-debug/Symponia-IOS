-- Voice is opt-in. The server must be able to see that a person agreed before it
-- sends any reply text to the speech provider, the same way oracle already
-- refuses anyone whose ai_consent is not true.
--
-- NOT YET APPLIED to the live database. Apply with the voice session (Phase 2).
-- Additive: existing rows default to "not agreed".

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS voice_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voice_kind text CHECK (voice_kind IN ('woman', 'man'));

COMMENT ON COLUMN public.profiles.voice_enabled IS
  'True only after the person agreed on the voice consent screen. Speech is never generated for false.';
COMMENT ON COLUMN public.profiles.voice_kind IS
  'Which of the two cloud voices they chose. NULL until they choose.';
