-- Migration: Fix payments table so EVERY payment is reliably saved with its own date + amount
-- 1) Ensure the payments table exists (may be missing if only legacy scripts were applied)
-- 2) Ensure receipt_id column exists (persists per-payment receipt numbers)
-- 3) Widen payment_method CHECK so "Bank Transfer" (bank_transfer) from the UI is accepted
--    (previously bank_transfer violated the CHECK and silently killed the whole insert)
-- 4) Restore RLS + institute-isolation policy (mirrors student_fees)
-- 5) Reload PostgREST schema cache

-- ── 1. Ensure the payments table exists (idempotent) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_fee_id UUID NOT NULL REFERENCES public.student_fees(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank', 'card', 'upi')),
    payment_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    transaction_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- ── 2. Ensure receipt_id column exists (used to persist per-payment receipt numbers) ──
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS receipt_id TEXT;

-- ── 3. Widen payment_method constraint to accept 'bank_transfer' (Bank Transfer) ──
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_payment_method_check;
ALTER TABLE public.payments
    ADD CONSTRAINT payments_payment_method_check
    CHECK (payment_method IN ('cash', 'bank', 'card', 'upi', 'bank_transfer'));

-- Performance index
CREATE INDEX IF NOT EXISTS idx_payments_student_fee_id ON public.payments(student_fee_id);

-- ── 4. RLS: enable + permissive public-access policy ─────────────────────────
-- IMPORTANT: This matches the app's working RLS model. The canonical migration
-- 20260423112050_create_batch_fees_structure.sql uses a permissive "Public access
-- policy" (FOR ALL USING true) on student_fees/batch_fees, and the admin login
-- flow resolves the institute from the `institutes` table (not public.users). A
-- strict isolation policy here would silently block payment reads/inserts for
-- admins whose auth user has no public.users row — exactly the "payment history
-- could not be saved / date keeps overwriting" bug. So payments uses the same
-- permissive policy as the fee tables it belongs to.
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Payments isolation policy" ON public.payments;
DROP POLICY IF EXISTS "Payments public access policy" ON public.payments;
CREATE POLICY "Payments public access policy" ON public.payments
    FOR ALL USING (true);

-- ── 5. Reload PostgREST schema cache so the new column/constraint are visible ──
NOTIFY pgrst, 'reload schema';
