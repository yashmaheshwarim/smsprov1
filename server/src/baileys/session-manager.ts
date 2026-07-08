import { Server as SocketIOServer } from "socket.io";
import { makeWASocket, DisconnectReason, useMultiFileAuthState, WASocket, fetchLatestBaileysVersion, Browsers } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import * as fs from "node:fs";
import * as path from "node:path";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import pino from "pino";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BaileysSession {
  instituteId: string;
  socket: WASocket | null;
  status: "disconnected" | "connecting" | "connected" | "error";
  phone?: string;
  qrCode?: string;
  error?: string;
  connectedAt?: string;
  lastDisconnectedAt?: string;
}

export interface SessionState {
  instituteId: string;
  status: BaileysSession["status"];
  phone?: string;
  error?: string;
  connectedAt?: string;
  lastDisconnectedAt?: string;
}

// ─── Session Manager ─────────────────────────────────────────────────────────

export class BaileysSessionManager {
  private sessions: Map<string, BaileysSession> = new Map();
  private io: SocketIOServer;
  private supabase: SupabaseClient | null = null;
  private supabaseAvailable = false;
  private authBaseDir: string;
  private logger: pino.Logger;

  constructor(io: SocketIOServer, supabaseUrl: string, supabaseKey: string, authDir: string = "./baileys_auth") {
    this.io = io;
    this.authBaseDir = path.resolve(authDir);
    this.logger = pino({ level: "warn" });

    // Only create Supabase client if both URL and key are provided
    if (supabaseUrl && supabaseKey) {
      try {
        this.supabase = createClient(supabaseUrl, supabaseKey);
        this.supabaseAvailable = true;
      } catch (err) {
        this.logger.warn("Failed to create Supabase client:", err);
        this.supabaseAvailable = false;
      }
    } else {
      this.logger.info("Supabase not configured — session metadata won't persist to DB.");
      this.logger.info("QR connection and file-based auth still work normally.");
    }

    // Ensure auth directory exists
    if (!fs.existsSync(this.authBaseDir)) {
      fs.mkdirSync(this.authBaseDir, { recursive: true });
    }
  }

  // ── Session Access ─────────────────────────────────────────────────────────

  getSession(instituteId: string): BaileysSession | undefined {
    return this.sessions.get(instituteId);
  }

  getAllSessions(): BaileysSession[] {
    return Array.from(this.sessions.values());
  }

  getSessionState(instituteId: string): SessionState | null {
    const session = this.sessions.get(instituteId);
    if (!session) return null;
    return {
      instituteId: session.instituteId,
      status: session.status,
      phone: session.phone,
      error: session.error,
      connectedAt: session.connectedAt,
      lastDisconnectedAt: session.lastDisconnectedAt,
    };
  }

  // ── Connection Management ──────────────────────────────────────────────────

  async connect(instituteId: string): Promise<void> {
    // If already connected or connecting, skip
    const existing = this.sessions.get(instituteId);
    if (existing?.status === "connected" || existing?.status === "connecting") {
      return;
    }

    const session: BaileysSession = {
      instituteId,
      socket: null,
      status: "connecting",
    };
    this.sessions.set(instituteId, session);
    this.emitStatus(instituteId);

    try {
      const authDir = path.join(this.authBaseDir, `institute_${instituteId}`);
      if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
      }

      const { state, saveCreds } = await useMultiFileAuthState(authDir);
      const { version, isLatest } = await fetchLatestBaileysVersion();

      this.logger.info(`Baileys version: ${version.join(".")}, isLatest: ${isLatest}`);

      const sock = makeWASocket({
        version,
        auth: state,
        logger: this.logger,
        browser: Browsers.windows("Chrome"),
        printQRInTerminal: false,
        markOnlineOnConnect: true,
        syncFullHistory: false,
      });

      session.socket = sock;

      // Handle connection updates
      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          session.qrCode = qr;
          session.status = "connecting";
          this.emitQR(instituteId, qr);
          this.emitStatus(instituteId);
        }

