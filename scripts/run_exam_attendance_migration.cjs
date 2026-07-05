// Run with: node scripts/run_exam_attendance_migration.cjs
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://aqehjaaikspulflvikcq.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxZWhqYWFpa3NwdWxmbHZpa2NxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNjg3MTAsImV4cCI6MjA5MDk0NDcxMH0.g3kBhpXyOzBtGLiNhBdN3T_GYmFyqeBAM1o6Hj03sts';

const sql = `
-- Add 'leave' to the attendance status CHECK constraint
ALTER TABLE public.attendance 
DROP CONSTRAINT IF EXISTS attendance_status_check;

ALTER TABLE public.attendance 
ADD CONSTRAINT attendance_status_check 
CHECK (status IN ('present', 'absent', 'late', 'half-day', 'leave'));

-- Create exam_attendance table
CREATE TABLE IF NOT EXISTS public.exam_attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    exam_name TEXT NOT NULL,
    subject TEXT,
    exam_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'leave')),
    marked_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_attendance_unique 
ON public.exam_attendance(institute_id, student_id, exam_name, subject, exam_date);

CREATE INDEX IF NOT EXISTS idx_exam_attendance_institute_id ON public.exam_attendance(institute_id);
CREATE INDEX IF NOT EXISTS idx_exam_attendance_student_id ON public.exam_attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_exam_attendance_exam_name ON public.exam_attendance(exam_name);
CREATE INDEX IF NOT EXISTS idx_exam_attendance_exam_date ON public.exam_attendance(exam_date);

ALTER TABLE public.exam_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Exam attendance isolation policy" ON public.exam_attendance;
CREATE POLICY "Exam attendance isolation policy" ON public.exam_attendance
    FOR ALL
    USING (
        public.is_super_admin() OR 
        institute_id = public.get_auth_user_institute_id()
    );
`;

async function main() {
  console.log('Applying exam_attendance migration...');
  
  // Try via exec_sql RPC (needs to be created first in Supabase)
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase.rpc('exec_sql', { query_text: sql });
    if (!error) {
      console.log('✓ Migration applied successfully via exec_sql!');
      return;
    }
    console.log('exec_sql RPC not available:', error.message);
  } catch (e) {
    console.log('exec_sql RPC failed:', e.message);
  }
  
  // Try via direct REST API call to the SQL endpoint
  console.log('Trying REST API approach...');
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query_text: sql })
    });
    const result = await response.json();
    console.log('Result:', JSON.stringify(result));
    if (response.ok) {
      console.log('✓ Migration applied successfully!');
    } else {
      console.log('✗ Failed to apply migration via REST API.');
      console.log('\nPlease run the SQL manually in your Supabase SQL Editor:');
      console.log('https://supabase.com/dashboard/project/aqehjaaikspulflvikcq/sql/new');
    }
  } catch (e) {
    console.log('REST API call failed:', e.message);
    console.log('\nPlease run the SQL manually in your Supabase SQL Editor:');
    console.log('https://supabase.com/dashboard/project/aqehjaaikspulflvikcq/sql/new');
  }
}

main().catch(console.error);
