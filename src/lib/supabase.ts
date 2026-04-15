import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
const missingSupabaseEnvVars = [
  !supabaseUrl ? 'VITE_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL' : null,
  !supabaseAnonKey ? 'VITE_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY' : null,
].filter(Boolean) as string[];

export const hasSupabaseConfig = missingSupabaseEnvVars.length === 0;
export const supabaseConfigError = hasSupabaseConfig
  ? null
  : `Missing Supabase environment variables: ${missingSupabaseEnvVars.join(', ')}`;

if (!hasSupabaseConfig) {
  console.warn(supabaseConfigError);
}

const createMissingConfigProxy = () =>
  new Proxy(
    {},
    {
      get() {
        throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
      },
    },
  ) as ReturnType<typeof createClient>;

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createMissingConfigProxy();

if (hasSupabaseConfig) {
  console.log('Supabase initialized with URL:', supabaseUrl);
  console.log('Using Anon Key (First 10 chars):', supabaseAnonKey?.substring(0, 10));
}

export const isUuid = (val: string | null | undefined) => {
  if (!val) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
};
