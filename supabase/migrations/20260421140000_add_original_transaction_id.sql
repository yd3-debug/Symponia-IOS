ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS original_transaction_id text;

CREATE INDEX IF NOT EXISTS idx_profiles_original_transaction_id
  ON profiles (original_transaction_id);
