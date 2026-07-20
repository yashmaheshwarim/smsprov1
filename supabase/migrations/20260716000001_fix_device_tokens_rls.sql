-- ─── Fix RLS Policies for device_tokens ─────────────────────────────────────
-- The app uses custom auth (not Supabase Auth), so auth.uid() returns null.
-- The existing FOR ALL policy with `USING (user_id = auth.uid())` blocks all
-- INSERT/UPDATE/DELETE operations because there is no Supabase Auth session.
--
-- Fix: Drop the restrictive FOR ALL policy only. The permissive per-operation
-- policies (INSERT/UPDATE/DELETE SELECT) already exist from migration
-- 20260715000002_create_device_tokens.sql and allow unauthenticated access.

DROP POLICY IF EXISTS "Users can manage their own device tokens"
  ON public.device_tokens;
