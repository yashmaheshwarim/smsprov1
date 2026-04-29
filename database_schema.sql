CREATE TABLE public.message_logs (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
     channel TEXT CHECK (channel IN ('sms', 'whatsapp', 'push')),
     recipient TEXT NOT NULL,
     message TEXT NOT NULL,
     credits_used INTEGER DEFAULT 1,
     status TEXT DEFAULT 'delivered' CHECK (status IN ('delivered', 'failed', 'pending')),
     sent_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
 );
 CREATE INDEX idx_messages_institute_id ON public.message_logs(institute_id);

-- MESSAGE QUEUE (Rate-limited WhatsApp/SMS sending with 3-5s gaps)
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

-- WALLET BALANCES (Optional optimization, mostly tracked via Sums or specific config table)
CREATE TABLE public.institute_wallets (