-- ==========================================
-- FIX: PGRST200 - Relationship not found
-- ==========================================

-- ISSUE: Supabase PostgREST can't find the relationship between 
-- 'student_fees' and 'students' tables
-- CAUSE: Foreign key exists but schema cache not updated

-- ==========================================
-- STEP 1: Verify foreign key exists
-- ==========================================

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

-- Expected output should show:
-- constraint_name: student_fees_student_id_fkey (or similar)
-- column_name: student_id
-- foreign_table_name: students
-- foreign_column_name: id

-- ==========================================
-- STEP 2: Drop and recreate the foreign key (to refresh cache)
-- ==========================================

-- First, check if the foreign key exists
DO $$
BEGIN
    -- Drop existing foreign key if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'student_fees_student_id_fkey'
        AND table_name = 'student_fees'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.student_fees 
        DROP CONSTRAINT student_fees_student_id_fkey;
        RAISE NOTICE 'Dropped existing foreign key';
    END IF;
    
    -- Recreate the foreign key with explicit name
    ALTER TABLE public.student_fees
    ADD CONSTRAINT student_fees_student_id_fkey 
    FOREIGN KEY (student_id) 
    REFERENCES public.students(id) 
    ON DELETE CASCADE;
    
    RAISE NOTICE 'Recreated foreign key successfully';
END $$;

-- ==========================================
-- STEP 3: Also ensure batch_fees relationship is correct
-- ==========================================

DO $$
BEGIN
    -- Drop existing foreign key if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'student_fees_batch_fee_id_fkey'
        AND table_name = 'student_fees'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.student_fees 
        DROP CONSTRAINT student_fees_batch_fee_id_fkey;
        RAISE NOTICE 'Dropped batch_fee_id foreign key';
    END IF;
    
    -- Recreate the foreign key
    ALTER TABLE public.student_fees
    ADD CONSTRAINT student_fees_batch_fee_id_fkey 
    FOREIGN KEY (batch_fee_id) 
    REFERENCES public.batch_fees(id) 
    ON DELETE SET NULL;
    
    RAISE NOTICE 'Recreated batch_fee_id foreign key successfully';
END $$;

-- ==========================================
-- STEP 4: Refresh Supabase Schema Cache
-- ==========================================

-- IMPORTANT: After running the above SQL, you MUST:
-- 1. Go to Supabase Dashboard
-- 2. Go to Database > Tables > student_fees
-- 3. Click on "..." menu > "Refresh schema cache"
-- OR:
-- 1. Go to Project Settings > Database
-- 2. Click "Reset Schema Cache" button

-- ==========================================
-- STEP 5: Alternative - Force schema reload via API
-- ==========================================

-- You can also call the Supabase Management API to reload the schema:
-- POST https://api.supabase.com/v1/projects/{project-ref}/database/extensions
-- But easiest is manually refreshing via Dashboard

-- ==========================================
-- STEP 6: Verify the fix worked
-- ==========================================

-- Run this query to test the relationship:
SELECT 
    sf.id,
    sf.student_id,
    s.name as student_name,
    s.enrollment_no
FROM student_fees sf
LEFT JOIN students s ON sf.student_id = s.id
LIMIT 5;

-- If this works, the relationship is fixed!

-- ==========================================
-- STEP 7: Test the exact query that was failing
-- ==========================================

-- This is the query from your code:
SELECT 
    sf.*,
    jsonb_build_object(
        'name', s.name,
        'enrollment_no', s.enrollment_no
    ) as students
FROM student_fees sf
LEFT JOIN students s ON sf.student_id = s.id
WHERE sf.institute_id = 'your-institute-id-here'
LIMIT 5;

-- Or using Supabase syntax (should work after cache refresh):
-- supabase.from('student_fees').select(`
--   *,
--   students (name, enrollment_no)
-- `)

-- ==========================================
-- SUMMARY OF FIX
-- ==========================================

/*
1. The foreign key constraint exists but Supabase's PostgREST cache 
   doesn't recognize it

2. Solution: Recreate the foreign key to trigger cache update

3. Steps:
   a. Run the SQL above (Steps 2 and 3)
   b. Go to Supabase Dashboard
   c. Database > Tables > student_fees
   d. Click "..." > "Refresh schema cache"
   e. Try your query again

4. Alternative: You can also use explicit JOIN in SQL instead of
   Supabase's nested select syntax:
   
   const { data, error } = await supabase
     .rpc('get_student_fees_with_students')  // Create a DB function
   
   OR use simpler query without nested select:
   
   const { data: fees, error: feesError } = await supabase
     .from('student_fees')
     .select('*')
     .eq('institute_id', instId);
     
   Then fetch student names separately:
   
   const studentIds = fees.map(f => f.student_id);
   const { data: students } = await supabase
     .from('students')
     .select('id, name, enrollment_no')
     .in('id', studentIds);
*/

-- ==========================================
-- OPTIONAL: Create a DB function as alternative
-- ==========================================

/*
CREATE OR REPLACE FUNCTION get_student_fees_with_details()
RETURNS TABLE (
    fee_id UUID,
    student_id UUID,
    student_name TEXT,
    enrollment_no TEXT,
    original_fee NUMERIC,
    final_fee NUMERIC,
    paid_fees NUMERIC,
    status TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sf.id,
        sf.student_id,
        s.name,
        s.enrollment_no,
        sf.original_fee,
        sf.final_fee,
        sf.paid_fees,
        sf.status
    FROM student_fees sf
    LEFT JOIN students s ON sf.student_id = s.id;
END;
$$ LANGUAGE plpgsql;

-- Then call it:
-- const { data, error } = await supabase.rpc('get_student_fees_with_details');
*/
