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

// Accept any localhost origin (any port) + any explicitly configured origin
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOrigin = (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
  // Allow requests with no origin (server-to-server, curl, etc.)
  if (!origin) return cb(null, true);
  // Allow any localhost origin regardless of port
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return cb(null, true);
  // Allow any 127.0.0.1 origin
  if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return cb(null, true);
  // Allow any explicitly configured origins
  if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
  cb(null, true); // In dev, allow all
};

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
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST"],
  },
});

app.use(cors({ origin: corsOrigin }));
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

// Send a message
app.post("/api/sessions/:instituteId/send", async (req, res) => {
  const { to, text } = req.body;
  if (!to || !text) {
    return res.status(400).json({ success: false, error: "Missing 'to' or 'text'" });
  }
  const result = await sessionManager.sendMessage(req.params.instituteId, to, text);
  res.json(result);
});

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", sessions: sessionManager.getAllSessions().length });
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
  console.log(`\n  🚀 WhatsApp Baileys Server running on port ${PORT}`);
  console.log(`  🌐 CORS origin: ${CORS_ORIGIN}`);
  console.log(`  📡 WebSocket: socket.io`);

  // Load previously connected sessions and auto-connect
  sessionManager.loadSessionsFromDb().then(() => {
    console.log(`  ✅ Loaded existing sessions from database`);
  });
});
