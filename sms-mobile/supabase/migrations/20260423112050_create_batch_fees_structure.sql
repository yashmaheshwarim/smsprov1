-- Create batch_fees and student_fees tables for batch-based fee management
-- Migration: 20260423112050_create_batch_fees_structure.sql

-- Batch fees table - defines fee structures for each batch
CREATE TABLE IF NOT EXISTS public.batch_fees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id UUID NOT NULL,
    batch_id UUID NOT NULL,
    title TEXT NOT NULL,
    total_fees NUMERIC(10,2) NOT NULL,
    description TEXT,
    due_date DATE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Student fees table - individual student fee records with discounts
CREATE TABLE IF NOT EXISTS public.student_fees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id UUID NOT NULL,
    batch_fee_id UUID NOT NULL,
    student_id UUID NOT NULL,
    discounted_fees NUMERIC(10,2),
    paid_fees NUMERIC(10,2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(10,2) DEFAULT 0,
    discount_reason TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('paid', 'pending', 'partial', 'overdue')),
    last_payment_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Add foreign key constraints (using ALTER TABLE to avoid issues with existing tables)
DO $$
BEGIN
    -- Add foreign key constraints for batch_fees if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'batch_fees_institute_id_fkey') THEN
        ALTER TABLE public.batch_fees ADD CONSTRAINT batch_fees_institute_id_fkey FOREIGN KEY (institute_id) REFERENCES public.institutes(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'batch_fees_batch_id_fkey') THEN
        ALTER TABLE public.batch_fees ADD CONSTRAINT batch_fees_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE CASCADE;
    END IF;

    -- Add foreign key constraints for student_fees if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'student_fees_institute_id_fkey') THEN
        ALTER TABLE public.student_fees ADD CONSTRAINT student_fees_institute_id_fkey FOREIGN KEY (institute_id) REFERENCES public.institutes(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'student_fees_batch_fee_id_fkey') THEN
        ALTER TABLE public.student_fees ADD CONSTRAINT student_fees_batch_fee_id_fkey FOREIGN KEY (batch_fee_id) REFERENCES public.batch_fees(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'student_fees_student_id_fkey') THEN
        ALTER TABLE public.student_fees ADD CONSTRAINT student_fees_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_batch_fees_batch_id ON public.batch_fees(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_fees_institute_id ON public.batch_fees(institute_id);
CREATE INDEX IF NOT EXISTS idx_student_fees_batch_fee_id ON public.student_fees(batch_fee_id);
CREATE INDEX IF NOT EXISTS idx_student_fees_student_id ON public.student_fees(student_id);
CREATE INDEX IF NOT EXISTS idx_student_fees_institute_id ON public.student_fees(institute_id);

-- Add comments
COMMENT ON TABLE public.batch_fees IS 'Fee structures defined for each batch';
COMMENT ON TABLE public.student_fees IS 'Individual student fee records with discounts';
COMMENT ON COLUMN public.student_fees.discounted_fees IS 'Final fee amount after discount (NULL means use batch fee)';
COMMENT ON COLUMN public.student_fees.discount_amount IS 'Amount discounted from original batch fee';

-- Enable Row Level Security
ALTER TABLE public.batch_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_fees ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
DROP POLICY IF EXISTS "Public access policy" ON public.batch_fees;
DROP POLICY IF EXISTS "Public access policy" ON public.student_fees;
CREATE POLICY "Public access policy" ON public.batch_fees FOR ALL USING (true);
CREATE POLICY "Public access policy" ON public.student_fees FOR ALL USING (true);