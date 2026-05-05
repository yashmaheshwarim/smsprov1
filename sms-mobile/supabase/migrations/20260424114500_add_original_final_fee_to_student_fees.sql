-- ==========================================
-- Add original_fee and final_fee columns to student_fees
-- Migration: 20260424114500_add_original_final_fee_to_student_fees.sql
-- ==========================================

-- Add original_fee column
ALTER TABLE public.student_fees 
ADD COLUMN IF NOT EXISTS original_fee NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Add final_fee column  
ALTER TABLE public.student_fees 
ADD COLUMN IF NOT EXISTS final_fee NUMERIC(10,2) NOT NULL DEFAULT 0;

-- ==========================================
-- CRITICAL: Refresh the schema cache after applying this migration
-- ==========================================
--
-- Go to Supabase Dashboard → Database → Tables → student_fees
-- Click "..." menu → "Refresh schema cache"
--
-- Or run this SQL (if supported):
-- SELECT pg_notify('pgrst', 'reload schema');
--
-- Then restart your dev server: npm run dev
