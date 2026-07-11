-- Add student credential columns for enrollment-based login
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS login_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS login_password TEXT;

-- Set default login_id to enrollment_no for existing students
UPDATE public.students 
SET login_id = enrollment_no 
WHERE login_id IS NULL AND enrollment_no IS NOT NULL;

-- Create index for fast lookup during login
CREATE INDEX IF NOT EXISTS idx_students_login_id ON public.students(login_id);
