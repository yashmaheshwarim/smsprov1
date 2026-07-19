-- ─── Add institute_id to device_tokens (if not already present) ──────────
-- This handles the case where the table was created without this column,
-- so the mobile app's push notification registration doesn't fail with
-- "Could not find the 'institute_id' column of 'device_tokens'".

ALTER TABLE IF EXISTS public.device_tokens
  ADD COLUMN IF NOT EXISTS institute_id UUID;

CREATE INDEX IF NOT EXISTS idx_device_tokens_institute_id
  ON public.device_tokens (institute_id);
