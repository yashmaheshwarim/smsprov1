-- ==========================================
-- COMPLETE FIX: Foreign Keys & Batch-Student Relationship
-- ==========================================

-- STEP 1: Drop existing foreign keys (if any)
-- ==========================================

ALTER TABLE public.student_fees 
DROP CONSTRAINT IF EXISTS student_fees_student_id_fkey;

ALTER TABLE public.student_fees 
DROP CONSTRAINT IF EXISTS student_fees_batch_fee_id_fkey;

ALTER TABLE public.batch_fees 
DROP CONSTRAINT IF EXISTS batch_fees_batch_id_fkey;

-- ==========================================
-- STEP 2: Recreate tables with proper foreign keys
-- ==========================================

-- Drop tables in correct order (child first)
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.student_fees CASCADE;
DROP TABLE IF EXISTS public.batch_fees CASCADE;

-- Create batch_fees table
CREATE TABLE public.batch_fees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    total_fees NUMERIC(10,2) NOT NULL,
    description TEXT,
    due_date DATE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE INDEX idx_batch_fees_institute_id ON public.batch_fees(institute_id);
CREATE INDEX idx_batch_fees_batch_id ON public.batch_fees(batch_id);

-- Create student_fees table (WITH CORRECT COLUMN NAMES)
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

-- Create payments table
CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_fee_id UUID NOT NULL REFERENCES public.student_fees(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank', 'card', 'upi')),
    payment_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    transaction_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE INDEX idx_payments_student_fee_id ON public.payments(student_fee_id);

-- ==========================================
-- STEP 3: Enable RLS and create policies
-- ==========================================

ALTER TABLE public.batch_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Batch fees isolation policy" ON public.batch_fees;
DROP POLICY IF EXISTS "Student fees isolation policy" ON public.student_fees;
DROP POLICY IF EXISTS "Payments isolation policy" ON public.payments;

-- Create RLS policies
CREATE POLICY "Batch fees isolation policy" ON public.batch_fees
    FOR ALL
    USING (
        public.is_super_admin() OR 
        institute_id = public.get_auth_user_institute_id()
    );

CREATE POLICY "Student fees isolation policy" ON public.student_fees
    FOR ALL
    USING (
        public.is_super_admin() OR 
        institute_id = public.get_auth_user_institute_id()
    );

CREATE POLICY "Payments isolation policy" ON public.payments
    FOR ALL
    USING (
        public.is_super_admin() OR 
        student_fee_id IN (
            SELECT id FROM public.student_fees 
            WHERE institute_id = public.get_auth_user_institute_id()
        )
    );

-- ==========================================
-- STEP 4: CRITICAL - Refresh Schema Cache
-- ==========================================

-- AFTER running this script, you MUST:
-- 1. Go to Supabase Dashboard
-- 2. Database > Tables > batch_fees
-- 3. Click "..." menu > "Refresh schema cache"
-- 4. Repeat for student_fees table
-- 5. Repeat for payments table

-- Or try this SQL command (if supported):
-- SELECT pg_notify('pgrst', 'reload schema');

-- ==========================================
-- STEP 5: Verify the setup
-- ==========================================

-- Check foreign keys
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
WHERE tc.table_name IN ('student_fees', 'batch_fees')
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public';

-- Check columns in student_fees
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'student_fees' 
    AND table_schema = 'public'
ORDER BY ordinal_position;

-- ==========================================
-- STEP 6: Test insert
-- ==========================================

DO $$
DECLARE
    test_inst UUID;
    test_batch UUID;
    test_student UUID;
    test_batch_fee UUID;
BEGIN
    -- Get test data
    SELECT id INTO test_inst FROM public.institutes LIMIT 1;
    SELECT id INTO test_batch FROM public.batches LIMIT 1;
    SELECT id INTO test_student FROM public.students LIMIT 1;
    
    IF test_inst IS NULL OR test_batch IS NULL OR test_student IS NULL THEN
        RAISE NOTICE 'No test data found';
        RETURN;
    END IF;
    
    -- Create batch fee
    INSERT INTO public.batch_fees (
        institute_id, batch_id, title, total_fees
    ) VALUES (
        test_inst,
        test_batch,
        'Test Fee 2026',
        5000.00
    ) RETURNING id INTO test_batch_fee;
    
    RAISE NOTICE 'Created batch fee: %', test_batch_fee;
    
    -- Create student fee (this tests the foreign key)
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
    
    RAISE NOTICE 'Success! Foreign keys work correctly';
    
    -- Clean up test data
    DELETE FROM public.student_fees WHERE batch_fee_id = test_batch_fee;
    DELETE FROM public.batch_fees WHERE id = test_batch_fee;
    
END $$;
