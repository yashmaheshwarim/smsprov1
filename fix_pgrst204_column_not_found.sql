-- ==========================================
-- FIX: PGRST204 - Column not found in schema cache
-- ==========================================

-- ISSUE: "Could not find the 'final_fee' column of 'student_fees' in the schema cache"
-- CAUSE: Supabase PostgREST schema cache is outdated

-- ==========================================
-- STEP 1: Verify actual column names in database
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

-- Expected columns:
-- id (uuid)
-- institute_id (uuid)
-- student_id (uuid)
-- batch_fee_id (uuid)
-- original_fee (numeric) ← CHECK THIS NAME
-- final_fee (numeric) ← CHECK THIS NAME
-- paid_fees (numeric)
-- discount_amount (numeric)
-- discount_reason (text)
-- discounted_fees (numeric)
-- status (text)
-- last_payment_date (timestamp)
-- created_at (timestamp)
-- updated_at (timestamp)

-- ==========================================
-- STEP 2: Check if columns exist with wrong names
-- ==========================================

-- Check for common typos:
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'student_fees' 
  AND table_schema = 'public'
  AND column_name LIKE '%fee%';

-- Look for: original_fee, final_fee, paid_fees, etc.

-- ==========================================
-- STEP 3: If columns don't exist or have wrong names, recreate table
-- ==========================================

-- OPTION A: Rename columns (if they exist with wrong names)
-- Uncomment and run if needed:

/*
-- Rename original_fee to original_fee (if needed)
ALTER TABLE public.student_fees 
RENAME COLUMN original_fee TO original_fee;

-- Rename final_fee to final_fee (if needed)
ALTER TABLE public.student_fees 
RENAME COLUMN final_fee TO final_fee;
*/

-- OPTION B: Drop and recreate table (NUCLEAR OPTION - loses data!)
-- Only use if you have no important data:

/*
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.student_fees CASCADE;

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

CREATE INDEX idx_student_fees_institute_id ON public.student_fees(institute_id);
CREATE INDEX idx_student_fees_student_id ON public.student_fees(student_id);
CREATE INDEX idx_student_fees_batch_fee_id ON public.student_fees(batch_fee_id);

ALTER TABLE public.student_fees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Student fees isolation policy" ON public.student_fees;

CREATE POLICY "Student fees isolation policy" ON public.student_fees
    FOR ALL
    USING (
        public.is_super_admin() OR 
        institute_id = public.get_auth_user_institute_id()
    );
*/

-- ==========================================
-- STEP 4: Refresh Supabase Schema Cache (MOST IMPORTANT!)
-- ==========================================

-- After verifying/creating columns, you MUST refresh the cache:

-- Method 1: Supabase Dashboard
-- 1. Go to Supabase Dashboard
-- 2. Navigate to Database > Tables > student_fees
-- 3. Click "..." menu (top right)
-- 4. Select "Refresh schema cache"
-- 5. Wait for confirmation

-- Method 2: SQL command (if supported)
-- Uncomment and run:

/*
NOTIFY pgrst, 'reload schema';
*/

-- ==========================================
-- STEP 5: Verify the fix worked
-- ==========================================

-- Test inserting a record (minimal):
DO $$
DECLARE
  test_institute_id UUID;
  test_student_id UUID;
  test_batch_fee_id UUID;
BEGIN
  -- Get valid IDs
  SELECT id INTO test_institute_id FROM public.institutes LIMIT 1;
  SELECT id INTO test_student_id FROM public.students LIMIT 1;
  SELECT id INTO test_batch_fee_id FROM public.batch_fees LIMIT 1;
  
  IF test_institute_id IS NULL OR test_student_id IS NULL THEN
    RAISE NOTICE 'No institute or student found for testing';
    RETURN;
  END IF;
  
  -- Try insert with correct column names
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
      test_institute_id,
      test_student_id,
      test_batch_fee_id,
      1000.00,
      1000.00,
      0,
      0,
      'pending'
    );
    
    RAISE NOTICE 'Insert succeeded! Column names are correct.';
    
    -- Clean up
    DELETE FROM public.student_fees 
    WHERE institute_id = test_institute_id 
      AND student_id = test_student_id
      AND original_fee = 1000.00;
      
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Insert failed: %', SQLERRM;
  END;
END $$;

-- ==========================================
-- SUMMARY OF FIX
-- ==========================================

/*
1. PROBLEM: PGRST204 - Column not found in schema cache
   
   CAUSE: Supabase PostgREST cache is outdated

2. SOLUTION:
   a. Verify column names with Step 1 query
   b. Fix column names if wrong (Step 3)
   c. REFRESH SCHEMA CACHE (Step 4) - This is the KEY fix!
   
3. CODE FIX: Ensure your TypeScript uses correct column names:
   - original_fee (not original_fee)
   - final_fee (not final_fee)
   - paid_fees (not paid_fees)
   
4. After refreshing cache, restart your dev server:
   npm run dev
*/

-- ==========================================
-- QUICK FIX CHECKLIST
-- ==========================================

/*
□ Step 1: Run Step 1 query - verify column names are:
  - original_fee (with underscore)
  - final_fee (with underscore)
  
□ Step 2: Go to Supabase Dashboard
□ Step 3: Database > Tables > student_fees
□ Step 4: Click "..." > "Refresh schema cache"
□ Step 5: Restart your app (npm run dev)
□ Step 6: Test creating a batch fee again
*/
