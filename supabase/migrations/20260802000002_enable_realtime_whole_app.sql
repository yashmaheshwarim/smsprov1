-- =============================================================================
-- ENABLE REALTIME FOR THE WHOLE WEB APP
-- -----------------------------------------------------------------------------
-- Fixes two cross-device sync bugs:
--
--   1. Marks/exams not appearing on other devices
--      Pages subscribe to postgres_changes (marks, attendance, students, …),
--      but those tables were never added to the supabase_realtime publication
--      in this project, so no events are emitted. This migration adds EVERY
--      public table to the publication (idempotent).
--
--   2. WhatsApp session not displayed on another device
--      The gateway config (URL / type / API key) is stored per-browser in
--      localStorage, so a new device polls the wrong server. We already have a
--      per-institute `whatsapp_gateway_config` table; this migration adds an
--      RLS policy so an institute's admin can read (and write) their OWN row,
--      letting every device hydrate the same gateway config.
--
-- Safe to run repeatedly.
-- =============================================================================

-- 1) Add every public table to the supabase_realtime publication (idempotent)
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('schema_migrations')   -- supabase bookkeeping
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t.tablename);
    EXCEPTION WHEN duplicate_object THEN
      NULL; -- already a member — fine
    END;
  END LOOP;
END;
$$;

-- 2) REPLICA IDENTITY FULL for the tables the app filters on (institute_id /
--    student_id). Without it, UPDATE events don't carry the row data needed to
--    evaluate postgres_changes filters. Missing tables are skipped (some fee
--    tables only exist on some environments).
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'students', 'attendance', 'marks', 'exam_attendance', 'invoices',
    'batches', 'teachers', 'leave_requests', 'study_materials',
    'timetable_entries', 'inquiries', 'message_logs', 'wallet_transactions',
    'student_fees', 'fee_records', 'batch_fees', 'institutes',
    'institute_wallets', 'message_queue', 'notifications', 'grn_records'
  ]) LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'Skipping missing table: %', t;
    END;
  END LOOP;
END;
$$;

-- 3) WhatsApp gateway config: let an institute's admin read/write their own row
--    so any device can hydrate the same gateway settings (URL, type, API key).
--    Other institutes cannot see it, and anon cannot see it.

-- Distinguish configs saved from the WhatsApp page ("direct" mode) from ones
-- written by the serverless Edge Function. Only "direct" configs should be
-- hydrated into a fresh browser — serverless rows keep URL/API key server-side.
ALTER TABLE public.whatsapp_gateway_config
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'serverless';

ALTER TABLE public.whatsapp_gateway_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Institute admin can read own gateway config" ON public.whatsapp_gateway_config;
CREATE POLICY "Institute admin can read own gateway config"
  ON public.whatsapp_gateway_config
  FOR SELECT
  USING (institute_id = public.get_auth_user_institute_id());

DROP POLICY IF EXISTS "Institute admin can upsert own gateway config" ON public.whatsapp_gateway_config;
CREATE POLICY "Institute admin can upsert own gateway config"
  ON public.whatsapp_gateway_config
  FOR INSERT
  WITH CHECK (institute_id = public.get_auth_user_institute_id());

DROP POLICY IF EXISTS "Institute admin can update own gateway config" ON public.whatsapp_gateway_config;
CREATE POLICY "Institute admin can update own gateway config"
  ON public.whatsapp_gateway_config
  USING (institute_id = public.get_auth_user_institute_id())
  WITH CHECK (institute_id = public.get_auth_user_institute_id());

-- =============================================================================
-- VERIFY: run this afterwards — every public table should appear.
--   SELECT tablename FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime'
--   AND schemaname = 'public' ORDER BY tablename;
-- =============================================================================
