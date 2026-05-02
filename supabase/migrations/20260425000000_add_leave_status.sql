-- Add 'leave' to attendance status values
-- This allows marking students on leave, which counts as absent but won't trigger notifications

ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_status_check;

ALTER TABLE public.attendance ADD CONSTRAINT attendance_status_check 
    CHECK (status IN ('present', 'absent', 'late', 'half-day', 'leave'));
