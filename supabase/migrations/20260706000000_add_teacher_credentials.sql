-- =========================================================================
-- Add teacher login credentials, name, and status columns
-- =========================================================================

-- Add name column (teacher display name / full name)
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS name TEXT;

-- Add email column (login identifier, unique per institute)
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS email TEXT;

-- Add password column (plain text for now; can be hashed later)
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS password TEXT;

-- Add status column (active / inactive)
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive'));

-- Add updated_at column for tracking modifications
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now());

-- Create index for login lookups
CREATE INDEX IF NOT EXISTS idx_teachers_email ON public.teachers(email);

-- Create index for status lookups
CREATE INDEX IF NOT EXISTS idx_teachers_status ON public.teachers(status);
