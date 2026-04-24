CREATE TABLE IF NOT EXISTS apple_webhook_log (
  id                       bigserial PRIMARY KEY,
  notification_type        text,
  subtype                  text,
  original_transaction_id  text,
  payload                  jsonb,
  processed_at             timestamptz DEFAULT now(),
  error                    text
);

CREATE INDEX IF NOT EXISTS idx_apple_webhook_log_transaction
  ON apple_webhook_log (original_transaction_id);
