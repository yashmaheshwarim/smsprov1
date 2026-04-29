-- ==========================================
-- SAAS FEES MANAGEMENT SYSTEM - COMPLETE DATABASE SCHEMA
-- Multi-Tenant: Institute-based isolation via RLS
-- ==========================================

-- Drop existing tables in correct order (child first)
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.student_fees CASCADE;
DROP TABLE IF EXISTS public.batch_fees CASCADE;
DROP TABLE IF EXISTS public.institutes CASCADE;
DROP TABLE IF EXISTS public.batches CASCADE;
DROP TABLE IF EXISTS public.students CASCADE;
DROP TABLE IF EXISTS public.teachers CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

-- ==========================================
-- 1. INSTITUTES (Tenants)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.institutes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    plan_type TEXT DEFAULT 'trial',
    valid_until TIMESTAMP WITH TIME ZONE NOT NULL,
    student_limit INTEGER DEFAULT 500,
    teacher_limit INTEGER DEFAULT 50,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    grn_prefix TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- ==========================================
-- 2. USERS (Extends Supabase auth)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    institute_id UUID REFERENCES public.institutes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'teacher', 'student', 'parent')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_users_institute_id ON public.users(institute_id);

-- ==========================================
-- 3. BATCHES
-- ==========================================
CREATE TABLE IF NOT EXISTS public.batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    class_name TEXT NOT NULL,
    subjects TEXT[] DEFAULT '{}',
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_batches_institute_id ON public.batches(institute_id);

-- ==========================================
-- 4. STUDENTS
-- ==========================================
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    enrollment_no TEXT,
    batch_name TEXT,
    phone TEXT,
    email TEXT,
    guardian_name TEXT,
    guardian_phone TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'alumni')),
    join_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_students_institute_id ON public.students(institute_id);
CREATE INDEX IF NOT EXISTS idx_students_batch_id ON public.students(batch_id);

-- ==========================================
-- 5. BATCH FEES (Fee structure for batches - SaaS Multi-Tenant)
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_batch_fees_institute_id ON public.batch_fees(institute_id);
CREATE INDEX IF NOT EXISTS idx_batch_fees_batch_id ON public.batch_fees(batch_id);

-- ==========================================
-- 6. STUDENT FEES (Individual student fee records - Auto-created)
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
-- 7. PAYMENTS (Payment transaction records)
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
-- 8. AUDIT LOGS (SaaS tracking)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID REFERENCES public.institutes(id) ON DELETE SET NULL,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    table_name TEXT,
    record_id UUID,
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_institute_id ON public.audit_logs(institute_id);

-- ==========================================
-- HELPER FUNCTIONS (SaaS Multi-Tenant)
-- ==========================================

-- Function to get current user's institute_id
CREATE OR REPLACE FUNCTION public.get_auth_user_institute_id() RETURNS UUID AS $$
    SELECT institute_id FROM public.users WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;

-- Function to check if user is super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS BOOLEAN AS $$
    SELECT role = 'super_admin' FROM public.users WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES - SaaS Isolation
-- ==========================================

-- Enable RLS on all tables
ALTER TABLE public.institutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (if any)
DROP POLICY IF EXISTS "Institutes isolation policy" ON public.institutes;
DROP POLICY IF EXISTS "Users isolation policy" ON public.users;
DROP POLICY IF EXISTS "Batches isolation policy" ON public.batches;
DROP POLICY IF EXISTS "Students isolation policy" ON public.students;
DROP POLICY IF EXISTS "Batch fees isolation policy" ON public.batch_fees;
DROP POLICY IF EXISTS "Student fees isolation policy" ON public.student_fees;
DROP POLICY IF EXISTS "Payments isolation policy" ON public.payments;
DROP POLICY IF EXISTS "Audit logs isolation policy" ON public.audit_logs;

