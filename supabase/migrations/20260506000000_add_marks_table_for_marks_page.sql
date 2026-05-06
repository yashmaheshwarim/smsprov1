-- Create marks table used by MarksPage / StudentMarksPage / ParentMarksPage
-- This migration adds a minimal multi-tenant structure with RLS policies.

BEGIN;

-- Ensure uuid generation function exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Marks table: one row per student per subject per exam
-- (PK chosen as UUID id; FK references students table)
CREATE TABLE IF NOT EXISTS public.marks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,

  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,

  exam_name TEXT NOT NULL,
  subject TEXT NOT NULL,

  marks_obtained INTEGER NOT NULL DEFAULT 0,
  total_marks INTEGER NOT NULL DEFAULT 100,

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),

  -- Optional: store who entered/approved
  submitted_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_marks_institute_id ON public.marks(institute_id);
CREATE INDEX IF NOT EXISTS idx_marks_student_id ON public.marks(student_id);
CREATE INDEX IF NOT EXISTS idx_marks_exam_subject ON public.marks(exam_name, subject);
CREATE INDEX IF NOT EXISTS idx_marks_created_at ON public.marks(created_at);

-- Optional uniqueness to prevent duplicate entries for the same student+exam+subject
-- (keeps latest inserts from creating duplicates). If you want multiple attempts,
-- remove this unique index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_marks_unique_attempt
ON public.marks(institute_id, student_id, exam_name, subject);

-- Enable RLS
ALTER TABLE public.marks ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy (Super admin bypass)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'marks' AND policyname = 'Tenant isolation policy marks'
  ) THEN
    CREATE POLICY "Tenant isolation policy marks" ON public.marks
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

