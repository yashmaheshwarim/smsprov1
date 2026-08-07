-- Migration: Unblock payments RLS + backfill payment history rows
-- FIXES the real-world symptoms after running 20260807000001:
--   1) RLS: replace any strict isolation policy on payments with the same
--      permissive "Public access policy" the app uses on student_fees/batch_fees
--      (canonical migration 20260423112050). The admin login resolves the
--      institute via the `institutes` table, not public.users, so an isolation
--      policy silently blocks payment inserts/reads -> "payment history could
--      not be saved" and receipts showing a single overwritten date.
--   2) BACKFILL: create one payment row per existing student_fee that has
--      paid_fees > 0 but no payment rows yet (recorded before the payments
--      table worked). Uses last_payment_date (falling back to created_at) so
--      the receipt immediately shows a dated payment entry. Idempotent.
--   3) Reload PostgREST schema cache.

-- ── 1. RLS: permissive public-access policy (matches student_fees/batch_fees) ──
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Payments isolation policy" ON public.payments;
DROP POLICY IF EXISTS "Payments public access policy" ON public.payments;

CREATE POLICY "Payments public access policy" ON public.payments
    FOR ALL USING (true);

-- ── 2. Backfill payment rows for existing fees with paid amounts ──────────────
-- One row per student_fee that shows paid_fees but has no payment record yet.
-- The date is taken from last_payment_date (or created_at) so receipts display
-- a real dated entry instead of falling back to today's date.
INSERT INTO public.payments (student_fee_id, amount, payment_method, payment_date, receipt_id)
SELECT
    sf.id,
    sf.paid_fees,
    'cash',
    COALESCE(sf.last_payment_date, sf.created_at, timezone('utc', now())),
    sf.receipt_id
FROM public.student_fees sf
WHERE sf.paid_fees > 0
  AND NOT EXISTS (
      SELECT 1 FROM public.payments p WHERE p.student_fee_id = sf.id
  );

-- ── 3. Reload PostgREST schema cache ──────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
