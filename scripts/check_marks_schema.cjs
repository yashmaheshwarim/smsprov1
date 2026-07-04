const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://aqehjaaikspulflvikcq.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxZWhqYWFpa3NwdWxmbHZpa2NxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNjg3MTAsImV4cCI6MjA5MDk0NDcxMH0.g3kBhpXyOzBtGLiNhBdN3T_GYmFyqeBAM1o6Hj03sts';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase
    .from('marks')
    .select('*')
    .limit(1);

  if (error) {
    console.log('Query error:', error.message);
    return;
  }

  if (data && data.length > 0) {
    console.log('Columns in marks table:');
    Object.keys(data[0]).forEach(col => console.log(' -', col));
  } else {
    console.log('No data in marks table');
  }
}

main().catch(console.error);
