-- ==========================================
-- Add fee email notification settings to institutes
-- Migration: 20260620000000_add_fee_notification_settings.sql
-- ==========================================

-- Add notification email column
ALTER TABLE public.institutes 
ADD COLUMN IF NOT EXISTS notification_email TEXT;

-- Add fee email notifications enabled toggle (default true)
ALTER TABLE public.institutes 
ADD COLUMN IF NOT EXISTS fee_email_notifications_enabled BOOLEAN DEFAULT TRUE;

-- Add index for performance if needed
CREATE INDEX IF NOT EXISTS idx_institutes_notification_email ON public.institutes(notification_email);