BEGIN;

-- Create exam-wise attendance (separate from daily class attendance)
-- Use pgcrypto-based UUIDs to avoid uuid-ossp dependency
CREATE EXTENSION IF NOT EXISTS pgcrypto;


CREATE TABLE IF NOT EXISTS public.exam_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),


  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,

  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,

  batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,

  exam_name TEXT NOT NULL,
  subject TEXT NOT NULL,

  -- Exam date (comes from MarksPage's entered Exam Date)
  exam_date DATE NOT NULL,

  status TEXT NOT NULL DEFAULT 'present'
    CHECK (status IN ('present','absent','leave')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_exam_attendance_institute_id ON public.exam_attendance(institute_id);
CREATE INDEX IF NOT EXISTS idx_exam_attendance_student_id ON public.exam_attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_exam_attendance_exam_subject_date ON public.exam_attendance(exam_name, subject, exam_date);
CREATE INDEX IF NOT EXISTS idx_exam_attendance_created_at ON public.exam_attendance(created_at);

-- Prevent duplicates for the same student+exam+subject+date
CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_attendance_unique
  ON public.exam_attendance(institute_id, student_id, exam_name, subject, exam_date);

-- Enable RLS
ALTER TABLE public.exam_attendance ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy (Super admin bypass)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'exam_attendance'
      AND policyname = 'Tenant isolation policy exam_attendance'
  ) THEN
    CREATE POLICY "Tenant isolation policy exam_attendance" ON public.exam_attendance
      FOR ALL
      USING (
        public.is_super_admin() OR
        institute_id = public.get_auth_user_institute_id()
      )
      WITH CHECK (
        true
      );
  END IF;
END $$;

COMMIT;

