-- ==========================================
-- CHECK: What columns actually exist in student_fees?
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

-- ==========================================
-- CHECK: What columns exist in batch_fees?
-- ==========================================

SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'batch_fees' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- ==========================================
-- FIX: Make sure all required columns exist
-- ==========================================

-- Add columns IF they don't exist
ALTER TABLE public.student_fees 
ADD COLUMN IF NOT EXISTS original_fee NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.student_fees 
ADD COLUMN IF NOT EXISTS final_fee NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.student_fees 
ADD COLUMN IF NOT EXISTS paid_fees NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.student_fees 
ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.student_fees 
ADD COLUMN IF NOT EXISTS discount_reason TEXT;

ALTER TABLE public.student_fees 
ADD COLUMN IF NOT EXISTS discounted_fees NUMERIC(10,2);

ALTER TABLE public.student_fees 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('paid', 'pending', 'partial', 'overdue'));

ALTER TABLE public.student_fees 
ADD COLUMN IF NOT EXISTS last_payment_date TIMESTAMP WITH TIME ZONE;

-- ==========================================
-- CRITICAL: Refresh the schema cache!
-- ==========================================

-- AFTER running the above, go to Supabase Dashboard:
-- 1. Database > Tables > student_fees
-- 2. Click "..." menu
-- 3. Select "Refresh schema cache"
-- 4. Wait for confirmation

-- Or try this SQL command:
SELECT pg_notify('pgrst', 'reload schema');

-- ==========================================
-- TEST: Verify the fix worked
-- ==========================================

-- Test insert with correct column names
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
      5000.00,
      5000.00,
      0,
      0,
      'pending'
    );
    
    RAISE NOTICE 'SUCCESS! Insert worked correctly';
    
    -- Clean up
    DELETE FROM public.student_fees 
    WHERE institute_id = test_inst 
      AND student_id = test_student
      AND original_fee = 5000.00;
      
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FAILED: %', SQLERRM;
  END;
END $$;
