-- Migration: Add updated_at column to inquiries table
-- The update_updated_at_column() trigger function exists and is attached
-- to the inquiries table via trg_inquiries_updated_at, but the column
-- was never added. This fixes "Record 'new' has no field 'updated_at'" errors.

ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now());

-- Backfill existing records so updated_at is never null
UPDATE public.inquiries SET updated_at = created_at WHERE updated_at IS NULL;
