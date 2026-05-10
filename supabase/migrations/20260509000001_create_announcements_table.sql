-- Create announcements table for notifications
CREATE TABLE public.announcements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'announcement' CHECK (type IN ('announcement', 'fee_reminder', 'material_update', 'assignment')),
    batch_filter TEXT, -- 'all' or specific batch name, null for all
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
CREATE INDEX idx_announcements_institute_id ON public.announcements(institute_id);