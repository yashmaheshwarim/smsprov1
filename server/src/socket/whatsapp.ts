import { Server as SocketIOServer } from "socket.io";
import { BaileysSessionManager } from "../baileys/session-manager.js";

export function setupSocketHandlers(io: SocketIOServer, sessionManager: BaileysSessionManager) {
  // Socket-based commands (in addition to REST)
  io.on("connection", (socket) => {
    // ── Room Management (multi-tenant isolation) ────────────────────────

    socket.on("session:join", (data: { instituteId: string }) => {
      if (data?.instituteId) {
        socket.join(`whatsapp:${data.instituteId}`);
        console.log(`[socket/whatsapp] Client ${socket.id} joined room whatsapp:${data.instituteId}`);

        // Send current session state immediately
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
        // This handles the case where the client joins the room AFTER the QR was emitted
        // (e.g., socket was still connecting when Baileys first generated the QR)
        const session = sessionManager.getSession(data.instituteId);
        if (session?.qrCode) {
          console.log(`[socket/whatsapp] Re-emitting stored QR for institute ${data.instituteId}`);
          socket.emit("session:qr", { instituteId: data.instituteId, qr: session.qrCode });
        }
      }
    });

    socket.on("session:leave", (data: { instituteId: string }) => {
      if (data?.instituteId) {
        socket.leave(`whatsapp:${data.instituteId}`);
        console.log(`[socket/whatsapp] Client ${socket.id} left room whatsapp:${data.instituteId}`);
      }
    });

    // Connect session
    socket.on("session:connect", async (data: { instituteId: string }) => {
      if (!data?.instituteId) {
        socket.emit("session:error", { error: "Missing instituteId" });
        return;
      }
      try {
        await sessionManager.connect(data.instituteId);
      } catch (err: any) {
        socket.emit("session:error", { instituteId: data.instituteId, error: err.message });
      }
    });

    // Disconnect session
    socket.on("session:disconnect", async (data: { instituteId: string }) => {
      if (!data?.instituteId) return;
      try {
        await sessionManager.disconnect(data.instituteId);
      } catch (err: any) {
        socket.emit("session:error", { instituteId: data.instituteId, error: err.message });
      }
    });

    // Logout session
    socket.on("session:logout", async (data: { instituteId: string }) => {
      if (!data?.instituteId) return;
      try {
        await sessionManager.logout(data.instituteId);
      } catch (err: any) {
        socket.emit("session:error", { instituteId: data.instituteId, error: err.message });
      }
    });

    // Send message
    socket.on("message:send", async (data: { instituteId: string; to: string; text: string }) => {
      if (!data?.instituteId || !data?.to || !data?.text) {
        socket.emit("message:error", { error: "Missing required fields" });
        return;
      }
      const result = await sessionManager.sendMessage(data.instituteId, data.to, data.text);
      socket.emit("message:sent", { ...result, instituteId: data.instituteId });
    });
  });
}
