-- ==========================================
-- DEBUG: Why are 0 students showing?
-- ==========================================

-- Step 1: Check if students table has data
SELECT COUNT(*) as total_students 
FROM students 
WHERE institute_id = 'YOUR_INSTITUTE_ID_HERE'
  AND status = 'active';

-- Replace YOUR_INSTITUTE_ID_HERE with your actual institute ID
-- You can get it from: SELECT id FROM institutes LIMIT 1;

-- ==========================================
-- Step 2: Check if students have batch_id set
SELECT 
  COUNT(*) as students_with_batch,
  COUNT(batch_id) as students_with_batch_id_set
FROM students 
WHERE institute_id = 'YOUR_INSTITUTE_ID_HERE'
  AND status = 'active';

-- ==========================================
-- Step 3: Check a specific batch
-- Replace BATCH_ID with an actual batch ID from your batches table
SELECT 
  b.name as batch_name,
  COUNT(s.id) as student_count
FROM batches b
LEFT JOIN students s ON s.batch_id = b.id 
  AND s.institute_id = 'YOUR_INSTITUTE_ID_HERE'
  AND s.status = 'active'
WHERE b.id = 'BATCH_ID'
GROUP BY b.name;

-- ==========================================
-- Step 4: Check if batch_fees were created
SELECT 
  bf.id,
  bf.title,
  bf.total_fees,
  b.name as batch_name,
  (SELECT COUNT(*) FROM student_fees sf WHERE sf.batch_fee_id = bf.id) as student_fee_records
FROM batch_fees bf
JOIN batches b ON b.id = bf.batch_id
WHERE bf.institute_id = 'YOUR_INSTITUTE_ID_HERE'
  AND bf.status = 'active'
ORDER BY bf.created_at DESC
LIMIT 5;

-- ==========================================
-- Step 5: Check if student_fees exist
SELECT 
  COUNT(*) as total_student_fees,
  COUNT(batch_fee_id) as with_batch_fee_id,
  COUNT(*) FILTER (WHERE batch_fee_id IS NOT NULL) as not_null_batch_fee_id
FROM student_fees
WHERE institute_id = 'YOUR_INSTITUTE_ID_HERE';

-- ==========================================
-- Step 6: Manual test - Create student fees for a batch
-- Replace BATCH_ID and BATCH_FEE_ID with actual IDs
/*
DO $$
DECLARE
  batch_fee_id UUID := 'BATCH_FEE_ID_HERE';
  inst_id UUID := 'YOUR_INSTITUTE_ID_HERE';
  total_fee NUMERIC := 5000.00;
BEGIN
  -- Get students in this batch
  INSERT INTO student_fees (
    institute_id,
    student_id,
    batch_fee_id,
    original_fee,
    final_fee,
    paid_fees,
    discount_amount,
    status
  )
  SELECT 
    inst_id,
    id,
    batch_fee_id,
    total_fee,
    total_fee,
    0,
    0,
    'pending'
  FROM students
  WHERE batch_id = 'BATCH_ID_HERE'
    AND institute_id = inst_id
    AND status = 'active';
  
  RAISE NOTICE 'Inserted % student fee records', (SELECT COUNT(*) FROM student_fees WHERE batch_fee_id = batch_fee_id);
END $$;
*/

-- ==========================================
-- Step 7: Refresh schema cache (CRITICAL!)
-- ==========================================

-- AFTER running any changes:
-- 1. Go to Supabase Dashboard
-- 2. Database > Tables > student_fees
-- 3. Click "..." menu > "Refresh schema cache"
-- 4. Repeat for batch_fees table

-- ==========================================
-- QUICK FIX: Reset and recreate tables (NUCLEAR OPTION)
-- ==========================================

/*
-- WARNING: This deletes all data in these tables!
-- Only use if you have no important data!

DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.student_fees CASCADE;

-- Recreate student_fees with correct columns
CREATE TABLE public.student_fees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    batch_fee_id UUID REFERENCES public.batch_fees(id) ON DELETE SET NULL,
    original_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
    final_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
    paid_fees NUMERIC(10,2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    discount_reason TEXT,
    discounted_fees NUMERIC(10,2),
    status TEXT DEFAULT 'pending' CHECK (status IN ('paid', 'pending', 'partial', 'overdue')),
    last_payment_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Then refresh schema cache!
*/
