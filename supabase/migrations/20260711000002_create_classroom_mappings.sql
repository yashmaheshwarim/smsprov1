-- Create classroom_mappings table for cross-device batch-course mapping
CREATE TABLE IF NOT EXISTS public.classroom_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    batch_name TEXT NOT NULL,
    course_name TEXT NOT NULL,
    enrollment_code TEXT,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_classroom_mappings_institute_id ON public.classroom_mappings(institute_id);
CREATE INDEX IF NOT EXISTS idx_classroom_mappings_batch_name ON public.classroom_mappings(batch_name);

-- Enable RLS
ALTER TABLE public.classroom_mappings ENABLE ROW LEVEL SECURITY;

-- RLS: institute isolation
DROP POLICY IF EXISTS "Classroom mappings isolation policy" ON public.classroom_mappings;
CREATE POLICY "Classroom mappings isolation policy" ON public.classroom_mappings
    FOR ALL
    USING (
        public.is_super_admin() OR 
        institute_id = public.get_auth_user_institute_id()
    );
