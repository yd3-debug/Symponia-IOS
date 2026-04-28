-- Audit log for account deletion requests.
-- user_id is intentionally NOT a FK to auth.users — this record must survive
-- after the user is deleted, to provide an accountability trail and to support
-- the per-user rate limit check in the delete-account edge function.
-- RLS: enabled with no client policies — service role access only.

CREATE TABLE IF NOT EXISTS public.account_deletion_log (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL,
  email                 text,
  deleted_at            timestamptz NOT NULL DEFAULT now(),
  request_ip            text,
  user_agent            text,
  confirmation_received boolean     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_account_deletion_log_user_time
  ON public.account_deletion_log (user_id, deleted_at DESC);

ALTER TABLE public.account_deletion_log ENABLE ROW LEVEL SECURITY;
-- No SELECT/INSERT/UPDATE/DELETE policies — service role only.
