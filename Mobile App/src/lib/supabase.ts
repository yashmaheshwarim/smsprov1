import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Try reading from env vars (EXPO_PUBLIC_*) first ─────────────────────
let supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
let supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// ─── Fall back to expo-constants (app.json extra fields) ────────────────
if (!supabaseUrl || !supabaseAnonKey) {
  try {
    const Constants = require('expo-constants').default;
    const extra = Constants.expoConfig?.extra || {};
    supabaseUrl = supabaseUrl || extra.supabaseUrl || '';
    supabaseAnonKey = supabaseAnonKey || extra.supabaseAnonKey || '';
  } catch {
    // expo-constants not available
  }
}

// ─── Fall back to hardcoded defaults (same as web project) ──────────────
if (!supabaseUrl || !supabaseAnonKey) {
  supabaseUrl = supabaseUrl || 'https://aqehjaaikspulflvikcq.supabase.co';
  supabaseAnonKey = supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxZWhqYWFpa3NwdWxmbHZpa2NxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNjg3MTAsImV4cCI6MjA5MDk0NDcxMH0.g3kBhpXyOzBtGLiNhBdN3T_GYmFyqeBAM1o6Hj03sts';
}

// Lazily initialize the client to avoid crashing module evaluation if createClient throws
let _instance: ReturnType<typeof createClient> | null = null;

function getInstance() {
  if (!_instance) {
    try {
      _instance = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      });
    } catch (error) {
      console.error('[Supabase] Failed to create client:', error);
      throw error;
    }
  }
  return _instance;
}

// Export a proxy so existing imports (supabase.from(), supabase.auth, etc.) still work
// without eagerly initializing the client at module load time.
// Hermes 0.76+ supports Proxy, but we wrap calls in try-catch for safety.
export const supabase = new Proxy({} as any, {
  get(_, prop) {
    try {
      return getInstance()[prop as keyof typeof _instance];
    } catch (error) {
      // Throw immediately so the error stack trace is clear and actionable
      throw new Error(
        `[Supabase] Cannot access .${String(prop)}: ${(error as Error).message}`
      );
    }
  },
});

export const isSupabaseConfigured = () => !!(supabaseUrl && supabaseAnonKey);

export const isUuid = (val: string | null | undefined) => {
  if (!val) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
};
