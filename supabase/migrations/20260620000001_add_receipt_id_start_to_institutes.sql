-- ==========================================
-- Add receipt_id_start column to institutes table
-- Migration: 20260620000001_add_receipt_id_start_to_institutes.sql
-- ==========================================

-- Add receipt_id_start column with default 101
ALTER TABLE public.institutes 
ADD COLUMN IF NOT EXISTS receipt_id_start INTEGER DEFAULT 101;

-- Update any existing rows that have NULL to use the default
UPDATE public.institutes 
SET receipt_id_start = 101 
WHERE receipt_id_start IS NULL;