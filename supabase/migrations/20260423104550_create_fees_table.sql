-- Create fees table to store fee records separately from invoices
-- Migration: 20260423104550_create_fees_table.sql

CREATE TABLE public.fees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    total_fees NUMERIC(10,2) NOT NULL,
    paid_fees NUMERIC(10,2) NOT NULL DEFAULT 0,
    pending_fees NUMERIC(10,2) NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('paid', 'pending', 'partial', 'overdue')),
    due_date DATE NOT NULL,
    last_payment_date TIMESTAMP WITH TIME ZONE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Create indexes for better performance
CREATE INDEX idx_fees_institute_id ON public.fees(institute_id);
CREATE INDEX idx_fees_student_id ON public.fees(student_id);
CREATE INDEX idx_fees_status ON public.fees(status);
CREATE INDEX idx_fees_due_date ON public.fees(due_date);

-- Add comments for clarity
COMMENT ON TABLE public.fees IS 'Stores fee records for students with total, paid, and pending amounts';
COMMENT ON COLUMN public.fees.total_fees IS 'Total fee amount for the student';
COMMENT ON COLUMN public.fees.paid_fees IS 'Amount already paid by the student';
COMMENT ON COLUMN public.fees.pending_fees IS 'Remaining amount to be paid';
COMMENT ON COLUMN public.fees.last_payment_date IS 'Date of the last payment made';

-- Enable Row Level Security
ALTER TABLE public.fees ENABLE ROW LEVEL SECURITY;

-- Create RLS policy (similar to other tables)
CREATE POLICY "Public access policy" ON public.fees FOR ALL USING (true);