-- Add page_access column to institutes table for super admin page access toggle
ALTER TABLE public.institutes
  ADD COLUMN IF NOT EXISTS page_access JSONB DEFAULT '{}'::jsonb;

-- Add wallet_credits column if not exists (for top-up feature)
ALTER TABLE public.institutes
  ADD COLUMN IF NOT EXISTS wallet_credits INTEGER DEFAULT 0;

-- Add password column for admin login via institutes table
ALTER TABLE public.institutes
  ADD COLUMN IF NOT EXISTS password TEXT;
