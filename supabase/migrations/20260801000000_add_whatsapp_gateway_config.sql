-- ==========================================
-- Serverless WhatsApp Gateway Config
-- Migration: 20260801000000_add_whatsapp_gateway_config.sql
-- ==========================================
--
-- Stores the *persistent* WhatsApp gateway (OpenWA / Baileys server) endpoint
-- for each institute. The browser never needs to know the gateway URL or API
-- key in serverless mode — the Supabase Edge Function "whatsapp-gateway" reads
-- this table (falling back to env vars) and proxies all calls.
--
-- Columns:
--   base_url     – the persistent gateway origin, e.g. https://your-openwa.up.railway.app
--   api_key      – OpenWA API key (ignored for Baileys gateways)
--   server_type  – 'baileys' | 'openwa' (drives the proxy path + auth headers)
--   session_id   – cached OpenWA session id for this institute (created lazily)
--
-- NOTE: RLS is ENABLED with NO policies on purpose. This table holds the
-- gateway URL + plaintext OpenWA API key, so it must NOT be readable/writable
-- by the anon/authenticated roles (the browser never talks to it directly).
-- Only the Edge Function's service-role client (which bypasses RLS) can
-- read/write it.

CREATE TABLE IF NOT EXISTS public.whatsapp_gateway_config (
  institute_id UUID PRIMARY KEY REFERENCES public.institutes(id) ON DELETE CASCADE,
  base_url     TEXT NOT NULL DEFAULT '',
  api_key      TEXT NOT NULL DEFAULT '',
  server_type  TEXT NOT NULL DEFAULT 'baileys' CHECK (server_type IN ('baileys', 'openwa')),
  session_id   TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Speed up lookups by gateway type (used by the edge function fallback logic)
CREATE INDEX IF NOT EXISTS idx_whatsapp_gateway_config_server_type
  ON public.whatsapp_gateway_config (server_type);

-- Deny all direct access; only the service-role key (Edge Function) bypasses RLS.
ALTER TABLE public.whatsapp_gateway_config ENABLE ROW LEVEL SECURITY;
