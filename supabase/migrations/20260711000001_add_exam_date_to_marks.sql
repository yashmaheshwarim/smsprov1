-- Add exam_date column to marks table
ALTER TABLE public.marks ADD COLUMN IF NOT EXISTS exam_date DATE DEFAULT CURRENT_DATE;

-- Update the unique constraint to include exam_date so the same exam can happen on different dates
DROP INDEX IF EXISTS public.idx_unique_marks_conflict;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_marks_conflict 
ON public.marks(institute_id, student_id, exam_name, subject, exam_date);

-- Index for date-based filtering
CREATE INDEX IF NOT EXISTS idx_marks_exam_date ON public.marks(exam_date);
