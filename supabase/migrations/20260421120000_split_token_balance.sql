-- supabase/migrations/20260421120000_split_token_balance.sql
--
-- Splits the single `tokens` column into two purpose-specific columns:
--   subscription_tokens  — 350 granted on purchase/renewal, reset (not rolled over) each month
--   topup_tokens         — added via one-time IAP packs, never expire
--
-- The legacy `tokens` column is NOT dropped in this migration.
-- It will be deprecated in a follow-up migration after the new system is verified.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS subscription_tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS topup_tokens        integer NOT NULL DEFAULT 0;

-- One-time data migration: treat all existing token balances as non-expiring top-up tokens.
-- Conservative default — no existing user loses tokens they already have.
UPDATE profiles
SET topup_tokens = COALESCE(tokens, 0)
WHERE topup_tokens = 0 AND tokens IS NOT NULL AND tokens > 0;
