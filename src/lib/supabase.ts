import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const isProduction = import.meta.env.MODE === 'production';
const isConfigured = !!(supabaseUrl && supabaseAnonKey);

console.log('[Supabase] Initializing...');
console.log('[Supabase] Mode:', import.meta.env.MODE);
console.log('[Supabase] URL present:', !!supabaseUrl);
console.log('[Supabase] Key present:', !!supabaseAnonKey);
console.log('[Supabase] All env vars:', Object.keys(import.meta.env).filter(k => k.includes('SUPABASE')));

if (!isConfigured) {
  const missingVars = [];
  if (!supabaseUrl) missingVars.push('VITE_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL');
  if (!supabaseAnonKey) missingVars.push('VITE_SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY');
  
  console.error('[Supabase] CRITICAL: Missing configuration!');
  console.error('[Supabase] Missing vars:', missingVars.join(', '));
  
  if (isProduction) {
    console.error('[Supabase] In production, you must set these environment variables in your hosting provider dashboard!');
    console.error('[Supabase] Example for Vercel/Netlify: Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to environment variables');
  }
} else {
  console.log('[Supabase] Configuration found, creating client...');
  console.log('[Supabase] URL:', supabaseUrl.substring(0, 40) + '...');
}

export const supabase: SupabaseClient = isConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : ({} as SupabaseClient);

export const isSupabaseConfigured = () => isConfigured;

export const isUuid = (val: string | null | undefined) => {
  if (!val) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
};