-- Institutes: Super admin sees all, others see only their institute
CREATE POLICY "Institutes isolation policy" ON public.institutes
    FOR ALL
    USING (
        public.is_super_admin() OR 
        id = public.get_auth_user_institute_id()
    );

-- Users: Super admin sees all, others see only their institute
CREATE POLICY "Users isolation policy" ON public.users
    FOR ALL
    USING (
        public.is_super_admin() OR 
        institute_id = public.get_auth_user_institute_id()
    );

-- Batches: Institute isolation
CREATE POLICY "Batches isolation policy" ON public.batches
    FOR ALL
    USING (
        public.is_super_admin() OR 
        institute_id = public.get_auth_user_institute_id()
    );

-- Students: Institute isolation
CREATE POLICY "Students isolation policy" ON public.students
    FOR ALL
    USING (
        public.is_super_admin() OR 
        institute_id = public.get_auth_user_institute_id()
    );

-- Batch Fees: Institute isolation
CREATE POLICY "Batch fees isolation policy" ON public.batch_fees
    FOR ALL
    USING (
        public.is_super_admin() OR 
        institute_id = public.get_auth_user_institute_id()
    );

-- Student Fees: Institute isolation
CREATE POLICY "Student fees isolation policy" ON public.student_fees
    FOR ALL
    USING (
        public.is_super_admin() OR 
        institute_id = public.get_auth_user_institute_id()
    );

-- Payments: Institute isolation via student_fees
CREATE POLICY "Payments isolation policy" ON public.payments
    FOR ALL
    USING (
        public.is_super_admin() OR 
        student_fee_id IN (
            SELECT id FROM public.student_fees 
            WHERE institute_id = public.get_auth_user_institute_id()
        )
    );

-- Audit Logs: Institute isolation
CREATE POLICY "Audit logs isolation policy" ON public.audit_logs
    FOR ALL
    USING (
        public.is_super_admin() OR 
        institute_id = public.get_auth_user_institute_id()
    );

-- ==========================================
-- SAMPLE DATA (SaaS Demo)
-- ==========================================

-- Only insert if tables are empty
DO $$
DECLARE
    inst_id UUID;
    batch_id UUID;
BEGIN
    -- Create sample institute if not exists
    IF NOT EXISTS (SELECT 1 FROM public.institutes LIMIT 1) THEN
        INSERT INTO public.institutes (name, email, plan_type, valid_until)
        VALUES ('Demo Institute', 'demo@institute.com', 'trial', NOW() + INTERVAL '30 days')
        RETURNING id INTO inst_id;
        
        -- Create sample batch
        INSERT INTO public.batches (institute_id, name, class_name)
        VALUES (inst_id, 'Grade 10 - A', 'Grade 10')
        RETURNING id INTO batch_id;
        
        -- Create sample batch fee
        INSERT INTO public.batch_fees (institute_id, batch_id, title, total_fees, description)
        VALUES (inst_id, batch_id, 'Tuition Fee 2026', 5000.00, 'Annual tuition fee');
    END IF;
END $$;

-- ==========================================
-- CRITICAL: Refresh Schema Cache (RUN THIS AFTER CREATING TABLES!)
-- ==========================================

-- Method 1: Go to Supabase Dashboard
-- Database > Tables > student_fees > "..." > "Refresh schema cache"
-- Repeat for: batch_fees, payments, institutes, batches, students

-- Method 2: SQL command (if supported)
-- SELECT pg_notify('pgrst', 'reload schema');

-- ==========================================
-- VERIFICATION QUERIES
-- ==========================================

-- Check tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('institutes', 'users', 'batches', 'students', 'batch_fees', 'student_fees', 'payments')
ORDER BY table_name;

-- Check RLS is enabled
SELECT tablename, rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename IN ('institutes', 'users', 'batches', 'students', 'batch_fees', 'student_fees', 'payments')
  AND schemaname = 'public';

-- Check foreign keys
SELECT
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN ('batch_fees', 'student_fees', 'payments')
ORDER BY tc.table_name;
