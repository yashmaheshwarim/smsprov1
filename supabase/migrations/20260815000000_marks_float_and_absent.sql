  -- =============================================================================
  -- ALLOW DECIMAL MARKS + PER-STUDENT ABSENT FLAG
  -- -----------------------------------------------------------------------------
  -- 1. marks_obtained was INTEGER — teachers want point marks (e.g. 17.5 / 20).
  --    Change both marks_obtained and total_marks to NUMERIC so decimals are
  --    stored exactly (NUMERIC(7,2) supports up to 99999.99).
  --
  -- 2. Add is_absent BOOLEAN to marks. When a student is marked "Absent" while
  --    entering marks, the row is stored with marks_obtained = 0 and is_absent =
  --    true so every marks report (view dialog, report card PDF, student/parent
  --    marks pages, mobile app) can show "Absent" instead of 0.
  --
  -- Safe to run repeatedly (idempotent).
  -- =============================================================================

  -- 1) Float marks — cast existing INTEGER values to NUMERIC
  ALTER TABLE public.marks
    ALTER COLUMN marks_obtained TYPE NUMERIC(7,2) USING marks_obtained::NUMERIC(7,2);

  ALTER TABLE public.marks
    ALTER COLUMN total_marks TYPE NUMERIC(7,2) USING total_marks::NUMERIC(7,2);

  -- 2) Absent flag for per-student absence at marks-entry time
  ALTER TABLE public.marks
    ADD COLUMN IF NOT EXISTS is_absent BOOLEAN NOT NULL DEFAULT FALSE;

  -- Backfill: marks_obtained = 0 with an "absent"-looking row (legacy data never
  -- had the flag; there is no way to know retroactively, so leave as FALSE).
  -- (No-op — kept for documentation clarity.)
