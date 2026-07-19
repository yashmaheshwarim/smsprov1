-- =========================================================================
-- Create notifications table for in-app notification system
-- Admin sends notifications → Teachers & Students receive them
-- =========================================================================

-- Notifications sent by admin
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'announcement' CHECK (type IN ('info', 'urgent', 'general', 'announcement', 'fee_reminder', 'material_update')),
    target_role TEXT NOT NULL CHECK (target_role IN ('teacher', 'student', 'all')),
    target_batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,
    target_student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Track which users have read which notifications
CREATE TABLE IF NOT EXISTS public.notification_reads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    user_role TEXT NOT NULL CHECK (user_role IN ('teacher', 'student')),
    read_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    UNIQUE(notification_id, user_id, user_role)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_institute_id ON public.notifications(institute_id);
CREATE INDEX IF NOT EXISTS idx_notifications_target_role ON public.notifications(target_role);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_reads_notification_id ON public.notification_reads(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON public.notification_reads(user_id, user_role);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

-- RLS policies for notifications
DROP POLICY IF EXISTS "Allow all access for notifications" ON public.notifications;
CREATE POLICY "Allow all access for notifications" ON public.notifications
    FOR ALL USING (true);

-- RLS policies for notification_reads
DROP POLICY IF EXISTS "Allow all access for notification_reads" ON public.notification_reads;
CREATE POLICY "Allow all access for notification_reads" ON public.notification_reads
    FOR ALL USING (true);

-- Enable replica identity for realtime
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.notification_reads REPLICA IDENTITY FULL;

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_reads;
