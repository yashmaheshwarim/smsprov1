import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MessageSquare, Mail, Bell, CreditCard, FileText, Globe, Check, Settings2, Zap, Loader2, ShieldCheck, X, MessageCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import { supabase, isUuid } from "@/lib/supabase";
import { ZavuService, getZavuConfig, saveZavuConfig, disconnectZavu } from "@/lib/zavu-service";

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
    id: "waplus",
    name: "WaPlus.io",
    description: "Two webhook URLs for incoming/outgoing WhatsApp messages",
    icon: MessageSquare,
    status: "disconnected",
    category: "Messaging",
    fields: [],
  },
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

  // Zavu-specific state
  const [zavuStatus, setZavuStatus] = useState<"connected" | "disconnected" | "error">("disconnected");
  const [zavuConfigOpen, setZavuConfigOpen] = useState(false);
  const [zavuApiKey, setZavuApiKey] = useState("");
  const [zavuValidating, setZavuValidating] = useState(false);
  const [zavuLoading, setZavuLoading] = useState(true);

  // Generic integrations state
  const [statuses, setStatuses] = useState<Record<string, "connected" | "disconnected" | "error">>(
    Object.fromEntries(staticIntegrations.map((i) => [i.id, i.status]))
  );
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  // Load Zavu config from Supabase on mount
  useEffect(() => {
    if (!isUuid(instId)) {
      setZavuLoading(false);
      return;
    }
    (async () => {
      const config = await getZavuConfig(instId);
      if (config && config.status === "connected") {
        setZavuStatus("connected");
      }
      setZavuLoading(false);
    })();
  }, [instId]);

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
        toast({ title: "Invalid API Key", description: "Could not validate the key with Zavu. Please check and try again.", variant: "destructive" });
        setZavuValidating(false);
        return;
      }

      const saved = await saveZavuConfig(instId, zavuApiKey.trim(), "connected");
      if (!saved) {
        toast({ title: "Save Error", description: "Failed to save configuration to database.", variant: "destructive" });
        setZavuValidating(false);
        return;
      }

      setZavuStatus("connected");
      setZavuConfigOpen(false);
      setZavuApiKey("");
      toast({ title: "Zavu Connected! 🎉", description: "SMS, WhatsApp, Email & Voice messaging is now active for your institute." });
    } catch (err: any) {
      toast({ title: "Connection Error", description: err.message || "Failed to connect", variant: "destructive" });
    } finally {
      setZavuValidating(false);
    }
  };

  const handleZavuDisconnect = async () => {
    await disconnectZavu(instId);
    setZavuStatus("disconnected");
    toast({ title: "Zavu Disconnected", description: "Messaging integration has been removed." });
  };

  // Generic integration handlers
  const handleConnect = async (integrationId: string) => {
    const integration = staticIntegrations.find((i) => i.id === integrationId);
    if (!integration) return;
    const allFilled = integration.fields.every((f) => formValues[f.key]?.trim());
    if (!allFilled) {
      toast({ title: "Missing fields", description: "Please fill all required fields.", variant: "destructive" });
      return;
    }

    // WaPlus: no config needed, just show URLs
    if (integrationId === 'waplus') {
      toast({ title: "WaPlus Ready!", description: "Copy webhook URLs to WaPlus.io dashboard:\n• Incoming: https://apexsms.netlify.app/.netlify/functions/whatsapp-incoming\n• Outgoing: https://apexsms.netlify.app/.netlify/functions/whatsapp-outgoing", variant: "default" });
    }

    setStatuses((prev) => ({ ...prev, [integrationId]: "connected" }));
    setConfiguring(null);
    setFormValues({});
    toast({ title: "Connected!", description: `${integration.name} has been configured successfully.` });
  };

  const handleDisconnect = (integrationId: string) => {
    if (integrationId === 'waplus') {
      supabase
        .from('institutes')
        .update({ waplus_webhook_secret: null, waplus_status: 'disconnected' })
        .eq('id', instId);
    }
    setStatuses((prev) => ({ ...prev, [integrationId]: "disconnected" }));
    toast({ title: "Disconnected", description: "Integration has been removed." });
  };

  const categories = ["Messaging", ...new Set(staticIntegrations.map((i) => i.category))];

  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Integrations</h2>
        <p className="text-sm text-muted-foreground">Connect external services to enhance your institute</p>
      </div>

      {/* ── Messaging: Zavu Card ─────────────────────────────────────────── */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Messaging</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="surface-elevated rounded-lg p-4 ring-1 ring-primary/20 relative overflow-hidden">
            {/* Gradient accent bar */}
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
                    <StatusBadge variant={zavuStatus === "connected" ? "success" : "default"}>
                      {zavuStatus}
                    </StatusBadge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Send SMS, WhatsApp, Email & Voice messages via Zavu — unified multi-channel messaging platform
                </p>

                {/* Channel badges */}
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {["SMS", "WhatsApp", "Email", "Voice", "Telegram"].map((ch) => (
                    <span key={ch} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary/60 text-muted-foreground">
                      {ch}
                    </span>
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
                      <Button variant="outline" size="sm" onClick={handleZavuDisconnect} className="h-8 text-xs">
                        Disconnect
                      </Button>
                    </>
                  ) : (
                    <Dialog open={zavuConfigOpen} onOpenChange={setZavuConfigOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" className="h-8 text-xs bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 shadow-lg shadow-emerald-500/20">
                          <Zap className="w-3.5 h-3.5 mr-1" />
                          Connect Zavu
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
                        <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 mb-4">
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            Enter your Zavu API key to enable multi-channel messaging. Get your key from{" "}
                            <a href="https://zavu.dev" target="_blank" rel="noopener noreferrer" className="text-primary underline font-medium">
                              zavu.dev
                            </a>
                          </p>
                        </div>
                        <div className="space-y-4 pt-2">
                          <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              Enter your Zavu API key to enable multi-channel messaging. Get your key from{" "}
                              <a href="https://zavu.dev" target="_blank" rel="noopener noreferrer" className="text-primary underline font-medium">
                                zavu.dev
                              </a>
                            </p>
                          </div>
                          <div>
                            <Label className="text-xs">API Key</Label>
                            <Input
                              type="password"
                              placeholder="zv_live_xxxxxxxxxxxxxxxx"
                              value={zavuApiKey}
                              onChange={(e) => setZavuApiKey(e.target.value)}
                              className="mt-1 font-mono text-xs"
                            />
                          </div>
                          <Button
                            className="w-full bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500"
                            onClick={handleZavuConnect}
                            disabled={zavuValidating}
                          >
                            {zavuValidating ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Validating...
                              </>
                            ) : (
                              <>
                                <Check className="w-4 h-4 mr-1" />
                                Connect & Validate
                              </>
                            )}
                          </Button>
                          <p className="text-[10px] text-muted-foreground text-center">
                            Your API key is stored securely per-institute in the database
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
                              <Button variant="outline" size="sm" onClick={() => handleDisconnect(integration.id)}>
                                Disconnect
                              </Button>
                              <Button variant="ghost" size="sm">
                                <Settings2 className="w-3.5 h-3.5" />
                              </Button>
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
