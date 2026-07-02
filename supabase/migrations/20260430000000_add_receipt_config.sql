-- Migration: Add receipt configuration for continuous receipt numbering
-- Adds receipt_prefix and next_receipt_no to institutes
-- Adds receipt_id to student_fees for storing generated receipt IDs

-- Add receipt prefix to institutes (e.g., "AGT-", "REC-", or empty for numeric-only)
ALTER TABLE public.institutes 
  ADD COLUMN IF NOT EXISTS receipt_prefix TEXT DEFAULT '';

-- Add next receipt counter (starts at 500 by default)
ALTER TABLE public.institutes 
  ADD COLUMN IF NOT EXISTS next_receipt_no BIGINT DEFAULT 500;

-- Add receipt_id to student_fees to persist the generated receipt number
ALTER TABLE public.student_fees 
  ADD COLUMN IF NOT EXISTS receipt_id TEXT;

-- Add receipt_id to payments table for per-payment receipt tracking
ALTER TABLE public.payments 
  ADD COLUMN IF NOT EXISTS receipt_id TEXT;

-- Initialize existing institutes with default values
UPDATE public.institutes 
SET receipt_prefix = '', next_receipt_no = 500 
WHERE receipt_prefix IS NULL OR next_receipt_no IS NULL;
