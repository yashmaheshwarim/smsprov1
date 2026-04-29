import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const isProduction = import.meta.env.MODE === 'production';
const isConfigured = !!(supabaseUrl && supabaseAnonKey);

console.log('[Supabase] Initializing...');
console.log('[Supabase] Mode:', import.meta.env.MODE);
console.log('[Supabase] URL present:', !!supabaseUrl);
console.log('[Supabase] Key present:', !!supabaseAnonKey);

if (!isConfigured) {
  const missingVars = [];
  if (!supabaseUrl) missingVars.push('VITE_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL');
  if (!supabaseAnonKey) missingVars.push('VITE_SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY');
  
  console.error('[Supabase] CRITICAL: Missing configuration!');
  console.error('[Supabase] Missing vars:', missingVars.join(', '));
  console.error('[Supabase] Please set these env vars in your .env file and rebuild!');
} else {
  console.log('[Supabase] Configuration found, creating client...');
  console.log('[Supabase] URL:', supabaseUrl.substring(0, 40) + '...');
}

const createDummyClient = (): SupabaseClient => {
  const dummy = {
    from: () => {
      throw new Error('Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.');
    },
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } }, error: null }),
      signInWithPassword: () => Promise.resolve({ data: { user: null, session: null }, error: null }),
      signOut: () => Promise.resolve({ error: null }),
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    },
  };
  return dummy as unknown as SupabaseClient;
};

export const supabase: SupabaseClient = isConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createDummyClient();

export const isSupabaseConfigured = () => isConfigured;

export const isUuid = (val: string | null | undefined) => {
  if (!val) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
};