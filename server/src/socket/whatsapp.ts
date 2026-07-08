import { Server as SocketIOServer } from "socket.io";
import { BaileysSessionManager } from "../baileys/session-manager.js";

export function setupSocketHandlers(io: SocketIOServer, sessionManager: BaileysSessionManager) {
  // Socket-based commands (in addition to REST)
  io.on("connection", (socket) => {
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
