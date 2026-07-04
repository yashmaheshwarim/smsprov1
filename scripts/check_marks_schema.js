const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://aqehjaaikspulflvikcq.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxZWhqYWFpa3NwdWxmbHZpa2NxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNjg3MTAsImV4cCI6MjA5MDk0NDcxMH0.g3kBhpXyOzBtGLiNhBdN3T_GYmFyqeBAM1o6Hj03sts';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  // Try to get one row of data to see which columns exist
  const { data, error } = await supabase
    .from('marks')
    .select('*')
    .limit(1);

  if (error) {
    console.log('Query error:', error.message);
    return;
  }

  if (data && data.length > 0) {
    console.log('Existing columns in marks table:');
    Object.keys(data[0]).forEach(col => console.log(' -', col));
  } else {
    console.log('No data found in marks table');
    console.log('Trying information_schema via raw query...');
    
    // Use the Supabase REST API to get the table schema
    const response = await fetch(`${supabaseUrl}/rest/v1/marks?select=*&limit=0`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Accept': 'application/json',
        'Prefer': 'return=representation'
      }
    });
    
    const responseData = await response.json();
    if (Array.isArray(responseData) && responseData.length > 0) {
      console.log('Columns:', Object.keys(responseData[0]));
    } else {
      console.log('Response:', JSON.stringify(responseData).substring(0, 200));
      console.log('Headers:', JSON.stringify(Object.fromEntries(response.headers)));
    }
  }

  // Check migration status
  const { data: migrations, error: migError } = await supabase
    .from('_migrations')
    .select('*')
    .limit(20);

  if (migError) {
    console.log('Cannot check migrations:', migError.message);
  } else {
    console.log('\nApplied migrations:', migrations?.length || 0);
  }
}

main().catch(console.error);
