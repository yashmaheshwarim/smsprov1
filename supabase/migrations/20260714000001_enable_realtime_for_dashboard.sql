-- ==========================================
-- Enable Supabase Realtime for Dashboard Tables
-- ==========================================
-- 
-- The mobile dashboard subscribes to real-time changes on these tables:
--   - students     (student count, recent students)
--   - attendance   (today's attendance rate)
--   - invoices     (total revenue)
--
-- Without Realtime enabled, the dashboard won't auto-refresh
-- when data changes (e.g., after saving attendance).
-- ==========================================

-- 1. Enable Realtime for dashboard tables (safe to run multiple times)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.students;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'students already in publication';
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'attendance already in publication';
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'invoices already in publication';
  END;
END;
$$;

-- ==========================================
-- Verify which tables are in the publication
-- ==========================================
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- ==========================================
-- HOW TO APPLY
-- ==========================================
--
-- Option A — Supabase Dashboard:
--   1. Go to https://supabase.com → Your Project → Database → Replication
--   2. Under "Source", make sure "Enable Realtime" is ON
--   3. In the table list, check the boxes for:
--      ☑ students
--      ☑ attendance  
--      ☑ invoices
--   4. Click "Save"
--
-- Option B — SQL Editor:
--   1. Go to Supabase Dashboard → SQL Editor
--   2. Paste this entire script
--   3. Click "Run"
--   4. Check the output table to verify the tables are listed
--
-- Option C — Supabase CLI:
--   npx supabase migration up
--
-- ==========================================
-- TROUBLESHOOTING
-- ==========================================
--
-- If you see "ERROR: relation is already a member of the publication":
--   → That's fine, it just means Realtime was already enabled
--   → You can run SELECT to verify
--
-- If dashboard still doesn't auto-refresh:
--   1. Check Supabase → Project Settings → API → Realtime
--      → Make sure "Realtime" is enabled (has a project-wide toggle)
--   2. Verify your Supabase URL in .env uses the standard URL
--      (not a custom domain) — Realtime requires the standard `.supabase.co` URL
--   3. Check the mobile app logs for: "Realtime subscription established"
