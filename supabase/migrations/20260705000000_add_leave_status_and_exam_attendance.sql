-- Add 'leave' to the attendance status CHECK constraint
ALTER TABLE public.attendance 
DROP CONSTRAINT IF EXISTS attendance_status_check;

ALTER TABLE public.attendance 
ADD CONSTRAINT attendance_status_check 
CHECK (status IN ('present', 'absent', 'late', 'half-day', 'leave'));

-- Create exam_attendance table for exam-specific attendance records
CREATE TABLE IF NOT EXISTS public.exam_attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    exam_name TEXT NOT NULL,
    subject TEXT,
    exam_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'leave')),
    marked_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Unique constraint: one attendance per student per exam per subject per day
CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_attendance_unique 
ON public.exam_attendance(institute_id, student_id, exam_name, subject, exam_date);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_exam_attendance_institute_id ON public.exam_attendance(institute_id);
CREATE INDEX IF NOT EXISTS idx_exam_attendance_student_id ON public.exam_attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_exam_attendance_exam_name ON public.exam_attendance(exam_name);
CREATE INDEX IF NOT EXISTS idx_exam_attendance_exam_date ON public.exam_attendance(exam_date);

-- Enable RLS
ALTER TABLE public.exam_attendance ENABLE ROW LEVEL SECURITY;

-- RLS policy for multi-tenant isolation
DROP POLICY IF EXISTS "Exam attendance isolation policy" ON public.exam_attendance;
CREATE POLICY "Exam attendance isolation policy" ON public.exam_attendance
    FOR ALL
    USING (
        public.is_super_admin() OR 
        institute_id = public.get_auth_user_institute_id()
    );
