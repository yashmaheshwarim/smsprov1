-- ==========================================
-- Events Table (Academic Calendar)
-- Created for the Mobile App CalendarScreen
-- ==========================================

CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    date DATE NOT NULL,
    type TEXT NOT NULL DEFAULT 'event' CHECK (type IN ('event', 'holiday', 'exam', 'parent_meeting')),
    time TEXT,
    location TEXT,
    comments TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_events_institute_id ON public.events(institute_id);
CREATE INDEX IF NOT EXISTS idx_events_date ON public.events(institute_id, date);

-- Enable RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow all operations for now (dev-friendly)
DROP POLICY IF EXISTS "Public access policy" ON public.events;
CREATE POLICY "Public access policy" ON public.events
    FOR ALL
    USING (true);

-- ==========================================
-- Institute Config Table (Settings per institute)
-- Used by WhatsAppScreen, settings, etc.
-- ==========================================

CREATE TABLE IF NOT EXISTS public.institute_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    config_key TEXT NOT NULL,
    config_value JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    UNIQUE(institute_id, config_key)
);

CREATE INDEX IF NOT EXISTS idx_institute_config_institute_id ON public.institute_config(institute_id);

-- Enable RLS
ALTER TABLE public.institute_config ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow all operations for now (dev-friendly)
DROP POLICY IF EXISTS "Public access policy" ON public.institute_config;
CREATE POLICY "Public access policy" ON public.institute_config
    FOR ALL
    USING (true);

-- ==========================================
-- Seed default config values for existing institutes
-- (whatsapp_connected, sms_settings, notification_prefs)
-- ==========================================

INSERT INTO public.institute_config (institute_id, config_key, config_value)
SELECT 
    id as institute_id,
    'whatsapp_settings' as config_key,
    jsonb_build_object(
        'whatsapp_connected', false,
        'auto_absent_alerts', true,
        'auto_fee_reminders', false,
        'broadcast_enabled', true
    ) as config_value
FROM public.institutes
WHERE NOT EXISTS (
    SELECT 1 FROM public.institute_config 
    WHERE institute_config.institute_id = institutes.id 
    AND institute_config.config_key = 'whatsapp_settings'
);

-- ==========================================
-- Refresh schema cache
-- ==========================================

SELECT pg_notify('pgrst', 'reload schema');

-- ==========================================
-- USAGE NOTES:
-- ==========================================
--
-- 1. After applying this migration, refresh the schema cache in Supabase Dashboard:
--    Go to Database → Tables → click "..." → "Refresh schema cache"
--
-- 2. The events table supports these types:
--    - 'event'         → General academic events
--    - 'holiday'       → Holidays / no-class days
--    - 'exam'          → Exam schedules
--    - 'parent_meeting' → Parent-teacher meetings
--
-- 3. The institute_config table uses a key-value pattern:
--    - config_key: 'whatsapp_settings' | 'sms_settings' | 'notification_prefs'
--    - config_value: JSONB with relevant settings
--
-- 4. To query WhatsApp config:
--    SELECT config_value->>'whatsapp_connected' 
--    FROM public.institute_config 
--    WHERE institute_id = '<uuid>' AND config_key = 'whatsapp_settings';
--
-- 5. To update WhatsApp config:
--    INSERT INTO public.institute_config (institute_id, config_key, config_value)
--    VALUES ('<uuid>', 'whatsapp_settings', '{"whatsapp_connected": true}')
--    ON CONFLICT (institute_id, config_key) 
--    DO UPDATE SET config_value = EXCLUDED.config_value, updated_at = timezone('utc', now());
