-- ==========================================
-- Message Queue Table (Rate-limited WhatsApp/SMS with 3-5s gaps)
-- Migration: 20260429110000_create_message_queue.sql
-- ==========================================

-- Message Queue for rate-limited sending (RocketSender-style)
CREATE TABLE public.message_queue (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
     recipient TEXT NOT NULL,
     recipient_name TEXT,
     message TEXT NOT NULL,
     channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'sms', 'email')),
     priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('high', 'normal', 'low')),
     status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
     attempt_count INTEGER NOT NULL DEFAULT 0,
     scheduled_at TIMESTAMP WITH TIME ZONE,
     last_attempt_at TIMESTAMP WITH TIME ZONE,
     error_message TEXT,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE INDEX idx_queue_institute_id ON public.message_queue(institute_id);
CREATE INDEX idx_queue_status ON public.message_queue(status);
CREATE INDEX idx_queue_priority ON public.message_queue(priority);
CREATE INDEX idx_queue_scheduled ON public.message_queue(scheduled_at);

-- Enable RLS
ALTER TABLE public.message_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Institutes can view their own queue"
    ON public.message_queue FOR SELECT
    USING (auth.uid() IN (SELECT id FROM public.users WHERE institute_id = message_queue.institute_id));

CREATE POLICY "Institutes can insert their own queue items"
    ON public.message_queue FOR INSERT
    WITH CHECK (auth.uid() IN (SELECT id FROM public.users WHERE institute_id = message_queue.institute_id));

CREATE POLICY "Institutes can update their own queue"
    ON public.message_queue FOR UPDATE
    USING (auth.uid() IN (SELECT id FROM public.users WHERE institute_id = message_queue.institute_id));

-- ==========================================
-- CRITICAL: Refresh the schema cache after applying this migration
-- ==========================================
--
-- Go to Supabase Dashboard → Database → Tables → message_queue
-- Click "..." menu → "Refresh schema cache"
--
-- Or run this SQL:
-- SELECT pg_notify('pgrst', 'reload schema');
--
-- Then restart your dev server: npm run dev
