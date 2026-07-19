-- ─── Device Tokens for Push Notifications ─────────────────────────────────
-- Stores Expo push tokens for each user device so we can send push
-- notifications when an admin creates an in-app notification.

CREATE TABLE IF NOT EXISTS public.device_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  institute_id  UUID,                              -- scopes pushes to the correct institute
  token         TEXT NOT NULL UNIQUE,
  platform      TEXT NOT NULL DEFAULT '',           -- 'ios' | 'android'
  device_model  TEXT NOT NULL DEFAULT '',
  os_version    TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Speed up lookups of tokens by user
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON public.device_tokens (user_id);

-- Speed up lookups of tokens by user + platform (for targeted sends)
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_platform ON public.device_tokens (user_id, platform);

-- Speed up lookups by institute_id (used in Edge Function to scope pushes)
CREATE INDEX IF NOT EXISTS idx_device_tokens_institute_id ON public.device_tokens (institute_id);

-- Enable Row-Level Security
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- Users can read/update only their own tokens
CREATE POLICY "Users can manage their own device tokens"
  ON public.device_tokens
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Allow unauthenticated inserts/updates (for users who don't use Supabase Auth)
CREATE POLICY "Allow token upsert without auth"
  ON public.device_tokens
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow token update without auth"
  ON public.device_tokens
  FOR UPDATE
  USING (true);

CREATE POLICY "Allow token delete without auth"
  ON public.device_tokens
  FOR DELETE
  USING (true);

-- Auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION update_device_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_device_tokens_updated_at ON public.device_tokens;
CREATE TRIGGER trg_device_tokens_updated_at
  BEFORE UPDATE ON public.device_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_device_tokens_updated_at();
