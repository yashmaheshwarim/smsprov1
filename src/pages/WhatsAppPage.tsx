import { useState, useEffect, useCallback, useMemo } from "react";
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
import {
  whatsappSocket,
  fetchSessionStatus,
  restConnectSession,

  restDisconnectSession,
  restLogoutSession,
  restSendMessage,
  restSendBatch,
  getServerUrlDescription,
  getCustomServerUrl,
  setCustomServerUrl,
  clearCustomServerUrl,
  stripTrailingSlash,
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

  // Socket readiness — ensure WebSocket is connected before showing connect button
  const [socketReady, setSocketReady] = useState(false);

  // QR timeout detection — if connecting for >= 15s without QR, offer refresh
  const [qrWaitingLong, setQrWaitingLong] = useState(false);
  const [refreshingQr, setRefreshingQr] = useState(false);

  // Message sending
  const [sendTo, setSendTo] = useState("");
  const [sendText, setSendText] = useState("");
  const [sending, setSending] = useState(false);

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
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // ── Socket Connection ───────────────────────────────────────────────────────

  // QR timeout: if connecting for > 30s without receiving a QR, allow refresh
  // Baileys initialization (pre-key download, version fetch, socket setup) can
  // take 15-30s on cold start, especially on first deploy.
  useEffect(() => {
    if (sessionStatus?.status !== "connecting" || qrCodeDataUrl) {
      setQrWaitingLong(false);
      return;
    }
    const timer = setTimeout(() => {
      setQrWaitingLong(true);
    }, 30000);
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
    setConnecting(true);
    setSessionStatus((prev) => prev ? { ...prev, status: "connecting" } : null);
    try {
      const url = await QRCode.toDataURL(data.qr, {
        width: 256,
        margin: 2,
        color: { dark: "#111827", light: "#ffffff" },
      });
      setQrCodeDataUrl(url);
    } catch {
      setQrCodeDataUrl(null);
    }
  }, []);

  const handleConnected = useCallback((data: { instituteId: string; phone?: string }) => {
    setSessionStatus((prev) =>
      prev ? { ...prev, status: "connected", phone: data.phone } : { instituteId: instId, status: "connected", phone: data.phone }
    );
    setQrCodeDataUrl(null);
    setConnecting(false);
  }, [instId]);

  const handleDisconnected = useCallback(() => {
    setSessionStatus((prev) => prev ? { ...prev, status: "disconnected", phone: undefined } : { instituteId: instId, status: "disconnected" });
    setQrCodeDataUrl(null);
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
    const url = stripTrailingSlash(customUrlInput.trim());
    if (!url) {
      setTestResult({ ok: false, message: "Please enter a URL first" });
      return;
    }
    setTestingConnection(true);
    setTestResult(null);
    try {
      const resp = await fetch(`${url}/api/health`, {
        signal: AbortSignal.timeout(8000),
      });
      if (resp.ok) {
        const data = await resp.json();
        setTestResult({
          ok: true,
          message: `Connected! Server has ${data.sessions || 0} active session(s).`,
        });
      } else {
        setTestResult({ ok: false, message: `Server responded with status ${resp.status}` });
      }
    } catch (err: any) {
      setTestResult({ ok: false, message: `Cannot reach server: ${err.message || "Connection failed"}` });
    } finally {
      setTestingConnection(false);
    }
  }, [customUrlInput]);

  const handleSaveUrl = useCallback(() => {
    const url = stripTrailingSlash(customUrlInput.trim());
    if (!url) {
      toast({ title: "Invalid URL", description: "Please enter a valid server URL", variant: "destructive" });
      return;
    }
    // Basic URL validation
    try {
      new URL(url);
    } catch {
      toast({ title: "Invalid URL", description: "URL must start with http:// or https://", variant: "destructive" });
      return;
    }
    setCustomServerUrl(url);
    setSettingsOpen(false);
    setTestResult(null);
    toast({
      title: "Server URL Saved",
      description: `WhatsApp server URL updated to ${url}`,
    });
    // Force re-connect with new URL
    window.location.reload();
  }, [customUrlInput]);

  const handleResetUrl = useCallback(() => {
    clearCustomServerUrl();
    setCustomUrlInput("");
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
    setTestResult(null);
    setSettingsOpen(true);
  }, []);

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

  // Connect to socket on mount
  useEffect(() => {
    if (!isUuid(instId)) return;

    let cancelled = false;
    let healthInterval: ReturnType<typeof setInterval>;

    const checkServer = async () => {
      try {
        const resp = await fetch(`${getServerUrlDescription().url}/api/health`, {
          signal: AbortSignal.timeout(5000),
        });
        if (cancelled) return;
        const online = resp.ok;
        setServerAvailable(online);
        if (online) {
          clearInterval(healthInterval);
          fetchSessionStatus(instId).then((status) => {
            if (!cancelled && status) {
              setSessionStatus(status);
            }
          });
        }
      } catch {
        if (!cancelled) setServerAvailable(false);
      }
    };

    checkServer();
    healthInterval = setInterval(checkServer, 5000);

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
      clearInterval(healthInterval);
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
        const srcLabel = source === "custom" ? "Custom URL" : source === "env" ? "Env Variable" : "Default";
        toast({
          title: "Connection Failed",
          description: `Could not reach WhatsApp server at ${url} (${srcLabel}). Check your server URL in settings.`,
          variant: "destructive",
        });
    }
  };

  const handleRefreshQR = async () => {
    setRefreshingQr(true);
    setQrWaitingLong(false);
    setQrCodeDataUrl(null);
    const { url } = getServerUrlDescription();
    try {
      const res = await fetch(`${url}/api/sessions/${instId}/refresh-qr`, {
        method: "POST",
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        if (res.status === 404) {
          toast({
            title: "Refresh Not Available",
            description: `The refresh-qr endpoint is missing on the server. Deploy the latest code to ${url}. (Status: 404)`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Refresh Failed",
            description: `Server responded with status ${res.status}. Check the server URL in settings.`,
            variant: "destructive",
          });
        }
        setConnecting(false);
      }
    } catch (err: any) {
      toast({
        title: "Refresh Failed",
        description: `Cannot reach server at ${url}: ${err?.message || "Connection refused"}. Make sure the server is running and accessible.`,
        variant: "destructive",
      });
    } finally {
      setRefreshingQr(false);
    }
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
    const result = await restSendMessage(instId, sendTo.trim(), sendText.trim());
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

    // Send all messages as a single batch request to the server
    // The server handles 3-5s anti-ban delays internally
    const batchResult = await restSendBatch(instId, messages.map(m => ({ to: m.to, text: m.text })));

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
    } catch {}
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

  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">WhatsApp Manager</h2>
          <p className="text-sm text-muted-foreground">
            {instituteName ? `${instituteName} — ` : ""}Connect your institute WhatsApp using QR code
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
          {!serverAvailable && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-destructive/10 border border-destructive/20" title={`Trying: ${getServerUrlDescription().url}`}>
              <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
              <div className="hidden sm:block">
                <span className="text-xs text-destructive font-medium">Server Offline</span>
                <p className="text-[9px] text-destructive/70 max-w-[200px] truncate">
                  {getServerUrlDescription().url}
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

                {/* QR Code Display */}
                {sessionStatus?.status === "connecting" && (
                  <div className="mt-5 flex flex-col items-center gap-3 p-4 bg-muted/30 rounded-xl border border-border/50">
                    {qrCodeDataUrl ? (
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
                          <span className="text-[10px] text-muted-foreground">Waiting for scan... QR refreshes every 30s</span>
                        </div>
                      </>
                    ) : qrWaitingLong ? (
                      <div className="flex flex-col items-center gap-3 py-6">
                        <AlertCircle className="w-8 h-8 text-warning" />
                        <p className="text-sm font-medium text-foreground">QR code not received yet</p>
                        <p className="text-xs text-muted-foreground text-center max-w-xs">
                          The server may have emitted the QR before your browser finished connecting.
                          Click below to request a fresh QR code.
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
                  <p>Follow these guidelines when using the WhatsApp integration:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li><strong>Multi-tenant:</strong> Each institute manages its own WhatsApp session</li>
                    <li><strong>QR Auth:</strong> Connect by scanning a QR code from your phone's WhatsApp → Linked Devices</li>
                    <li><strong>Persistent:</strong> Sessions survive server restarts (auth stored on disk)</li>
                    <li><strong>Queue:</strong> Messages are queued and sent with 3-5s delays to prevent rate limiting</li>
                    <li><strong>Auto-reconnect:</strong> Automatically reconnects on network issues</li>
                    <li><strong>Receipts:</strong> Delivery (✓✓) and Read (✓✓ blue) receipts are tracked in real-time</li>
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              WhatsApp Server Settings
            </DialogTitle>
            <DialogDescription>
              Configure the URL of your WhatsApp Baileys server.
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
                    : "bg-muted text-muted-foreground"
                }`}>
                  {getServerUrlDescription().source === "custom" ? "Custom" : getServerUrlDescription().source === "env" ? "Env Var" : "Default"}
                </span>
              </div>
              <p className="text-xs font-mono text-muted-foreground break-all">{getServerUrlDescription().url}</p>
            </div>              {/* Quick Preset URLs */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Quick Select</Label>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] font-mono px-2"
                    onClick={() => {
                      setCustomUrlInput('https://apexsmspro.onrender.com');
                      setTestResult(null);
                    }}
                    title="Render deployment"
                  >
                    <ExternalLink className="w-2.5 h-2.5 mr-1" />
                    Render
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] font-mono px-2"
                    onClick={() => {
                      setCustomUrlInput('https://smsprov1-production.up.railway.app');
                      setTestResult(null);
                    }}
                    title="Railway deployment"
                  >
                    <ExternalLink className="w-2.5 h-2.5 mr-1" />
                    Railway
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] font-mono px-2"
                    onClick={() => setCustomUrlInput('http://localhost:3001')}
                    title="Local development"
                  >
                    Localhost
                  </Button>
                </div>
              </div>

              {/* Custom URL Input */}
              <div className="space-y-1.5">
                <Label htmlFor="server-url" className="text-xs">Custom Server URL</Label>
                <Input
                  id="server-url"
                  value={customUrlInput}
                  onChange={(e) => {
                    setCustomUrlInput(e.target.value);
                    setTestResult(null);
                  }}
                  placeholder="https://your-whatsapp-server.up.railway.app"
                  className="text-sm font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  Leave empty to use the build-time env variable or same-origin default.
                </p>
              </div>

            {/* Test Connection Button + Result */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                disabled={testingConnection || !customUrlInput.trim()}
                className="text-xs"
              >
                {testingConnection ? (
                  <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Testing...</>
                ) : (
                  <><ExternalLink className="w-3 h-3 mr-1.5" />Test Connection</>
                )}
              </Button>
              {testResult && (
                <div className={`flex items-center gap-1.5 text-xs ${
                  testResult.ok ? "text-success" : "text-destructive"
                }`}>
                  {testResult.ok ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span className="truncate max-w-[200px]">{testResult.message}</span>
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
                disabled={!customUrlInput.trim()}
                className="text-xs"
              >
                Save & Reload
              </Button>
            </div>

            <p className="text-[10px] text-muted-foreground text-center">
              Saved to browser localStorage. The page will reload after saving.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
