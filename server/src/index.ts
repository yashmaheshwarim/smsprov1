import "dotenv/config";
import { config as loadDotenv } from "dotenv";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { createServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import { BaileysSessionManager } from "./baileys/session-manager.js";
import { setupSocketHandlers } from "./socket/whatsapp.js";

// ─── Environment ─────────────────────────────────────────────────────────────
// Load .env from server/ first, then fall back to root project .env
loadDotenv({ path: path.resolve(__dirname, "../.env") });
loadDotenv({ path: path.resolve(__dirname, "../../.env") });

const PORT = parseInt(process.env.PORT || "3001", 10);
// Try server-specific vars first, then fall back to Vite-prefixed vars from root .env
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

// Allow any origin — CORS is managed via Render's firewall / Cloudflare.
// In dev mode this is needed for localhost:8080 → Render cross-origin requests.
// To restrict origins in production, set CORS_ORIGIN env var to a comma-separated list.
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Use origin: true (reflect request origin) for reliable CORS behavior.
// This matches vite-plugin.ts and avoids edge cases where the cors package
// doesn't add headers to 404 responses from non-existent routes.
const corsConfig = ALLOWED_ORIGINS.length > 0
  ? { origin: ALLOWED_ORIGINS, methods: ["GET", "POST", "OPTIONS"] }
  : { origin: true, methods: ["GET", "POST", "OPTIONS"] };

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.log("⚠️  Supabase credentials not found. Session metadata won't persist to DB.");
  console.log("   QR connection, auth files, and messaging still work fine.");
  console.log("   To enable DB persistence, create server/.env with:");
  console.log("     SUPABASE_URL=...");
  console.log("     SUPABASE_SERVICE_ROLE_KEY=...");
}

// ─── App Setup ───────────────────────────────────────────────────────────────

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  path: "/api/ws",
  cors: corsConfig,
});

app.use(cors(corsConfig));
app.use(express.json());

// ─── Baileys Session Manager ─────────────────────────────────────────────────

const sessionManager = new BaileysSessionManager(io, SUPABASE_URL, SUPABASE_KEY);

// ─── REST API ────────────────────────────────────────────────────────────────

// Get all session states
app.get("/api/sessions", (_req, res) => {
  const sessions = sessionManager.getAllSessions().map((s) => ({
    instituteId: s.instituteId,
    status: s.status,
    phone: s.phone,
    connectedAt: s.connectedAt,
    lastDisconnectedAt: s.lastDisconnectedAt,
    error: s.error,
  }));
  res.json({ sessions });
});

// Get a specific session state
app.get("/api/sessions/:instituteId", (req, res) => {
  const state = sessionManager.getSessionState(req.params.instituteId);
  if (!state) {
    return res.status(404).json({ error: "Session not found" });
  }
  res.json(state);
});

// Connect / initiate session
app.post("/api/sessions/:instituteId/connect", async (req, res) => {
  try {
    await sessionManager.connect(req.params.instituteId);
    res.json({ success: true, message: "Session initiating" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Disconnect session
app.post("/api/sessions/:instituteId/disconnect", async (req, res) => {
  try {
    await sessionManager.disconnect(req.params.instituteId);
    res.json({ success: true, message: "Disconnected" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Logout (delete auth) session
app.post("/api/sessions/:instituteId/logout", async (req, res) => {
  try {
    await sessionManager.logout(req.params.instituteId);
    res.json({ success: true, message: "Logged out and auth cleared" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Refresh QR — force reconnect to generate a fresh QR code
// Use this when the client missed the initial QR (socket wasn't ready)
app.post("/api/sessions/:instituteId/refresh-qr", async (req, res) => {
  try {
    await sessionManager.forceReconnect(req.params.instituteId);
    res.json({ success: true, message: "Reconnecting to generate fresh QR" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Send a message
app.post("/api/sessions/:instituteId/send", async (req, res) => {
  const { to, text } = req.body;
  if (!to || !text) {
    return res.status(400).json({ success: false, error: "Missing 'to' or 'text'" });
  }
  const result = await sessionManager.sendMessage(req.params.instituteId, to, text);
  res.json(result);
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

    const result = await sessionManager.sendMessage(req.params.instituteId, to, text);
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

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    sessions: sessionManager.getAllSessions().length,
    sessionsDetail: sessionManager.getAllSessions().map(s => ({
      instituteId: s.instituteId,
      status: s.status,
    })),
  });
});

// ─── Socket.IO ───────────────────────────────────────────────────────────────

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Client joins a room for their institute
  socket.on("session:join", (data: { instituteId: string }) => {
    if (data?.instituteId) {
      socket.join(`whatsapp:${data.instituteId}`);
      console.log(`Client ${socket.id} joined room whatsapp:${data.instituteId}`);

      // Send current session state
      const state = sessionManager.getSessionState(data.instituteId);
      if (state) {
        socket.emit("session:status", state);
      } else {
        // Always emit a default disconnected status so the client knows
        // the socket is ready, even if no session exists yet
        socket.emit("session:status", {
          instituteId: data.instituteId,
          status: "disconnected",
        });
      }

      // 🔁 Re-emit QR code if session is connecting and has one stored
      // Handles the race condition where client socket joins AFTER QR was first emitted
      const session = sessionManager.getSession(data.instituteId);
      if (session?.qrCode) {
        console.log(`Re-emitting stored QR for institute ${data.instituteId}`);
        socket.emit("session:qr", { instituteId: data.instituteId, qr: session.qrCode });
      }
    }
  });

  socket.on("session:leave", (data: { instituteId: string }) => {
    if (data?.instituteId) {
      socket.leave(`whatsapp:${data.instituteId}`);
    }
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Set up socket command handlers
setupSocketHandlers(io, sessionManager);

// ─── Start ───────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  const corsOriginDisplay = process.env.CORS_ORIGIN || "all origins (*)";
  console.log(`\n  🚀 WhatsApp Baileys Server running on port ${PORT}`);
  console.log(`  🌐 CORS: ${corsOriginDisplay}`);
  console.log(`  📡 REST API: http://localhost:${PORT}/api/health`);
  console.log(`  📡 WebSocket: ws://localhost:${PORT}/api/ws`);
  console.log(`  📡 Server started at: ${new Date().toISOString()}`);

  // Load previously connected sessions and auto-connect
  sessionManager.loadSessionsFromDb().then(() => {
    console.log(`  ✅ Loaded existing sessions from database`);
  });
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n  📴 Shutting down server...");
  for (const s of sessionManager.getAllSessions()) {
    await sessionManager.disconnect(s.instituteId);
  }
  httpServer.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n  📴 Shutting down server...");
  for (const s of sessionManager.getAllSessions()) {
    await sessionManager.disconnect(s.instituteId);
  }
  httpServer.close();
  process.exit(0);
});