        if (connection === "open") {
          session.status = "connected";
          session.qrCode = undefined;
          session.connectedAt = new Date().toISOString();
          session.lastDisconnectedAt = undefined;

          // Get connected phone number
          try {
            const user = sock.user;
            if (user?.id) {
              session.phone = user.id.split(":")[0];
            }
          } catch {}

          this.emitStatus(instituteId);
          this.emitConnected(instituteId, session.phone);

          // Save to Supabase
          await this.saveSessionToDb(instituteId, {
            status: "connected",
            phone: session.phone,
          });
        }

        if (connection === "close") {
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          session.status = "disconnected";
          session.qrCode = undefined;
          session.lastDisconnectedAt = new Date().toISOString();
          session.phone = undefined;

          this.logger.info(`Connection closed for ${instituteId}, code: ${statusCode}, reconnect: ${shouldReconnect}`);

          // Update Supabase immediately
          await this.saveSessionToDb(instituteId, {
            status: "disconnected",
            phone: undefined,
          });

          // Clean up socket reference
          session.socket = null;

          // Debounce the "disconnected" emission to avoid UI flicker on transient drops.
          // Wait 2 seconds — if the session has already reconnected by then, skip the emit.
          const debounceTimer = setTimeout(() => {
            const currentSession = this.sessions.get(instituteId);
            if (currentSession?.status === "disconnected") {
              this.emitStatus(instituteId);
              this.emitDisconnected(instituteId, statusCode);
            }
          }, 2000);

          // Auto-reconnect if not logged out
          if (shouldReconnect) {
            this.logger.info(`Auto-reconnecting ${instituteId}...`);
            setTimeout(() => {
              clearTimeout(debounceTimer);
              this.connect(instituteId);
            }, 5000);
          }
        }
      });

      // Handle credentials update
      sock.ev.on("creds.update", saveCreds);

      // Handle incoming messages + status updates
      sock.ev.on("messages.upsert", async (msgEvent) => {
        if (msgEvent.type === "notify") {
          this.io.to(`whatsapp:${instituteId}`).emit("message:received", {
            instituteId,
            messages: msgEvent.messages.map((m) => ({
              id: m.key.id,
              from: m.key.remoteJid,
              text: m.message?.conversation || m.message?.extendedTextMessage?.text || "",
              timestamp: m.messageTimestamp,
            })),
          });
        }
      });

      // Handle message status updates (delivery receipts, read receipts)
      sock.ev.on("messages.update", async (updates) => {
        for (const update of updates) {
          const msgId = update.key?.id;
          if (!msgId) continue;

          const status = update.update?.status;
          // Baileys status values: 1 = delivered (server ACK), 2 = read (blue double check)
          if (status === 1) {
            // Message was delivered to recipient's device
            this.io.to(`whatsapp:${instituteId}`).emit("message:delivered", {
              instituteId,
              id: msgId,
              from: update.key?.remoteJid,
              status: "delivered",
              timestamp: new Date().toISOString(),
            });
            this.logger.info(`Message ${msgId} delivered for institute ${instituteId}`);
          } else if (status === 2) {
            // Message was read by recipient
            this.io.to(`whatsapp:${instituteId}`).emit("message:read", {
              instituteId,
              id: msgId,
              from: update.key?.remoteJid,
              status: "read",
              timestamp: new Date().toISOString(),
            });
            this.logger.info(`Message ${msgId} read for institute ${instituteId}`);
          }
        }
      });

      this.logger.info(`Session initiated for institute ${instituteId}`);
    } catch (err: any) {
      session.status = "error";
      session.error = err.message || "Unknown error";
      this.emitStatus(instituteId);
      this.logger.error(`Failed to connect ${instituteId}:`, err);
    }
  }

  async disconnect(instituteId: string): Promise<void> {
    const session = this.sessions.get(instituteId);
    if (session?.socket) {
      session.socket.end(undefined);
      session.socket = null;
    }
    session.status = "disconnected";
    session.qrCode = undefined;
    session.phone = undefined;
    session.lastDisconnectedAt = new Date().toISOString();

    await this.saveSessionToDb(instituteId, { status: "disconnected", phone: undefined });
    this.emitStatus(instituteId);
    this.emitDisconnected(instituteId);
  }

  async logout(instituteId: string): Promise<void> {
    const session = this.sessions.get(instituteId);
    if (session?.socket) {
      session.socket.logout();
      session.socket.end(undefined);
      session.socket = null;
    }

    // Remove auth files to force fresh scan
    const authDir = path.join(this.authBaseDir, `institute_${instituteId}`);
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true, force: true });
    }

    session.status = "disconnected";
    session.qrCode = undefined;
    session.phone = undefined;

    await this.saveSessionToDb(instituteId, { status: "disconnected", phone: undefined });
    this.emitStatus(instituteId);
  }

  // ── Message Sending ────────────────────────────────────────────────────────

  async sendMessage(instituteId: string, to: string, text: string): Promise<{ success: boolean; id?: string; error?: string }> {
    const session = this.sessions.get(instituteId);
    if (!session?.socket || session.status !== "connected") {
      return { success: false, error: "Not connected" };
    }

    try {
      // Format phone: remove non-digits, ensure it has country code
      const cleanPhone = to.replace(/\D/g, "");
      const jid = cleanPhone.includes("@") ? cleanPhone : `${cleanPhone}@s.whatsapp.net`;

      const result = await session.socket.sendMessage(jid, { text });
      return {
        success: true,
        id: result?.key?.id,
      };
    } catch (err: any) {
      this.logger.error(`Failed to send message for ${instituteId}:`, err);
      return { success: false, error: err.message || "Send failed" };
    }
  }

  // ── Supabase Integration ───────────────────────────────────────────────────

  private async saveSessionToDb(instituteId: string, data: { status?: string; phone?: string }): Promise<void> {
    if (!this.supabaseAvailable || !this.supabase) return;
    try {
      const config: Record<string, any> = {};
      if (data.phone) config.phone = data.phone;
      config.last_updated = new Date().toISOString();

      const { error } = await this.supabase.from("institute_integrations").upsert(
        {
          institute_id: instituteId,
          provider: "baileys",
          config,
          status: data.status || "disconnected",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "institute_id,provider" }
      );

      if (error) {
        this.logger.error(`Failed to save session to DB for ${instituteId}:`, error);
      }
    } catch (err) {
      this.logger.error(`DB save error for ${instituteId}:`, err);
    }
  }

  async loadSessionsFromDb(): Promise<void> {
    if (!this.supabaseAvailable || !this.supabase) {
      this.logger.info("Supabase not available — skipping session auto-load from DB.");
      return;
    }
    try {
      const { data, error } = await this.supabase
        .from("institute_integrations")
        .select("institute_id, status, config")
        .eq("provider", "baileys")
        .eq("status", "connected");

      if (error) {
        this.logger.error("Failed to load sessions from DB:", error);
        return;
      }

      if (data) {
        for (const row of data) {
          this.logger.info(`Auto-connecting session for institute ${row.institute_id}`);
          this.connect(row.institute_id);
        }
      }
    } catch (err) {
      this.logger.error("Error loading sessions:", err);
    }
  }

  // ── Socket.IO Emitters ─────────────────────────────────────────────────────

  private emitStatus(instituteId: string) {
    const session = this.sessions.get(instituteId);
    if (!session) return;
    this.io.to(`whatsapp:${instituteId}`).emit("session:status", {
      instituteId,
      status: session.status,
      phone: session.phone,
      error: session.error,
      connectedAt: session.connectedAt,
      lastDisconnectedAt: session.lastDisconnectedAt,
    });
  }

  private emitQR(instituteId: string, qr: string) {
    this.io.to(`whatsapp:${instituteId}`).emit("session:qr", { instituteId, qr });
  }

  private emitConnected(instituteId: string, phone?: string) {
    this.io.to(`whatsapp:${instituteId}`).emit("session:connected", { instituteId, phone });
  }

  private emitDisconnected(instituteId: string, code?: number) {
    this.io.to(`whatsapp:${instituteId}`).emit("session:disconnected", { instituteId, code });
  }
}
