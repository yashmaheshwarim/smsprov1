-- =========================================================================
-- Add unified wallet_credits to institutes and create wallet_transactions
-- 1 student message = 1 credit deducted from wallet_credits
-- =========================================================================

-- Add wallet_credits column to institutes for unified credit system
ALTER TABLE public.institutes 
ADD COLUMN IF NOT EXISTS wallet_credits INTEGER DEFAULT 0;

-- Update existing institutes: set wallet_credits = sms_credits + whatsapp_credits for backward compatibility
UPDATE public.institutes 
SET wallet_credits = COALESCE(sms_credits, 0) + COALESCE(whatsapp_credits, 0)
WHERE wallet_credits = 0;

-- Wallet transactions log for audit trail
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
    amount INTEGER NOT NULL,
    description TEXT,
    reference_type TEXT, -- 'recharge', 'whatsapp', 'sms'
    reference_id TEXT, -- message ID or other reference
    balance_before INTEGER NOT NULL DEFAULT 0,
    balance_after INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_institute_id ON public.wallet_transactions(institute_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at ON public.wallet_transactions(created_at DESC);

-- Enable RLS
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Add RLS policy
DROP POLICY IF EXISTS "Public access policy" ON public.wallet_transactions;
CREATE POLICY "Public access policy" ON public.wallet_transactions
    FOR ALL USING (true);
