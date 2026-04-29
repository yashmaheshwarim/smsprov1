-- =========================================
-- CHECK 1: Verify student_fees table structure
-- =========================================

SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default,
  character_maximum_length
FROM information_schema.columns 
WHERE table_name = 'student_fees' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- =========================================
-- CHECK 2: Verify RLS status
-- =========================================

SELECT 
  tablename, 
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename = 'student_fees' 
  AND schemaname = 'public';

-- =========================================
-- CHECK 3: Check existing RLS policies
-- =========================================

SELECT 
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'student_fees' 
  AND schemaname = 'public';

-- =========================================
-- CHECK 4: Verify foreign key constraints
-- =========================================

SELECT
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'student_fees'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public';

-- =========================================
-- CHECK 5: Test insert (minimal - will fail if RLS blocks)
-- =========================================

-- First, get a valid institute_id and student_id
-- Uncomment and run if you want to test:

/*
DO $$
DECLARE
  test_institute_id UUID;
  test_student_id UUID;
BEGIN
  -- Get first institute
  SELECT id INTO test_institute_id FROM institutes LIMIT 1;
  
  -- Get first student
  SELECT id INTO test_student_id FROM students LIMIT 1;
  
  -- Try insert
  BEGIN
    INSERT INTO student_fees (
      institute_id,
      student_id,
      original_fee,
      final_fee,
      paid_fees,
      discount_amount,
      status
    ) VALUES (
      test_institute_id,
      test_student_id,
      1000.00,
      1000.00,
      0,
      0,
      'pending'
    );
    
    RAISE NOTICE 'Insert succeeded!';
    
    -- Clean up test data
    DELETE FROM student_fees 
    WHERE institute_id = test_institute_id 
      AND student_id = test_student_id
      AND original_fee = 1000.00;
      
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Insert failed: %', SQLERRM;
  END;
END $$;
*/

-- =========================================
-- FIX 1: Disable RLS temporarily (for testing)
-- =========================================

-- Uncomment if you want to disable RLS to test:

/*
ALTER TABLE student_fees DISABLE ROW LEVEL SECURITY;
RAISE NOTICE 'RLS disabled for testing. Re-enable after testing!';
*/

-- =========================================
-- FIX 2: Re-enable RLS and add proper policy
-- =========================================

-- After testing, re-enable and add policy:

/*
ALTER TABLE student_fees ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first
DROP POLICY IF EXISTS "Student fees isolation policy" ON student_fees;

-- Create proper policy
CREATE POLICY "Student fees isolation policy" ON student_fees
  FOR ALL
  USING (
    (SELECT role FROM users WHERE id = auth.uid() LIMIT 1) = 'super_admin'
    OR 
    institute_id = (SELECT institute_id FROM users WHERE id = auth.uid() LIMIT 1)
  );
*/

-- =========================================
-- CHECK 6: Verify your instId is valid
-- =========================================

-- Check if the instId you're using exists:

/*
SELECT id, name FROM institutes WHERE id = 'YOUR_INSTITUTE_ID_HERE';
*/

-- =========================================
-- SUMMARY: Common 400 Error Causes
-- =========================================

/*
1. COLUMN NAME MISMATCH
   - Check column names in Step 1 output
   - Common: 'original_fee' vs 'original_fee', 'batch_fee_id' vs 'batch_fee_id'
   
2. DATA TYPE MISMATCH
   - numeric(10,2) expects: 1000.00 (number), not "1000" (string)
   - uuid expects valid UUID format, not arbitrary string
   
3. RLS POLICY VIOLATION
   - If Step 2 shows rls_enabled = true
   - Disable RLS or add proper policy (see FIX 1)
   
4. FOREIGN KEY VIOLATION
   - Check Step 4 for foreign key constraints
   - institute_id must exist in institutes table
   - student_id must exist in students table
   - batch_fee_id must exist in batch_fees table (or be null)
   
5. MISSING REQUIRED COLUMNS
   - Check Step 1: is_nullable = 'NO' means column is required
   - Common: institute_id, student_id are usually NOT NULL
*/
