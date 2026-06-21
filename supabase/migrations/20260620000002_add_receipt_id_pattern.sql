-- ==========================================
-- Add receipt_id_pattern to institutes table
-- Allows custom receipt ID formats like AGT-500, AGT-501
-- Migration: 20260620000002_add_receipt_id_pattern.sql
-- ==========================================

-- Add receipt_id_pattern column (stores pattern like "AGT-500" or "101")
ALTER TABLE public.institutes 
ADD COLUMN IF NOT EXISTS receipt_id_pattern TEXT DEFAULT '101';

-- Update existing rows that have receipt_id_start but no pattern
UPDATE public.institutes 
SET receipt_id_pattern = CAST(receipt_id_start AS TEXT) 
WHERE receipt_id_pattern IS NULL AND receipt_id_start IS NOT NULL;

-- Update remaining NULLs to default
UPDATE public.institutes 
SET receipt_id_pattern = '101' 
WHERE receipt_id_pattern IS NULL;