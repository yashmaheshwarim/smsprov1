-- =========================================================================
-- Fix attendance table: add subject column and unique constraint for upsert
-- =========================================================================
-- 
-- Problem 1: AttendancePage.tsx sends a "subject" field in upsert, but the 
-- attendance table has no subject column at all.
-- 
-- Problem 2: The upsert uses onConflict: "institute_id,student_id,date,subject"
-- but there is no unique constraint on these columns, causing:
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- 
-- Problem 3: There is an existing constraint "unique_attendance_per_day" on
-- (institute_id, student_id, date) that conflicts with the new upsert because
-- it enforces uniqueness WITHOUT the subject column. This must be dropped
-- and replaced with the new unique index that includes subject.
-- =========================================================================

BEGIN;

-- 1. Drop the old constraint that enforces uniqueness without subject
--    This constraint was added outside the migration system (in database_schema.sql)
--    and conflicts with the new upsert that includes subject in the conflict target.
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS unique_attendance_per_day;

-- 2. Add subject column to attendance table (nullable, since "all subjects" sends null)
ALTER TABLE public.attendance 
  ADD COLUMN IF NOT EXISTS subject TEXT; 

-- 3. Drop any existing unique constraint/index with this name before recreating
DROP INDEX IF EXISTS idx_attendance_unique_student_date_subject;

-- 4. Create unique index on (institute_id, student_id, date, subject)
--    Postgres treats NULLs as distinct in unique indexes, so multiple rows 
--    with subject=NULL for different statuses on same student/date will NOT conflict.
--    This allows upsert with onConflict to work correctly.
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_unique_student_date_subject 
  ON public.attendance(institute_id, student_id, date, subject);

COMMIT;