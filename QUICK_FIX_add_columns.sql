-- ==========================================
-- QUICK FIX: Add missing columns to student_fees
-- ==========================================

-- Step 1: Check current columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'student_fees' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Step 2: Add missing columns (run each line if column doesn't exist)
-- Uncomment and run:

/*
-- Add original_fee column
ALTER TABLE public.student_fees 
ADD COLUMN IF NOT EXISTS original_fee NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Add final_fee column  
ALTER TABLE public.student_fees 
ADD COLUMN IF NOT EXISTS final_fee NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Add paid_fees column
ALTER TABLE public.student_fees 
ADD COLUMN IF NOT EXISTS paid_fees NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Add discount_amount column
ALTER TABLE public.student_fees 
ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Add other columns if missing
ALTER TABLE public.student_fees 
ADD COLUMN IF NOT EXISTS discount_reason TEXT;

ALTER TABLE public.student_fees 
ADD COLUMN IF NOT EXISTS discounted_fees NUMERIC(10,2);

ALTER TABLE public.student_fees 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('paid', 'pending', 'partial', 'overdue'));

ALTER TABLE public.student_fees 
ADD COLUMN IF NOT EXISTS last_payment_date TIMESTAMP WITH TIME ZONE;
*/

-- Step 3: Verify columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'student_fees' 
  AND table_schema = 'public'
  AND column_name LIKE '%fee%'
ORDER BY ordinal_position;

-- You should see: original_fee, final_fee, paid_fees, discount_amount

-- ==========================================
-- CRITICAL: Refresh the schema cache
-- ==========================================

-- AFTER adding columns, you MUST refresh the cache:

-- Method 1: Via Dashboard (RECOMMENDED)
/*
1. Go to Supabase Dashboard
2. Database → Tables → student_fees
3. Click "..." menu
4. Select "Refresh schema cache"
5. Wait for confirmation
*/

-- Method 2: Via SQL (if supported)
-- Uncomment and run:

/*
SELECT pg_notify('pgrst', 'reload schema');
*/

-- ==========================================
-- Step 4: Test the insert
-- ==========================================

DO $$
DECLARE
  test_inst UUID;
  test_student UUID;
  test_batch_fee UUID;
BEGIN
  -- Get test data
  SELECT id INTO test_inst FROM public.institutes LIMIT 1;
  SELECT id INTO test_student FROM public.students LIMIT 1;
  SELECT id INTO test_batch_fee FROM public.batch_fees LIMIT 1;
  
  IF test_inst IS NULL OR test_student IS NULL THEN
    RAISE NOTICE 'No test data found';
    RETURN;
  END IF;
  
  -- Try insert
  BEGIN
    INSERT INTO public.student_fees (
      institute_id,
      student_id,
      batch_fee_id,
      original_fee,
      final_fee,
      paid_fees,
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
    
    RAISE NOTICE 'SUCCESS! Insert worked - columns exist and cache is refreshed';
    
    -- Clean up
    DELETE FROM public.student_fees 
    WHERE institute_id = test_inst 
      AND student_id = test_student
      AND original_fee = 1000.00;
      
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FAILED: %', SQLERRM;
  END;
END $$;

-- ==========================================
-- SUMMARY
-- ==========================================

/*
1. Run Step 1 to see existing columns
2. Run Step 2 to add any missing columns
3. REFRESH SCHEMA CACHE (via Dashboard - most important!)
4. Run Step 4 to test if it works now
5. Restart your dev server: npm run dev
*/
