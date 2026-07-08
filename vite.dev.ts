import { defineConfig, mergeConfig } from "vite";
import baseConfig from "./vite.config";

// Dynamic import of the Baileys plugin — it depends on server-only packages
// (express, socket.io, cors, @whiskeysockets/baileys) that are only in
// server/package.json. This module is NEVER loaded during production builds.
const { baileysPlugin } = await import("./server/vite-plugin");

export default defineConfig(async (env) => {
  const base = await baseConfig(env);
  return mergeConfig(base, {
    plugins: [baileysPlugin()],
  });
});
