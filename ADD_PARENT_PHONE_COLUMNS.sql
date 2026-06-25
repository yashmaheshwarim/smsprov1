-- ==========================================
-- ADD MOTHER & FATHER PHONE TO STUDENTS
-- ==========================================
-- These columns enable sending absent notifications to both parents
-- via n8n and other external integrations
-- ==========================================

ALTER TABLE public.students 
  ADD COLUMN IF NOT EXISTS mother_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS mother_phone TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS father_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS father_phone TEXT DEFAULT '';

-- Index for quick phone lookups in parent notification queries
CREATE INDEX IF NOT EXISTS idx_students_mother_phone ON public.students(mother_phone);
CREATE INDEX IF NOT EXISTS idx_students_father_phone ON public.students(father_phone);