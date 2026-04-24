-- ==========================================
-- URGENT FIX: PGRST204 Column Not Found
-- ==========================================

-- ISSUE: "Could not find the 'final_fee' column of 'student_fees' in the schema cache"
-- ROOT CAUSE: Supabase PostgREST schema cache is OUTDATED
-- FIX: Refresh the schema cache (see below)

-- ==========================================
-- STEP 1: Check what columns ACTUALLY exist in database
-- ==========================================

SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'student_fees' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Run this FIRST to see actual column names
-- Look for: original_fee, final_fee, paid_fees, etc.
-- NOTE: Column names ARE case-sensitive in information_schema

-- ==========================================
-- STEP 2: Check if maybe columns exist with DIFFERENT names
-- ==========================================

-- Search for any column with "fee" in the name:
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'student_fees' 
  AND table_schema = 'public'
  AND column_name LIKE '%fee%';

-- This will show you ALL fee-related columns and their exact names

-- ==========================================
-- STEP 3: The MOST LIKELY issue - Refresh Schema Cache
-- ==========================================

-- YOU MUST DO THIS IN SUPABASE DASHBOARD (not in SQL Editor):

/*
1. Go to: https://supabase.com/dashboard
2. Select your project
3. Go to: Database (left sidebar)
4. Click: Tables
5. Find: student_fees table
6. Click the "..." menu (three dots) next to the table name
7. Select: "Refresh schema cache"
8. Wait for confirmation message
9. RESTART your dev server (Ctrl+C, then npm run dev)
*/

-- ==========================================
-- STEP 4: Alternative - Force reload via SQL (if Dashboard method fails)
-- ==========================================

-- Run this in SQL Editor to notify PostgREST to reload:
SELECT pg_notify('pgrst', 'reload schema');

-- After running, wait 10-20 seconds for cache to refresh

-- ==========================================
-- STEP 5: If columns don't exist, create them
-- ==========================================

-- ONLY RUN THIS IF STEP 1 SHOWS THE COLUMNS DON'T EXIST

/*
ALTER TABLE public.student_fees 
ADD COLUMN IF NOT EXISTS original_fee NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.student_fees 
ADD COLUMN IF NOT EXISTS final_fee NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.student_fees 
ADD COLUMN IF NOT EXISTS paid_fees NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.student_fees 
ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Then refresh schema cache again (Step 3)
*/

-- ==========================================
-- STEP 6: Verify the fix worked
-- ==========================================

-- After refreshing cache, test with minimal insert:

DO $$
DECLARE
  test_inst UUID;
  test_student UUID;
  test_batch_fee UUID;
BEGIN
  -- Get valid IDs
  SELECT id INTO test_inst FROM public.institutes LIMIT 1;
  SELECT id INTO test_student FROM public.students LIMIT 1;
  SELECT id INTO test_batch_fee FROM public.batch_fees LIMIT 1;
  
  IF test_inst IS NULL OR test_student IS NULL THEN
    RAISE NOTICE 'No institute or student found for testing';
    RETURN;
  END IF;
  
  -- Try insert with CORRECT column names from Step 1
  BEGIN
    INSERT INTO public.student_fees (
      institute_id,
      student_id,
      batch_fee_id,
      original_fee,    -- Use EXACT name from Step 1
      final_fee,      -- Use EXACT name from Step 1
      paid_fees,      -- Use EXACT name from Step 1
      discount_amount,
      status
    ) VALUES (
      test_inst,
      test_student,
      test_batch_fee,
      1000.00,
      1000.00,
      0,
      0,
      'pending'
    );
    
    RAISE NOTICE 'SUCCESS! Insert worked - columns exist with correct names';
    
    -- Clean up test data
    DELETE FROM public.student_fees 
    WHERE institute_id = test_inst 
      AND student_id = test_student
      AND original_fee = 1000.00;
      
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FAILED: %', SQLERRM;
  END;
END $$;

-- ==========================================
-- SUMMARY: What you need to do RIGHT NOW
-- ==========================================

/*
1. ✅ Run STEP 1 query - see what columns actually exist
2. ✅ Go to Supabase Dashboard
3. ✅ Database → Tables → student_fees
4. ✅ Click "..." → "Refresh schema cache"
5. ✅ Wait for confirmation
6. ✅ Restart dev server: npm run dev
7. ✅ Test creating batch fee again

The error "Could not find column in schema cache" means:
- The COLUMN EXISTS in database
- But PostgREST (the API layer) doesn't know about it
- REFRESHING SCHEMA CACHE fixes this
*/
