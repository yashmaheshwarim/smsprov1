-- Add mother and father phone fields to students table
ALTER TABLE public.students ADD COLUMN mother_phone TEXT;
ALTER TABLE public.students ADD COLUMN father_phone TEXT;