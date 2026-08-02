-- =============================================================================
-- FIX: Marks page "ON CONFLICT" upsert errors
-- -----------------------------------------------------------------------------
-- Problem
--   The web app (src/pages/MarksPage.tsx) and mobile apps upsert marks using:
--       .upsert(rows, { onConflict: "institute_id,student_id,exam_name,subject,exam_date" })
--   Postgres raises SQLSTATE 42P10 ("no unique or exclusion constraint matching
--   the ON CONFLICT specification") when that 5-column unique index is missing.
--
--   Migration 20260711000001_add_exam_date_to_marks.sql added the exam_date
--   column, but the CREATE UNIQUE INDEX step in it did not end up applied on
--   this project — so the marks table has no unique index matching the
--   onConflict target used by the app.
--
-- This migration is idempotent, atomic (single transaction), and safe to run
-- repeatedly.
-- =============================================================================

BEGIN;

-- 1) Backfill NULL exam_date values (rows created before exam_date existed)
UPDATE public.marks
SET exam_date = COALESCE(created_at::date, CURRENT_DATE)
WHERE exam_date IS NULL;

-- 2) Safety net: if duplicate 5-tuples somehow exist, keep only the most
--    recently created row per key so the unique index can be created.
--    (Keeps the newest submission per student/exam/subject/date, handling
--    NULL created_at and identical timestamps deterministically.)
DELETE FROM public.marks
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      row_number() OVER (
        PARTITION BY institute_id, student_id, exam_name, subject, exam_date
        ORDER BY created_at DESC NULLS LAST, id DESC
      ) AS rn
    FROM public.marks
  ) ranked
  WHERE rn > 1
);

-- 3) Drop any stale/conflicting unique indexes on marks so exactly ONE unique
--    constraint covers the onConflict target.
DROP INDEX IF EXISTS public.idx_unique_marks_conflict;
DROP INDEX IF EXISTS public.marks_institute_id_student_id_exam_name_subject_idx;

-- 4) Create the single 5-column unique index used by the ON CONFLICT upserts
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_marks_conflict
ON public.marks(institute_id, student_id, exam_name, subject, exam_date);

-- 5) Recreate the exam-date lookup index (in case it was dropped along the way)
CREATE INDEX IF NOT EXISTS idx_marks_exam_date ON public.marks(exam_date);

COMMIT;
