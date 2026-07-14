-- Enable Realtime for marks table so exam data syncs across devices
-- This allows MarksPage to receive live updates when exams are created/edited/deleted

ALTER PUBLICATION supabase_realtime ADD TABLE public.marks;

-- Also add exam_attendance for consistency
ALTER PUBLICATION supabase_realtime ADD TABLE public.exam_attendance;
