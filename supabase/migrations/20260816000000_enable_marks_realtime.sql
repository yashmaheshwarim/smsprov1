-- =============================================================================
-- ENABLE REALTIME FOR MARKS / EXAM_ATTENDANCE (web ⇄ mobile sync)
-- -----------------------------------------------------------------------------
-- The mobile app marks screens (admin, teacher, student, parent) subscribe to
-- postgres_changes on `marks` and `exam_attendance`, but those tables were
-- never added to the supabase_realtime publication on the live database, and
-- REPLICA IDENTITY is not FULL — so UPDATE events carry only the primary key
-- and cannot be matched against the `institute_id=eq.<id>` filter.
--
-- Result: attendance syncs (it is in the publication) but marks do not:
--   • Editing marks / approving / marking a student absent (UPDATE events)
--     never reach the mobile app.
--   • Absent rows written to exam_attendance are never pushed either.
--
-- This migration is idempotent and safe to run repeatedly.
-- =============================================================================

-- 1) Make sure marks + exam_attendance are members of the realtime publication
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['marks', 'exam_attendance']) LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN
      NULL; -- already a member — fine
    END;
  END LOOP;
END;
$$;

-- 2) REPLICA IDENTITY FULL so UPDATE/DELETE events carry the row data needed to
--    evaluate the institute_id / student_id postgres_changes filters.
--    (Attendance is included so its UPDATE events keep flowing too.)
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['marks', 'exam_attendance', 'attendance']) LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'Skipping missing table: %', t;
    END;
  END LOOP;
END;
$$;

-- 3) Safety net: is_absent flag must exist (older environments may be missing
--    the 20260815000000 migration).
ALTER TABLE public.marks
  ADD COLUMN IF NOT EXISTS is_absent BOOLEAN NOT NULL DEFAULT FALSE;

-- =============================================================================
-- VERIFY — both should return rows:
--   SELECT tablename FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime'
--     AND tablename IN ('marks', 'exam_attendance', 'attendance')
--     ORDER BY tablename;
--
--   SELECT c.relname, c.relreplident FROM pg_class c
--   WHERE c.relname IN ('marks', 'exam_attendance', 'attendance')
--   ORDER BY c.relname;   -- relreplident 'f' = FULL
-- =============================================================================
