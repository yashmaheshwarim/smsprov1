-- =========================================================================
-- Fix notification type check constraint
-- The original DB constraint only allowed ('info','urgent','general','announcement',
-- 'fee_reminder','material_update'), but the TypeScript code defines
-- NotificationType as ('info'|'warning'|'event'|'exam'|'holiday').
--
-- This migration ALIGNS both worlds by merging all types into one constraint.
-- =========================================================================

-- Reset any rows whose type is NOT in the merged allowed list to 'info'
UPDATE public.notifications
SET type = 'info'
WHERE type NOT IN (
  -- DB-original types
  'info', 'urgent', 'general', 'announcement', 'fee_reminder', 'material_update',
  -- TypeScript NotificationType values
  'warning', 'event', 'exam', 'holiday'
);

-- Drop the old constraints (name may vary depending on how the table was created)
ALTER TABLE public.notifications
DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
DROP CONSTRAINT IF EXISTS notification_type_check;

-- Recreate with the merged list of all allowed types
ALTER TABLE public.notifications
ADD CONSTRAINT notifications_type_check
CHECK (type IN (
  'info', 'urgent', 'general', 'announcement', 'fee_reminder', 'material_update',
  'warning', 'event', 'exam', 'holiday'
));
