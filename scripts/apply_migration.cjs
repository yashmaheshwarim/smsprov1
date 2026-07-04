const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://aqehjaaikspulflvikcq.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxZWhqYWFpa3NwdWxmbHZpa2NxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNjg3MTAsImV4cCI6MjA5MDk0NDcxMH0.g3kBhpXyOzBtGLiNhBdN3T_GYmFyqeBAM1o6Hj03sts';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const sql = `
    ALTER TABLE public.marks 
    ADD COLUMN IF NOT EXISTS submitted_by_role TEXT CHECK (submitted_by_role IN ('teacher', 'admin'));
    
    UPDATE public.marks 
    SET submitted_by_role = 'admin' 
    WHERE submitted_by_role IS NULL;
  `;

  try {
    const { data, error } = await supabase.rpc('exec_sql', { query_text: sql });
    if (error) {
      console.log('RPC exec_sql failed:', error.message);
      console.log('Trying direct SQL query...');
      
      // Try using the REST endpoint
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
      console.log('RPC result:', JSON.stringify(result));
    } else {
      console.log('Migration applied successfully!');
      console.log('Result:', JSON.stringify(data));
    }
  } catch (e) {
    console.log('Error:', e.message);
  }

  // Now verify the column was added
  const { data, error } = await supabase
    .from('marks')
    .select('*')
    .limit(1);

  if (error) {
    console.log('Verify query error:', error.message);
  } else if (data && data.length > 0) {
    console.log('\nColumns after migration:');
    Object.keys(data[0]).forEach(col => console.log(' -', col));
    const hasRole = 'submitted_by_role' in data[0];
    console.log('\nsubmitted_by_role column:', hasRole ? 'EXISTS ✓' : 'MISSING ✗');
  } else {
    console.log('No data to verify');
  }
}

main().catch(console.error);
