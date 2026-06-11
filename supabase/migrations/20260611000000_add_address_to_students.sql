-- Add address column to students table
-- Enable UUID extension (only needed once, safe to repeat)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Add address column if it doesn't exist
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS address TEXT;
