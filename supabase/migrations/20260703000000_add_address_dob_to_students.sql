-- Add home_address and date_of_birth columns to students table
-- Migration: 20260703000000_add_address_dob_to_students.sql

ALTER TABLE public.students
ADD COLUMN IF NOT EXISTS home_address TEXT,
ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- Update join_date comment
COMMENT ON COLUMN public.students.home_address IS 'Full home address of the student';
COMMENT ON COLUMN public.students.date_of_birth IS 'Date of birth of the student';
COMMENT ON COLUMN public.students.join_date IS 'Admission date of the student';
