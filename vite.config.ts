import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const plugins = [
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean);

  // Baileys plugin uses server-only dependencies (express, socket.io, cors,
  // @whiskeysockets/baileys) that are ONLY in server/package.json, never in the
  // root package.json. This try/catch ensures the production build never fails
  // even if module resolution somehow reaches this code path.
  if (mode === "development") {
    try {
      const { baileysPlugin } = await import("./server/vite-plugin");
      plugins.push(baileysPlugin());
    } catch (err) {
      console.warn("[vite] Baileys WhatsApp plugin not available:", (err as Error)?.message);
      console.warn("[vite] Run 'npm --prefix server install' to install server dependencies.");
    }
  }

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins,
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || ''),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || ''),
      'import.meta.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(env.NEXT_PUBLIC_SUPABASE_URL || ''),
      'import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY': JSON.stringify(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || ''),
    },
  };
});