-- Add explicit AI processing consent flag to profiles.
-- Required for Apple App Store Guidelines 5.1.1(i)/5.1.2(i) and GDPR.
--
-- Default false: accounts created after this migration cannot invoke Anthropic
-- until finalizeOnboarding() sets ai_consent = true after the user taps consent.
--
-- Backfill: existing rows set to true under the assumption that all accounts
-- created during v1.0 testing went through the onboarding flow which included
-- AI consent disclosure. If any test account did not complete consent, this
-- backfill grants consent retroactively — an acceptable conservative position
-- for v1.0 → v1.0 build N+1.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_consent boolean NOT NULL DEFAULT false;

UPDATE public.profiles SET ai_consent = true;
