-- ==========================================
-- 15. BATCH FEES (Fee structure for batches)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.batch_fees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    total_fees NUMERIC(10,2) NOT NULL,
    description TEXT,
    due_date DATE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_batch_fees_institute_id ON public.batch_fees(institute_id);
CREATE INDEX IF NOT EXISTS idx_batch_fees_batch_id ON public.batch_fees(batch_id);

-- ==========================================
-- 16. STUDENT FEES (Individual student fee records)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.student_fees (
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
CREATE INDEX IF NOT EXISTS idx_student_fees_institute_id ON public.student_fees(institute_id);
CREATE INDEX IF NOT EXISTS idx_student_fees_student_id ON public.student_fees(student_id);
CREATE INDEX IF NOT EXISTS idx_student_fees_batch_fee_id ON public.student_fees(batch_fee_id);

-- ==========================================
-- 17. PAYMENTS (Payment transaction records)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_fee_id UUID NOT NULL REFERENCES public.student_fees(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank', 'card', 'upi')),
    payment_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    transaction_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_payments_student_fee_id ON public.payments(student_fee_id);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

ALTER TABLE public.batch_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid "already exists" error)
DROP POLICY IF EXISTS "Batch fees isolation policy" ON public.batch_fees;
DROP POLICY IF EXISTS "Student fees isolation policy" ON public.student_fees;
DROP POLICY IF EXISTS "Payments isolation policy" ON public.payments;

-- RLS Policies for batch_fees
CREATE POLICY "Batch fees isolation policy" ON public.batch_fees
    FOR ALL
    USING (
        public.is_super_admin() OR 
        institute_id = public.get_auth_user_institute_id()
    );

-- RLS Policies for student_fees
CREATE POLICY "Student fees isolation policy" ON public.student_fees
    FOR ALL
    USING (
        public.is_super_admin() OR 
        institute_id = public.get_auth_user_institute_id()
    );

-- RLS Policies for payments
CREATE POLICY "Payments isolation policy" ON public.payments
    FOR ALL
    USING (
        public.is_super_admin() OR 
        student_fee_id IN (
            SELECT id FROM public.student_fees 
            WHERE institute_id = public.get_auth_user_institute_id()
        )
    );

-- RLS Policies for student_fees
CREATE POLICY "Student fees isolation policy" ON public.student_fees
    FOR ALL
    USING (
        public.is_super_admin() OR 
        institute_id = public.get_auth_user_institute_id()
    );

-- RLS Policies for payments
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
-- SAMPLE DATA (Optional - for testing)
-- ==========================================

-- Note: Run this only if you want sample data
-- INSERT INTO public.batch_fees (institute_id, batch_id, title, total_fees, description, due_date)
-- SELECT 
--     (SELECT id FROM public.institutes LIMIT 1),
--     (SELECT id FROM public.batches LIMIT 1),
--     'Tuition Fee - 2026',
--     25000.00,
--     'Annual tuition fee for 2026 batch',
--     '2026-06-30'
-- WHERE EXISTS (SELECT 1 FROM public.institutes) AND EXISTS (SELECT 1 FROM public.batches);
