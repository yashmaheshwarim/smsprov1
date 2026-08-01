import { io, Socket } from "socket.io-client";

// ─── WhatsApp Client (multi-protocol) ──────────────────────────────────────
// Supports THREE server backends, auto-selected by the WhatsApp page settings:
//
//   1. Baileys server (self-hosted, no API key)
//      - The `server/` folder in this repo — deploy on Render/Railway and
//        paste the deployed link into Server Settings. No API key needed.
//      - REST   : /api/sessions/:instituteId  · /connect · /disconnect
//                 /logout · /refresh-qr · /send · /send-batch · /health
//      - Auth   : none
//
//   2. OpenWA (https://github.com/rmyndharis/OpenWA) — requires API key
//      - Base URL : http://<host>:2785  (or the full https://host up.railway.app)
//      - Auth     : X-API-Key header (printed to startup log / data/.api-key)
//      - Sessions : POST /api/sessions {name} · GET /api/sessions/:id
//                   POST /api/sessions/:id/start|stop|logout
//      - QR       : GET /api/sessions/:id/qr → { qrCode: "data:image/png;base64,..." }
//      - Messages : POST /api/sessions/:id/messages/send-text {chatId, text}
//      - Health   : GET /api/health
//
//   3. Serverless (Supabase Edge Functions) — no URL/API key in the browser
//      - Base URL : <supabase-url>/functions/v1/whatsapp-gateway
//      - The Edge Function proxies to the persistent gateway (OpenWA/Baileys)
//        using per-institute config stored in `whatsapp_gateway_config` (or
//        env vars). Every REST path in this file is transparently rewritten
//        to the function's routes (see toServerlessRoute + gatewayFetch).
//      - Supports QR codes AND WhatsApp pairing codes ("link with phone number").
//
// Session naming (OpenWA): we use the institute UUID as the session *name*
// (UUIDs match OpenWA's ^[a-zA-Z0-9-]+$ name rule). The OpenWA session *id*
// (a separate UUID) is resolved by listing sessions and matching by name,
// then cached in memory. In serverless mode the Edge Function does this
// resolution instead (cached in the config table). The Baileys server uses
// the instituteId directly.

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
  qrCode?: string;
  pairingCode?: string;
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

// ─── Server URL Configuration ───────────────────────────────────────────────
// Priority: localStorage custom URL > VITE_WHATSAPP_SERVER_URL env var > window.location.origin

const STORAGE_KEY = "whatsapp_server_url";
const API_KEY_STORAGE_KEY = "openwa_api_key";
const SEND_DELAY_STORAGE_KEY = "whatsapp_send_delay_ms";

/** Env var build-time URL (set in Netlify/Vercel) */
const WHATSAPP_SERVER_URL = import.meta.env.VITE_WHATSAPP_SERVER_URL || "";
export { WHATSAPP_SERVER_URL };

/** Get the user's custom server URL from localStorage (if any) */
export function getCustomServerUrl(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Save a custom server URL to localStorage */
export function setCustomServerUrl(url: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, url);
  } catch {
    // localStorage may be unavailable
  }
}

/** Clear the custom server URL from localStorage (revert to env var / default) */
export function clearCustomServerUrl(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage may be unavailable
  }
}

/** Strip trailing slash from a URL to avoid double-slash issues like //api/health */
export function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Normalize a server URL for OpenWA: strip trailing slashes AND a trailing
 * `/api` segment. OpenWA's README shows the API at `http://host:2785/api`, but
 * every request in this file already appends `/api/...`, so the stored URL must
 * be the bare origin (`http://host:2785`) or we get `//api/api/...` 404s.
 */
export function normalizeBaseUrl(url: string): string {
  const clean = stripTrailingSlash(url);
  return clean.replace(/\/api$/i, "");
}

// ─── Inter-message send delay (customizable) ────────────────────────────────
// Used by restSendBatch and the bulk/absent-notification send loops. Persisted
// in localStorage so each institute's admin can tune it from the WhatsApp page.

export const DEFAULT_SEND_DELAY_MS = 3000; // 3s — safe anti-ban default (matches queue pacing)
export const MIN_SEND_DELAY_MS = 500;
export const MAX_SEND_DELAY_MS = 60000;

/** Clamp a raw delay (ms) into the allowed range */
export function clampSendDelayMs(ms: number): number {
  if (!Number.isFinite(ms)) return DEFAULT_SEND_DELAY_MS;
  return Math.min(MAX_SEND_DELAY_MS, Math.max(MIN_SEND_DELAY_MS, Math.round(ms)));
}

/** Current inter-message delay in ms (localStorage > default 4s) */
export function getSendDelayMs(): number {
  try {
    const raw = localStorage.getItem(SEND_DELAY_STORAGE_KEY);
    if (raw) {
      const parsed = parseInt(raw, 10);
      if (!Number.isNaN(parsed)) return clampSendDelayMs(parsed);
    }
  } catch {
    // localStorage may be unavailable
  }
  return DEFAULT_SEND_DELAY_MS;
}

/** Persist the inter-message delay (ms) */
export function setSendDelayMs(ms: number): void {
  try {
    localStorage.setItem(SEND_DELAY_STORAGE_KEY, String(clampSendDelayMs(ms)));
  } catch {
    // localStorage may be unavailable
  }
}

/** Get the effective base URL for API calls (normalized, no trailing /api) */
export function getBaseUrl(): string {
  const custom = getCustomServerUrl();
  if (custom) return normalizeBaseUrl(custom);
  return normalizeBaseUrl(WHATSAPP_SERVER_URL || window.location.origin);
}

export type UrlSource = "custom" | "env" | "default" | "serverless";

/**
 * Base URL of the Supabase Edge Function (serverless control plane).
 * Empty when the Supabase URL isn't configured.
 */
export function getServerlessBase(): string {
  const url = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  return url ? `${url}/functions/v1/whatsapp-gateway` : "";
}

/**
 * Optional shared secret for the serverless control plane. Only enforced by
 * the Edge Function when WHATSAPP_APP_SECRET is configured there — set
 * VITE_WHATSAPP_APP_SECRET at build time to enable multi-tenant hardening.
 */
