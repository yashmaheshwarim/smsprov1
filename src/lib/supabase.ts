import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

const isProduction = import.meta.env.MODE === 'production';

if (!supabaseUrl || !supabaseAnonKey) {
  const errorMsg = `CRITICAL: Supabase configuration missing!
  - VITE_SUPABASE_URL: ${supabaseUrl ? '✓' : '✗'}
  - VITE_SUPABASE_ANON_KEY: ${supabaseAnonKey ? '✓' : '✗'}
  - Mode: ${import.meta.env.MODE}
  - Please ensure .env file has these variables and rebuild the application.`;
  
  console.error(errorMsg);
  
  if (isProduction) {
    throw new Error('Supabase configuration is missing. Please contact the administrator.');
  }
}

if (isProduction && (!supabaseUrl || !supabaseAnonKey)) {
  throw new Error(
    'Supabase environment variables are not configured for production. ' +
    'Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file and rebuild.'
  );
}

export const supabase: SupabaseClient = createClient(supabaseUrl || '', supabaseAnonKey || '');

console.log('Supabase client initialized');
console.log('  URL:', supabaseUrl ? `${supabaseUrl.substring(0, 30)}...` : 'MISSING');
console.log('  Key:', supabaseAnonKey ? `${supabaseAnonKey.substring(0, 10)}...` : 'MISSING');
console.log('  Mode:', import.meta.env.MODE);

export const isSupabaseConfigured = () => !!(supabaseUrl && supabaseAnonKey);

export const isUuid = (val: string | null | undefined) => {
  if (!val) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
};