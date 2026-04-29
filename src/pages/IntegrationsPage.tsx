import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MessageSquare, Mail, Bell, CreditCard, FileText, Globe, Check, Settings2, Zap, Loader2, ShieldCheck, QrCode, Smartphone, ExternalLink } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import { isUuid } from "@/lib/supabase";
import { ZavuService, getZavuConfig, saveZavuConfig, disconnectZavu } from "@/lib/zavu-service";
import { getWhatsAppWebConfig, saveWhatsAppWebConfig, disconnectWhatsAppWeb } from "@/lib/whatsapp-web-service";

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  status: "connected" | "disconnected" | "error";
  category: string;
  fields: { key: string; label: string; placeholder: string; type?: string }[];
}

const staticIntegrations: Integration[] = [
  {
    id: "razorpay",
    name: "Razorpay",
    description: "Accept online fee payments via UPI, cards, and net banking",
    icon: CreditCard,
    status: "disconnected",
    category: "Payments",
    fields: [
      { key: "key_id", label: "Key ID", placeholder: "rzp_live_xxxxx" },
      { key: "key_secret", label: "Key Secret", placeholder: "Enter key secret", type: "password" },
    ],
  },
  {
    id: "smtp",
    name: "Email (SMTP)",
    description: "Send emails for notifications, reports, and communications",
    icon: Mail,
    status: "disconnected",
    category: "Email",
    fields: [
      { key: "host", label: "SMTP Host", placeholder: "smtp.gmail.com" },
      { key: "port", label: "Port", placeholder: "587" },
      { key: "username", label: "Username", placeholder: "your@email.com" },
      { key: "password", label: "Password", placeholder: "App password", type: "password" },
    ],
  },
  {
    id: "firebase",
    name: "Firebase Push Notifications",
    description: "Send push notifications to student and parent mobile apps",
    icon: Bell,
    status: "disconnected",
    category: "Notifications",
    fields: [
      { key: "project_id", label: "Project ID", placeholder: "your-firebase-project" },
      { key: "server_key", label: "Server Key", placeholder: "Enter FCM server key", type: "password" },
    ],
  },
  {
    id: "google_sheets",
    name: "Google Sheets",
    description: "Import/export student data, attendance, and fee records",
    icon: FileText,
    status: "disconnected",
    category: "Data",
    fields: [
      { key: "service_account", label: "Service Account JSON", placeholder: "Paste service account JSON", type: "password" },
    ],
  },
  {
    id: "webhook",
    name: "Custom Webhook",
    description: "Send event data to any external URL for custom integrations",
    icon: Globe,
    status: "disconnected",
    category: "Developer",
    fields: [
      { key: "url", label: "Webhook URL", placeholder: "https://your-api.com/webhook" },
      { key: "secret", label: "Secret Key", placeholder: "Optional webhook secret", type: "password" },
    ],
  },
];

