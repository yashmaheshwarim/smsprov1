-- Create marks table for exam results
CREATE TABLE IF NOT EXISTS public.marks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    exam_name TEXT NOT NULL,
    subject TEXT NOT NULL,
    marks_obtained INTEGER NOT NULL,
    total_marks INTEGER NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    submitted_by TEXT,
    submitted_by_role TEXT CHECK (submitted_by_role IN ('teacher', 'admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Unique constraint for upsert conflict resolution
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_marks_conflict 
ON public.marks(institute_id, student_id, exam_name, subject);

-- Indexes for filtering and RLS
CREATE INDEX idx_marks_institute_id ON public.marks(institute_id);
CREATE INDEX idx_marks_batch_id ON public.marks(batch_id);
CREATE INDEX idx_marks_student_id ON public.marks(student_id);
CREATE INDEX idx_marks_exam_name ON public.marks(exam_name);

-- Enable RLS
ALTER TABLE public.marks ENABLE ROW LEVEL SECURITY;

-- RLS policy
DROP POLICY IF EXISTS "Marks isolation policy" ON public.marks;
CREATE POLICY "Marks isolation policy" ON public.marks
    FOR ALL
    USING (
        public.is_super_admin() OR 
        institute_id = public.get_auth_user_institute_id()
    );