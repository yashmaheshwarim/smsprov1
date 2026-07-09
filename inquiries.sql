-- ============================================================
-- INQUIRIES MANAGEMENT SYSTEM — COMPLETE DATABASE SCHEMA
-- ============================================================
-- This file defines all tables, relationships, indexes,
-- Row-Level Security (RLS) policies, and seed data for the
-- inquiries/leads/admissions system.
--
-- Run with: psql -U <user> -d <db> -f inquiries.sql
-- Or paste into Supabase SQL Editor.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 0. SAFETY — Drop existing objects if re-running
-- ─────────────────────────────────────────────────────────────
-- Uncomment these only if you need to reset:
-- DROP POLICY IF EXISTS inquiries_institute_isolation ON inquiries;
-- DROP TABLE IF EXISTS inquiries CASCADE;

-- ─────────────────────────────────────────────────────────────
-- 1. EXTENSIONS (enable once per database)
-- ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────
-- 2. CUSTOM ENUM TYPES
-- ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE inquiry_status AS ENUM (
    'new', 'contacted', 'interested', 'applied',
    'approved', 'rejected', 'converted'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 3. INQUIRIES TABLE
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inquiries (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institute_id  UUID NOT NULL,
  student_name  TEXT NOT NULL,
  parent_name   TEXT DEFAULT '',
  mother_phone  TEXT DEFAULT '',
  father_phone  TEXT DEFAULT '',
  student_phone TEXT DEFAULT '',
  email         TEXT DEFAULT '',
  class_name    TEXT DEFAULT '',       -- Batch name at time of inquiry
  source        TEXT DEFAULT 'Walk-in', -- Walk-in, Phone, Website, Referral, Social Media, Advertisement
  notes         TEXT DEFAULT '',
  status        inquiry_status DEFAULT 'new',
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),

  -- Foreign key to institutes table
  CONSTRAINT fk_institute
    FOREIGN KEY (institute_id)
    REFERENCES institutes(id)
    ON DELETE CASCADE
);

-- ─────────────────────────────────────────────────────────────
-- 4. INDEXES (for performance)
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_inquiries_institute
  ON inquiries(institute_id);

CREATE INDEX IF NOT EXISTS idx_inquiries_status
  ON inquiries(status);

CREATE INDEX IF NOT EXISTS idx_inquiries_created
  ON inquiries(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inquiries_student_name
  ON inquiries USING gin(to_tsvector('simple', student_name));

-- ─────────────────────────────────────────────────────────────
-- 5. AUTO-UPDATE updated_at TRIGGER
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inquiries_updated_at ON inquiries;
CREATE TRIGGER trg_inquiries_updated_at
  BEFORE UPDATE ON inquiries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────────────────────
-- 6. ROW-LEVEL SECURITY (multi-tenant isolation)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;

-- Policy: users can only see inquiries belonging to their institute.
-- Uses the JWT app_metadata claim which stores institute_id for admin users.
-- Adjust the JWT path if your setup uses a different claim location.
CREATE POLICY inquiries_institute_isolation ON inquiries
  FOR ALL
  USING (institute_id = (auth.jwt() -> 'app_metadata' ->> 'institute_id')::uuid);

-- ─────────────────────────────────────────────────────────────
-- 7. SEED DATA (optional — for testing)
-- ─────────────────────────────────────────────────────────────
-- INSERT INTO inquiries (institute_id, student_name, parent_name, mother_phone, class_name, source, status)
-- VALUES
--   ('00000000-0000-0000-0000-000000000001', 'Aarav Sharma', 'Rajesh Sharma', '9876543210', 'JEE 2025 - Batch A', 'Walk-in', 'new'),
--   ('00000000-0000-0000-0000-000000000001', 'Priya Patel',  'Anita Patel',   '9876543211', 'NEET 2025 - Batch B', 'Referral', 'contacted');

-- ─────────────────────────────────────────────────────────────
-- 8. COMMON QUERIES (for reference)
-- ─────────────────────────────────────────────────────────────

-- Get all inquiries for an institute with latest first:
--   SELECT * FROM inquiries WHERE institute_id = '...' ORDER BY created_at DESC;

-- Get lead conversion rate:
--   SELECT
--     COUNT(*) AS total,
--     COUNT(*) FILTER (WHERE status = 'converted') AS converted,
--     ROUND(COUNT(*) FILTER (WHERE status = 'converted') * 100.0 / NULLIF(COUNT(*), 0), 1) AS conversion_pct
--   FROM inquiries WHERE institute_id = '...';

-- Get pipeline breakdown:
--   SELECT status, COUNT(*) FROM inquiries WHERE institute_id = '...' GROUP BY status;

-- ─────────────────────────────────────────────────────────────
-- 9. KNOWN ERRORS & SOLUTIONS
-- ─────────────────────────────────────────────────────────────

-- ERROR:  relation "institutes" does not exist
-- FIX:   Run your institutes table migration first, or
--        remove the CONSTRAINT fk_institute and add it later.

-- ERROR:  column "status" is of type inquiry_status but expression is of type text
-- FIX:   Cast the value:  'new'::inquiry_status
--        Or ensure your app sends the enum value as string matching one of the enum labels.

-- ERROR:  new row violates row-level security policy for table "inquiries"
-- FIX:   The insert is not matching the institute_id policy.
--        Make sure institute_id is set correctly and the JWT claim matches.
--        Temporarily disable RLS for testing:  ALTER TABLE inquiries DISABLE ROW LEVEL SECURITY;

-- ERROR:  permission denied for table inquiries
-- FIX:   Grant usage:  GRANT ALL ON inquiries TO authenticated;
--        Or in Supabase: go to SQL Editor → enable "Use public schema" 

-- ============================================================
-- END OF SCHEMA
-- ============================================================