const WHATSAPP_APP_SECRET = import.meta.env.VITE_WHATSAPP_APP_SECRET || "";

function serverlessHeaders(extra: Record<string, string> = {}): HeadersInit {
  const headers: Record<string, string> = { ...extra };
  if (WHATSAPP_APP_SECRET) headers["x-app-secret"] = WHATSAPP_APP_SECRET;
  return headers;
}

/** Human-readable description of which URL is being used and its source */
export function getServerUrlDescription(): { url: string; source: UrlSource } {
  if (isServerless()) {
    return { url: getServerlessBase() || "Supabase Edge Functions", source: "serverless" };
  }
  const custom = getCustomServerUrl();
  if (custom) {
    return { url: normalizeBaseUrl(custom), source: "custom" };
  }
  if (WHATSAPP_SERVER_URL) {
    return { url: normalizeBaseUrl(WHATSAPP_SERVER_URL), source: "env" };
  }
  return { url: window.location.origin, source: "default" };
}

// ─── Server Presets (alternative hosting options) ─────────────────────────
// The WhatsApp page lets admins point the app at any OpenWA-compatible
// gateway. These presets cover the most common hosting options so a user can
// pick their provider and just fill in the actual URL/API key.

export interface ServerPreset {
  id: string;
  label: string;
  provider: "OpenWA" | "Baileys" | "Serverless" | "Custom";
  description: string;
  /** Example URL — may contain <placeholders> the user replaces */
  url: string;
  /** Which backend this preset targets — drives the API-key requirement */
  serverType: ServerType;
  /** Whether an API key is required for this provider */
  apiKeyRequired: boolean;
  /** Default API port (only set when meaningful) */
  port?: number;
}

export const SERVER_PRESETS: ServerPreset[] = [
  {
    id: "baileys-render",
    label: "Baileys Server · Render",
    provider: "Baileys",
    description: "Your deployed Baileys server on Render (Web Service) — no API key needed.",
    url: "https://<your-service>.onrender.com",
    serverType: "baileys",
    apiKeyRequired: false,
  },
  {
    id: "baileys-railway",
    label: "Baileys Server · Railway",
    provider: "Baileys",
    description: "Your deployed Baileys server on Railway (auto-restarts on failure) — no API key needed.",
    url: "https://<your-service>.up.railway.app",
    serverType: "baileys",
    apiKeyRequired: false,
  },
  {
    id: "openwa-hosted",
    label: "OpenWA · Hosted (Railway/Render/Fly)",
    provider: "OpenWA",
    description: "OpenWA deployed anywhere with a public URL — requires its API key.",
    url: "https://<your-openwa>.up.railway.app",
    serverType: "openwa",
    apiKeyRequired: true,
  },
  {
    id: "serverless",
    label: "Serverless · Supabase Edge Functions",
    provider: "Serverless",
    description: "No server URL or API key stored in this browser — a Supabase Edge Function proxies to your gateway. Configure the gateway in the Serverless panel below.",
    url: "",
    serverType: "serverless",
    apiKeyRequired: false,
  },
  {
    id: "custom",
    label: "Custom URL",
    provider: "Custom",
    description: "Any other endpoint — pick the backend below.",
    url: "",
    serverType: "baileys",
    apiKeyRequired: false,
  },
];



// ─── OpenWA API Key Management ──────────────────────────────────────────────
// Priority: localStorage (set in the Server Settings dialog) > VITE_OPENWA_API_KEY env var

const OPENWA_API_KEY = import.meta.env.VITE_OPENWA_API_KEY || "";

export function getApiKey(): string {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY) || OPENWA_API_KEY;
  } catch {
    return OPENWA_API_KEY;
  }
}

export function setApiKey(key: string): void {
  try {
    if (key) localStorage.setItem(API_KEY_STORAGE_KEY, key);
    else localStorage.removeItem(API_KEY_STORAGE_KEY);
  } catch {
    // localStorage may be unavailable
  }
}

export function clearApiKey(): void {
  try {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  } catch {
    // localStorage may be unavailable
  }
}

/** True when an OpenWA API key is configured (localStorage or env) */
export function isApiKeyConfigured(): boolean {
  return !!getApiKey();
}

// ─── Server Type (Baileys vs OpenWA) ───────────────────────────────────────
// The app supports two WhatsApp backends:
//   - "baileys": the self-hosted Baileys server (this repo's server/ folder,
//     deployed on Render/Railway). No API key required.
//   - "openwa": the OpenWA gateway. API key required.
// Auto-detected (API key present → openwa), with an explicit override the
// WhatsApp page can persist.

export type ServerType = "baileys" | "openwa" | "serverless";

const SERVER_TYPE_STORAGE_KEY = "whatsapp_server_type";

/** Get the active server type (explicit setting, else auto-detect) */
export function getServerType(): ServerType {
  try {
    const raw = localStorage.getItem(SERVER_TYPE_STORAGE_KEY);
    if (raw === "baileys" || raw === "openwa" || raw === "serverless") return raw;
  } catch {
    /* ignore */
  }
  // Auto-detect: an API key only makes sense for OpenWA
  return isApiKeyConfigured() ? "openwa" : "baileys";
}

/** Persist an explicit server type override */
export function setServerType(type: ServerType): void {
  try {
    localStorage.setItem(SERVER_TYPE_STORAGE_KEY, type);
  } catch {
    /* ignore */
  }
}

