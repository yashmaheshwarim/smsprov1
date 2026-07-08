import { io, Socket } from "socket.io-client";

export interface SessionStatus {
  instituteId: string;
  status: "disconnected" | "connecting" | "connected" | "error";
  phone?: string;
  error?: string;
  connectedAt?: string;
  lastDisconnectedAt?: string;
}

export interface QRData {
  instituteId: string;
  qr: string;
}

export interface MessageResult {
  success: boolean;
  instituteId?: string;
  id?: string;
  error?: string;
}

export interface SessionInfo {
  instituteId: string;
  status: SessionStatus["status"];
  phone?: string;
  connectedAt?: string;
  lastDisconnectedAt?: string;
  error?: string;
}

export interface MessageStatusEvent {
  instituteId: string;
  id: string;
  from?: string;
  status: "delivered" | "read";
  timestamp: string;
}

export type SessionEventCallback = {
  onStatus?: (status: SessionStatus) => void;
  onQR?: (data: QRData) => void;
  onConnected?: (data: { instituteId: string; phone?: string }) => void;
  onDisconnected?: (data: { instituteId: string; code?: number }) => void;
  onError?: (data: { instituteId?: string; error: string }) => void;
  onMessageSent?: (data: MessageResult) => void;
  onMessageDelivered?: (data: MessageStatusEvent) => void;
  onMessageRead?: (data: MessageStatusEvent) => void;
};

// ─── Socket Manager ──────────────────────────────────────────────────────────

// In dev mode the Baileys server is embedded in Vite, so connect to the same origin.
// Override with VITE_WHATSAPP_SERVER_URL if running standalone.
const WHATSAPP_SERVER_URL = import.meta.env.VITE_WHATSAPP_SERVER_URL || "";
export { WHATSAPP_SERVER_URL };

/** Get the base URL for API calls — defaults to current origin when embedded */
function getBaseUrl(): string {
  return WHATSAPP_SERVER_URL || window.location.origin;
}

class WhatsAppSocketClient {
  private socket: Socket | null = null;
  private instituteId: string | null = null;
  private callbacks: SessionEventCallback = {};
  private connected = false;
  private reconnectAttempts = 0;

  connect(instituteId: string, callbacks: SessionEventCallback): void {
    // If already connected to this same institute, just update callbacks — don't reconnect
    if (this.instituteId === instituteId && this.connected && this.socket?.connected) {
      this.callbacks = callbacks;
      return;
    }
    this.instituteId = instituteId;
    this.callbacks = callbacks;
    this.reconnectAttempts = 0;
    this.doConnect();
  }

  private doConnect(): void {
    // Clean up old socket if any
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.socket = io(getBaseUrl(), {
      path: "/api/ws",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      timeout: 10000,
    });

    this.socket.on("connect", () => {
      console.log("[WhatsAppSocket] Connected to server");
      this.connected = true;
      this.reconnectAttempts = 0;

      // Join institute room
      if (this.instituteId) {
        this.socket?.emit("session:join", { instituteId: this.instituteId });
      }
    });

    this.socket.on("disconnect", (reason) => {
      console.log("[WhatsAppSocket] Disconnected:", reason);
      this.connected = false;
    });

    this.socket.on("connect_error", () => {
      this.connected = false;
      this.reconnectAttempts++;
    });

    // Session events
    this.socket.on("session:status", (data: SessionStatus) => {
      this.callbacks.onStatus?.(data);
    });

    this.socket.on("session:qr", (data: QRData) => {
      this.callbacks.onQR?.(data);
    });

    this.socket.on("session:connected", (data: { instituteId: string; phone?: string }) => {
      this.callbacks.onConnected?.(data);
    });

    this.socket.on("session:disconnected", (data: { instituteId: string; code?: number }) => {
      this.callbacks.onDisconnected?.(data);
    });

    this.socket.on("session:error", (data: { instituteId?: string; error: string }) => {
      this.callbacks.onError?.(data);
    });

    this.socket.on("message:sent", (data: MessageResult) => {
      this.callbacks.onMessageSent?.(data);
    });

    this.socket.on("message:delivered", (data: MessageStatusEvent) => {
      this.callbacks.onMessageDelivered?.(data);
    });

    this.socket.on("message:read", (data: MessageStatusEvent) => {
      this.callbacks.onMessageRead?.(data);
    });
  }

  disconnect(): void {
    if (this.instituteId && this.socket?.connected) {
      this.socket.emit("session:leave", { instituteId: this.instituteId });
    }
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
    }
    this.socket = null;
    this.instituteId = null;
    this.connected = false;
  }

  // Commands
  async commandConnect(instituteId: string): Promise<void> {
    this.socket?.emit("session:connect", { instituteId });
  }

  async commandDisconnect(instituteId: string): Promise<void> {
    this.socket?.emit("session:disconnect", { instituteId });
  }

  async commandLogout(instituteId: string): Promise<void> {
    this.socket?.emit("session:logout", { instituteId });
  }

  async sendMessage(instituteId: string, to: string, text: string): Promise<void> {
    this.socket?.emit("message:send", { instituteId, to, text });
  }

  get isConnected(): boolean {
    return this.connected;
  }
}

export const whatsappSocket = new WhatsAppSocketClient();

// ─── REST API Fallback ───────────────────────────────────────────────────────

export async function fetchSessionStatus(instituteId: string): Promise<SessionInfo | null> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/sessions/${instituteId}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchAllSessions(): Promise<SessionInfo[]> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/sessions`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.sessions || [];
  } catch {
    return [];
  }
}

export async function restConnectSession(instituteId: string): Promise<boolean> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/sessions/${instituteId}/connect`, { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function restDisconnectSession(instituteId: string): Promise<boolean> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/sessions/${instituteId}/disconnect`, { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function restLogoutSession(instituteId: string): Promise<boolean> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/sessions/${instituteId}/logout`, { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function restSendMessage(instituteId: string, to: string, text: string): Promise<MessageResult> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/sessions/${instituteId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, text }),
    });
    return res.json();
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function restSendBatch(instituteId: string, messages: { to: string; text: string }[]): Promise<{ success: boolean; results: MessageResult[] }> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/sessions/${instituteId}/send-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });
    return res.json();
  } catch (err: any) {
    return { success: false, results: [] };
  }
}