export default function IntegrationsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const instId = isAdmin ? (user as AdminUser).instituteId : "";

  // Zavu state
  const [zavuStatus, setZavuStatus] = useState<"connected" | "disconnected" | "error">("disconnected");
  const [zavuConfigOpen, setZavuConfigOpen] = useState(false);
  const [zavuApiKey, setZavuApiKey] = useState("");
  const [zavuValidating, setZavuValidating] = useState(false);
  const [zavuLoading, setZavuLoading] = useState(true);

  // WhatsApp Web state
  const [waWebStatus, setWaWebStatus] = useState<"connected" | "disconnected" | "error">("disconnected");
  const [waWebOpen, setWaWebOpen] = useState(false);
  const [waWebLoading, setWaWebLoading] = useState(true);
  const [waWebConfirming, setWaWebConfirming] = useState(false);
  const [popupOpened, setPopupOpened] = useState(false);
  const popupRef = useRef<Window | null>(null);

  // Generic integrations state
  const [statuses, setStatuses] = useState<Record<string, "connected" | "disconnected" | "error">>(
    Object.fromEntries(staticIntegrations.map((i) => [i.id, i.status]))
  );
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  // Load configs on mount
  useEffect(() => {
    if (!isUuid(instId)) {
      setZavuLoading(false);
      setWaWebLoading(false);
      return;
    }
    (async () => {
      const zavuConfig = await getZavuConfig(instId);
      if (zavuConfig?.status === "connected") setZavuStatus("connected");
      setZavuLoading(false);

      const waConfig = await getWhatsAppWebConfig(instId);
      if (waConfig?.status === "connected") setWaWebStatus("connected");
      setWaWebLoading(false);
    })();
  }, [instId]);

  // ── Zavu ────────────────────────────────────────────────────────────────

  const handleZavuConnect = async () => {
    if (!zavuApiKey.trim()) {
      toast({ title: "Missing API Key", description: "Please enter your Zavu API key.", variant: "destructive" });
      return;
    }
    setZavuValidating(true);
    try {
      const svc = new ZavuService(zavuApiKey.trim());
      const valid = await svc.validateKey();
      if (!valid) {
        toast({ title: "Invalid API Key", description: "Could not validate the key with Zavu.", variant: "destructive" });
        return;
      }
      const saved = await saveZavuConfig(instId, zavuApiKey.trim(), "connected");
      if (!saved) {
        toast({ title: "Save Error", description: "Failed to save configuration.", variant: "destructive" });
        return;
      }
      setZavuStatus("connected");
      setZavuConfigOpen(false);
      setZavuApiKey("");
      toast({ title: "Zavu Connected!", description: "Multi-channel messaging is now active." });
    } catch (err: any) {
      toast({ title: "Connection Error", description: err.message || "Failed to connect", variant: "destructive" });
    } finally {
      setZavuValidating(false);
    }
  };

  const handleZavuDisconnect = async () => {
    await disconnectZavu(instId);
    setZavuStatus("disconnected");
    toast({ title: "Zavu Disconnected", description: "Messaging integration removed." });
  };

  // ── WhatsApp Web ─────────────────────────────────────────────────────────

  const openWhatsAppWebPopup = () => {
    // Close any existing popup first
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.focus();
      return;
    }
    const width = 1024;
    const height = 700;
    const left = Math.max(0, (window.screen.width - width) / 2);
    const top = Math.max(0, (window.screen.height - height) / 2);
    const popup = window.open(
      "https://web.whatsapp.com/",
      "whatsapp_web",
      `width=${width},height=${height},left=${left},top=${top},toolbar=0,menubar=0,scrollbars=1,resizable=1`
    );
    popupRef.current = popup;
    setPopupOpened(true);
  };

  const handleWaWebConfirm = async () => {
    setWaWebConfirming(true);
    try {
      // Save a "connected" record with mode=web (no API credentials needed)
      const saved = await saveWhatsAppWebConfig(instId, "web", "web", "connected");
      if (!saved) {
        toast({ title: "Save Error", description: "Failed to save connection.", variant: "destructive" });
        return;
      }
      // Close popup if still open
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
      popupRef.current = null;
      setWaWebStatus("connected");
      setWaWebOpen(false);
      setPopupOpened(false);
      toast({ title: "WhatsApp Web Connected!", description: "Your WhatsApp is now linked as a device." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to save.", variant: "destructive" });
    } finally {
      setWaWebConfirming(false);
    }
  };

  const handleWaWebDisconnect = async () => {
    await disconnectWhatsAppWeb(instId);
    setWaWebStatus("disconnected");
    if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    popupRef.current = null;
    toast({ title: "WhatsApp Web Disconnected", description: "Device link removed." });
  };

  const handleWaWebDialogChange = (open: boolean) => {
    setWaWebOpen(open);
    if (!open) {
      setPopupOpened(false);
      // Don't close the popup — user may still be scanning
    }
  };

  // ── Generic integrations ─────────────────────────────────────────────────

  const handleConnect = (integrationId: string) => {
    const integration = staticIntegrations.find((i) => i.id === integrationId);
    if (!integration) return;
    const allFilled = integration.fields.every((f) => formValues[f.key]?.trim());
    if (!allFilled) {
      toast({ title: "Missing fields", description: "Please fill all required fields.", variant: "destructive" });
      return;
    }
    setStatuses((prev) => ({ ...prev, [integrationId]: "connected" }));
    setConfiguring(null);
    setFormValues({});
    toast({ title: "Connected!", description: `${integration.name} has been configured successfully.` });
  };

  const handleDisconnect = (integrationId: string) => {
    setStatuses((prev) => ({ ...prev, [integrationId]: "disconnected" }));
    toast({ title: "Disconnected", description: "Integration has been removed." });
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Integrations</h2>
        <p className="text-sm text-muted-foreground">Connect external services to enhance your institute</p>
      </div>

      {/* ── Messaging ─────────────────────────────────────────────────────── */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Messaging</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">

          {/* ── Zavu Card ── */}
          <div className="surface-elevated rounded-lg p-4 ring-1 ring-primary/20 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-cyan-500 to-violet-500" />
            <div className="flex items-start gap-3 pt-1">
              <div className="p-2.5 rounded-lg bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 shrink-0">
                <Zap className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">Zavu Messaging</p>
                  {zavuLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                  ) : (
                    <StatusBadge variant={zavuStatus === "connected" ? "success" : "default"}>{zavuStatus}</StatusBadge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Send SMS, WhatsApp, Email & Voice messages via Zavu — unified multi-channel messaging platform
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {["SMS", "WhatsApp", "Email", "Voice", "Telegram"].map((ch) => (
                    <span key={ch} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary/60 text-muted-foreground">{ch}</span>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-3">
                  {zavuStatus === "connected" ? (
                    <>
                      <div className="flex items-center gap-1.5 text-xs text-success font-medium">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        API Connected
                      </div>
                      <div className="flex-1" />
                      <Button variant="outline" size="sm" onClick={handleZavuDisconnect} className="h-8 text-xs">Disconnect</Button>
                    </>
                  ) : (
                    <Dialog open={zavuConfigOpen} onOpenChange={setZavuConfigOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" className="h-8 text-xs bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 shadow-lg shadow-emerald-500/20">
                          <Zap className="w-3.5 h-3.5 mr-1" />Connect Zavu
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[440px]">
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            <div className="p-1.5 rounded-md bg-gradient-to-br from-emerald-500/20 to-cyan-500/20">
                              <Zap className="w-4 h-4 text-emerald-400" />
                            </div>
                            Connect Zavu Messaging
                          </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-2">
                          <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              Enter your Zavu API key to enable multi-channel messaging. Get your key from{" "}
                              <a href="https://zavu.dev" target="_blank" rel="noopener noreferrer" className="text-primary underline font-medium">zavu.dev</a>
                            </p>
                          </div>
                          <div>
                            <Label className="text-xs">API Key</Label>
                            <Input type="password" placeholder="zv_live_xxxxxxxxxxxxxxxx" value={zavuApiKey} onChange={(e) => setZavuApiKey(e.target.value)} className="mt-1 font-mono text-xs" />
                          </div>
                          <Button className="w-full bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500" onClick={handleZavuConnect} disabled={zavuValidating}>
                            {zavuValidating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Validating...</> : <><Check className="w-4 h-4 mr-1" />Connect & Validate</>}
                          </Button>
                          <p className="text-[10px] text-muted-foreground text-center">Your API key is stored securely per-institute in the database</p>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── WhatsApp Web Card ── */}
          <div className="surface-elevated rounded-lg p-4 ring-1 ring-green-500/20 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500" />
            <div className="flex items-start gap-3 pt-1">
              <div className="p-2.5 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/20 shrink-0">
                <QrCode className="w-5 h-5 text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">WhatsApp Web</p>
                  {waWebLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                  ) : (
                    <StatusBadge variant={waWebStatus === "connected" ? "success" : "default"}>{waWebStatus}</StatusBadge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Link your WhatsApp as a device — just like web.whatsapp.com on your computer
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {["WhatsApp", "QR Scan", "Linked Device"].map((ch) => (
                    <span key={ch} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/10 text-green-600">{ch}</span>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-3">
                  {waWebStatus === "connected" ? (
                    <>
                      <div className="flex items-center gap-1.5 text-xs text-success font-medium">
                        <Check className="w-3.5 h-3.5" />
                        Device Linked
                      </div>
                      <div className="flex-1" />
                      <Button variant="outline" size="sm" onClick={handleWaWebDisconnect} className="h-8 text-xs">Disconnect</Button>
                    </>
                  ) : (
                    <Dialog open={waWebOpen} onOpenChange={handleWaWebDialogChange}>
                      <DialogTrigger asChild>
                        <Button size="sm" className="h-8 text-xs bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 shadow-lg shadow-green-500/20">
                          <QrCode className="w-3.5 h-3.5 mr-1" />Connect WhatsApp Web
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[420px]">
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            <div className="p-1.5 rounded-md bg-gradient-to-br from-green-500/20 to-emerald-500/20">
                              <QrCode className="w-4 h-4 text-green-400" />
                            </div>
                            Connect WhatsApp Web
                          </DialogTitle>
                        </DialogHeader>

                        <div className="space-y-5 pt-2">
                          {/* How it works */}
                          <div className="space-y-2">
                            {[
                              { icon: ExternalLink, text: "Click the button below — WhatsApp Web opens in a popup window" },
                              { icon: QrCode,       text: "A QR code will appear in WhatsApp Web" },
                              { icon: Smartphone,   text: "Open WhatsApp on your phone → ⋮ Menu → Linked devices → Link a device → scan the QR" },
                              { icon: Check,        text: "Come back here and click \"I've connected\" to save" },
                            ].map(({ icon: Icon, text }, i) => (
                              <div key={i} className="flex items-start gap-3">
                                <span className="w-5 h-5 rounded-full bg-green-500/15 text-green-500 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                                  {i + 1}
                                </span>
                                <div className="flex items-start gap-2">
                                  <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                                  <p className="text-xs text-muted-foreground leading-snug">{text}</p>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Open popup button */}
                          <Button
                            className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500"
                            onClick={openWhatsAppWebPopup}
                          >
                            <ExternalLink className="w-4 h-4 mr-2" />
                            {popupOpened ? "Reopen WhatsApp Web" : "Open WhatsApp Web"}
                          </Button>

                          {/* Confirm button — appears after popup opened */}
                          {popupOpened && (
                            <Button
                              variant="outline"
                              className="w-full border-green-500/40 text-green-600 hover:bg-green-500/10"
                              onClick={handleWaWebConfirm}
                              disabled={waWebConfirming}
                            >
                              {waWebConfirming ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
                              ) : (
                                <><Check className="w-4 h-4 mr-2" />I've scanned — confirm connection</>
                              )}
                            </Button>
                          )}

                          <p className="text-[10px] text-muted-foreground text-center">
                            Your phone must stay connected to the internet for WhatsApp Web to work
                          </p>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── Other Integrations ───────────────────────────────────────────── */}
      {[...new Set(staticIntegrations.map((i) => i.category))].map((category) => (
        <div key={category}>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{category}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {staticIntegrations
              .filter((i) => i.category === category)
              .map((integration) => {
                const status = statuses[integration.id];
                return (
                  <div key={integration.id} className="surface-elevated rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-md bg-primary/10 shrink-0">
                        <integration.icon className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-foreground truncate">{integration.name}</p>
                          <StatusBadge variant={status === "connected" ? "success" : status === "error" ? "destructive" : "default"}>
                            {status}
                          </StatusBadge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{integration.description}</p>
                        <div className="flex items-center gap-2 mt-3">
                          {status === "connected" ? (
                            <>
                              <Button variant="outline" size="sm" onClick={() => handleDisconnect(integration.id)}>Disconnect</Button>
                              <Button variant="ghost" size="sm"><Settings2 className="w-3.5 h-3.5" /></Button>
                            </>
                          ) : (
                            <Dialog open={configuring === integration.id} onOpenChange={(open) => { setConfiguring(open ? integration.id : null); if (!open) setFormValues({}); }}>
                              <DialogTrigger asChild>
                                <Button size="sm" onClick={() => setConfiguring(integration.id)}>Configure</Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle className="flex items-center gap-2">
                                    <integration.icon className="w-5 h-5 text-primary" />
                                    Configure {integration.name}
                                  </DialogTitle>
                                </DialogHeader>
                                <div className="space-y-3 pt-2">
                                  {integration.fields.map((field) => (
                                    <div key={field.key}>
                                      <Label className="text-xs">{field.label}</Label>
                                      <Input
                                        type={field.type || "text"}
                                        placeholder={field.placeholder}
                                        value={formValues[field.key] || ""}
                                        onChange={(e) => setFormValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                                        className="mt-1"
                                      />
                                    </div>
                                  ))}
                                  <Button className="w-full" onClick={() => handleConnect(integration.id)}>
                                    <Check className="w-4 h-4 mr-1" /> Connect
                                  </Button>
                                </div>
                              </DialogContent>
                            </Dialog>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
