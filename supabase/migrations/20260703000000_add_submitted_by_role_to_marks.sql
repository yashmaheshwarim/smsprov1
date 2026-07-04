-- Add submitted_by_role column to marks table
ALTER TABLE public.marks 
ADD COLUMN IF NOT EXISTS submitted_by_role TEXT CHECK (submitted_by_role IN ('teacher', 'admin'));

-- Update existing rows to have a default value
UPDATE public.marks 
SET submitted_by_role = 'admin' 
WHERE submitted_by_role IS NULL;
