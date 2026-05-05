-- Update invoices table to support fee records with total_fees, paid_fees, pending_fees
-- Migration: 20260423102045_update_invoices_for_fee_records.sql

-- Add new columns for fee record structure
ALTER TABLE public.invoices
ADD COLUMN total_fees NUMERIC(10,2),
ADD COLUMN paid_fees NUMERIC(10,2) DEFAULT 0,
ADD COLUMN pending_fees NUMERIC(10,2),
ADD COLUMN last_payment_date TIMESTAMP WITH TIME ZONE;

-- Update existing records to migrate from old structure to new structure
UPDATE public.invoices
SET
  total_fees = COALESCE(amount, 0),
  paid_fees = CASE
    WHEN status = 'paid' THEN COALESCE(amount, 0)
    ELSE 0
  END,
  pending_fees = CASE
    WHEN status = 'paid' THEN 0
    ELSE COALESCE(amount, 0)
  END,
  last_payment_date = CASE
    WHEN status = 'paid' THEN paid_date
    ELSE NULL
  END;

-- Update status to include 'partial' for records that have some payment but not full
UPDATE public.invoices
SET status = 'partial'
WHERE paid_fees > 0 AND paid_fees < total_fees AND status != 'paid';

-- Make total_fees NOT NULL after migration
ALTER TABLE public.invoices
ALTER COLUMN total_fees SET NOT NULL,
ALTER COLUMN paid_fees SET NOT NULL,
ALTER COLUMN pending_fees SET NOT NULL;

-- Add comments for clarity
COMMENT ON COLUMN public.invoices.total_fees IS 'Total fee amount for the student';
COMMENT ON COLUMN public.invoices.paid_fees IS 'Amount already paid by the student';
COMMENT ON COLUMN public.invoices.pending_fees IS 'Remaining amount to be paid';
COMMENT ON COLUMN public.invoices.last_payment_date IS 'Date of the last payment made';