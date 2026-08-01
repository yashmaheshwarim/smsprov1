import { defineConfig } from "vite";
import baseConfig from "./vite.config";

// The legacy Baileys WhatsApp server plugin was removed — all WhatsApp
// functionality now goes through the self-hosted OpenWA gateway
// (https://github.com/rmyndharis/OpenWA). Point the frontend at your OpenWA
// instance via VITE_WHATSAPP_SERVER_URL or the in-app Server Settings dialog.

export default defineConfig(async (env) => {
  const base = await baseConfig(env);
  return base;
});