/** Clear the server-type override (back to auto-detect) */
export function clearServerType(): void {
  try {
    localStorage.removeItem(SERVER_TYPE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** True when talking to an OpenWA gateway (requires API key) */
export function isOpenWA(): boolean {
  return getServerType() === "openwa";
}

/** True when talking to the Supabase Edge Function serverless control plane */
export function isServerless(): boolean {
  return getServerType() === "serverless";
}

/**
 * True when a WhatsApp gateway is configured for sending.
 * - Baileys server: always available (no key needed)
 * - OpenWA: requires the API key
 * - Serverless: config lives server-side (per-institute DB row / env vars);
 *   the health probe surfaces "unconfigured" when nothing is set.
 */
export function isGatewayConfigured(): boolean {
  if (isServerless()) return true;
  return isOpenWA() ? isApiKeyConfigured() : true;
}

// ─── Internal helpers ───────────────────────────────────────────────────────

/** Session-id cache: instituteId → OpenWA session id */
const sessionIdCache = new Map<string, string>();
/** In-flight session resolution promises — dedupes concurrent list+create calls */
const sessionInflight = new Map<string, Promise<string>>();

function apiHeaders(json = false): Record<string, string> {
  const headers: Record<string, string> = {};
  // Only OpenWA needs the X-API-Key header; the Baileys server ignores it and
  // the serverless layer stores the key server-side (never sent to the browser).
  if (isOpenWA()) {
    const key = getApiKey();
    if (key) headers["X-API-Key"] = key;
  }
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

/**
 * Route a gateway REST path through the active transport.
 * - Baileys / OpenWA: direct fetch against the gateway base URL.
 * - Serverless: rewrite to a Supabase Edge Function route and inject the
 *   institute id (query param for GET, body field for POST/PUT).
 */
function toServerlessRoute(path: string): { route: string; instituteId?: string } {
  const match = path.match(/^\/api\/sessions\/([^/]+)(?:\/([a-z-]+))?$/i);
  const id = match?.[1];
  const action = match?.[2];
  const actionRoutes: Record<string, string> = {
    "": "session", // GET /api/sessions/:id → status
    connect: "connect",
    disconnect: "disconnect",
    logout: "logout",
    "refresh-qr": "refresh-qr",
    qr: "qr",
    send: "send",
    "pairing-code": "pairing-code",
  };
  if (match && (action === undefined || actionRoutes[action] !== undefined)) {
    return { route: `/${actionRoutes[action ?? ""]}`, instituteId: id };
  }
  if (/^\/api\/sessions$/.test(path)) return { route: "/sessions" };
  if (/^\/api\/health$/.test(path)) return { route: "/health" };
  // Unknown path — pass through unchanged (fallback)
  return { route: path };
}  /**
   * Fetch through the active transport. In serverless mode the gateway path is
   * rewritten to the Edge Function route and institute_id is injected.
   */
  async function gatewayFetch(path: string, options: RequestInit = {}): Promise<Response> {
    if (!isServerless()) {
      return fetch(`${getBaseUrl()}${path}`, options);
    }
  const base = getServerlessBase();
  if (!base) {
    return Promise.reject(new Error("Serverless mode is enabled but no Supabase URL is configured"));
  }
  const { route, instituteId } = toServerlessRoute(path);
  const headers = new Headers(options.headers || {});
  if (WHATSAPP_APP_SECRET) headers.set("x-app-secret", WHATSAPP_APP_SECRET);
  const needsInstitute = !!instituteId && route !== "/sessions" && route !== "/health" && route !== "/config";

  if (needsInstitute && (options.method === "POST" || options.method === "PUT")) {
    let body: Record<string, unknown> = {};
    if (options.body) {
      try { body = JSON.parse(String(options.body)); } catch { body = {}; }
    }
    options = { ...options, body: JSON.stringify({ ...body, institute_id: instituteId }) };
  }
  const sep = route.includes("?") ? "&" : "?";
  const target =
    needsInstitute && (!options.method || options.method === "GET")
      ? `${route}${sep}institute_id=${encodeURIComponent(instituteId!)}`
      : route;
  return fetch(`${base}${target}`, { ...options, headers });
}

/** Raw fetch wrapper against the active gateway base URL (or serverless route) */
async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await gatewayFetch(path, options);
  if (!res.ok) {
    let message = `Server error ${res.status}`;
    let body: any = null;
    try {
      body = await res.json();
      message = body?.message || body?.error || message;
    } catch {
      /* keep default message */
    }
    // Surface the deploy hint when the serverless Edge Function isn't deployed yet.
    if (isServerless() && isFunctionNotDeployed(body)) {
      message = FUNCTION_NOT_DEPLOYED_HINT;
    }
    const err: any = new Error(message);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/**
 * OpenWA health check — sends the X-API-Key header so it also works when the
 * server protects /api/health (the key is otherwise never exercised by the
 * page's reachability probes). Returns reachability + any error detail.
 */
/**
 * Supabase Edge Functions 404 body when the requested function isn't deployed.
 * We surface this specific error so admins know to deploy `whatsapp-gateway`
 * instead of guessing why the page shows "offline".
 */
const FUNCTION_NOT_DEPLOYED_HINT =
  "The whatsapp-gateway Edge Function is not deployed on Supabase yet. From the repo root run: npx supabase functions deploy whatsapp-gateway --no-verify-jwt";

/** True when a gateway error body is Supabase's "Requested function not found" */
export function isFunctionNotDeployed(data: { error?: string; code?: number; message?: string } | null | undefined): boolean {
  if (!data) return false;
  return (
    data?.error === "Requested function not found" ||
    data?.message === "Requested function not found" ||
    data?.code === 404
  ) && /function not found/i.test(`${data?.error || data?.message || ""}`);
}

export async function fetchServerHealth(baseUrl?: string, instituteId?: string): Promise<{ ok: boolean; status?: number; message?: string; version?: string; latencyMs?: number; functionNotDeployed?: boolean }> {
  const startedAt = Date.now();
  // Serverless: probe the Edge Function, which reports the configured gateway's health.
  if (isServerless()) {
    try {
      const base = getServerlessBase();
      if (!base) {
        return { ok: false, message: "Serverless mode is enabled but no Supabase URL is configured (VITE_SUPABASE_URL).", latencyMs: Date.now() - startedAt };
      }
      // Pass the institute id so the Edge Function probes THAT institute's
      // gateway config (multitenant), not just the env-var fallback.
      const q = instituteId ? `?institute_id=${encodeURIComponent(instituteId)}` : "";
      const resp = await fetch(`${base}/health${q}`, {
        headers: serverlessHeaders(),
        signal: AbortSignal.timeout(8000),
      });
      const latencyMs = Date.now() - startedAt;
      const data: any = await resp.json().catch(() => ({}));
      if (isFunctionNotDeployed(data)) {
        return { ok: false, status: 404, functionNotDeployed: true, message: FUNCTION_NOT_DEPLOYED_HINT, latencyMs };
      }
      return {
        ok: data?.ok === true,
        status: resp.status,
        version: data?.version,
        message: data?.message,
        latencyMs,
      };
    } catch (err: any) {
      return { ok: false, message: err?.message || "Cannot reach serverless gateway", latencyMs: Date.now() - startedAt };
    }
  }
  const url = normalizeBaseUrl(baseUrl ?? getBaseUrl());
  try {
    const resp = await fetch(`${url}/api/health`, {
      headers: apiHeaders(),
      signal: AbortSignal.timeout(8000),
    });
    const latencyMs = Date.now() - startedAt;
    if (resp.ok) {
      let version: string | undefined;
      try {
        version = (await resp.json())?.version;
      } catch {
        /* body may be empty */
      }
      return { ok: true, status: resp.status, version, latencyMs };
    }
    return { ok: false, status: resp.status, message: `Server responded with status ${resp.status}`, latencyMs };
  } catch (err: any) {
    return { ok: false, message: describeFetchError(err), latencyMs: Date.now() - startedAt };
  }
}

/**
 * Diagnose a fetch failure. "Failed to fetch" is what browsers report when the
 * server refuses the cross-origin request (CORS). OpenWA's production config
 * blocks wildcard origins (see its .env.example: CORS_ORIGINS="*" is refused
 * outside development), so a direct browser → OpenWA call is silently blocked
 * even though curl works fine. We surface an actionable hint so admins know to
 * use Serverless mode (the Edge Function calls the gateway server-to-server,
 * which sidesteps browser CORS entirely).
 */
export function describeFetchError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err || "");
  if (/failed to fetch|networkerror|network error|load failed|fetch failed|cors/i.test(msg)) {
    const origin = getCorsOriginsValue();
    return (
      "The browser blocked this request (CORS). OpenWA in production refuses cross-origin browser calls, so a direct " +
      "OpenWA URL can't be called from this app's origin" +
      (origin ? ` (${origin})` : "") +
      ". Fix: on your OpenWA host (Railway/Render) set the environment variable " +
      "CORS_ORIGINS to that origin (no trailing slash, comma-separated for multiple) and redeploy — " +
      "or use Serverless mode, where the Supabase Edge Function calls OpenWA server-to-server and bypasses browser CORS."
    );
  }
  return msg || "Cannot reach server";
}

/**
 * This app's exact origin (no trailing slash) — the value OpenWA's CORS_ORIGINS
 * needs to allow direct browser calls from the deployed app. CORS is exact-match
 * and OpenWA refuses a trailing slash, so we always strip one.
 */
export function getCorsOriginsValue(): string {
  try {
    return (window.location.origin || "").replace(/\/+$/, "");
  } catch {
    return "";
  }
}

/** The full env-var line to paste into Railway/Render for OpenWA, e.g. `CORS_ORIGINS=https://...` */
export function getCorsOriginsEnvLine(): string {
  const origin = getCorsOriginsValue();
  return origin ? `CORS_ORIGINS=${origin}` : "";
}

/**
 * Validate an OpenWA API key by hitting the (authenticated) sessions endpoint.
 * Used by the settings dialog's "Test Connection" so a wrong key is reported
 * as "API key invalid" instead of a generic "cannot reach server".
 */
export async function verifyApiKey(baseUrl?: string, apiKey?: string): Promise<{ ok: boolean; message: string }> {
  const url = normalizeBaseUrl(baseUrl ?? getBaseUrl());
  const headers: Record<string, string> = {};
  const key = apiKey ?? getApiKey();
  if (key) headers["X-API-Key"] = key;
  try {
    const resp = await fetch(`${url}/api/sessions`, { headers, signal: AbortSignal.timeout(8000) });
    if (resp.ok) return { ok: true, message: "API key is valid" };
    if (resp.status === 401) return { ok: false, message: "API key is missing or invalid" };
    if (resp.status === 403) return { ok: false, message: "API key lacks permission for this action" };
    return { ok: false, message: `Server responded with status ${resp.status}` };
  } catch (err: any) {
    return { ok: false, message: describeFetchError(err) };
  }
}

// ─── Keep-alive heartbeat ────────────────────────────────────────────────────
// Free tiers on Render / Railway sleep after ~15 min of inactivity, which
// makes the WhatsApp server appear "offline". The page keeps a lightweight
// keep-alive heartbeat running while it's open: a small GET /api/health ping
// every few minutes keeps the instance warm (and detects outages early).
// Also used to expose a live uptime + latency readout in the UI.

const KEEPALIVE_STORAGE_KEY = "whatsapp_keepalive_enabled";

let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
let lastHealthPing: { at: number; latencyMs?: number } | null = null;

/** Whether the page's keep-alive heartbeat is enabled (default: true) */
export function isKeepAliveEnabled(): boolean {
  try {
    return localStorage.getItem(KEEPALIVE_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setKeepAliveEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.removeItem(KEEPALIVE_STORAGE_KEY);
    else localStorage.setItem(KEEPALIVE_STORAGE_KEY, "0");
  } catch {
    /* localStorage may be unavailable */
  }
}

/** Timestamp + latency of the most recent successful health ping */
export function getLastHealthPing(): { at: number; latencyMs?: number } | null {
  return lastHealthPing;
}

/**
 * Start the keep-alive heartbeat (a lightweight /api/health GET at a fixed
 * interval). Pings keep free-tier hosts (Render/Railway) from sleeping and
 * keep the server status badge fresh. Safe to call repeatedly.
 *
 * Pass `{ immediate: false }` to skip the initial ping (e.g. when the caller
 * just health-checked) — avoids a redundant duplicate request on mount.
 */
export function startKeepAlive(intervalMs?: number, opts?: { immediate?: boolean }): void {
  stopKeepAlive();
  if (!isKeepAliveEnabled()) return;
  // Default 3 min between pings — enough to keep Render/Railway free tiers awake
  const interval = clampKeepAlive(intervalMs ?? 3 * 60 * 1000);

  const ping = async () => {
    const result = await fetchServerHealth();
    if (result.ok) {
      lastHealthPing = { at: Date.now(), latencyMs: result.latencyMs };
    }
  };

  if (opts?.immediate !== false) void ping();
  keepAliveTimer = setInterval(() => void ping(), interval);
}

/** Stop the keep-alive heartbeat */
export function stopKeepAlive(): void {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

/** Clamp a keep-alive interval to the allowed range (30s – 30min) */
export function clampKeepAlive(ms: number): number {
  if (!Number.isFinite(ms)) return 3 * 60 * 1000;
  return Math.min(30 * 60 * 1000, Math.max(30 * 1000, Math.round(ms)));
}

/**
 * Resolve the OpenWA session id for an institute. Creates the session on first
 * use (session name = institute UUID). Throws when the server is unreachable.
 */
async function ensureSessionOrThrow(instituteId: string): Promise<string> {
  // The Baileys server addresses sessions directly by instituteId — no
  // session-id resolution needed.
  if (!isOpenWA()) return instituteId;

  const cached = sessionIdCache.get(instituteId);
  if (cached) return cached;

  // Dedupe concurrent resolutions for the same institute (e.g. the polling
  // socket and a dashboard status check firing at the same time).
  const inflight = sessionInflight.get(instituteId);
  if (inflight) return inflight;

  const promise = (async () => {
    const sessions = await apiRequest<any[]>("/api/sessions", { headers: apiHeaders() });
    let found = (sessions || []).find((s: any) => s.name === instituteId);

    if (!found) {
      found = await apiRequest<any>("/api/sessions", {
        method: "POST",
        headers: apiHeaders(true),
        body: JSON.stringify({ name: instituteId }),
      });
    }

    if (found?.id) {
      sessionIdCache.set(instituteId, found.id);
      return found.id;
    }
    throw new Error("OpenWA session could not be resolved");
  })().finally(() => {
    sessionInflight.delete(instituteId);
  });

  sessionInflight.set(instituteId, promise);
  return promise;
}

/** Map an OpenWA session status to the app's SessionStatus */
function mapOpenWAStatus(status?: string): SessionStatus["status"] {
  switch (status) {
    case "ready":
      return "connected";
    case "initializing":
    case "qr_ready":
    case "authenticating":
    case "created":
      return "connecting";
    case "failed":
    case "action_required":
      return "error";
    case "disconnected":
    default:
      return "disconnected";
  }
}

/** Normalize a phone number to OpenWA chatId format (91XXXXXXXXXX@c.us) */
function toChatId(to: string): string {
  if (to.includes("@")) return to;
  const digits = to.replace(/\D/g, "");
  return `${digits}@c.us`;
}

// ─── Polling Socket Client ──────────────────────────────────────────────────
// OpenWA does not share the legacy Socket.IO event protocol, so the client
// polls session status + QR at a fixed cadence and fans events out through the
// same callback surface the UI already uses.

class WhatsAppSocketClient {
  private instituteId: string | null = null;
  private callbacks: SessionEventCallback = {};
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = true;

  /** Socket.IO QR push channel (lazy fallback for Baileys servers without /qr route) */
  private qrSocket: Socket | null = null;
  /** Set once the socket channel fails (e.g. 502 on old builds) — stop retrying */
  private qrSocketFailed = false;

  private lastStatus: string | null = null;
  private lastPhone: string | null = null;
  private lastQR: string | null = null;

  connect(instituteId: string, callbacks: SessionEventCallback): void {
    if (this.instituteId === instituteId && this.pollTimer) {
      this.callbacks = callbacks;
      return;
    }
    this.instituteId = instituteId;
    this.callbacks = callbacks;
    this.stopped = false;
    this.lastStatus = null;
    this.lastPhone = null;
    this.lastQR = null;
    this.qrSocketFailed = false;

    // Kick off an immediate poll, then poll adaptively (2s while connecting so
    // the freshly-generated QR is picked up fast, 4s otherwise).
    // NOTE: the Socket.IO QR fallback is NOT opened here — it is opened lazily
    // from pollOnce only when a QR is needed and the REST path returned nothing,
    // so it never spams 502 handshake errors against old builds.
    void this.pollOnce();
    this.schedulePoll();
  }

  /**
   * Lazily open the Socket.IO QR push channel — only called from pollOnce when
   * a QR is needed AND the REST status/`/qr` path returned nothing. Fail-fast
   * (no auto-reconnect): old builds reject the handshake with a 502, so we try
   * once, mark it failed, and rely on REST polling instead.
   */
  private connectQRSocket(): void {
    if (!this.instituteId || isOpenWA() || isServerless() || this.qrSocketFailed) return;
    // Socket already exists (e.g. institute switched without an intervening
    // disconnect) — just re-join the current institute's room.
    if (this.qrSocket) {
      this.qrSocket.emit("session:join", { instituteId: this.instituteId });
      return;
    }
    try {
      // Polling-only: avoids the 502 websocket-handshake console error that
      // old builds produce, and polling is the more proxy-friendly transport
      // for a fallback channel anyway.
      const sock = io(getBaseUrl(), {
        transports: ["polling"],
        reconnection: false,
        timeout: 8000,
      });
      this.qrSocket = sock;
      sock.on("connect", () => {
        sock.emit("session:join", { instituteId: this.instituteId });
      });
      sock.on("session:qr", (data: { instituteId?: string; qr?: string }) => {
        if (this.stopped || !data?.qr) return;
        if (data.qr !== this.lastQR) {
          this.lastQR = data.qr;
          this.callbacks.onQR?.({ instituteId: this.instituteId!, qr: data.qr });
        }
      });
      sock.on("connect_error", () => {
        // Old builds reject the socket handshake (502) — stop trying, rely on REST.
        this.qrSocketFailed = true;
        sock.disconnect();
        this.qrSocket = null;
      });
    } catch {
      this.qrSocket = null;
    }
  }

  /**
   * (Re)schedule the polling interval based on the current status:
   * 2s while connecting (QR appears/rotates quickly, important on slow servers),
   * 4s otherwise (connected/idle — keeps server load low).
   */
  private schedulePoll(): void {
    if (this.stopped || !this.instituteId) return;
    if (this.pollTimer) clearInterval(this.pollTimer);
    const delay = this.lastStatus === "connecting" ? 2000 : 4000;
    this.pollTimer = setInterval(() => void this.pollOnce(), delay);
  }

  private async pollOnce(): Promise<void> {
    if (this.stopped || !this.instituteId) return;
    const instituteId = this.instituteId;

    let info: SessionInfo | null = null;
    try {
      info = await fetchSessionStatus(instituteId);
    } catch {
      info = null;
    }
    if (this.stopped) return;

    if (!info) {
      // Server unreachable or no API key — emit a safe disconnected status so
      // the UI becomes interactive (the Server Offline badge covers messaging).
      if (this.lastStatus !== "disconnected") {
        this.lastStatus = "disconnected";
        this.callbacks.onStatus?.({ instituteId, status: "disconnected" });
      }
      return;
    }

    // Status transitions
    const statusKey = `${info.status}|${info.phone || ""}`;
    if (statusKey !== `${this.lastStatus}|${this.lastPhone || ""}`) {
      this.lastStatus = info.status;
      this.lastPhone = info.phone || null;
      this.callbacks.onStatus?.({
        instituteId,
        status: info.status,
        phone: info.phone,
        error: info.error,
        connectedAt: info.connectedAt,
        lastDisconnectedAt: info.lastDisconnectedAt,
      });
    }

    if (info.status === "connected") {
      this.callbacks.onConnected?.({ instituteId, phone: info.phone });
    } else if (info.status === "connecting") {
      // Prefer the QR bundled in the status response (single request on slow
      // links); fall back to the dedicated /qr endpoint. Only when BOTH return
      // nothing do we try the lazy Socket.IO push channel (once, fail-fast).
      let qr = info.qrCode || null;
      if (!qr) qr = await this.fetchQR();
      if (qr && qr !== this.lastQR) {
        this.lastQR = qr;
        this.callbacks.onQR?.({ instituteId, qr });
      } else if (!qr) {
        this.connectQRSocket();
      }
    } else if (info.status === "error" && info.error) {
      this.callbacks.onError?.({ instituteId, error: info.error });
    } else if (info.status === "disconnected") {
      this.callbacks.onDisconnected?.({ instituteId });
    }

    // Keep the poll cadence matched to the connection state
    this.schedulePoll();
  }

  private async fetchQR(): Promise<string | null> {
    if (!this.instituteId) return null;
    try {
      if (!isOpenWA()) {
        // Baileys server exposes the stored QR code directly by instituteId
        const data = await apiRequest<any>(`/api/sessions/${this.instituteId}/qr`, { headers: apiHeaders() });
        return data?.qrCode || null;
      }
      const sessionId = await ensureSessionOrThrow(this.instituteId);
      const data = await apiRequest<any>(`/api/sessions/${sessionId}/qr`, { headers: apiHeaders() });
      return data?.qrCode || null;
    } catch {
      return null;
    }
  }

  disconnect(): void {
    this.stopped = true;
    if (this.qrSocket) {
      this.qrSocket.disconnect();
      this.qrSocket = null;
    }
    this.qrSocketFailed = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.instituteId = null;
  }

  // Command shims — kept for API compatibility; the UI uses the REST helpers below.
  async commandConnect(instituteId: string): Promise<void> {
    await restConnectSession(instituteId);
  }

  async commandDisconnect(instituteId: string): Promise<void> {
    await restDisconnectSession(instituteId);
  }

  async commandLogout(instituteId: string): Promise<void> {
    await restLogoutSession(instituteId);
  }

  async sendMessage(instituteId: string, to: string, text: string): Promise<void> {
    await restSendMessage(instituteId, to, text);
  }

  get isConnected(): boolean {
    return this.lastStatus === "connected";
  }
}

export const whatsappSocket = new WhatsAppSocketClient();

// ─── REST API (OpenWA) ──────────────────────────────────────────────────────

/** Fetch the current session status for an institute (creates the session lazily) */
export async function fetchSessionStatus(instituteId: string): Promise<SessionInfo | null> {
  try {
    if (!isOpenWA()) {
      // Baileys / serverless: session is addressed directly by instituteId
      const session = await apiRequest<any>(`/api/sessions/${instituteId}`, { headers: apiHeaders() });
      return {
        instituteId,
        status: session.status || "disconnected",
        phone: session.phone || undefined,
        qrCode: session.qrCode || undefined,
        pairingCode: session.pairingCode || undefined,
        connectedAt: session.connectedAt || undefined,
        lastDisconnectedAt: session.lastDisconnectedAt || undefined,
        error: session.error || undefined,
      };
    }
    const sessionId = await ensureSessionOrThrow(instituteId);
    const session = await apiRequest<any>(`/api/sessions/${sessionId}`, { headers: apiHeaders() });
    return {
      instituteId,
      status: mapOpenWAStatus(session.status),
      phone: session.phone || undefined,
      connectedAt: session.connectedAt || undefined,
      lastDisconnectedAt: undefined,
      error: session.lastError || undefined,
    };
  } catch (err: any) {
    // Surface auth/permission failures so the UI can tell the user their
    // API key is wrong instead of silently showing "not connected".
    if (err?.status === 401 || err?.status === 403) {
      return {
        instituteId,
        status: "error",
        error: isOpenWA()
          ? (err.status === 401
              ? "OpenWA API key is missing or invalid. Add it in Server Settings."
              : "OpenWA API key lacks permission for this action.")
          : "Server rejected the request. Check the server URL.",
      };
    }
    // 404 = session not created yet on the Baileys server — treat as disconnected
    if (err?.status === 404 && !isOpenWA()) {
      return { instituteId, status: "disconnected" };
    }
    return null;
  }
}

/** List all sessions known to the gateway */
export async function fetchAllSessions(): Promise<SessionInfo[]> {
  try {
    if (!isOpenWA()) {
      // Baileys returns { sessions: [...] } with instituteId directly
      const data = await apiRequest<any>("/api/sessions", { headers: apiHeaders() });
      const list = data?.sessions || data || [];
      return (Array.isArray(list) ? list : []).map((s: any) => ({
        instituteId: s.instituteId,
        status: s.status || "disconnected",
        phone: s.phone || undefined,
        connectedAt: s.connectedAt || undefined,
        lastDisconnectedAt: s.lastDisconnectedAt || undefined,
        error: s.error || undefined,
      }));
    }
    const sessions = await apiRequest<any[]>("/api/sessions", { headers: apiHeaders() });
    return (sessions || []).map((s: any) => ({
      instituteId: s.name || s.id,
      status: mapOpenWAStatus(s.status),
      phone: s.phone || undefined,
      connectedAt: s.connectedAt || undefined,
      lastDisconnectedAt: undefined,
      error: s.lastError || undefined,
    }));
  } catch {
    return [];
  }
}

/** Create (if needed) and start the session for an institute */
export async function restConnectSession(instituteId: string): Promise<boolean> {
  try {
    if (!isOpenWA()) {
      const res = await gatewayFetch(`/api/sessions/${instituteId}/connect`, {
        method: "POST",
        headers: apiHeaders(),
      });
      return res.ok || res.status === 400;
    }
    const sessionId = await ensureSessionOrThrow(instituteId);
    const res = await gatewayFetch(`/api/sessions/${sessionId}/start`, {
      method: "POST",
      headers: apiHeaders(),
    });
    // 400 = already started/starting, which is fine
    return res.ok || res.status === 400;
  } catch {
    return false;
  }
}

/** Force a fresh QR by stopping + restarting the session */
export async function restRefreshQR(instituteId: string): Promise<boolean> {
  try {
    if (!isOpenWA()) {
      // Baileys server handles the reconnect internally via refresh-qr
      const res = await gatewayFetch(`/api/sessions/${instituteId}/refresh-qr`, {
        method: "POST",
        headers: apiHeaders(),
      });
      return res.ok;
    }
    const sessionId = await ensureSessionOrThrow(instituteId);
    await gatewayFetch(`/api/sessions/${sessionId}/stop`, {
      method: "POST",
      headers: apiHeaders(),
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, 800));
    const res = await gatewayFetch(`/api/sessions/${sessionId}/start`, {
      method: "POST",
      headers: apiHeaders(),
    });
    return res.ok || res.status === 400;
  } catch {
    return false;
  }
}

/** Stop the session (disconnects WhatsApp, keeps auth) */
export async function restDisconnectSession(instituteId: string): Promise<boolean> {
  try {
    if (!isOpenWA()) {
      const res = await gatewayFetch(`/api/sessions/${instituteId}/disconnect`, {
        method: "POST",
        headers: apiHeaders(),
      });
      return res.ok || res.status === 400;
    }
    const sessionId = await ensureSessionOrThrow(instituteId);
    const res = await gatewayFetch(`/api/sessions/${sessionId}/stop`, {
      method: "POST",
      headers: apiHeaders(),
    });
    // 400 = session not started, which is effectively already stopped
    return res.ok || res.status === 400;
  } catch {
    return false;
  }
}

/** Logout the session (clears WhatsApp auth, a fresh QR will be needed) */
export async function restLogoutSession(instituteId: string): Promise<boolean> {
  try {
    if (!isOpenWA()) {
      const res = await gatewayFetch(`/api/sessions/${instituteId}/logout`, {
        method: "POST",
        headers: apiHeaders(),
      });
      return res.ok;
    }
    const sessionId = await ensureSessionOrThrow(instituteId);
    const res = await gatewayFetch(`/api/sessions/${sessionId}/logout`, {
      method: "POST",
      headers: apiHeaders(),
    });
    sessionIdCache.delete(instituteId);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Wait for an inter-message delay (ms) with a small ±10% jitter so send
 * patterns are less deterministic (anti-ban). Clamps to the valid range.
 */
async function waitSendDelay(delayMs: number): Promise<void> {
  const d = clampSendDelayMs(delayMs);
  const jittered = Math.round(d + (Math.random() - 0.5) * d * 0.2);
  await new Promise((r) => setTimeout(r, Math.max(MIN_SEND_DELAY_MS, jittered)));
}

/**
 * Send a single text message through OpenWA.
 * An optional per-message delay (ms) can be supplied to throttle single sends;
 * when provided, it waits (with anti-ban jitter) before sending. Omit it to
 * send immediately — the default for all existing callers.
 */
export async function restSendMessage(instituteId: string, to: string, text: string, delayMs?: number): Promise<MessageResult> {
  try {
    if (!isOpenWA()) {
      // Optional per-message delay override — waits before sending when set.
      if (delayMs !== undefined) await waitSendDelay(delayMs);
      const data = await apiRequest<any>(
        `/api/sessions/${instituteId}/send`,
        {
          method: "POST",
          headers: apiHeaders(true),
          body: JSON.stringify({ to, text }),
        }
      );
      return { success: data?.success === true, instituteId, id: data?.id, error: data?.error };
    }
    const sessionId = await ensureSessionOrThrow(instituteId);
    // Optional per-message delay override — waits before sending when set.
    // Applied after session resolution so connection errors surface immediately.
    if (delayMs !== undefined) {
      await waitSendDelay(delayMs);
    }
    const data = await apiRequest<any>(
      `/api/sessions/${sessionId}/messages/send-text`,
      {
        method: "POST",
        headers: apiHeaders(true),
        body: JSON.stringify({ chatId: toChatId(to), text }),
      }
    );
    return { success: true, instituteId, id: data.messageId };
  } catch (err: any) {
    return { success: false, instituteId, error: err?.message || "Send failed" };
  }
}

/**
 * Send multiple text messages sequentially with a customizable anti-ban delay
 * between each. The delay comes from (in order): an explicit delayMs argument,
 * else the persisted setting (see getSendDelayMs / the WhatsApp page), else the
 * 4s default. Returns per-message results.
 */
export async function restSendBatch(
  instituteId: string,
  messages: { to: string; text: string }[],
  delayMs?: number
): Promise<{ success: boolean; results: MessageResult[] }> {
  if (!messages || messages.length === 0) return { success: true, results: [] };

  const delay = clampSendDelayMs(delayMs ?? getSendDelayMs());
  const results: MessageResult[] = [];
  try {
    if (!isOpenWA()) {
      // Loop client-side (one /send per message with the configured delay) so
      // the UI gets live per-message progress, matching the OpenWA path. The
      // Baileys server also has a /send-batch endpoint, but it only responds
      // after all messages finish, which stalls the progress bar.
      for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        try {
          const data = await apiRequest<any>(
            `/api/sessions/${instituteId}/send`,
            {
              method: "POST",
              headers: apiHeaders(true),
              body: JSON.stringify({ to: m.to, text: m.text }),
            }
          );
          results.push({ success: data?.success === true, instituteId, id: data?.id, error: data?.error });
        } catch (err: any) {
          results.push({ success: false, instituteId, error: err?.message || "Send failed" });
        }
        if (i < messages.length - 1) {
          // Small ±10% jitter keeps send patterns less deterministic (anti-ban)
          await waitSendDelay(delay);
        }
      }
      return { success: results.some((r) => r.success), results };
    }
    const sessionId = await ensureSessionOrThrow(instituteId);
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      try {
        const data = await apiRequest<any>(
          `/api/sessions/${sessionId}/messages/send-text`,
          {
            method: "POST",
            headers: apiHeaders(true),
            body: JSON.stringify({ chatId: toChatId(m.to), text: m.text }),
          }
        );
        results.push({ success: true, instituteId, id: data.messageId });
      } catch (err: any) {
        results.push({ success: false, instituteId, error: err?.message || "Send failed" });
      }
      if (i < messages.length - 1) {
        // Small ±10% jitter keeps send patterns less deterministic (anti-ban)
        await waitSendDelay(delay);
      }
    }
    return { success: results.some((r) => r.success), results };
  } catch (err: any) {
    const error = err?.message || "Batch send failed";
    return {
      success: false,
      results: messages.map(() => ({ success: false, instituteId, error })),
    };
  }
}

// ─── Serverless mode helpers (Supabase Edge Functions) ─────────────────────
// In serverless mode the gateway URL + API key live server-side (per-institute
// row in `whatsapp_gateway_config`, or env vars on the function). These helpers
// read / write / test that config through the Edge Function.

export interface ServerlessGatewayConfig {
  configured: boolean;
  base_url: string;
  server_type: ServerType;
  source: "db" | "env";
  has_api_key: boolean;
  api_key_masked?: string;
  /** Edge Function set this when the config table is missing (migration not applied) */
  config_error?: string;
}

/** Read this institute's serverless gateway config (API key is masked) */
export async function getServerlessConfig(instituteId: string): Promise<ServerlessGatewayConfig | null> {
  if (!instituteId) return null;
  try {
    const res = await fetch(`${getServerlessBase()}/config?institute_id=${encodeURIComponent(instituteId)}`, {
      headers: serverlessHeaders(),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as ServerlessGatewayConfig;
  } catch {
    return null;
  }
}

/** Save this institute's gateway config (URL, key, type) via the Edge Function */
export async function saveServerlessConfig(
  instituteId: string,
  cfg: { base_url: string; api_key?: string; server_type?: ServerType }
): Promise<{ ok: boolean; message?: string }> {
  if (!instituteId) return { ok: false, message: "Invalid institute ID" };
  try {
    const res = await fetch(`${getServerlessBase()}/config`, {
      method: "PUT",
      headers: serverlessHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ institute_id: instituteId, ...cfg }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: data?.error || `Server error ${res.status}` };
    return { ok: true };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Cannot reach serverless gateway" };
  }
}

/**
 * Test a gateway configuration through the serverless layer. When `cfg` is
 * provided it tests that (unsaved) config; otherwise it tests the saved one.
 */
export async function testServerlessConnection(
  instituteId: string,
  cfg?: { base_url: string; api_key?: string; server_type?: ServerType }
): Promise<{ ok: boolean; message?: string; version?: string; latencyMs?: number }> {
  if (!instituteId) return { ok: false, message: "Invalid institute ID" };
  try {
    const res = await fetch(`${getServerlessBase()}/test`, {
      method: "POST",
      headers: serverlessHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ institute_id: instituteId, ...cfg }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: data?.error || `Server error ${res.status}` };
    return {
      ok: data?.ok === true,
      message: data?.message,
      version: data?.version,
      latencyMs: data?.latencyMs,
    };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Cannot reach serverless gateway" };
  }
}

/**
 * Request a WhatsApp pairing code ("link with phone number instead").
 * Works with the Baileys server and the serverless layer; OpenWA gateways that
 * don't expose pairing return a clear error.
 */
export async function restRequestPairingCode(
  instituteId: string,
  phone: string
): Promise<{ success: boolean; code?: string; error?: string }> {
  try {
    if (isServerless()) {
      const res = await fetch(`${getServerlessBase()}/pairing-code`, {
        method: "POST",
        headers: serverlessHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ institute_id: instituteId, phone }),
        signal: AbortSignal.timeout(20000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false, error: data?.error || `Server error ${res.status}` };
      return { success: data?.ok === true, code: data?.code, error: data?.error };
    }
    if (isOpenWA()) {
      const sessionId = await ensureSessionOrThrow(instituteId);
      const data = await apiRequest<any>(
        `/api/sessions/${sessionId}/pairing-code`,
        {
          method: "POST",
          headers: apiHeaders(true),
          body: JSON.stringify({ phone }),
        }
      );
      return { success: true, code: data?.code, error: data?.error };
    }
    const data = await apiRequest<any>(
      `/api/sessions/${instituteId}/pairing-code`,
      {
        method: "POST",
        headers: apiHeaders(true),
        body: JSON.stringify({ phone }),
      }
    );
    return { success: data?.success === true, code: data?.code, error: data?.error };
  } catch (err: any) {
    return { success: false, error: err?.message || "Pairing code request failed" };
  }
}
