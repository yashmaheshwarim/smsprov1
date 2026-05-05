-- Add separate phone fields for mother, father, and student to students table
-- Migration: 20260423101125_add_phone_fields_to_students.sql

ALTER TABLE public.students
ADD COLUMN mother_phone TEXT,
ADD COLUMN father_phone TEXT,
ADD COLUMN student_phone TEXT;

-- Add comments for clarity
COMMENT ON COLUMN public.students.mother_phone IS 'Phone number of the student mother';
COMMENT ON COLUMN public.students.father_phone IS 'Phone number of the student father';
COMMENT ON COLUMN public.students.student_phone IS 'Phone number of the student';

-- Update existing records to move phone data to student_phone if it exists
UPDATE public.students
SET student_phone = phone
WHERE phone IS NOT NULL AND student_phone IS NULL;

-- Optional: Keep the original phone field for backward compatibility or drop it later
-- For now, we'll keep it but update the logic to use student_phone as primary