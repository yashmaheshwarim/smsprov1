import { Server as SocketIOServer } from "socket.io";
import { makeWASocket, DisconnectReason, useMultiFileAuthState, WASocket, fetchLatestBaileysVersion, Browsers } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import * as fs from "node:fs";
import * as path from "node:path";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import pino from "pino";

// ─── Reconnection Constants ──────────────────────────────────────────────────

/** Maximum consecutive connection failures before giving up */
const MAX_CONSECUTIVE_FAILURES = 8;
/** Initial retry delay in ms (doubles each failure up to MAX_RETRY_DELAY_MS) */
const BASE_RETRY_DELAY_MS = 5_000;
/** Cap for exponential backoff delay */
const MAX_RETRY_DELAY_MS = 300_000; // 5 minutes

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
  /** Number of consecutive connection failures (reset on successful connect) */
  consecutiveFailures: number;
  /** Timestamp of the last retry attempt */
  lastRetryAt?: number;
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
    // Use "error" level to suppress Baileys' own verbose internal logs
    // (decryption failures, notification parsing errors, etc.)
    this.logger = pino({ level: "error" });

    // Only create Supabase client if both URL and key are provided
    if (supabaseUrl && supabaseKey) {
      try {
        this.supabase = createClient(supabaseUrl, supabaseKey);
        this.supabaseAvailable = true;
      } catch (err) {
        this.logger.warn({ err }, "Failed to create Supabase client:");
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
      consecutiveFailures: existing?.consecutiveFailures ?? 0,
      lastRetryAt: existing?.lastRetryAt,
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
        /**
         * Increase default query timeout to reduce premature timeouts
         * during init queries (fetching chats, contacts) on slow connections.
         */
        defaultQueryTimeoutMs: 120_000, // 2 minutes
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

          // Reset consecutive failures on successful connection
          session.consecutiveFailures = 0;
          session.lastRetryAt = undefined;
          session.error = undefined;

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

          session.status = "disconnected";
          session.qrCode = undefined;
          session.lastDisconnectedAt = new Date().toISOString();
          session.phone = undefined;
          session.socket = null;

          // Increment failures before any decision
          session.consecutiveFailures++;
          session.lastRetryAt = Date.now();

          // ── Exponential backoff reconnection ──────────────────────────
          //
          // Common DisconnectReason codes:
          //   401 = loggedOut (don't reconnect)
          //   408 = connectionLost (timed out — usually phone offline)
          //   428 = connectionClosed (normal close)
          //   500 = badSession (auth corruption — suggest re-login)
          //   515 = restartRequired
          //
          // For badSession (500), stop retrying and prompt for fresh login.

          const isBadSession = statusCode === DisconnectReason.badSession;
          const shouldReconnect =
            statusCode !== DisconnectReason.loggedOut && !isBadSession;

          if (isBadSession) {
            this.logger.warn(
              `Bad session for ${instituteId} — auth may be corrupted. ` +
              `User should re-scan QR to get a fresh session.`
            );
            session.error = "Session corrupted — please re-scan QR code";
          }

          this.logger.info(
            `Connection closed for ${instituteId}, ` +
            `code: ${statusCode}, ` +
            `consecutive failures: ${session.consecutiveFailures}, ` +
            `reconnect: ${shouldReconnect}`
          );

          // Update Supabase
          await this.saveSessionToDb(instituteId, {
            status: isBadSession ? "error" : "disconnected",
            phone: undefined,
          });

          // Debounce the "disconnected" emission to avoid UI flicker on transient drops.
          // Wait 2 seconds — if the session has already reconnected by then, skip the emit.
          const debounceTimer = setTimeout(() => {
            const currentSession = this.sessions.get(instituteId);
            if (currentSession?.status === "disconnected") {
              this.emitStatus(instituteId);
              this.emitDisconnected(instituteId, statusCode);
            }
          }, 2000);

          // Auto-reconnect with exponential backoff
          if (shouldReconnect) {
            if (session.consecutiveFailures > MAX_CONSECUTIVE_FAILURES) {
              this.logger.warn(
                `Max consecutive failures (${MAX_CONSECUTIVE_FAILURES}) reached for ${instituteId}. ` +
                `Stopping auto-reconnect. User should re-scan QR.`
              );
              session.error = "Connection failed repeatedly — please re-scan QR code";
              session.status = "error";
              this.emitStatus(instituteId);
              return;
            }

            // Calculate delay: base * 2^(failures-1), capped at MAX_RETRY_DELAY_MS
            // e.g. 5s, 10s, 20s, 40s, 80s, 160s, 300s, 300s
            const delay = Math.min(
              BASE_RETRY_DELAY_MS * Math.pow(2, session.consecutiveFailures - 1),
              MAX_RETRY_DELAY_MS
            );

            this.logger.info(
              `Auto-reconnecting ${instituteId} in ${Math.round(delay / 1000)}s ` +
              `(attempt ${session.consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})...`
            );

            setTimeout(() => {
              clearTimeout(debounceTimer);
              this.connect(instituteId);
            }, delay);
          }
        }
      });

      // Handle credentials update
      sock.ev.on("creds.update", saveCreds);

      // Handle incoming messages
      sock.ev.on("messages.upsert", async (msgEvent) => {
        // Only process actual push notifications (not history sync)
        if (msgEvent.type !== "notify") return;

        // Filter out messages that couldn't be decrypted or are protocol-only
        const validMessages = msgEvent.messages.filter((m) => {
          if (!m.key?.id || !m.key?.remoteJid) return false;
          // Skip protocol stub messages (deleted, edited, etc.)
          if (m.messageStubType !== undefined && m.messageStubType !== null) return false;
          // Skip messages with no content (undecryptable)
          if (!m.message) return false;
          return true;
        });

        if (validMessages.length === 0) return;

        this.io.to(`whatsapp:${instituteId}`).emit("message:received", {
          instituteId,
          messages: validMessages.map((m) => ({
            id: m.key.id,
            from: m.key.remoteJid,
            text: m.message?.conversation || m.message?.extendedTextMessage?.text || "",
            timestamp: m.messageTimestamp,
          })),
        });
      });

      // Handle message updates (delivery receipts + read receipts + decryption events)
      sock.ev.on("messages.update", async (updates) => {
        for (const update of updates) {
          const msgId = update.key?.id;
          if (!msgId) continue;

          // Check for decryption/protocol stub types — log at debug, they're handled internally
          if (update.update?.messageStubType !== undefined) {
            if (update.update.messageStubType === 100) {
              // Stub type 100 = CIPHERTEXT (decryption failure) — auto-recovery is enabled
              this.logger.debug(`Decryption failure for message ${msgId} — auto-recovery enabled`);
            }
            continue; // Skip protocol stubs, only process real status changes below
          }

          const status = update.update?.status;
          // Baileys status values: 1 = delivered (server ACK), 2 = read (blue double check)
          if (status === 1) {
            this.io.to(`whatsapp:${instituteId}`).emit("message:delivered", {
              instituteId,
              id: msgId,
              from: update.key?.remoteJid,
              status: "delivered",
              timestamp: new Date().toISOString(),
            });
            this.logger.info(`Message ${msgId} delivered for institute ${instituteId}`);
          } else if (status === 2) {
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
      session.error = err?.message || "Unknown error";
      this.emitStatus(instituteId);
      this.logger.error({ err }, `Failed to connect ${instituteId}:`);
    }
  }

  async disconnect(instituteId: string): Promise<void> {
    const session = this.sessions.get(instituteId);
    if (!session) return;
    if (session.socket) {
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
    if (!session) return;
    if (session.socket) {
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
        id: result?.key?.id || undefined,
      };
    } catch (err: any) {
      this.logger.error({ err }, `Failed to send message for ${instituteId}:`);
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
        this.logger.error({ error }, `Failed to save session to DB for ${instituteId}:`);
      }
    } catch (err) {
      this.logger.error({ err }, `DB save error for ${instituteId}:`);
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
        this.logger.error({ error }, "Failed to load sessions from DB:");
        return;
      }

      if (data) {
        for (const row of data) {
          this.logger.info(`Auto-connecting session for institute ${row.institute_id}`);
          this.connect(row.institute_id);
        }
      }
    } catch (err) {
      this.logger.error({ err }, "Error loading sessions:");
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
