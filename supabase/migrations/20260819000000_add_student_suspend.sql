-- Add suspended_until column to students table for temporary suspension
-- When suspended_until is set and in the future, the student is suspended
-- When it's NULL or in the past, the student is active

ALTER TABLE public.students
ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add an index for quick checks
CREATE INDEX IF NOT EXISTS idx_students_suspended_until ON public.students(suspended_until) WHERE suspended_until IS NOT NULL;

-- Add comment
COMMENT ON COLUMN public.students.suspended_until IS 'If set and in the future, the student is temporarily suspended. NULL means active.';
