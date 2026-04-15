import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  MessageSquare, Send, Wallet, Phone, Mail, Loader2, Zap, Radio,
  Plus, Users, BarChart3, RefreshCw, CheckCircle, XCircle, Clock, Megaphone, ArrowRight
} from "lucide-react";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import { supabase, isUuid } from "@/lib/supabase";
import {
  ZavuService, createZavuServiceForInstitute, getZavuConfig,
  ZavuChannel, ZavuBroadcast, ZavuBroadcastProgress
} from "@/lib/zavu-service";

// ── Types ──────────────────────────────────────────────────────────────────

interface MessageLog {
  id: string;
  channel: string;
  recipient: string;
  message: string;
  credits: number;
  sentAt: string;
  status: "delivered" | "failed" | "pending" | "sent" | "queued";
}

type Tab = "send" | "broadcasts";

// ── Component ──────────────────────────────────────────────────────────────

export default function MessageWalletPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const instId = isAdmin ? (user as AdminUser).instituteId : "";

  // Core state
  const [tab, setTab] = useState<Tab>("send");
  const [zavuConnected, setZavuConnected] = useState(false);
  const [zavuLoading, setZavuLoading] = useState(true);
  const [zavuSvc, setZavuSvc] = useState<ZavuService | null>(null);

  // Send message state
  const [sendOpen, setSendOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({
    channel: "sms" as ZavuChannel,
    recipient: "",
    message: "",
    subject: "",
  });

  // Quick batch send state
  const [batchSendOpen, setBatchSendOpen] = useState(false);
  const [batchSending, setBatchSending] = useState(false);
  const [batchForm, setBatchForm] = useState({
    channel: "sms" as ZavuChannel,
    batchName: "all",
    message: "",
  });
  const [batches, setBatches] = useState<{ name: string; count: number }[]>([]);

  // Broadcast campaign state
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastCreating, setBroadcastCreating] = useState(false);
  const [broadcastForm, setBroadcastForm] = useState({
    name: "",
    channel: "sms" as ZavuChannel,
    text: "",
    batchName: "all",
  });
  const [campaigns, setCampaigns] = useState<ZavuBroadcast[]>([]);

  // Message logs
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [stats, setStats] = useState({ sent: 0, delivered: 0, failed: 0 });

  // ── Load Zavu config & batches ──────────────────────────────────────────

  useEffect(() => {
    if (!isUuid(instId)) {
      setZavuLoading(false);
      return;
    }

    (async () => {
      const svc = await createZavuServiceForInstitute(instId);
      if (svc) {
        setZavuSvc(svc);
        setZavuConnected(true);
      }
      setZavuLoading(false);
    })();

    // Load batches from Supabase
    (async () => {
      const { data } = await supabase
        .from("students")
        .select("batch")
        .eq("institute_id", instId);

      if (data) {
        const batchMap: Record<string, number> = {};
        data.forEach((s: any) => {
          const b = s.batch || "Unassigned";
          batchMap[b] = (batchMap[b] || 0) + 1;
        });
        const arr = Object.entries(batchMap).map(([name, count]) => ({ name, count }));
        setBatches(arr);
      }
    })();

    // Load message logs from Supabase
    (async () => {
      const { data } = await supabase
        .from("message_logs")
        .select("*")
        .eq("institute_id", instId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (data) {
        const formatted: MessageLog[] = data.map((m: any) => ({
          id: m.id,
          channel: m.channel || "sms",
          recipient: m.recipient,
          message: m.message,
          credits: 1,
          sentAt: new Date(m.created_at).toLocaleString("en-IN"),
          status: m.status || "pending",
        }));
        setLogs(formatted);
        setStats({
          sent: formatted.length,
          delivered: formatted.filter((m) => m.status === "delivered").length,
          failed: formatted.filter((m) => m.status === "failed").length,
        });
      }
    })();
  }, [instId]);

  // ── Send single message ─────────────────────────────────────────────────

  const handleSendMessage = async () => {
    if (!form.recipient.trim() || !form.message.trim()) {
      toast({ title: "Error", description: "Recipient and message are required.", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      if (zavuSvc) {
        const result = await zavuSvc.sendMessage({
          to: form.recipient.trim(),
          text: form.message.trim(),
          channel: form.channel,
          ...(form.channel === "email" && form.subject ? { subject: form.subject } : {}),
        });

        // Log to Supabase
        await supabase.from("message_logs").insert([{
          institute_id: instId,
          channel: form.channel,
          recipient: form.recipient.trim(),
          message: form.message.trim(),
          status: "sent",
          zavu_message_id: result.message.id,
        }]);

        const newLog: MessageLog = {
          id: result.message.id,
          channel: form.channel,
          recipient: form.recipient.trim(),
          message: form.message.trim(),
          credits: 1,
          sentAt: new Date().toLocaleString("en-IN"),
          status: "sent",
        };
        setLogs((prev) => [newLog, ...prev]);
        setStats((p) => ({ ...p, sent: p.sent + 1 }));

        toast({ title: "Message Sent! ✉️", description: `Sent via ${form.channel.toUpperCase()} to ${form.recipient}` });
      } else {
        // Fallback: just log it
        await supabase.from("message_logs").insert([{
          institute_id: instId,
          channel: form.channel,
          recipient: form.recipient.trim(),
          message: form.message.trim(),
          status: "pending",
        }]);

        toast({ title: "Message Queued", description: "Connect Zavu in Integrations to send messages via API." });
      }

      setSendOpen(false);
      setForm({ channel: "sms", recipient: "", message: "", subject: "" });
    } catch (err: any) {
      toast({ title: "Send Error", description: err.message || "Failed to send message", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  // ── Batch send ──────────────────────────────────────────────────────────

  const handleBatchSend = async () => {
    if (!batchForm.message.trim()) {
      toast({ title: "Error", description: "Message is required.", variant: "destructive" });
      return;
    }
    if (!zavuSvc) {
      toast({ title: "Not Connected", description: "Connect Zavu in Integrations first.", variant: "destructive" });
      return;
    }

    setBatchSending(true);
    try {
      // Fetch student phones from the selected batch
      let query = supabase
        .from("students")
        .select("name, phone, parent_phone")
        .eq("institute_id", instId);

      if (batchForm.batchName !== "all") {
        query = query.eq("batch", batchForm.batchName);
      }

      const { data: students } = await query;
      if (!students || students.length === 0) {
        toast({ title: "No Recipients", description: "No students found in this batch.", variant: "destructive" });
        setBatchSending(false);
        return;
      }

      // Create a broadcast campaign
      const { broadcast } = await zavuSvc.createBroadcast({
        name: `${batchForm.batchName} — ${new Date().toLocaleDateString("en-IN")}`,
        channel: batchForm.channel,
        text: batchForm.message.trim(),
      });

      // Add contacts
      const contacts = students
        .map((s: any) => ({
          recipient: s.phone || s.parent_phone || "",
          templateVariables: { name: s.name || "" },
        }))
        .filter((c) => c.recipient);

      if (contacts.length > 0) {
        await zavuSvc.addBroadcastContacts(broadcast.id, contacts);
      }

      // Send
      await zavuSvc.sendBroadcast(broadcast.id);

      // Log
      await supabase.from("message_logs").insert([{
        institute_id: instId,
        channel: batchForm.channel,
        recipient: `${batchForm.batchName} (${contacts.length} students)`,
        message: batchForm.message.trim(),
        status: "sent",
        zavu_message_id: broadcast.id,
      }]);

      setCampaigns((prev) => [{ ...broadcast, status: "sending" }, ...prev]);
      toast({
        title: "Broadcast Launched! 🚀",
        description: `Sending to ${contacts.length} recipients via ${batchForm.channel.toUpperCase()}`,
      });

      setBatchSendOpen(false);
      setBatchForm({ channel: "sms", batchName: "all", message: "" });
    } catch (err: any) {
      toast({ title: "Broadcast Error", description: err.message || "Failed to create broadcast", variant: "destructive" });
    } finally {
      setBatchSending(false);
    }
  };

  // ── Create broadcast campaign ───────────────────────────────────────────

  const handleCreateBroadcast = async () => {
    if (!broadcastForm.name.trim() || !broadcastForm.text.trim()) {
      toast({ title: "Error", description: "Campaign name and message are required.", variant: "destructive" });
      return;
    }
    if (!zavuSvc) {
      toast({ title: "Not Connected", description: "Connect Zavu in Integrations first.", variant: "destructive" });
      return;
    }

    setBroadcastCreating(true);
    try {
      const { broadcast } = await zavuSvc.createBroadcast({
        name: broadcastForm.name.trim(),
        channel: broadcastForm.channel,
        text: broadcastForm.text.trim(),
      });

      // If batch selected, auto-add contacts
      let added = 0;
      if (broadcastForm.batchName) {
        let query = supabase
          .from("students")
          .select("name, phone, parent_phone")
          .eq("institute_id", instId);

        if (broadcastForm.batchName !== "all") {
          query = query.eq("batch", broadcastForm.batchName);
        }

        const { data: students } = await query;
        if (students && students.length > 0) {
          const contacts = students
            .map((s: any) => ({
              recipient: s.phone || s.parent_phone || "",
              templateVariables: { name: s.name || "" },
            }))
            .filter((c) => c.recipient);

          if (contacts.length > 0) {
            const result = await zavuSvc.addBroadcastContacts(broadcast.id, contacts);
            added = result.added;
          }
        }
      }

      setCampaigns((prev) => [broadcast, ...prev]);
      setBroadcastOpen(false);
      setBroadcastForm({ name: "", channel: "sms", text: "", batchName: "all" });

      toast({
        title: "Campaign Created ✅",
        description: `"${broadcast.name}" created${added > 0 ? ` with ${added} contacts` : ""}. Go to campaign to add contacts and send.`,
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to create campaign", variant: "destructive" });
    } finally {
      setBroadcastCreating(false);
    }
  };

  // ── Channel helpers ─────────────────────────────────────────────────────

  const channelIcon = (ch: string) => {
    switch (ch) {
      case "whatsapp": return "💬";
      case "sms": return "📱";
      case "email": return "📧";
      case "voice": return "📞";
      case "telegram": return "✈️";
      default: return "📨";
    }
  };

  const statusVariant = (s: string) => {
    switch (s) {
      case "delivered": case "completed": return "success" as const;
      case "failed": case "rejected": case "rejected_final": case "cancelled": return "destructive" as const;
      case "sending": case "approved": case "sent": return "info" as const;
      case "pending": case "pending_review": case "queued": case "draft": case "scheduled": return "warning" as const;
      default: return "default" as const;
    }
  };

  const totalStudents = batches.reduce((a, b) => a + b.count, 0);

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Messages & Campaigns</h2>
          <p className="text-sm text-muted-foreground">
            {zavuConnected ? "Powered by Zavu · Multi-channel messaging" : "Connect Zavu in Integrations to enable API messaging"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setBatchSendOpen(true)} className="h-9 hidden sm:flex">
            <Users className="w-4 h-4 mr-1" /> Batch Send
          </Button>
          <Button size="sm" onClick={() => setSendOpen(true)} className="h-9 shadow-md">
            <Send className="w-4 h-4 mr-1" /> Send Message
          </Button>
        </div>
      </div>

      {/* Zavu status banner */}
      {!zavuLoading && !zavuConnected && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
          <Zap className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-xs text-foreground flex-1">
            <strong>Zavu not connected.</strong> Go to <a href="/integrations" className="text-primary underline font-medium">Integrations</a> to enter your API key and enable SMS, WhatsApp, Email & Voice messaging.
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Messages Sent" value={stats.sent} icon={Send} />
        <StatCard title="Delivered" value={stats.delivered} icon={CheckCircle} changeType="positive" />
        <StatCard title="Failed" value={stats.failed} icon={XCircle} changeType="negative" />
        <StatCard
          title="Zavu Status"
          value={zavuConnected ? "Connected" : "Not Connected"}
          icon={Zap}
          changeType={zavuConnected ? "positive" : "neutral"}
          change={zavuConnected ? "API Active" : "Setup required"}
        />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-lg bg-secondary/40 w-fit">
        <button
          onClick={() => setTab("send")}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
            tab === "send" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Send className="w-3.5 h-3.5 inline mr-1.5" />
          Message Logs
        </button>
        <button
          onClick={() => setTab("broadcasts")}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
            tab === "broadcasts" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Megaphone className="w-3.5 h-3.5 inline mr-1.5" />
          Campaigns
        </button>
      </div>

      {/* Tab Content */}
      {tab === "send" && (
        <div className="surface-elevated rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Message History</h3>
            <span className="text-xs text-muted-foreground">{logs.length} messages</span>
          </div>
          <div className="divide-y divide-border/50">
            {logs.length === 0 ? (
              <div className="p-8 text-center">
                <MessageSquare className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No messages sent yet</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => setSendOpen(true)}>
                  <Send className="w-3.5 h-3.5 mr-1" /> Send First Message
                </Button>
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="px-4 py-3 hover:bg-secondary/30 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base">{channelIcon(log.channel)}</span>
                        <span className="text-sm font-medium text-foreground">{log.channel.toUpperCase()}</span>
                        <span className="text-xs text-muted-foreground">→ {log.recipient}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5 truncate max-w-md">{log.message}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <StatusBadge variant={statusVariant(log.status)}>{log.status}</StatusBadge>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{log.sentAt}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === "broadcasts" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Broadcast Campaigns</h3>
            <Button size="sm" onClick={() => setBroadcastOpen(true)} disabled={!zavuConnected} className="h-8">
              <Plus className="w-3.5 h-3.5 mr-1" /> New Campaign
            </Button>
          </div>

          {campaigns.length === 0 ? (
            <div className="surface-elevated rounded-lg p-8 text-center">
              <Megaphone className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No campaigns yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create a broadcast campaign to send messages to multiple students at once
              </p>
              {zavuConnected && (
                <Button size="sm" variant="outline" className="mt-3" onClick={() => setBroadcastOpen(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Create Campaign
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {campaigns.map((c) => (
                <div key={c.id} className="surface-elevated rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{c.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">{channelIcon(c.channel)} {c.channel.toUpperCase()}</span>
                        <StatusBadge variant={statusVariant(c.status)}>{c.status}</StatusBadge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.status === "draft" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs"
                          onClick={async () => {
                            if (zavuSvc) {
                              try {
                                await zavuSvc.sendBroadcast(c.id);
                                setCampaigns((prev) =>
                                  prev.map((x) => (x.id === c.id ? { ...x, status: "pending_review" } : x))
                                );
                                toast({ title: "Broadcast Submitted", description: "Campaign submitted for review and sending." });
                              } catch (err: any) {
                                toast({ title: "Error", description: err.message, variant: "destructive" });
                              }
                            }
                          }}
                        >
                          <Send className="w-3 h-3 mr-1" /> Send
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Send Message Dialog ──────────────────────────────────────────── */}
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-4 h-4 text-primary" />
              Send Message
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Channel selector */}
            <div>
              <label className="text-xs font-medium text-foreground">Channel</label>
              <div className="flex gap-2 mt-1.5">
                {(["sms", "whatsapp", "email", "voice"] as ZavuChannel[]).map((ch) => (
                  <button
                    key={ch}
                    onClick={() => setForm((p) => ({ ...p, channel: ch }))}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all border ${
                      form.channel === ch
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "bg-card border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {channelIcon(ch)} {ch.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Recipient */}
            <div>
              <label className="text-xs font-medium text-foreground">
                {form.channel === "email" ? "Email Address" : "Phone Number"}
              </label>
              <Input
                placeholder={form.channel === "email" ? "student@example.com" : "+91 9876543210"}
                value={form.recipient}
                onChange={(e) => setForm((p) => ({ ...p, recipient: e.target.value }))}
                className="mt-1"
              />
            </div>

            {/* Email subject */}
            {form.channel === "email" && (
              <div>
                <label className="text-xs font-medium text-foreground">Subject</label>
                <Input
                  placeholder="Fee reminder for April 2026"
                  value={form.subject}
                  onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
                  className="mt-1"
                />
              </div>
            )}

            {/* Message */}
            <div>
              <label className="text-xs font-medium text-foreground">Message</label>
              <textarea
                value={form.message}
                onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
                placeholder="Type your message..."
                rows={3}
                className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground resize-none outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendOpen(false)}>Cancel</Button>
            <Button onClick={handleSendMessage} disabled={sending}>
              {sending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
              {sending ? "Sending..." : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Batch Send Dialog ────────────────────────────────────────────── */}
      <Dialog open={batchSendOpen} onOpenChange={setBatchSendOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Batch Send to Students
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-foreground">Channel</label>
              <div className="flex gap-2 mt-1.5">
                {(["sms", "whatsapp"] as ZavuChannel[]).map((ch) => (
                  <button
                    key={ch}
                    onClick={() => setBatchForm((p) => ({ ...p, channel: ch }))}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all border ${
                      batchForm.channel === ch
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "bg-card border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {channelIcon(ch)} {ch.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground">Batch / Group</label>
              <select
                value={batchForm.batchName}
                onChange={(e) => setBatchForm((p) => ({ ...p, batchName: e.target.value }))}
                className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground outline-none"
              >
                <option value="all">All Students ({totalStudents})</option>
                {batches.map((b) => (
                  <option key={b.name} value={b.name}>{b.name} ({b.count})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground">Message</label>
              <textarea
                value={batchForm.message}
                onChange={(e) => setBatchForm((p) => ({ ...p, message: e.target.value }))}
                placeholder="Hi {{name}}, ..."
                rows={3}
                className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground resize-none outline-none focus:ring-1 focus:ring-primary/30"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Use {"{{name}}"} to personalize with student name</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchSendOpen(false)}>Cancel</Button>
            <Button onClick={handleBatchSend} disabled={batchSending || !zavuConnected}>
              {batchSending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
              {batchSending ? "Sending..." : "Send to Batch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create Campaign Dialog ───────────────────────────────────────── */}
      <Dialog open={broadcastOpen} onOpenChange={setBroadcastOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-primary" />
              Create Broadcast Campaign
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-foreground">Campaign Name</label>
              <Input
                placeholder="e.g., Fee Reminder April 2026"
                value={broadcastForm.name}
                onChange={(e) => setBroadcastForm((p) => ({ ...p, name: e.target.value }))}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-foreground">Channel</label>
              <div className="flex gap-2 mt-1.5">
                {(["sms", "whatsapp", "email", "voice"] as ZavuChannel[]).map((ch) => (
                  <button
                    key={ch}
                    onClick={() => setBroadcastForm((p) => ({ ...p, channel: ch }))}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all border ${
                      broadcastForm.channel === ch
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "bg-card border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {channelIcon(ch)} {ch.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground">Auto-add Students from Batch</label>
              <select
                value={broadcastForm.batchName}
                onChange={(e) => setBroadcastForm((p) => ({ ...p, batchName: e.target.value }))}
                className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground outline-none"
              >
                <option value="">Don't add (manual later)</option>
                <option value="all">All Students ({totalStudents})</option>
                {batches.map((b) => (
                  <option key={b.name} value={b.name}>{b.name} ({b.count})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground">Message Content</label>
              <textarea
                value={broadcastForm.text}
                onChange={(e) => setBroadcastForm((p) => ({ ...p, text: e.target.value }))}
                placeholder="Hi {{name}}, your fee for the month is due..."
                rows={4}
                className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground resize-none outline-none focus:ring-1 focus:ring-primary/30"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Use {"{{name}}"} for personalization</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBroadcastOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateBroadcast} disabled={broadcastCreating}>
              {broadcastCreating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Megaphone className="w-4 h-4 mr-1" />}
              {broadcastCreating ? "Creating..." : "Create Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
