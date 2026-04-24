-- supabase/migrations/20260424000000_add_tokens_reset_at.sql
--
-- Adds tokens_reset_at to profiles.
-- The server (verify-receipt and apple-notification) writes this timestamp
-- whenever it resets profiles.tokens to the subscription allowance (350).
-- The client reads it on launch/focus to detect renewals that happened while
-- the app was closed, without relying on server-to-server notifications alone.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tokens_reset_at TIMESTAMPTZ;
