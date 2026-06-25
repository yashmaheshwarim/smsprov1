-- ==========================================
-- INSTITUTE API KEYS FOR N8N INTEGRATION
-- ==========================================
-- Each institute gets unique API keys for external integrations (n8n, etc.)
-- Keys are hashed (SHA-256) in the database for security
-- ==========================================

-- 1. API KEYS TABLE
CREATE TABLE IF NOT EXISTS public.institute_api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Default',
    key_prefix TEXT NOT NULL,         -- First 8 chars of key (for display/lookup)
    key_hash TEXT NOT NULL UNIQUE,    -- SHA-256 hash of the full API key
    scopes TEXT[] DEFAULT '{}',       -- e.g., {'whatsapp:send', 'students:read', 'fees:read'}
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_api_keys_institute_id ON public.institute_api_keys(institute_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON public.institute_api_keys(key_hash);

-- 2. RLS
ALTER TABLE public.institute_api_keys ENABLE ROW LEVEL SECURITY;

-- Super admins see all
CREATE POLICY "api_keys_super_admin_all" ON public.institute_api_keys
    FOR ALL USING (
        (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
    );

-- Institute admins see only their own keys
CREATE POLICY "api_keys_admin_own" ON public.institute_api_keys
    FOR ALL USING (
        institute_id = (SELECT institute_id FROM public.users WHERE id = auth.uid())
    );