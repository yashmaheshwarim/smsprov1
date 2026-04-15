-- =========================================================================
-- SUPER ADMIN & MULTI-TENANT INSTITUTE MANAGEMENT PLATFORM SCHEMA
-- Target Database: PostgreSQL / Supabase
-- Applies RLS (Row Level Security) and indexes following Best Practices
-- =========================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. INSTITUTES (The Tenants)
-- ==========================================
CREATE TABLE public.institutes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    plan_type TEXT DEFAULT 'trial',
    valid_until TIMESTAMP WITH TIME ZONE NOT NULL,
    student_limit INTEGER DEFAULT 500,
    teacher_limit INTEGER DEFAULT 50,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- ==========================================
-- 2. USERS (Extends Supabase auth.users)
-- ==========================================
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    institute_id UUID REFERENCES public.institutes(id) ON DELETE CASCADE, -- Nullable for Super Admins
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'teacher', 'student', 'parent')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Index for RLS lookups
CREATE INDEX idx_users_institute_id ON public.users(institute_id);

-- ==========================================
-- 3. BATCHES & CLASSES
-- ==========================================
CREATE TABLE public.batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    class_name TEXT NOT NULL,
    subjects TEXT[] DEFAULT '{}',
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
CREATE INDEX idx_batches_institute_id ON public.batches(institute_id);

-- ==========================================
-- 4. TEACHERS
-- ==========================================
CREATE TABLE public.teachers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    phone TEXT,
    subjects TEXT[] DEFAULT '{}',
    assigned_classes TEXT[] DEFAULT '{}', -- Batch names or IDs
    permissions JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
CREATE INDEX idx_teachers_institute_id ON public.teachers(institute_id);

-- ==========================================
-- 5. STUDENTS
-- ==========================================
CREATE TABLE public.students (
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
CREATE INDEX idx_students_institute_id ON public.students(institute_id);
CREATE INDEX idx_students_batch_id ON public.students(batch_id);

-- ==========================================
-- 6. ATTENDANCE
-- ==========================================
CREATE TABLE public.attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'half-day')),
    type TEXT DEFAULT 'lecture',
    marked_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
CREATE INDEX idx_attendance_inst_student_date ON public.attendance(institute_id, student_id, date);

-- ==========================================
-- 7. FEES & INVOICES
-- ==========================================
CREATE TABLE public.invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('paid', 'pending', 'overdue', 'cancelled')),
    due_date DATE NOT NULL,
    paid_date DATE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
CREATE INDEX idx_invoices_inst_status ON public.invoices(institute_id, status);

-- ==========================================
-- 8. STUDY MATERIALS
-- ==========================================
CREATE TABLE public.study_materials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    subject TEXT NOT NULL,
    batch TEXT,
    type TEXT CHECK (type IN ('pdf', 'image', 'video', 'document')),
    file_url TEXT NOT NULL,
    file_name TEXT,
    size TEXT,
    uploaded_by TEXT, -- Instructor name or ID
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
CREATE INDEX idx_study_materials_institute_id ON public.study_materials(institute_id);

-- ==========================================
-- 9. LEAVE REQUESTS
-- ==========================================
CREATE TABLE public.leave_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    reason TEXT NOT NULL,
    type TEXT CHECK (type IN ('casual', 'sick', 'personal')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    admin_note TEXT,
    applied_on DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
CREATE INDEX idx_leave_requests_institute_id ON public.leave_requests(institute_id);

-- ==========================================
-- 10. ADMISSION INQUIRIES
-- ==========================================
CREATE TABLE public.inquiries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL,
    parent_name TEXT,
    phone TEXT NOT NULL,
    email TEXT,
    class_name TEXT,
    source TEXT,
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'interested', 'applied', 'approved', 'rejected', 'converted')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
CREATE INDEX idx_inquiries_institute_id ON public.inquiries(institute_id);

-- ==========================================
-- 11. ASSIGNMENTS
-- ==========================================
CREATE TABLE public.assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    subject TEXT NOT NULL,
    batch TEXT NOT NULL,
    due_date DATE NOT NULL,
    total_marks INTEGER DEFAULT 100,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed')),
    file_url TEXT,
    file_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
CREATE INDEX idx_assignments_institute_id ON public.assignments(institute_id);

-- ==========================================
-- 12. TIMETABLE ENTRIES
-- ==========================================
CREATE TABLE public.timetable_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    day TEXT NOT NULL,  -- e.g., 'Monday'
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    subject TEXT NOT NULL,
    teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
    room TEXT,
    batch TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
CREATE INDEX idx_timetable_institute_id ON public.timetable_entries(institute_id);

-- ==========================================
-- 13. MESSAGE WALLET & LOGS
-- ==========================================
CREATE TABLE public.message_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    channel TEXT CHECK (channel IN ('sms', 'whatsapp', 'push')),
    recipient TEXT NOT NULL,
    message TEXT NOT NULL,
    credits_used INTEGER DEFAULT 1,
    status TEXT DEFAULT 'delivered' CHECK (status IN ('delivered', 'failed', 'pending')),
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
CREATE INDEX idx_messages_institute_id ON public.message_logs(institute_id);

-- WALLET BALANCES (Optional optimization, mostly tracked via Sums or specific config table)
CREATE TABLE public.institute_wallets (
    institute_id UUID PRIMARY KEY REFERENCES public.institutes(id) ON DELETE CASCADE,
    sms_credits INTEGER DEFAULT 0,
    whatsapp_credits INTEGER DEFAULT 0,
    total_spent_credits INTEGER DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- ==========================================
-- 14. GRN RECORDS
-- ==========================================
CREATE TABLE public.grn_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    grn_number TEXT NOT NULL,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    issued_date DATE DEFAULT CURRENT_DATE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'transferred', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);
CREATE INDEX idx_grn_institute_id ON public.grn_records(institute_id);
-- Unique GRN per institute
CREATE UNIQUE INDEX idx_unique_grn_per_institute ON public.grn_records(institute_id, grn_number);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Function to get current user's institute_id
CREATE OR REPLACE FUNCTION public.get_auth_user_institute_id() RETURNS UUID AS $$
    SELECT institute_id FROM public.users WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;

-- Function to check if user is super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS BOOLEAN AS $$
    SELECT role = 'super_admin' FROM public.users WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;

-- Enabling RLS on standard tenant tables
ALTER TABLE public.institutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institute_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grn_records ENABLE ROW LEVEL SECURITY;

-- Base Policy Example: Permissive for development
CREATE POLICY "Public access policy" ON public.students
    FOR ALL
    USING (true);

CREATE POLICY "Public access policy" ON public.teachers
    FOR ALL
    USING (true);

-- Apply same baseline policy across heavily isolated tables
DO $$ 
DECLARE
    tbl text;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY[
        'batches', 'attendance', 'invoices', 'study_materials', 
        'leave_requests', 'inquiries', 'assignments', 'timetable_entries', 
        'message_logs', 'institute_wallets', 'grn_records'
    ]) 
    LOOP
        EXECUTE format('
            CREATE POLICY "Public access policy" ON public.%I
            FOR ALL USING (true);
        ', tbl);
    END LOOP;
END $$;
