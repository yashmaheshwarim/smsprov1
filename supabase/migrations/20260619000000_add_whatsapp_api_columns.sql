-- =========================================================================
-- WhatsApp API Keys & Session Mapping
-- =========================================================================

ALTER TABLE public.institutes 
  ADD COLUMN IF NOT EXISTS api_key TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS openwa_session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_institutes_api_key ON public.institutes(api_key);
CREATE INDEX IF NOT EXISTS idx_institutes_openwa_session ON public.institutes(openwa_session_id);

-- ==========================================
-- Message Logs Enhancements
-- ==========================================

ALTER TABLE public.message_logs 
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS message_type TEXT CHECK (message_type IN ('attendance', 'fees', 'custom')),
  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS openwa_message_id TEXT,
  ADD COLUMN IF NOT EXISTS failed_reason TEXT;

-- ==========================================
-- Rate Limiting Tracking
-- ==========================================

CREATE TABLE IF NOT EXISTS public.whatsapp_rate_limits (
  institute_id UUID PRIMARY KEY REFERENCES public.institutes(id) ON DELETE CASCADE,
  messages_sent_this_minute INTEGER DEFAULT 0,
  window_start TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON public.whatsapp_rate_limits(window_start);

-- ==========================================
-- Update message_logs status to include 'sent'
-- ==========================================

ALTER TABLE public.message_logs DROP CONSTRAINT IF EXISTS message_logs_status_check;
ALTER TABLE public.message_logs ADD CONSTRAINT message_logs_status_check 
  CHECK (status IN ('delivered', 'failed', 'pending', 'sent'));