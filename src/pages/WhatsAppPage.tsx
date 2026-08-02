import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/ui/stat-card";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import { supabase, isUuid } from "@/lib/supabase";
import { getMessageQueue, getQueueStats, QueueStats } from "@/lib/message-queue";
import { useTableRealtime } from "@/hooks/use-realtime";
import {
  whatsappSocket,
  fetchSessionStatus,
  restConnectSession,

  restDisconnectSession,
  restLogoutSession,
  restSendMessage,
  restSendBatch,
  restRefreshQR,
  getServerUrlDescription,
  getCustomServerUrl,
  setCustomServerUrl,
  clearCustomServerUrl,
  getApiKey,
  setApiKey,
  clearApiKey,
  isApiKeyConfigured,
  normalizeBaseUrl,
  fetchServerHealth,
  verifyApiKey,
  getSendDelayMs,
  setSendDelayMs,
  clampSendDelayMs,
  DEFAULT_SEND_DELAY_MS,
  SERVER_PRESETS,
  startKeepAlive,
  stopKeepAlive,
  getLastHealthPing,
  isKeepAliveEnabled,
  setKeepAliveEnabled,
  getServerType,
  setServerType,
  clearServerType,
  isOpenWA,
  isServerless,
  hydrateGatewayConfigFromDb,
  saveSharedGatewayConfig,
  restRequestPairingCode,
  getServerlessConfig,
  saveServerlessConfig,
  testServerlessConnection,
  getCorsOriginsEnvLine,
  type ServerPreset,
  type ServerType,
  type SessionStatus,
  type UrlSource,
} from "@/lib/whatsapp-socket";
import {
  Smartphone,
  QrCode,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  MessageSquare,
  Send,
  Clock,
  Signal,
  Phone,
  LogOut,
  Plug,
  X,
  Zap,
  AlertCircle,
  Wifi,
  Wallet,
  Users,
  Search,
  GraduationCap,
  Settings,
  ExternalLink,
  KeyRound,
  Cloud,
  Copy,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import QRCode from "qrcode";

interface Contact {
  id: string;
  name: string;
  phone: string;
  batch_name: string;
  enrollment_no: string;
}

export default function WhatsAppPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const instId = isAdmin ? (user as AdminUser).instituteId : "";
  const instituteName = isAdmin ? (user as AdminUser).instituteName : "";

  // Session state
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [serverAvailable, setServerAvailable] = useState(false);
  // Live server health readout (latency from the most recent health ping)
  const [serverLatency, setServerLatency] = useState<number | null>(null);
  const [lastHealthCheck, setLastHealthCheck] = useState<number | null>(null);
  // Keep-alive heartbeat toggle (persisted in localStorage)
  const [keepAliveEnabled, setKeepAliveEnabledState] = useState(isKeepAliveEnabled());

  // Socket readiness — ensure WebSocket is connected before showing connect button
  const [socketReady, setSocketReady] = useState(false);

  // QR timeout detection — if connecting for >= 15s without QR, offer refresh
  const [qrWaitingLong, setQrWaitingLong] = useState(false);
  const [refreshingQr, setRefreshingQr] = useState(false);

  // Message sending
  const [sendTo, setSendTo] = useState("");
  const [sendText, setSendText] = useState("");
  const [sending, setSending] = useState(false);
  // Per-message delay override for Quick Send (seconds). Empty = send immediately.
  // Stored as a string so the field can be empty while typing.
  const [quickDelayInput, setQuickDelayInput] = useState<string>("");
  const quickDelayMs = useMemo(() => {
    const v = parseFloat(quickDelayInput);
    return Number.isNaN(v) || v <= 0 ? undefined : clampSendDelayMs(v * 1000);
  }, [quickDelayInput]);

  // Queue
  const [queueStats, setQueueStats] = useState<QueueStats>({ pending: 0, sending: 0, sent: 0, failed: 0 });
  const [pendingMessages, setPendingMessages] = useState<any[]>([]);

  // Wallet
  const [walletCredits, setWalletCredits] = useState(0);
  const [loadingWallet, setLoadingWallet] = useState(true);

  // Contacts
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [contactSearch, setContactSearch] = useState("");

  // Batch filter
  const [batchFilter, setBatchFilter] = useState("all");

  // Derive unique batch names from contacts
  const allBatches = useMemo(() => {
    const batchNames = contacts.map(c => c.batch_name).filter(Boolean);
    return Array.from(new Set(batchNames)).sort();
  }, [contacts]);

  // Bulk send
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkSending, setBulkSending] = useState(false);
  // Inter-message delay (seconds) — persisted so bulk & absent-notification sends reuse it.
  // Stored as a string so the field can be empty while typing; parsed on use.
  const [sendDelayInput, setSendDelayInput] = useState<string>(() => String(getSendDelayMs() / 1000));
  const sendDelaySec = useMemo(() => {
    const v = parseFloat(sendDelayInput);
    return Number.isNaN(v) ? DEFAULT_SEND_DELAY_MS / 1000 : v;
  }, [sendDelayInput]);
  const [bulkProgress, setBulkProgress] = useState<{ sent: number; failed: number; total: number }>({ sent: 0, failed: 0, total: 0 });
  const [bulkSentStatus, setBulkSentStatus] = useState<Record<string, boolean>>({});

  // Message history (for delivery/read tracking)
  const [messageHistory, setMessageHistory] = useState<{
    id: string;
    to: string;
    text: string;
    status: "sent" | "delivered" | "read";
    timestamp: number;
  }[]>([]);

  // ── Server URL Settings ─────────────────────────────────────────────────────
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customUrlInput, setCustomUrlInput] = useState(getCustomServerUrl() || "");
  const [apiKeyInput, setApiKeyInput] = useState(getApiKey() || "");
  const [serverTypeInput, setServerTypeInput] = useState<ServerType>(getServerType());
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  // Copy feedback for the CORS_ORIGINS value shown when a direct OpenWA call is CORS-blocked
  const [corsCopied, setCorsCopied] = useState(false);

  // Serverless mode: gateway config lives server-side (Supabase Edge Functions)
  const [serverlessUrlInput, setServerlessUrlInput] = useState("");
  const [serverlessKeyInput, setServerlessKeyInput] = useState("");
  const [serverlessGatewayTypeInput, setServerlessGatewayTypeInput] = useState<Exclude<ServerType, "serverless">>("baileys");
  const [serverlessConfigLoading, setServerlessConfigLoading] = useState(false);
  const [serverlessConfigLoaded, setServerlessConfigLoaded] = useState(false);
  // Set when the Edge Function reports a config problem (missing table, etc.)
  const [serverlessConfigError, setServerlessConfigError] = useState<string | null>(null);
  // True when the Supabase Edge Function returns "Requested function not found"
  // (function not deployed) — shows an actionable deploy banner in the UI.
  const [functionNotDeployed, setFunctionNotDeployed] = useState(false);
  // Latest health-probe message (offline reason) shown under the status badge.
  const [serverHealthMessage, setServerHealthMessage] = useState<string | null>(null);

  // Connection method: QR code (default) or WhatsApp pairing code (phone number)
  const [connectMode, setConnectMode] = useState<"qr" | "pairing">("qr");
  const [pairingPhone, setPairingPhone] = useState("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);
  // Ref so handleQR can ignore stale QR events while a pairing code is showing
  const pairingActiveRef = useRef(false);
  useEffect(() => {
    pairingActiveRef.current = !!pairingCode;
  }, [pairingCode]);

  // Which hosting preset best matches the current URL (used to highlight the
  // active option in the provider picker)
  const activePresetId = useMemo(() => {
    const current = normalizeBaseUrl(customUrlInput.trim() || getServerUrlDescription().url);
    for (const p of SERVER_PRESETS) {
      if (p.url && current === normalizeBaseUrl(p.url)) return p.id;
    }
    return "custom";
  }, [customUrlInput]);

  const loadServerlessConfigIntoForm = useCallback(async () => {
    if (!isUuid(instId)) return;
    setServerlessConfigLoading(true);
    const cfg = await getServerlessConfig(instId);
    setServerlessConfigLoading(false);
    if (cfg) {
      setServerlessUrlInput(cfg.base_url || "");
      setServerlessGatewayTypeInput(cfg.server_type === "openwa" ? "openwa" : "baileys");
      // Never pre-fill the API key — it stays server-side
      setServerlessKeyInput("");
      setServerlessConfigLoaded(true);
      // The Edge Function may report a config-level problem (e.g. the
      // whatsapp_gateway_config table is missing — migration not applied).
      // Surface it so the admin sees the real cause instead of a generic error.
      // Always set (even to null) so a stale error clears after the fix is applied.
      setServerlessConfigError(cfg.config_error || null);
    }
  }, [instId]);

  const applyPreset = useCallback((preset: ServerPreset) => {
    setCustomUrlInput(preset.url);
    setTestResult(null);
    // A preset's server type (Baileys vs OpenWA vs Serverless) drives the fields shown
    if (preset.serverType) {
      setServerTypeInput(preset.serverType);
    }
    if (preset.serverType === "serverless") {
      // Load the server-side config into the form so the admin sees what's saved
      setServerlessConfigError(null);
      void loadServerlessConfigIntoForm();
    } else {
      setServerlessConfigLoaded(false);
      setServerlessConfigError(null);
    }
    // Presets that need a key but have none configured yet — surface a hint
    if (preset.apiKeyRequired && !getApiKey()) {
      setTestResult({ ok: false, message: "This provider needs an OpenWA API key — paste it below." });
    }
  }, [loadServerlessConfigIntoForm]);

  const toggleKeepAlive = useCallback(() => {
    const next = !keepAliveEnabled;
    setKeepAliveEnabled(next);
    setKeepAliveEnabledState(next);
    if (next) startKeepAlive();
    else stopKeepAlive();
  }, [keepAliveEnabled]);

  // ── Socket Connection ───────────────────────────────────────────────────────

  // QR timeout: if connecting for > 45s without receiving a QR, allow refresh.
  // Baileys initialization (pre-key download, version fetch, socket setup) can
  // take 15-30s on cold start — and up to 45s on slow/high-latency hosts — so
  // the server auto-regenerates the QR after 25s and the client polls at 2s.
  useEffect(() => {
    if (sessionStatus?.status !== "connecting" || qrCodeDataUrl) {
      setQrWaitingLong(false);
      return;
    }
    const timer = setTimeout(() => {
      setQrWaitingLong(true);
    }, 45000);
    return () => clearTimeout(timer);
  }, [sessionStatus?.status, qrCodeDataUrl]);

  const handleStatusUpdate = useCallback((status: SessionStatus) => {
    setSessionStatus(status);
    setConnecting(false);
    if (status.status === "connected") {
      setQrCodeDataUrl(null);
      toast({
        title: "WhatsApp Connected",
        description: status.phone ? `Phone: ${status.phone}` : "Device linked successfully",
      });
    }
  }, []);

  const handleQR = useCallback(async (data: { instituteId: string; qr: string }) => {
    // During a pairing-code flow, ignore QR events so they don't clobber the code
    if (pairingActiveRef.current) return;
    setConnecting(true);
    setPairingCode(null);
    setPairingError(null);
    setSessionStatus((prev) => prev ? { ...prev, status: "connecting" } : null);
    try {
      // OpenWA returns a ready-to-render data URL; the legacy Baileys server
      // returned a raw string that needed encoding here.
      if (data.qr.startsWith("data:")) {
        setQrCodeDataUrl(data.qr);
      } else {
        const url = await QRCode.toDataURL(data.qr, {
          width: 256,
          margin: 2,
          color: { dark: "#111827", light: "#ffffff" },
        });
        setQrCodeDataUrl(url);
      }
    } catch {
      setQrCodeDataUrl(null);
    }
  }, []);

  const handleConnected = useCallback((data: { instituteId: string; phone?: string }) => {
    setSessionStatus((prev) =>
      prev ? { ...prev, status: "connected", phone: data.phone } : { instituteId: instId, status: "connected", phone: data.phone }
    );
    setQrCodeDataUrl(null);
    setPairingCode(null);
    setPairingError(null);
    setConnecting(false);
  }, [instId]);

  const handleDisconnected = useCallback(() => {
    setSessionStatus((prev) => prev ? { ...prev, status: "disconnected", phone: undefined } : { instituteId: instId, status: "disconnected" });
    setQrCodeDataUrl(null);
    setPairingCode(null);
    setPairingError(null);
    setConnecting(false);
    setSocketReady(false);
  }, [instId]);

  const handleError = useCallback((data: { instituteId?: string; error: string }) => {
    setConnecting(false);
    toast({
      title: "WhatsApp Error",
      description: data.error,
      variant: "destructive",
    });
  }, []);

  // ── Server URL Settings Handlers ────────────────────────────────────────────

  const handleTestConnection = useCallback(async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      // Serverless: test through the Edge Function (unsaved config passed inline)
      if (serverTypeInput === "serverless") {
        if (!isUuid(instId)) {
          setTestResult({ ok: false, message: "Invalid institute ID" });
          return;
        }
        const res = await testServerlessConnection(instId, {
          base_url: serverlessUrlInput.trim() || undefined,
          api_key: serverlessKeyInput.trim() || undefined,
          server_type: serverlessGatewayTypeInput,
        });
        setTestResult(
          res.ok
            ? { ok: true, message: res.message || "Serverless gateway is healthy" }
            : { ok: false, message: res.message || "Test failed" }
        );
        return;
      }
      // Fall back to the effective URL (saved/env/default) so a key-only test works
      const rawUrl = customUrlInput.trim();
      const url = normalizeBaseUrl(rawUrl || getServerUrlDescription().url);
      if (!url) {
        setTestResult({ ok: false, message: "Please enter a URL first" });
        return;
      }
      const backend = serverTypeInput === "openwa" ? "OpenWA" : "Baileys server";
      // 1) Reachability + version — health works for both backends (no key needed)
      const health = await fetchServerHealth(url);
      if (!health.ok) {
        setTestResult({ ok: false, message: health.message || "Cannot reach server" });
        return;
      }
      // 2) Only OpenWA validates an API key; the Baileys server needs none.
      if (serverTypeInput === "openwa") {
        const keyCheck = await verifyApiKey(url, apiKeyInput.trim());
        setTestResult(
          keyCheck.ok
            ? { ok: true, message: `Connected! OpenWA server is healthy${health.version ? ` (v${health.version})` : ""} and API key is valid.` }
            : { ok: false, message: `Server is reachable, but ${keyCheck.message}. Check the API key in settings.` }
        );
      } else {
        setTestResult({
          ok: true,
          message: `Connected! ${backend} is healthy${health.version ? ` (v${health.version})` : ""}. No API key required.`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      setTestResult({ ok: false, message: `Cannot reach server: ${msg}` });
    } finally {
      setTestingConnection(false);
    }
  }, [customUrlInput, apiKeyInput, serverTypeInput, instId, serverlessUrlInput, serverlessKeyInput, serverlessGatewayTypeInput]);

  const handleSaveUrl = useCallback(async () => {
    // Serverless: save the gateway config server-side via the Edge Function
    if (serverTypeInput === "serverless") {
      if (!isUuid(instId)) {
        toast({ title: "Error", description: "Invalid institute ID", variant: "destructive" });
        return;
      }
      const saved = await saveServerlessConfig(instId, {
        base_url: serverlessUrlInput.trim(),
        api_key: serverlessKeyInput.trim(),
        server_type: serverlessGatewayTypeInput,
      });
      if (!saved.ok) {
        toast({ title: "Save Failed", description: saved.message || "Could not save gateway config", variant: "destructive" });
        return;
      }
      setServerType("serverless");
      setSettingsOpen(false);
      setTestResult(null);
      toast({
        title: "Serverless Gateway Saved",
        description: "WhatsApp now routes through Supabase Edge Functions.",
      });
      window.location.reload();
      return;
    }

    const rawUrl = customUrlInput.trim();
    const url = normalizeBaseUrl(rawUrl);
    if (rawUrl) {
      // Basic URL validation (only when the user actually typed a URL)
      try {
        new URL(url);
      } catch {
        toast({ title: "Invalid URL", description: "URL must start with http:// or https://", variant: "destructive" });
        return;
      }
      setCustomServerUrl(url);
    }
    // Always persist the API key + server type — saving the key alone (URL
    // empty) is allowed, e.g. when using the env-var/default URL.
    setApiKey(apiKeyInput.trim());
    setServerType(serverTypeInput);
    setSettingsOpen(false);
    setTestResult(null);
    const backend = serverTypeInput === "openwa" ? "OpenWA" : "Baileys server";
    toast({
      title: "Server Saved",
      description: rawUrl
        ? `WhatsApp ${backend} updated (${url})`
        : `${backend} settings ${apiKeyInput.trim() ? "updated" : "saved"}`,
    });
    // Persist per-institute so every device (any browser) uses the same gateway.
    await saveSharedGatewayConfig(instId, {
      base_url: rawUrl ? url : undefined,
      api_key: apiKeyInput.trim() || undefined,
      server_type: serverTypeInput,
    });
    // Force re-connect with new URL
    window.location.reload();
  }, [customUrlInput, apiKeyInput, serverTypeInput, instId, serverlessUrlInput, serverlessKeyInput, serverlessGatewayTypeInput]);

  const handleResetUrl = useCallback(() => {
    clearCustomServerUrl();
    clearApiKey();
    clearServerType();
    setCustomUrlInput("");
    setApiKeyInput("");
    setServerTypeInput("baileys");
    setServerlessUrlInput("");
    setServerlessKeyInput("");
    setServerlessGatewayTypeInput("baileys");
    setServerlessConfigLoaded(false);
    setTestResult(null);
    setSettingsOpen(false);
    toast({
      title: "Server URL Reset",
      description: "Using default server URL (env var or same-origin)",
    });
    // Force re-connect with default URL
    window.location.reload();
  }, []);

  const openSettings = useCallback(() => {
    setCustomUrlInput(getCustomServerUrl() || "");
    setApiKeyInput(getApiKey() || "");
    const st = getServerType();
    setServerTypeInput(st);
    setTestResult(null);
    setServerlessConfigError(null);
    if (st === "serverless" && isUuid(instId)) {
      void loadServerlessConfigIntoForm();
    }
    setSettingsOpen(true);
  }, [instId, loadServerlessConfigIntoForm]);

  // Format phone for display: show last 10 digits with +91
  const formatPhoneDisplay = (phone: string): string => {
    const clean = phone.replace(/\D/g, '');
    if (clean.length === 10) return `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`;
    if (clean.length >= 12 && clean.startsWith('91')) return `+91 ${clean.slice(2, 7)} ${clean.slice(7, 12)}`;
    return phone;
  };

  // Load wallet credits and contacts
  useEffect(() => {
    if (!isUuid(instId)) return;

    // Load wallet
    const loadWallet = async () => {
      try {
        const { data } = await supabase
          .from("institutes")
          .select("wallet_credits")
          .eq("id", instId)
          .single();
        setWalletCredits(data?.wallet_credits || 0);
      } catch {
        setWalletCredits(0);
      } finally {
        setLoadingWallet(false);
      }
    };

    // Load contacts (students with phone numbers)
    const loadContacts = async () => {
      setContactsLoading(true);
      try {
        const { data } = await supabase
          .from("students")
          .select("id, name, phone, mother_phone, father_phone, guardian_phone, batch_name, enrollment_no")
          .eq("institute_id", instId)
          .eq("status", "active")
          .order("name", { ascending: true });

        if (data) {
          const mapped: Contact[] = data
            .map((s: any) => ({
              id: s.id,
              name: s.name,
              phone: s.mother_phone || s.father_phone || s.phone || s.guardian_phone || '',
              batch_name: s.batch_name || '',
              enrollment_no: s.enrollment_no || '',
            }))
            .filter(c => c.phone.length > 0);
          setContacts(mapped);
        }
      } catch {
        // Contacts are optional
      } finally {
        setContactsLoading(false);
      }
    };

    loadWallet();
    loadContacts();
  }, [instId]);

  // Live wallet balance: refresh when the institute row changes (credits spent
  // from another device while this page is open).
  useTableRealtime({
    table: "institutes",
    filter: { column: "id", value: instId },
    enabled: isUuid(instId),
    onEvent: () => {
      void (async () => {
        try {
          const { data } = await supabase
            .from("institutes")
            .select("wallet_credits")
            .eq("id", instId)
            .single();
          if (data) setWalletCredits(data.wallet_credits || 0);
        } catch {
          /* non-critical */
        }
      })();
    },
  });

  // Live message history: reload when a message is logged from any device.
  useTableRealtime({
    table: "message_logs",
    filter: { column: "institute_id", value: instId },
    enabled: isUuid(instId),
    onEvent: () => {
      void (async () => {
        try {
          const { data } = await supabase
            .from("message_logs")
            .select("message_id, recipient, message, status, created_at, delivered_at, read_at")
            .eq("institute_id", instId)
            .eq("channel", "whatsapp")
            .order("created_at", { ascending: false })
            .limit(50);
          if (!data) return;
          setMessageHistory(
            data
              .filter(m => m.message_id)
              .map(m => ({
                id: m.message_id,
                to: m.recipient || "",
                text: m.message || "",
                status: m.read_at ? "read" as const : m.delivered_at ? "delivered" as const : "sent" as const,
                timestamp: new Date(m.created_at).getTime(),
              }))
          );
        } catch {
          /* non-critical */
        }
      })();
    },
  });

  // Connect to socket on mount + continuous health monitoring (keep-alive)
  useEffect(() => {
    if (!isUuid(instId)) return;

    let cancelled = false;
    // Ref so the adaptive poll cadence can read the latest availability
    // without re-running the effect when serverAvailable changes.
    const serverAvailableRef: { current: boolean } = { current: false };

    const checkServer = async () => {
      // Cross-device sync: if THIS browser has no gateway config of its own
      // (fresh device), pull the institute's saved config from the DB so we
      // poll the same gateway and see the same connected session.
      await hydrateGatewayConfigFromDb(instId);
      // Health probe sends the API key header so it reflects the real auth state.
      // Pass the institute id so the serverless probe checks THIS institute's config.
      const health = await fetchServerHealth(undefined, instId);
      if (cancelled) return;
      const online = health.ok;
      serverAvailableRef.current = online;
      setServerAvailable(online);
      setFunctionNotDeployed(!!health.functionNotDeployed);
      // Store the offline reason (e.g. missing table / unconfigured gateway) so
      // the UI can show why the server is offline instead of a bare URL.
      setServerHealthMessage(online ? null : health.message || null);
      if (health.latencyMs !== undefined) setServerLatency(health.latencyMs);
      setLastHealthCheck(Date.now());
      if (online) {
        fetchSessionStatus(instId).then((status) => {
          if (!cancelled && status) {
            setSessionStatus(status);
          }
        });
      }
    };

    // Adaptive polling: immediately, then every 5s while offline / 30s while
    // online. This keeps the status badge live AND doubles as a keep-alive so
    // free-tier hosts (Render/Railway) don't sleep and take the server offline.
    let healthTimer: ReturnType<typeof setTimeout> | null = null;
    const pollHealth = async () => {
      await checkServer();
      if (cancelled) return;
      // 5s retry while offline (recover fast), 30s while online (cheap keep-alive)
      const nextDelay = serverAvailableRef.current ? 30000 : 5000;
      healthTimer = setTimeout(() => void pollHealth(), nextDelay);
    };
    void pollHealth();

    // Longer-interval keep-alive heartbeat (also refreshes the last-ping readout)
    startKeepAlive(undefined, { immediate: false });
    const keepAliveRefresh = setInterval(() => {
      const last = getLastHealthPing();
      if (last) {
        setServerLatency(last.latencyMs ?? null);
        setLastHealthCheck(last.at);
      }
    }, 5000);

    // Track socket readiness — the socket must connect and join the institute room
    // before we can receive QR events. The 'onStatus' callback fires when the socket
    // first joins the room, which means the socket is ready.
    const onSocketReady = (status: SessionStatus) => {
      if (!cancelled) {
        setSocketReady(true);
        handleStatusUpdate(status);
      }
    };

    whatsappSocket.connect(instId, {
      onStatus: onSocketReady,
      onQR: handleQR,
      onConnected: handleConnected,
      onDisconnected: handleDisconnected,
      onError: handleError,
      onMessageSent: (result) => {
        if (!cancelled) {
          if (result.success && result.id) {
            toast({ title: "Message Sent ✓", description: `ID: ${result.id.substring(0, 8)}...` });
          } else {
            toast({ title: "Send Failed", description: result.error, variant: "destructive" });
          }
        }
      },
      onMessageDelivered: (data) => {
        if (!cancelled) {
          setMessageHistory(prev =>
            prev.map(msg => msg.id === data.id ? { ...msg, status: "delivered" as const } : msg)
          );
          // Update DB
          if (isUuid(instId)) {
            supabase.from('message_logs').update({ status: 'delivered', delivered_at: new Date().toISOString() }).eq('message_id', data.id).then(() => {});
          }
        }
      },
      onMessageRead: (data) => {
        if (!cancelled) {
          setMessageHistory(prev =>
            prev.map(msg => msg.id === data.id ? { ...msg, status: "read" as const } : msg)
          );
          // Update DB
          if (isUuid(instId)) {
            supabase.from('message_logs').update({ status: 'read', read_at: new Date().toISOString() }).eq('message_id', data.id).then(() => {});
          }
        }
      },
    });

    return () => {
      cancelled = true;
      if (healthTimer) clearTimeout(healthTimer);
      clearInterval(keepAliveRefresh);
      stopKeepAlive();
      whatsappSocket.disconnect();
    };
  }, [instId, handleStatusUpdate, handleQR, handleConnected, handleDisconnected, handleError]);

  // ── Load Message History from DB ───────────────────────────────────────────

  useEffect(() => {
    if (!isUuid(instId)) return;
    let cancelled = false;
    const loadHistory = async () => {
      try {
        const { data } = await supabase
          .from('message_logs')
          .select('message_id, recipient, message, status, created_at, delivered_at, read_at')
          .eq('institute_id', instId)
          .eq('channel', 'whatsapp')
          .order('created_at', { ascending: false })
          .limit(50);
        if (cancelled || !data) return;
        const mapped = data
          .filter(m => m.message_id)
          .map(m => ({
            id: m.message_id,
            to: m.recipient || '',
            text: m.message || '',
            status: m.read_at ? 'read' as const : m.delivered_at ? 'delivered' as const : 'sent' as const,
            timestamp: new Date(m.created_at).getTime(),
          }));
        setMessageHistory(mapped);
      } catch { /* non-critical */ }
    };
    loadHistory();
    return () => { cancelled = true; };
  }, [instId]);

  // ── Queue ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isUuid(instId)) return;

    const loadQueue = async () => {
      const stats = await getQueueStats(instId);
      setQueueStats(stats);
      const queue = getMessageQueue(instId);
      const pending = await queue.getPendingMessages(20);
      setPendingMessages(pending);
    };

    loadQueue();
    const interval = setInterval(loadQueue, 5000);
    return () => clearInterval(interval);
  }, [instId]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleConnect = async () => {
    if (!isUuid(instId)) {
      toast({ title: "Error", description: "Invalid institute ID", variant: "destructive" });
      return;
    }
    setConnecting(true);
    setQrCodeDataUrl(null);
    const ok = await restConnectSession(instId);
    if (!ok) {        setConnecting(false);
        const { url, source } = getServerUrlDescription();
        const srcLabel = source === "custom" ? "Custom URL" : source === "env" ? "Env Variable" : source === "serverless" ? "Serverless" : "Default";
        const keyHint = isServerless()
          ? "Check that a gateway URL is saved in Server Settings (Serverless panel)."
          : isOpenWA()
            ? (isApiKeyConfigured()
                ? "Check the server URL and API key in settings."
                : "Add your OpenWA API key in Server Settings first.")
            : "Check the server URL in settings (no API key needed for the Baileys server).";
        toast({
          title: "Connection Failed",
          description: `Could not reach WhatsApp server at ${url} (${srcLabel}). ${keyHint}`,
          variant: "destructive",
        });
    }
  };

  const handleRefreshQR = async () => {
    setRefreshingQr(true);
    setQrWaitingLong(false);
    setQrCodeDataUrl(null);
    const { url } = getServerUrlDescription();
    const ok = await restRefreshQR(instId);
    if (!ok) {
      toast({
        title: "Refresh Failed",
        description: `Cannot refresh the QR code. Make sure the OpenWA server at ${url} is running and the API key is set in settings.`,
        variant: "destructive",
      });
      setConnecting(false);
    }
    setRefreshingQr(false);
  };

  const handleDisconnect = async () => {
    await restDisconnectSession(instId);
    handleDisconnected();
    toast({ title: "Disconnected", description: "WhatsApp session disconnected" });
  };

  const handleLogout = async () => {
    const ok = await restLogoutSession(instId);
    if (ok) {
      handleDisconnected();
      toast({ title: "Logged Out", description: "Auth credentials cleared. A fresh QR scan will be needed." });
    }
  };

  // ── Pairing Code (alternative to QR) ────────────────────────────────────────

  const handleRequestPairingCode = async () => {
    if (!isUuid(instId)) {
      toast({ title: "Error", description: "Invalid institute ID", variant: "destructive" });
      return;
    }
    const phone = pairingPhone.replace(/\D/g, "");
    if (!phone) {
      setPairingError("Enter the WhatsApp number with country code (e.g. 91XXXXXXXXXX)");
      return;
    }
    setPairingLoading(true);
    setPairingError(null);
    setPairingCode(null);
    setQrCodeDataUrl(null);
    setConnecting(true);
    setSessionStatus((prev) =>
      prev ? { ...prev, status: "connecting" } : { instituteId: instId, status: "connecting" }
    );
    // Ensure the session is started first, then request the pairing code.
    await restConnectSession(instId);
    const res = await restRequestPairingCode(instId, phone);
    setPairingLoading(false);
    if (res.success && res.code) {
      setPairingCode(res.code);
    } else {
      setConnecting(false);
      setPairingError(res.error || "Could not generate a pairing code");
    }
  };

  const handleContactSend = (contact: Contact) => {
    const cleanPhone = contact.phone.replace(/\D/g, '');
    const formatted = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    setSendTo(formatted);
  };

  // ── Bulk Send ───────────────────────────────────────────────────────────────

  const toggleContactSelect = (id: string) => {
    setSelectedContactIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllForBulk = () => {
    if (selectedContactIds.size === filteredContacts.length) {
      setSelectedContactIds(new Set());
    } else {
      setSelectedContactIds(new Set(filteredContacts.map(c => c.id)));
    }
  };

  // Save a sent message to DB and local history
  const saveMessageToHistory = async (phone: string, text: string, resultId?: string, status: 'sent' | 'delivered' | 'read' = 'sent') => {
    const msg = {
      id: resultId || `local_${Date.now()}`,
      to: phone,
      text,
      status,
      timestamp: Date.now(),
    };
    setMessageHistory(prev => [msg, ...prev]);
    // Persist to database
    if (isUuid(instId) && resultId) {
      try {
        await supabase.from('message_logs').insert([{
          institute_id: instId,
          message_id: resultId,
          recipient: phone,
          message: text,
          status: 'sent',
          channel: 'whatsapp',
          created_at: new Date().toISOString(),
        }]);
      } catch { /* non-critical */ }
    }
  };

  // Debit multiple credits at once (called after successful batch send)
  const bulkDebitCredits = async (count: number): Promise<boolean> => {
    if (!isUuid(instId) || count === 0) return true;
    try {
      const { data: inst } = await supabase
        .from("institutes")
        .select("wallet_credits")
        .eq("id", instId)
        .single();
      const currentBalance = inst?.wallet_credits || 0;
      if (currentBalance < count) return false;
      await supabase
        .from("institutes")
        .update({ wallet_credits: currentBalance - count })
        .eq("id", instId);
      await supabase.from("wallet_transactions").insert([{
        institute_id: instId,
        type: "debit",
        amount: count,
        description: `Bulk WhatsApp send (${count} messages)`,
        reference_type: "whatsapp",
        balance_before: currentBalance,
        balance_after: currentBalance - count,
      }]);
      setWalletCredits(prev => prev - count);
      return true;
    } catch {
      return false;
    }
  };

  const handleSendMessage = async () => {
    if (!sendTo.trim() || !sendText.trim()) {
      toast({ title: "Missing Fields", description: "Phone number and message are required", variant: "destructive" });
      return;
    }
    setSending(true);
    // Per-message delay override (undefined = send immediately)
    const result = await restSendMessage(instId, sendTo.trim(), sendText.trim(), quickDelayMs);
    setSending(false);
    if (result.success) {
      // Save to history (persists to message_logs)
      if (result.id) {
        saveMessageToHistory(sendTo, sendText, result.id, 'sent');
      }
      setSendText("");
    } else {
      toast({ title: "Send Failed", description: result.error || "Unknown error", variant: "destructive" });
    }
  };

  const handleBulkSend = async () => {
    const selectedContacts = contacts.filter(c => selectedContactIds.has(c.id));
    if (selectedContacts.length === 0 || !bulkMessage.trim()) {
      toast({ title: "Missing Fields", description: "Select contacts and write a message.", variant: "destructive" });
      return;
    }
    if (sessionStatus?.status !== "connected") {
      toast({ title: "Not Connected", description: "WhatsApp must be connected to send messages.", variant: "destructive" });
      return;
    }
    if (walletCredits < selectedContacts.length) {
      toast({ title: "Insufficient Credits", description: `Need ${selectedContacts.length} credits, but you have ${walletCredits}. Contact super admin.`, variant: "destructive" });
      return;
    }

    setBulkSending(true);
    setBulkProgress({ sent: 0, failed: 0, total: selectedContacts.length });
    setBulkSentStatus({});

    // Build messages array for the server batch endpoint
    const messages = selectedContacts.map(c => ({
      contactId: c.id,
      to: c.phone.replace(/\D/g, '').length === 10 ? `91${c.phone.replace(/\D/g, '')}` : c.phone.replace(/\D/g, ''),
      text: bulkMessage.trim(),
    }));

    // Send all messages as a single batch request to the server, honouring the
    // user-configured inter-message delay (anti-ban). Persist the current value
    // so the Attendance page's absent-notification loop uses the same setting.
    const delayMs = clampSendDelayMs(sendDelaySec * 1000);
    setSendDelayMs(delayMs);
    const batchResult = await restSendBatch(instId, messages.map(m => ({ to: m.to, text: m.text })), delayMs);

    let sent = 0;
    let failed = 0;

    if (batchResult.success && batchResult.results) {
      for (let i = 0; i < batchResult.results.length; i++) {
        const result = batchResult.results[i];
        const contact = messages[i];
        if (result.success) {
          sent++;
          setBulkSentStatus(prev => ({ ...prev, [contact.contactId]: true }));
          saveMessageToHistory(contact.to, contact.text, result.id, 'sent');
        } else {
          failed++;
        }
        setBulkProgress({ sent, failed, total: messages.length });
      }
    } else {
      failed = messages.length;
      setBulkProgress({ sent: 0, failed, total: messages.length });
    }

    // Debit credits for successful sends
    if (sent > 0) {
      await bulkDebitCredits(sent);
    }

    setBulkSending(false);
    toast({
      title: "Bulk Send Complete",
      description: `${sent} sent ✓, ${failed} failed`,
      variant: failed > 0 ? "destructive" : "default",
    });

    if (failed === 0) {
      setSelectedContactIds(new Set());
      setBulkMessage("");
    }

    // Refresh wallet balance from DB
    try {
      const { data } = await supabase
        .from("institutes")
        .select("wallet_credits")
        .eq("id", instId)
        .single();
      if (data) setWalletCredits(data.wallet_credits || 0);
    } catch { /* wallet refresh is non-critical */ }
  };

  // Filtered contacts (by search AND batch)
  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      // Batch filter
      if (batchFilter !== "all" && c.batch_name !== batchFilter) return false;
      // Search filter
      if (contactSearch.trim()) {
        const q = contactSearch.toLowerCase();
        return c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.enrollment_no.toLowerCase().includes(q);
      }
      return true;
    });
  }, [contacts, contactSearch, batchFilter]);

  // ── Render ──────────────────────────────────────────────────────────────────

  const statusVariant = sessionStatus?.status === "connected" ? "success"
    : sessionStatus?.status === "connecting" ? "warning"
    : sessionStatus?.status === "error" ? "destructive"
    : "default";

  const statusIcon = sessionStatus?.status === "connected" ? <CheckCircle2 className="w-4 h-4 text-success" />
    : sessionStatus?.status === "connecting" ? <Loader2 className="w-4 h-4 animate-spin text-warning" />
    : <XCircle className="w-4 h-4 text-muted-foreground" />;

  // The exact CORS_ORIGINS env line for the admin to paste into their OpenWA host
  const corsEnvLine = getCorsOriginsEnvLine();

  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">WhatsApp Manager</h2>
          <p className="text-sm text-muted-foreground">
            {instituteName ? `${instituteName} — ` : ""}Connect your institute WhatsApp via QR code or phone number
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Wallet Badge */}
          {loadingWallet ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/10 border border-primary/20">
              <Wallet className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-bold text-primary tabular-nums">{walletCredits}</span>
              <span className="text-[10px] text-muted-foreground">credits</span>
            </div>
          )}
          {/* Live Server Health Badge — online shows latency, offline warns */}
          {serverAvailable ? (
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-success/10 border border-success/20"
              title={`Server online · last check ${lastHealthCheck ? new Date(lastHealthCheck).toLocaleTimeString() : "—"}`}
            >
              <span className="relative flex w-2 h-2 shrink-0">
                <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-60 animate-ping" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
              </span>
              <div className="hidden sm:block">
                <span className="text-xs text-success font-medium">Server Online</span>
                {serverLatency !== null && (
                  <p className="text-[9px] text-success/70 tabular-nums">{serverLatency}ms</p>
                )}
              </div>
              <span className="text-xs text-success font-medium sm:hidden">Online</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-destructive/10 border border-destructive/20" title={`Trying: ${getServerUrlDescription().url}${serverHealthMessage ? `\n${serverHealthMessage}` : ""}`}>
              <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
              <div className="hidden sm:block max-w-[240px]">
                <span className="text-xs text-destructive font-medium">Server Offline</span>
                <p className="text-[9px] text-destructive/70 truncate">
                  {serverHealthMessage || getServerUrlDescription().url}
                </p>
              </div>
              <span className="text-xs text-destructive font-medium sm:hidden">Server Offline</span>
            </div>
          )}
          {/* Settings Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={openSettings}
            className="h-8 w-8 p-0"
            title="Server Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {!instId ? (
        <div className="p-8 text-center text-muted-foreground">
          <Plug className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>WhatsApp management is available for institute admins only.</p>
          <p className="text-sm mt-1">Log in as an admin to connect WhatsApp.</p>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6">
          {/* ── Main Content ──────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 space-y-6">
            {/* Serverless function not deployed banner */}
            {functionNotDeployed && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/30 animate-fade-in">
                <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-destructive">Serverless function not deployed</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    The <code className="text-primary bg-primary/10 px-1 rounded">whatsapp-gateway</code> Edge Function is not deployed to your Supabase project yet,
                    so every serverless request returns <em>"Requested function not found"</em>. Deploy it from the repo root:
                  </p>
                  <pre className="mt-2 px-3 py-2 rounded-md bg-background border border-border text-[11px] font-mono text-foreground overflow-x-auto">npx supabase functions deploy whatsapp-gateway --no-verify-jwt</pre>
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    Or run <code className="text-primary bg-primary/10 px-1 rounded">npm run deploy:whatsapp</code>. After deploying, this banner disappears and the serverless
                    status below becomes live.
                  </p>
                </div>
              </div>
            )}
            {/* Wallet Info Card */}
            {!loadingWallet && (
              <Card className="overflow-hidden border-primary/20">
                <div className="flex items-center gap-4 p-4">
                  <div className="p-3 rounded-xl bg-primary/10">
                    <Wallet className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">Wallet Balance</h3>
                      <span className={`text-xl font-bold tabular-nums ${
                        walletCredits > 100 ? "text-success" : walletCredits > 0 ? "text-warning" : "text-destructive"
                      }`}>
                        {walletCredits}
                      </span>
                      <span className="text-xs text-muted-foreground">credits</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      1 message = 1 credit · Managed by Super Admin · <a href="/messages" className="text-primary underline underline-offset-2 hover:text-primary/80">View wallet details</a>
                    </p>
                  </div>
                  <StatusBadge variant={walletCredits > 10 ? "success" : walletCredits > 0 ? "warning" : "destructive"}>
                    {walletCredits > 10 ? "Sufficient" : walletCredits > 0 ? "Low" : "Empty"}
                  </StatusBadge>
                </div>
              </Card>
            )}

            {/* ── Connection Card ──────────────────────────────────────────── */}
            <Card className="overflow-hidden">
              <div className={`h-1.5 ${sessionStatus?.status === "connected" ? "bg-success" : sessionStatus?.status === "connecting" ? "bg-warning" : "bg-muted"}`} />
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-3 rounded-xl ${sessionStatus?.status === "connected" ? "bg-success/10" : sessionStatus?.status === "connecting" ? "bg-warning/10" : "bg-muted"}`}>
                      {sessionStatus?.status === "connected" ? (
                        <Smartphone className="w-6 h-6 text-success" />
                      ) : sessionStatus?.status === "connecting" ? (
                        <QrCode className="w-6 h-6 text-warning" />
                      ) : (
                        <Signal className="w-6 h-6 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-foreground">WhatsApp Connection</h3>
                        <StatusBadge variant={statusVariant}>{sessionStatus?.status || "inactive"}</StatusBadge>
                      </div>
                      {sessionStatus?.phone && (
                        <p className="text-sm text-muted-foreground mt-1">
                          <Phone className="w-3.5 h-3.5 inline mr-1" />
                          {sessionStatus.phone}
                        </p>
                      )}
                      {sessionStatus?.connectedAt && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          <Clock className="w-3 h-3 inline mr-1" />
                          Connected since {new Date(sessionStatus.connectedAt).toLocaleString("en-IN")}
                        </p>
                      )}
                      {sessionStatus?.status === "connecting" && !qrCodeDataUrl && (
                        <p className="text-xs text-muted-foreground mt-1">Initializing connection, waiting for QR code...</p>
                      )}
                      {sessionStatus?.error && (
                        <p className="text-xs text-destructive mt-1">{sessionStatus.error}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {sessionStatus?.status === "connected" ? (
                      <>
                        <Button variant="outline" size="sm" onClick={handleDisconnect} className="h-8 text-xs">
                          <X className="w-3.5 h-3.5 mr-1" />Disconnect
                        </Button>
                        <Button variant="destructive" size="sm" onClick={handleLogout} className="h-8 text-xs">
                          <LogOut className="w-3.5 h-3.5 mr-1" />Logout
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        onClick={handleConnect}
                        disabled={connecting || !serverAvailable}
                        className="h-8 text-xs"
                      >
                        {connecting || !socketReady ? (
                          <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Connecting...</>
                        ) : (
                          <><QrCode className="w-3.5 h-3.5 mr-1" />Connect WhatsApp</>
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {/* QR / Pairing Code Display */}
                {sessionStatus?.status === "connecting" && (
                  <div className="mt-5 flex flex-col items-center gap-3 p-4 bg-muted/30 rounded-xl border border-border/50">
                    {pairingCode ? (
                      <>
                        <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                          <KeyRound className="w-7 h-7 text-primary" />
                        </div>
                        <div className="text-center">
                          <p className="text-xs font-medium text-foreground">Enter this code on your phone</p>
                          <div className="mt-2 font-mono text-3xl font-bold tracking-[0.35em] text-foreground bg-card border-2 border-primary/40 rounded-xl px-6 py-3 select-all">
                            {pairingCode}
                          </div>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] text-muted-foreground">
                            On your phone: WhatsApp → ⋮ Menu → Linked devices →{" "}
                            <b>Link with phone number instead</b> → enter this code
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <RefreshCw className="w-3 h-3 text-muted-foreground animate-pulse" />
                          <span className="text-[10px] text-muted-foreground">Waiting for the phone to confirm...</span>
                        </div>
                      </>
                    ) : qrCodeDataUrl ? (
                      <>
                        <div className="relative group">
                          <img
                            src={qrCodeDataUrl}
                            alt="WhatsApp QR Code"
                            className="w-56 h-56 rounded-lg border-2 border-border bg-white shadow-sm"
                          />
                        </div>
                        <div className="text-center">
                          <p className="text-xs font-medium text-foreground">Scan this QR code with your phone</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Open WhatsApp on phone → ⋮ Menu → Linked devices → Link a device
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <RefreshCw className="w-3 h-3 text-muted-foreground animate-pulse" />
                          <span className="text-[10px] text-muted-foreground">Waiting for scan... QR refreshes automatically when it expires</span>
                        </div>
                      </>
                    ) : qrWaitingLong ? (
                      <div className="flex flex-col items-center gap-3 py-6">
                        <AlertCircle className="w-8 h-8 text-warning" />
                        <p className="text-sm font-medium text-foreground">QR code not received yet</p>
                        <p className="text-xs text-muted-foreground text-center max-w-xs">
                          Server: <span className="font-mono text-foreground">{getServerUrlDescription().url}</span>
                        </p>
                        <p className="text-xs text-muted-foreground text-center max-w-xs">
                          If this server never returns a QR, it is likely running an <b>older build</b> without QR
                          support. Redeploy the current <code className="text-primary bg-primary/10 px-1 rounded">server/</code>{' '}
                          code to Render/Railway, then click below to request a fresh QR.
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleRefreshQR}
                          disabled={refreshingQr}
                        >
                          {refreshingQr ? (
                            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Refreshing...</>
                          ) : (
                            <><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh QR Code</>
                          )}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 py-8 text-muted-foreground">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span className="text-sm">Generating QR code...</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Not connected state */}
                {sessionStatus?.status !== "connected" && sessionStatus?.status !== "connecting" && (
                  <>
                    {/* Connection method toggle: QR vs phone number */}
                    <div className="mt-4 flex items-center gap-1.5 p-1 rounded-lg bg-muted/30 border border-border/50 w-fit">
                      <button
                        type="button"
                        onClick={() => {
                          setConnectMode("qr");
                          setPairingError(null);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          connectMode === "qr"
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        QR code
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConnectMode("pairing");
                          setPairingError(null);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          connectMode === "pairing"
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        Phone number
                      </button>
                    </div>

                    {connectMode === "qr" ? (
                      <div className="mt-4 p-4 rounded-xl bg-muted/30 border border-border/50">
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-lg bg-primary/10">
                            <Wifi className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">Not Connected</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Click "Connect WhatsApp" to generate a QR code. Open WhatsApp on your phone, go to Linked Devices, and scan the QR to link this institute's WhatsApp.
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 p-4 rounded-xl bg-muted/30 border border-border/50">
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-lg bg-primary/10">
                            <KeyRound className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">Link with phone number</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Enter the WhatsApp number (with country code) to get an 8-character code to enter on the phone — no QR scanning needed.
                            </p>
                            <div className="flex gap-2 mt-2">
                              <Input
                                value={pairingPhone}
                                onChange={(e) => {
                                  setPairingPhone(e.target.value);
                                  setPairingError(null);
                                }}
                                placeholder="91XXXXXXXXXX"
                                className="font-mono text-sm flex-1"
                                disabled={pairingLoading || connecting}
                              />
                              <Button
                                size="sm"
                                onClick={handleRequestPairingCode}
                                disabled={pairingLoading || connecting || !pairingPhone.trim()}
                                className="h-9 text-xs shrink-0"
                              >
                                {pairingLoading ? (
                                  <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Requesting...</>
                                ) : (
                                  <><KeyRound className="w-3.5 h-3.5 mr-1.5" />Get code</>
                                )}
                              </Button>
                            </div>
                            {pairingError && (
                              <p className="text-[10px] text-destructive mt-1.5">{pairingError}</p>
                            )}
                            <p className="text-[10px] text-muted-foreground mt-1.5">
                              Requires a Baileys gateway (works in Serverless mode too). Some OpenWA builds don't expose pairing codes — use the QR code in that case.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </Card>

            {/* ── Statistics ──────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard
                title="Connection"
                value={sessionStatus?.status === "connected" ? "Active" : "Offline"}
                icon={Signal}
                change={sessionStatus?.status === "connected" ? "Live" : undefined}
                changeType={sessionStatus?.status === "connected" ? "positive" : undefined}
              />
              <StatCard
                title="Queue Pending"
                value={queueStats.pending}
                icon={Clock}
                change={`${queueStats.sending} sending`}
                changeType={queueStats.pending > 0 ? "negative" : "positive"}
              />
              <StatCard
                title="Sent Today"
                value={queueStats.sent}
                icon={CheckCircle2}
                changeType="positive"
              />
              <StatCard
                title="Failed"
                value={queueStats.failed}
                icon={XCircle}
                changeType={queueStats.failed > 0 ? "negative" : undefined}
              />
            </div>

            {/* ── Two-column layout ──────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* ── Send Message ─────────────────────────────────────────────── */}
              <Card>
                <div className="p-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Quick Send</h3>
                  </div>
                </div>
                <div className="p-4 space-y-4">
                  <div>
                    <Label className="text-xs">Phone Number</Label>
                    <Input
                      value={sendTo}
                      onChange={(e) => setSendTo(e.target.value)}
                      placeholder="919876543210"
                      className="mt-1 font-mono text-sm"
                      disabled={sessionStatus?.status !== "connected"}
                    />
                    <p className="text-[10px] text-muted-foreground mt-0.5">Include country code without + · Click a contact below to fill</p>
                  </div>
                  <div>
                    <Label className="text-xs">Message</Label>
                    <textarea
                      value={sendText}
                      onChange={(e) => setSendText(e.target.value)}
                      placeholder="Type your message..."
                      rows={3}
                      className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground resize-none disabled:opacity-50"
                      disabled={sessionStatus?.status !== "connected"}
                    />
                  </div>
                  {/* Per-message delay override — empty = send immediately */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Label className="text-xs">
                        Delay before send <span className="text-muted-foreground/70">(optional)</span>
                      </Label>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Input
                          type="number"
                          min={0.5}
                          max={60}
                          step={0.5}
                          value={quickDelayInput}
                          onChange={(e) => setQuickDelayInput(e.target.value)}
                          onBlur={() => {
                            const v = parseFloat(quickDelayInput);
                            if (!Number.isNaN(v) && v > 0) {
                              setQuickDelayInput(String(clampSendDelayMs(v * 1000) / 1000));
                            }
                          }}
                          placeholder="–"
                          className="h-7 w-20 text-xs text-center font-mono"
                          disabled={sessionStatus?.status !== "connected" || sending}
                        />
                        <span className="text-[10px] text-muted-foreground">seconds</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Leave empty to send immediately</p>
                    </div>
                    {quickDelayMs !== undefined && (
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-muted-foreground">Will send in</p>
                        <p className="text-xs font-semibold text-foreground tabular-nums">
                          ~{quickDelayMs % 1000 === 0 ? Math.round(quickDelayMs / 1000) : (quickDelayMs / 1000).toFixed(1)}s
                        </p>
                      </div>
                    )}
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleSendMessage}
                    disabled={sessionStatus?.status !== "connected" || sending || !sendTo.trim() || !sendText.trim()}
                  >
                    {sending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending...</>
                    ) : (
                      <><Send className="w-4 h-4 mr-2" />Send Message</>
                    )}
                  </Button>
                  {sessionStatus?.status !== "connected" && (
                    <p className="text-xs text-muted-foreground text-center">Connect WhatsApp to send messages</p>
                  )}
                </div>
              </Card>

              {/* ── Queue Management ─────────────────────────────────────────── */}
              <Card>
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Message Queue</h3>
                  </div>
                  <StatusBadge variant={queueStats.pending > 0 ? "warning" : "success"}>
                    {queueStats.pending} pending
                  </StatusBadge>
                </div>

                {pendingMessages.length > 0 ? (
                  <div className="divide-y divide-border/50 max-h-64 overflow-y-auto">
                    {pendingMessages.map((msg: any) => (
                      <div key={msg.id} className="px-4 py-3 hover:bg-secondary/30">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">
                              {msg.recipient_name || msg.recipient}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{msg.message}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] text-muted-foreground">
                                {msg.channel?.toUpperCase()}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                Attempts: {msg.attempt_count || 0}/3
                              </span>
                            </div>
                          </div>
                          <StatusBadge
                            variant={msg.status === "pending" ? "warning" : msg.status === "sending" ? "default" : "destructive"}
                            className="shrink-0 text-[10px]"
                          >
                            {msg.status}
                          </StatusBadge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-muted-foreground">
                    <Zap className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No pending messages</p>
                    <p className="text-xs mt-1">The message queue is empty</p>
                  </div>
                )}

                <div className="p-3 border-t border-border bg-muted/20 flex items-center justify-between">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-warning" /> Pending: {queueStats.pending}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-primary" /> Sending: {queueStats.sending}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-success" /> Sent: {queueStats.sent}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-destructive" /> Failed: {queueStats.failed}
                    </span>
                  </div>
                </div>
              </Card>
            </div>

            {/* ── Message History (with delivery/read receipts) ────────── */}
            <Card>
              <div className="p-4 border-b border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Message History</h3>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Sent
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-muted-foreground" />✓✓ Delivered
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-primary" />✓✓ Read
                    </span>
                  </div>
                </div>
              </div>
              {messageHistory.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Send className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No messages sent yet</p>
                  <p className="text-xs mt-1">Send a message to see delivery status here</p>
                </div>
              ) : (
                <div className="divide-y divide-border/50 max-h-[300px] overflow-y-auto">
                  {messageHistory.map((msg) => {
                    const statusIcon = msg.status === "read" ? (
                      <span className="text-primary font-bold text-xs" title="Read">✓✓</span>
                    ) : msg.status === "delivered" ? (
                      <span className="text-muted-foreground font-bold text-xs" title="Delivered">✓✓</span>
                    ) : (
                      <span className="text-muted-foreground/60 font-bold text-xs" title="Sent">✓</span>
                    );
                    const statusColor = msg.status === "read" ? "text-primary"
                      : msg.status === "delivered" ? "text-muted-foreground"
                      : "text-muted-foreground/60";
                    return (
                      <div key={`${msg.id}-${msg.timestamp}`} className="px-4 py-2.5 hover:bg-secondary/30 transition-colors">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-xs font-bold ${statusColor}`}>{statusIcon}</span>
                              <p className="text-xs font-medium text-foreground truncate">{msg.to}</p>
                            </div>
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">{msg.text}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <StatusBadge
                              variant={msg.status === "read" ? "info" : msg.status === "delivered" ? "success" : "default"}
                              className="text-[9px] px-1.5 py-0"
                            >
                              {msg.status}
                            </StatusBadge>
                            <p className="text-[9px] text-muted-foreground mt-0.5">
                              {new Date(msg.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* ── Instructions ──────────────────────────────────────────────── */}
            <Card>
              <div className="p-4">
                <h3 className="text-sm font-semibold text-foreground mb-2">Instruction</h3>
                <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
                  <p>Follow these guidelines when using the WhatsApp integration (OpenWA / Baileys / Serverless):</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li><strong>Multi-tenant:</strong> Each institute manages its own WhatsApp session</li>
                    <li><strong>QR Auth:</strong> Connect by scanning a QR code from your phone's WhatsApp → Linked Devices</li>
                    <li><strong>Pairing code:</strong> Alternative to QR — "Link with phone number instead" and enter the 8-character code (works with the Baileys gateway and Serverless mode)</li>
                    <li><strong>Serverless:</strong> In Serverless mode the gateway URL and API key stay out of the browser — a Supabase Edge Function proxies to your persistent gateway</li>
                    <li><strong>Persistent:</strong> Sessions survive server restarts (auth stored by the gateway on disk)</li>
                    <li><strong>Delay:</strong> Messages are sent with a customizable delay (default 4s) between them to prevent rate limiting — tune it in the Bulk Send panel, or set a per-message delay override in Quick Send</li>
                    <li><strong>Auto-reconnect:</strong> The gateway automatically reconnects on network issues</li>
                    <li><strong>Receipts:</strong> Sent (✓) and delivered (✓✓) receipts are tracked per-message</li>
                  </ul>
                  <p className="mt-2 p-2 rounded-md bg-primary/5 border border-primary/10">
                    <strong>Wallet:</strong> You have <strong>{walletCredits}</strong> wallet credits. 1 message = 1 credit. Contact Super Admin to recharge.
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* ── Sidebar: Contacts + Bulk Send ──────────────────────────────── */}
          <div className="w-full lg:w-80 shrink-0 space-y-4">
            {/* Contacts List with Checkboxes */}
            <Card className="overflow-hidden">
              <div className="p-3 border-b border-border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Contacts</h3>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {selectedContactIds.size > 0 && (
                      <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                        {selectedContactIds.size} selected
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded-full">
                      {contacts.length}
                    </span>
                  </div>
                </div>
                {/* Batch Filter Dropdown */}
                <div className="mb-2">
                  <select
                    value={batchFilter}
                    onChange={e => {
                      setBatchFilter(e.target.value);
                      setContactSearch("");
                      setSelectedContactIds(new Set());
                    }}
                    className="w-full px-2 py-1.5 rounded-md bg-card border border-border text-xs text-foreground"
                  >
                    <option value="all">All Batches</option>
                    {allBatches.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-1.5">
                  <div className="relative flex-1">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input
                      placeholder="Search..."
                      value={contactSearch}
                      onChange={e => {
                        setContactSearch(e.target.value);
                        setSelectedContactIds(new Set()); // Clear selection on search
                      }}
                      className="pl-7 h-7 text-xs"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[10px] px-2"
                    onClick={toggleSelectAllForBulk}
                    disabled={filteredContacts.length === 0}
                  >
                    {selectedContactIds.size === filteredContacts.length ? "Clear" : "All"}
                  </Button>
                </div>
              </div>

              <div className="max-h-[320px] overflow-y-auto">
                {contactsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  </div>
                ) : filteredContacts.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <GraduationCap className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">No contacts found</p>
                    <p className="text-[10px] mt-1">Add students with phone numbers to see them here</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {filteredContacts.map((contact) => {
                      const isSelected = selectedContactIds.has(contact.id);
                      const isSent = bulkSentStatus[contact.id];
                      return (
                        <div
                          key={contact.id}
                          className={`flex items-center gap-2 px-3 py-2 hover:bg-secondary/30 transition-colors ${
                            isSelected ? "bg-primary/5" : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleContactSelect(contact.id)}
                            className="rounded border-border accent-primary shrink-0"
                            disabled={bulkSending}
                          />
                          <div
                            className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
                            onClick={() => handleContactSend(contact)}
                          >
                            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <span className="text-[10px] font-bold text-primary">
                                {contact.name.split(" ").filter(Boolean).map(n => n[0]).join("").substring(0, 2)}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-foreground truncate">{contact.name}</p>
                              <p className="text-[10px] text-muted-foreground font-mono truncate">
                                {formatPhoneDisplay(contact.phone)}
                              </p>
                              {contact.batch_name && (
                                <p className="text-[9px] text-muted-foreground/60 truncate">{contact.batch_name}</p>
                              )}
                            </div>
                          </div>
                          {isSent ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 shrink-0"
                              disabled={sessionStatus?.status !== "connected" || bulkSending}
                              onClick={(e) => { e.stopPropagation(); handleContactSend(contact); }}
                              title="Quick fill number"
                            >
                              <Send className="w-3 h-3 text-muted-foreground" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>

            {/* Bulk Send Composer */}
            <Card className="overflow-hidden border-primary/20">
              <div className="p-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <Send className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Bulk Send</h3>
                  {bulkSending && (
                    <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full animate-pulse">
                      Sending...
                    </span>
                  )}
                </div>
              </div>
              <div className="p-3 space-y-3">
                {/* Inter-message delay setting */}
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Label className="text-[10px] text-muted-foreground">Delay between messages</Label>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Input
                        type="number"
                        min={0.5}
                        max={60}
                        step={0.5}
                        value={sendDelayInput}
                        onChange={(e) => setSendDelayInput(e.target.value)}
                        onBlur={() => {
                          const ms = clampSendDelayMs(sendDelaySec * 1000);
                          setSendDelayInput(String(ms / 1000));
                          setSendDelayMs(ms);
                        }}
                        className="h-7 w-20 text-xs text-center font-mono"
                        disabled={bulkSending}
                      />
                      <span className="text-[10px] text-muted-foreground">seconds</span>
                    </div>
                  </div>
                  {selectedContactIds.size > 0 && (
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-muted-foreground">Est. time</p>
                      <p className="text-xs font-semibold text-foreground tabular-nums">
                        ~{selectedContactIds.size <= 1 ? 0 : Math.round((selectedContactIds.size - 1) * (clampSendDelayMs(sendDelaySec * 1000) / 1000))}
                        s
                      </p>
                    </div>
                  )}
                </div>

                <textarea
                  value={bulkMessage}
                  onChange={e => setBulkMessage(e.target.value)}
                  placeholder="Write a pre-written message to send to all selected contacts..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground resize-none disabled:opacity-50"
                  disabled={bulkSending || sessionStatus?.status !== "connected"}
                />

                {/* Progress bar during sending */}
                {bulkSending && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        Sending {bulkProgress.sent + bulkProgress.failed} of {bulkProgress.total}...
                      </span>
                      <span className="text-success font-medium">{bulkProgress.sent} sent</span>
                      {bulkProgress.failed > 0 && (
                        <span className="text-destructive font-medium">{bulkProgress.failed} failed</span>
                      )}
                    </div>
                    <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-success rounded-full transition-all duration-300"
                        style={{ width: `${((bulkProgress.sent + bulkProgress.failed) / bulkProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                <Button
                  className="w-full"
                  onClick={handleBulkSend}
                  disabled={
                    bulkSending ||
                    selectedContactIds.size === 0 ||
                    !bulkMessage.trim() ||
                    sessionStatus?.status !== "connected"
                  }
                  size="sm"
                >
                  {bulkSending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending {bulkProgress.sent + bulkProgress.failed}/{bulkProgress.total}...</>
                  ) : (
                    <><Send className="w-4 h-4 mr-2" />Send to Selected ({selectedContactIds.size})</>
                  )}
                </Button>

                {sessionStatus?.status !== "connected" && (
                  <p className="text-[10px] text-destructive text-center">Connect WhatsApp first</p>
                )}
                {sessionStatus?.status === "connected" && selectedContactIds.size > 0 && walletCredits < selectedContactIds.size && !bulkSending && (
                  <p className="text-[10px] text-destructive text-center">
                    Insufficient credits. Need {selectedContactIds.size}, have {walletCredits}.
                  </p>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ── Server URL Settings Dialog ──────────────────────────────────── */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              WhatsApp Server Settings
            </DialogTitle>
            <DialogDescription>
              Point the app at your WhatsApp gateway: a self-hosted Baileys server (no API key), the
              OpenWA gateway (requires its API key), or the serverless control plane (Supabase Edge
              Functions — the gateway URL and key stay out of the browser).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Current URL Info */}
            <div className="p-3 rounded-lg bg-muted/30 border border-border/50 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">Current Server URL</span>
                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${
                  getServerUrlDescription().source === "custom"
                    ? "bg-primary/10 text-primary"
                    : getServerUrlDescription().source === "env"
                    ? "bg-info/10 text-info"
                    : getServerUrlDescription().source === "serverless"
                    ? "bg-success/10 text-success"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {getServerUrlDescription().source === "custom" ? "Custom" : getServerUrlDescription().source === "env" ? "Env Var" : getServerUrlDescription().source === "serverless" ? "Serverless" : "Default"}
                </span>
              </div>
              <p className="text-xs font-mono text-muted-foreground break-all">{getServerUrlDescription().url}</p>
            </div>

            {/* Server Type (Baileys vs OpenWA vs Serverless) */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Server Backend</Label>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setServerTypeInput("baileys");
                    setTestResult(null);
                    setServerlessConfigLoaded(false);
                  }}
                  className={`flex items-center gap-1.5 p-2 rounded-lg border text-left transition-colors ${
                    serverTypeInput === "baileys"
                      ? "border-primary bg-primary/10"
                      : "border-border/60 bg-card hover:bg-secondary/40"
                  }`}
                >
                  <Smartphone className={`w-3.5 h-3.5 shrink-0 ${serverTypeInput === "baileys" ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="min-w-0">
                    <p className={`text-[11px] font-semibold ${serverTypeInput === "baileys" ? "text-primary" : "text-foreground"}`}>
                      Baileys
                    </p>
                    <p className="text-[9px] text-muted-foreground">No key</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setServerTypeInput("openwa");
                    setTestResult(null);
                    setServerlessConfigLoaded(false);
                  }}
                  className={`flex items-center gap-1.5 p-2 rounded-lg border text-left transition-colors ${
                    serverTypeInput === "openwa"
                      ? "border-primary bg-primary/10"
                      : "border-border/60 bg-card hover:bg-secondary/40"
                  }`}
                >
                  <QrCode className={`w-3.5 h-3.5 shrink-0 ${serverTypeInput === "openwa" ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="min-w-0">
                    <p className={`text-[11px] font-semibold ${serverTypeInput === "openwa" ? "text-primary" : "text-foreground"}`}>
                      OpenWA
                    </p>
                    <p className="text-[9px] text-muted-foreground">API key</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setServerTypeInput("serverless");
                    setTestResult(null);
                    void loadServerlessConfigIntoForm();
                  }}
                  className={`flex items-center gap-1.5 p-2 rounded-lg border text-left transition-colors ${
                    serverTypeInput === "serverless"
                      ? "border-primary bg-primary/10"
                      : "border-border/60 bg-card hover:bg-secondary/40"
                  }`}
                >
                  <Cloud className={`w-3.5 h-3.5 shrink-0 ${serverTypeInput === "serverless" ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="min-w-0">
                    <p className={`text-[11px] font-semibold ${serverTypeInput === "serverless" ? "text-primary" : "text-foreground"}`}>
                      Serverless
                    </p>
                    <p className="text-[9px] text-muted-foreground">Edge Functions</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Serverless mode: gateway config is saved server-side */}
            {serverTypeInput === "serverless" ? (
              <div className="space-y-1.5 p-3 rounded-lg bg-success/5 border border-success/20">
                <div className="flex items-start gap-2">
                  <Cloud className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" />
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Serverless mode — no gateway URL or API key is stored in this browser. A Supabase
                    Edge Function (<code className="text-primary">whatsapp-gateway</code>) proxies to your persistent
                    gateway. Configure it below; it is saved to your institute's database.
                  </p>
                  <p className="text-[10px] text-warning leading-relaxed mt-1">
                    <AlertCircle className="w-3 h-3 inline mr-0.5" />
                    First deploy the function once so the page stops showing "Requested function not found":
                    <code className="block mt-1 px-2 py-1 rounded bg-muted text-primary font-mono text-[9px]">
                      npx supabase functions deploy whatsapp-gateway --no-verify-jwt
                    </code>
                    <span className="text-muted-foreground">(or <code className="text-primary">npm run deploy:whatsapp</code>)</span>
                  </p>
                </div>
                {serverlessConfigLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading saved config...
                  </div>
                ) : serverlessConfigError ? (
                  <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/30">
                    <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                    <p className="text-[10px] text-destructive leading-relaxed">{serverlessConfigError}</p>
                  </div>
                ) : serverlessConfigLoaded ? (
                  <p className="text-[10px] text-success">
                    <CheckCircle2 className="w-3 h-3 inline mr-0.5" />
                    Existing gateway config loaded (API key is kept server-side).
                  </p>
                ) : null}
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="serverless-url" className="text-xs">Gateway URL (OpenWA or Baileys server)</Label>
                  <Input
                    id="serverless-url"
                    value={serverlessUrlInput}
                    onChange={(e) => {
                      setServerlessUrlInput(e.target.value);
                      setTestResult(null);
                    }}
                    placeholder="https://your-openwa.up.railway.app"
                    className="text-sm font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Gateway Type</Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["baileys", "openwa"] as const).map((gt) => (
                      <button
                        key={gt}
                        type="button"
                        onClick={() => setServerlessGatewayTypeInput(gt)}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-left transition-colors ${
                          serverlessGatewayTypeInput === gt
                            ? "border-primary bg-primary/10"
                            : "border-border/60 bg-card hover:bg-secondary/40"
                        }`}
                      >
                        {gt === "baileys" ? (
                          <Smartphone className={`w-3 h-3 ${serverlessGatewayTypeInput === gt ? "text-primary" : "text-muted-foreground"}`} />
                        ) : (
                          <QrCode className={`w-3 h-3 ${serverlessGatewayTypeInput === gt ? "text-primary" : "text-muted-foreground"}`} />
                        )}
                        <span className={`text-[11px] font-semibold capitalize ${serverlessGatewayTypeInput === gt ? "text-primary" : "text-foreground"}`}>
                          {gt}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                {serverlessGatewayTypeInput === "openwa" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="serverless-key" className="text-xs">OpenWA API Key</Label>
                    <Input
                      id="serverless-key"
                      type="password"
                      value={serverlessKeyInput}
                      onChange={(e) => {
                        setServerlessKeyInput(e.target.value);
                        setTestResult(null);
                      }}
                      placeholder="owa_k1_..."
                      className="text-sm font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Saved server-side (Supabase DB). Leave empty to keep the currently saved key.
                    </p>
                    <p className="text-[10px] text-warning">
                      <AlertCircle className="w-3 h-3 inline mr-0.5" />
                      Use an <strong>Admin or Operator</strong> key — Viewer keys can read sessions but may be rejected for
                      sending/QR actions.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <>
            {/* Hosting Provider Presets */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Hosting Provider</Label>
                <div className="grid grid-cols-1 gap-1.5">
                  {SERVER_PRESETS.map((preset) => {
                    const isActive = activePresetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyPreset(preset)}
                        className={`flex items-start gap-2 p-2 rounded-lg border text-left transition-colors ${
                          isActive
                            ? "border-primary bg-primary/10"
                            : "border-border/60 bg-card hover:bg-secondary/40 hover:border-border"
                        }`}
                      >
                        <div className={`mt-0.5 p-1.5 rounded-md shrink-0 ${isActive ? "bg-primary/20" : "bg-muted"}`}>
                          <ExternalLink className={`w-3 h-3 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-[11px] font-semibold ${isActive ? "text-primary" : "text-foreground"}`}>
                              {preset.label}
                            </span>
                            <span className="text-[8px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                              {preset.provider}
                            </span>
                          </div>
                          <p className="text-[9px] text-muted-foreground mt-0.5 leading-relaxed">{preset.description}</p>
                          {preset.url && (
                            <p className="text-[9px] font-mono text-muted-foreground/80 mt-0.5 truncate">{preset.url}</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Pick your hosting option and paste your real URL/API key. Render & Railway free tiers
                  sleep after ~15 min idle — the page's keep-alive ping wakes them automatically.
                </p>
              </div>

              {/* Custom URL Input */}
              <div className="space-y-1.5">
                <Label htmlFor="server-url" className="text-xs">OpenWA Server URL</Label>
                <Input
                  id="server-url"
                  value={customUrlInput}
                  onChange={(e) => {
                    setCustomUrlInput(e.target.value);
                    setTestResult(null);
                  }}
                  placeholder="https://your-openwa.up.railway.app"
                  className="text-sm font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  Leave empty to use the build-time env variable or same-origin default.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="openwa-api-key" className="text-xs">OpenWA API Key</Label>
                <Input
                  id="openwa-api-key"
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => {
                    setApiKeyInput(e.target.value);
                    setTestResult(null);
                  }}
                  placeholder="owa_k1_..."
                  className="text-sm font-mono"
                  disabled={serverTypeInput !== "openwa"}
                />
                {serverTypeInput === "openwa" ? (
                  <p className="text-[10px] text-muted-foreground">
                    OpenWA prints the initial admin key to its startup log and writes it to{" "}
                    <code className="text-primary">data/.api-key</code> on first run. Create scoped keys
                    in the OpenWA dashboard (Settings → API Keys) if needed.
                  </p>
                ) : (
                  <p className="text-[10px] text-success">
                    <CheckCircle2 className="w-3 h-3 inline mr-0.5" />
                    Baileys server selected — no API key required.
                  </p>
                )}
              </div>

              {/* Keep-alive heartbeat toggle */}
              <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-muted/30 border border-border/50">
                <div className="min-w-0">
                  <Label className="text-xs text-foreground">Keep-alive heartbeat</Label>
                  <p className="text-[9px] text-muted-foreground mt-0.5">
                    Pings <code className="text-primary">/api/health</code> every few minutes so Render/Railway
                    free tiers don't sleep. Keeps the server online while this page is open.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={keepAliveEnabled}
                  onClick={toggleKeepAlive}
                  className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
                    keepAliveEnabled ? "bg-success" : "bg-muted-foreground/30"
                  }`}
                  title={keepAliveEnabled ? "Keep-alive is on" : "Keep-alive is off"}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      keepAliveEnabled ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
              </>
            )}

            {/* Test Connection Button + Result */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                disabled={
                  testingConnection ||
                  (serverTypeInput === "serverless"
                    ? !serverlessUrlInput.trim() && !serverlessConfigLoaded
                    : (!customUrlInput.trim() && !apiKeyInput.trim()) ||
                      (serverTypeInput === "openwa" && !customUrlInput.trim()))
                }
                className="text-xs"
              >
                {testingConnection ? (
                  <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Testing...</>
                ) : (
                  <><ExternalLink className="w-3 h-3 mr-1.5" />Test Connection</>
                )}
              </Button>
              {testResult && (
                <div className="flex items-start gap-1.5 text-xs">
                  {testResult.ok ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-success mt-0.5" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 shrink-0 text-destructive mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <span className={`block ${testResult.ok ? "text-success" : "text-destructive"}`}>{testResult.message}</span>
                    {/* Browser CORS hint — direct OpenWA URLs can't be called from the browser */}
                    {!testResult.ok && serverTypeInput !== "serverless" && /failed to fetch|cors/i.test(testResult.message) && (
                      <div className="mt-1.5 space-y-1.5 rounded-md bg-destructive/5 border border-destructive/15 p-2">
                        <p className="text-[10px] leading-relaxed text-muted-foreground">
                          This is a <b>CORS block on your OpenWA host</b>, not an app problem. To make direct mode
                          work, set this env var on your OpenWA deployment (Railway → Variables → Redeploy) —
                          <b> no trailing slash</b>:
                        </p>
                        <div className="flex items-center gap-1.5">
                          <code className="flex-1 min-w-0 truncate px-2 py-1 rounded bg-background border border-border font-mono text-[10px] text-foreground" title={corsEnvLine}>
                            {corsEnvLine || "CORS_ORIGINS=https://<your-app-origin>"}
                          </code>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-[10px] shrink-0"
                            onClick={() => {
                              if (!corsEnvLine) return;
                              navigator.clipboard?.writeText(corsEnvLine)?.then(() => {
                                setCorsCopied(true);
                                setTimeout(() => setCorsCopied(false), 2000);
                              }).catch(() => {});
                            }}
                          >
                            {corsCopied ? <CheckCircle2 className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                            {corsCopied ? "Copied" : "Copy"}
                          </Button>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setServerTypeInput("serverless");
                            setTestResult(null);
                            void loadServerlessConfigIntoForm();
                          }}
                          className="flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
                        >
                          <Cloud className="w-3 h-3" /> Or switch to Serverless mode (Edge Function bypasses browser CORS)
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetUrl}
                className="text-xs text-destructive hover:text-destructive"
              >
                Reset to Default
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSettingsOpen(false);
                  setTestResult(null);
                }}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveUrl}
                disabled={serverTypeInput === "serverless" ? !serverlessUrlInput.trim() : !customUrlInput.trim() && !apiKeyInput.trim()}
                className="text-xs"
              >
                Save & Reload
              </Button>
            </div>

            <p className="text-[10px] text-muted-foreground text-center">
              {serverTypeInput === "serverless"
                ? "Saved to your institute's database via Supabase Edge Functions. The page will reload after saving."
                : "Saved to browser localStorage. The page will reload after saving."}
            </p>
            {serverTypeInput === "openwa" && !isApiKeyConfigured() && (
              <div className="flex items-start gap-2 p-2 rounded-md bg-warning/10 border border-warning/20">
                <AlertCircle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
                <p className="text-[10px] text-warning">
                  OpenWA selected, but no API key is configured yet — connection and messaging will fail until you add one.
                </p>
              </div>
            )}
            {serverTypeInput === "serverless" && !serverlessConfigLoaded && !serverlessUrlInput.trim() && (
              <div className="flex items-start gap-2 p-2 rounded-md bg-warning/10 border border-warning/20">
                <AlertCircle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
                <p className="text-[10px] text-warning">
                  Serverless mode is on, but no gateway URL is configured yet — the status badge will show offline until you save one.
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
