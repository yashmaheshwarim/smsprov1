import type { Plugin, ViteDevServer } from "vite";
import express from "express";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import { BaileysSessionManager } from "./src/baileys/session-manager.js";
import { setupSocketHandlers } from "./src/socket/whatsapp.js";
import { config as loadDotenv } from "dotenv";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function baileysPlugin(): Plugin {
  let sessionManager: BaileysSessionManager | null = null;

  return {
    name: "baileys-whatsapp",
    configureServer(server: ViteDevServer) {
      // Load env vars
      loadDotenv({ path: path.resolve(__dirname, "../.env") });
      loadDotenv({ path: path.resolve(__dirname, "../.env.local") });
      loadDotenv({ path: path.resolve(__dirname, "../server/.env") });

      const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
      const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

      // Use Vite's HTTP server
      const httpServer = server.httpServer!;
      const app = express();

      // Socket.IO with custom path to avoid conflict with Vite HMR WebSocket
      const io = new SocketIOServer(httpServer, {
        path: "/api/ws",
        cors: {
          origin: true,
          methods: ["GET", "POST"],
        },
      });

      // Express middleware for REST API
      app.use(cors({ origin: true }));
      app.use(express.json());

      // Mount Express into Vite's connect middleware stack — runs before Vite's static file handler
      server.middlewares.use(app);

      // Create Baileys session manager
      sessionManager = new BaileysSessionManager(io, SUPABASE_URL, SUPABASE_KEY);

      // ── REST API ─────────────────────────────────────────────────────────

      app.get("/api/health", (_req, res) => {
        res.json({ status: "ok", sessions: sessionManager?.getAllSessions().length || 0 });
      });

      app.get("/api/sessions", (_req, res) => {
        const sessions = sessionManager?.getAllSessions().map((s) => ({
          instituteId: s.instituteId,
          status: s.status,
          phone: s.phone,
          connectedAt: s.connectedAt,
          lastDisconnectedAt: s.lastDisconnectedAt,
          error: s.error,
        })) || [];
        res.json({ sessions });
      });

      app.get("/api/sessions/:instituteId", (req, res) => {
        const state = sessionManager?.getSessionState(req.params.instituteId);
        if (!state) return res.status(404).json({ error: "Session not found" });
        res.json(state);
      });

      app.post("/api/sessions/:instituteId/connect", async (req, res) => {
        try {
          await sessionManager?.connect(req.params.instituteId);
          res.json({ success: true, message: "Session initiating" });
        } catch (err: any) {
          res.status(500).json({ success: false, error: err.message });
        }
      });

      app.post("/api/sessions/:instituteId/disconnect", async (req, res) => {
        try {
          await sessionManager?.disconnect(req.params.instituteId);
          res.json({ success: true, message: "Disconnected" });
        } catch (err: any) {
          res.status(500).json({ success: false, error: err.message });
        }
      });

      app.post("/api/sessions/:instituteId/logout", async (req, res) => {
        try {
          await sessionManager?.logout(req.params.instituteId);
          res.json({ success: true, message: "Logged out and auth cleared" });
        } catch (err: any) {
          res.status(500).json({ success: false, error: err.message });
        }
      });

      app.post("/api/sessions/:instituteId/send", async (req, res) => {
        const { to, text } = req.body;
        if (!to || !text) {
          return res.status(400).json({ success: false, error: "Missing 'to' or 'text'" });
        }
        const result = await sessionManager?.sendMessage(req.params.instituteId, to, text);
        res.json(result || { success: false, error: "Session manager not ready" });
      });

      // Batch send — send multiple messages with 3-5s delay between each (anti-ban)
      app.post("/api/sessions/:instituteId/send-batch", async (req, res) => {
        const { messages } = req.body;
        if (!Array.isArray(messages) || messages.length === 0) {
          return res.status(400).json({ success: false, error: "Missing 'messages' array" });
        }

        const results: { to: string; success: boolean; id?: string; error?: string }[] = [];

        for (let i = 0; i < messages.length; i++) {
          const { to, text } = messages[i];
          if (!to || !text) {
            results.push({ to: to || "", success: false, error: "Missing fields" });
            continue;
          }

          const result = await sessionManager?.sendMessage(req.params.instituteId, to, text);
          results.push({
            to,
            success: result?.success || false,
            id: result?.id,
            error: result?.error,
          });

          // 3-5s delay between messages for anti-ban (WhatsApp flags accounts with rapid messaging)
          if (i < messages.length - 1) {
            const delay = 3000 + Math.random() * 2000; // 3-5 seconds
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }

        res.json({ success: true, results });
      });

      // ── Socket.IO ───────────────────────────────────────────────────────

      io.on("connection", (socket) => {
        console.log(`[Baileys] Client connected: ${socket.id}`);

        socket.on("session:join", (data: { instituteId: string }) => {
          if (data?.instituteId) {
            socket.join(`whatsapp:${data.instituteId}`);
            const state = sessionManager?.getSessionState(data.instituteId);
            if (state) socket.emit("session:status", state);
          }
        });

        socket.on("session:leave", (data: { instituteId: string }) => {
          if (data?.instituteId) socket.leave(`whatsapp:${data.instituteId}`);
        });
      });

      // Set up command handlers
      setupSocketHandlers(io, sessionManager);

      const port = server.config.server.port || 8080;
      console.log(`\n  🚀 WhatsApp Baileys running inside Vite (port ${port})`);
      console.log(`  📡 REST API: http://localhost:${port}/api/health`);
      console.log(`  📡 WebSocket: ws://localhost:${port}/api/ws`);

      // Load existing sessions
      sessionManager.loadSessionsFromDb().then(() => {
        console.log(`  ✅ Loaded existing sessions from database`);
      });
    },
  };
}
