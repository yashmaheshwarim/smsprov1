-- Add mother and father phone fields to students table
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS mother_phone TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS father_phone TEXT;