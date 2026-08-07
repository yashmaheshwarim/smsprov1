-- Allow institutes to opt into recording advance/extra fee payments
-- Migration: 20260807000000_allow_advance_payments.sql

ALTER TABLE public.institutes
ADD COLUMN IF NOT EXISTS allow_advance_payments BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.institutes.allow_advance_payments IS
  'When enabled, admins can record advance/extra payments exceeding a student''s pending fee balance (recorded with a warning).';

-- Refresh the PostgREST schema cache so the new column is immediately visible
NOTIFY pgrst, 'reload schema';
