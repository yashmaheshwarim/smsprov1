import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "@/hooks/use-toast";
import {
  MessageSquare, Send, Wallet, Loader2, Radio,
  Plus, Users, BarChart3, RefreshCw, CheckCircle, XCircle, Clock
} from "lucide-react";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import { supabase, isUuid } from "@/lib/supabase";

interface MessageLog {
  id: string;
  channel: string;
  recipient: string;
  message: string;
  credits: number;
  sentAt: string;
  status: "delivered" | "failed" | "pending" | "sent" | "queued";
}

interface WaRecipient {
  id: string;
  name: string;
  batch: string;
  phone: string;
  source: "mother" | "father" | "student";
}

type Tab = "send" | "broadcasts";
type Channel = "sms" | "whatsapp" | "email";

const channelIcons: Record<Channel, string> = {
  sms: "📱",
  whatsapp: "💬",
  email: "📧",
};

export default function MessageWalletPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const instId = isAdmin ? (user as AdminUser).instituteId : "";

  const [tab, setTab] = useState<Tab>("send");
  const [sendOpen, setSendOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({
    channel: "sms" as Channel,
    recipient: "",
    message: "",
    subject: "",
  });

  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [stats, setStats] = useState({ sent: 0, delivered: 0, failed: 0 });
  const [waRecipients, setWaRecipients] = useState<WaRecipient[]>([]);
  const [waBatchFilter, setWaBatchFilter] = useState("all");
  const [waMessage, setWaMessage] = useState("");
  const [waSleepSeconds, setWaSleepSeconds] = useState(3);
  const [waSending, setWaSending] = useState(false);
  const [waProgress, setWaProgress] = useState({ current: 0, total: 0 });
  const [waLoading, setWaLoading] = useState(false);
  const [emailConnected, setEmailConnected] = useState(false);
  const [emailLoading, setEmailLoading] = useState(true);

  const loadWaRecipients = async () => {
    if (!isUuid(instId)) return;
    setWaLoading(true);

    const { data, error } = await supabase
      .from("students")
      .select("id, name, batch_name, mother_phone, father_phone, student_phone")
      .eq("institute_id", instId)
      .order("name", { ascending: true });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setWaLoading(false);
      return;
    }

    const recipients = (data || [])
      .map((student: any) => {
        const phone = student.mother_phone || student.father_phone || student.student_phone || "";
        const source = student.mother_phone ? "mother" : student.father_phone ? "father" : "student";
        return {
          id: student.id,
          name: student.name,
          batch: student.batch_name || "Unassigned",
          phone,
          source,
        };
      })
      .filter((recipient: any) => recipient.phone);

    setWaRecipients(recipients);
    setWaLoading(false);
  };

  const checkEmailConnection = async () => {
    if (!isUuid(instId)) {
      setEmailLoading(false);
      return;
    }

    try {
      const { data } = await supabase
        .from("institute_integrations")
        .select("config")
        .eq("institute_id", instId)
        .eq("provider", "smtp")
        .maybeSingle();

      setEmailConnected(!!data?.config?.host);
    } catch (e) {
      setEmailConnected(false);
    } finally {
      setEmailLoading(false);
    }
  };

  useEffect(() => {
    loadWaRecipients();
    const interval = window.setInterval(loadWaRecipients, 10000);
    return () => window.clearInterval(interval);
  }, [instId, waBatchFilter]);

  useEffect(() => {
    checkEmailConnection();
  }, [instId]);

  const handleSendWhatsApp = async () => {
    if (!waMessage.trim()) {
      toast({ title: "Error", description: "Please enter a message.", variant: "destructive" });
      return;
    }

    if (waRecipients.length === 0) {
      toast({ title: "No recipients", description: "No student contacts were available.", variant: "destructive" });
      return;
    }

    setWaSending(true);
    setWaProgress({ current: 0, total: waRecipients.length });

    for (let index = 0; index < waRecipients.length; index += 1) {
      const recipient = waRecipients[index];
      const cleanPhone = recipient.phone.replace(/\D/g, "");
      const link = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waMessage)}`;

      try {
        window.open(link, `_blank_${index}`, "noopener,noreferrer");
      } catch (err) {
        console.warn("Could not open WhatsApp link for", recipient.name, err);
      }

      setWaProgress({ current: index + 1, total: waRecipients.length });
      await new Promise((resolve) => window.setTimeout(resolve, waSleepSeconds * 1000));
    }

    setWaSending(false);
    toast({ title: "WhatsApp sending started", description: `Opened ${waRecipients.length} WhatsApp links with ${waSleepSeconds}s delay.` });
  };

  const loadLogs = async () => {
    if (!isUuid(instId)) return;
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
  };

  useEffect(() => {
    loadLogs();
    const interval = window.setInterval(loadLogs, 10000);
    return () => window.clearInterval(interval);
  }, [instId]);

  const handleSendMessage = async () => {
    if (!form.recipient.trim() || !form.message.trim()) {
      toast({ title: "Error", description: "Recipient and message are required.", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      if (form.channel === "email") {
        const { data: smtpConfig } = await supabase
          .from("institute_integrations")
          .select("config")
          .eq("institute_id", instId)
          .eq("provider", "smtp")
          .maybeSingle();

        if (!smtpConfig?.config?.host) {
          toast({ title: "Not Connected", description: "Configure SMTP in Integrations first.", variant: "destructive" });
          setSending(false);
          return;
        }

        const response = await fetch("/.netlify/functions/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            institute_id: instId,
            to: form.recipient.trim(),
            subject: form.subject || "Message from Institute",
            html: `<p>${form.message.replace(/\n/g, "<br>")}</p>`,
          }),
        });

        if (!response.ok) throw new Error("Failed to send email");
      }

      await supabase.from("message_logs").insert([{
        institute_id: instId,
        channel: form.channel,
        recipient: form.recipient.trim(),
        message: form.message.trim(),
        status: "sent",
      }]);

      const newLog: MessageLog = {
        id: `local-${Date.now()}`,
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
      setSendOpen(false);
      setForm({ channel: "sms", recipient: "", message: "", subject: "" });
    } catch (err: any) {
      toast({ title: "Send Error", description: err.message || "Failed to send message", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const batches = [...new Set(waRecipients.map((r) => r.batch))].filter(Boolean).sort();

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Messages & Campaigns</h2>
          <p className="text-sm text-muted-foreground">
            Send SMS, WhatsApp, or Email messages to students
          </p>
        </div>
        <Button size="sm" onClick={() => setSendOpen(true)} className="h-9 shadow-md">
          <Send className="w-4 h-4 mr-1" /> Send Message
        </Button>
      </div>

      {!emailLoading && !emailConnected && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
          <Mail className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-xs text-foreground flex-1">
            <strong>SMTP not configured.</strong> Go to <a href="/integrations" className="text-primary underline font-medium">Integrations</a> to configure email settings.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Messages Sent" value={stats.sent} icon={Send} />
        <StatCard title="Delivered" value={stats.delivered} icon={CheckCircle} changeType="positive" />
        <StatCard title="Failed" value={stats.failed} icon={XCircle} changeType="negative" />
        <StatCard
          title="Email Status"
          value={emailConnected ? "Configured" : "Not Configured"}
          icon={Mail}
          changeType={emailConnected ? "positive" : "neutral"}
        />
      </div>

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
      </div>

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
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="px-4 py-3 hover:bg-secondary/30 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base">{channelIcons[log.channel as Channel] || "📨"}</span>
                        <span className="text-sm font-medium text-foreground">{log.channel.toUpperCase()}</span>
                        <span className="text-xs text-muted-foreground">→ {log.recipient}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5 truncate max-w-md">{log.message}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <StatusBadge variant={log.status === "delivered" ? "success" : log.status === "failed" ? "destructive" : "warning"}>
                        {log.status}
                      </StatusBadge>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{log.sentAt}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}