import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
      // Proxy /api/openwa to the OpenWA server during local dev
      // This lets local dev work without Mixed Content issues
      // Note: the proxy target is hardcoded - if you run OpenWA on a
      // different host/port, update this target or set VITE_OPENWA_API_URL
      // to the actual HTTP URL in your .env file.
      proxy: {
        '/api/openwa': {
          target: 'http://localhost:2785',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/openwa/, ''),
        },
      },
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || ''),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || ''),
      'import.meta.env.VITE_OPENWA_API_URL': JSON.stringify(env.VITE_OPENWA_API_URL || '/api/openwa'),
      'import.meta.env.VITE_OPENWA_API_KEY': JSON.stringify(env.VITE_OPENWA_API_KEY || ''),
      'import.meta.env.VITE_WHATSAPP_SERVER_URL': JSON.stringify(env.VITE_WHATSAPP_SERVER_URL || '/api/openwa'),
      'import.meta.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(env.NEXT_PUBLIC_SUPABASE_URL || ''),
      'import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY': JSON.stringify(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || ''),
    },
  };
});