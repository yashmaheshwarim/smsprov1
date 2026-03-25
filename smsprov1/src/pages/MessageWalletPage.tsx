import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { MessageSquare, Send, Wallet, Phone, Mail } from "lucide-react";

interface MessageLog {
  id: string;
  channel: "whatsapp" | "sms" | "push";
  recipient: string;
  message: string;
  credits: number;
  sentAt: string;
  status: "delivered" | "failed" | "pending";
}

const initialLogs: MessageLog[] = [
  { id: "MSG-001", channel: "whatsapp", recipient: "JEE 2025 - Batch A (45 students)", message: "Reminder: Unit Test 4 on March 20", credits: 45, sentAt: "2025-03-15 10:30", status: "delivered" },
  { id: "MSG-002", channel: "sms", recipient: "All Parents (120)", message: "Fee reminder: Q2 payment due March 31", credits: 120, sentAt: "2025-03-14 14:00", status: "delivered" },
  { id: "MSG-003", channel: "push", recipient: "All Students (280)", message: "New study materials uploaded for Physics", credits: 0, sentAt: "2025-03-13 09:00", status: "delivered" },
];

const batches = ["All Students", "JEE 2025 - Batch A", "NEET 2025 - Batch B", "Foundation 10th", "Foundation 11th", "CET 2025"];

export default function MessageWalletPage() {
  const [wallet, setWallet] = useState({ smsCredits: 500, whatsappCredits: 300, totalSpent: 892 });
  const [logs, setLogs] = useState(initialLogs);
  const [sendOpen, setSendOpen] = useState(false);
  const [form, setForm] = useState({ channel: "whatsapp" as "whatsapp" | "sms" | "push", recipients: batches[0], message: "" });

  const handleSend = () => {
    if (!form.message.trim()) {
      toast({ title: "Error", description: "Message cannot be empty.", variant: "destructive" });
      return;
    }
    const estimatedRecipients = form.recipients === "All Students" ? 280 : 45;
    const credits = form.channel === "push" ? 0 : estimatedRecipients;

    if (form.channel === "sms" && wallet.smsCredits < credits) {
      toast({ title: "Insufficient Credits", description: "Contact Super Admin to top up SMS credits.", variant: "destructive" });
      return;
    }
    if (form.channel === "whatsapp" && wallet.whatsappCredits < credits) {
      toast({ title: "Insufficient Credits", description: "Contact Super Admin to top up WhatsApp credits.", variant: "destructive" });
      return;
    }

    const newLog: MessageLog = {
      id: `MSG-${String(logs.length + 1).padStart(3, "0")}`,
      channel: form.channel,
      recipient: `${form.recipients} (${estimatedRecipients})`,
      message: form.message,
      credits,
      sentAt: new Date().toLocaleString("en-IN"),
      status: "delivered",
    };
    setLogs(prev => [newLog, ...prev]);

    if (form.channel === "sms") setWallet(p => ({ ...p, smsCredits: p.smsCredits - credits, totalSpent: p.totalSpent + credits }));
    if (form.channel === "whatsapp") setWallet(p => ({ ...p, whatsappCredits: p.whatsappCredits - credits, totalSpent: p.totalSpent + credits }));

    setSendOpen(false);
    setForm({ channel: "whatsapp", recipients: batches[0], message: "" });
    toast({ title: "Message Sent", description: `Sent to ${estimatedRecipients} recipients. ${credits} credits deducted.` });
  };

  const channelIcon = (ch: string) => ch === "whatsapp" ? "💬" : ch === "sms" ? "📱" : "🔔";

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Messages & Wallet</h2>
          <p className="text-sm text-muted-foreground">Send messages · Credits managed by Super Admin</p>
        </div>
        <Button size="sm" onClick={() => setSendOpen(true)}><Send className="w-4 h-4 mr-1" /> Send Message</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="SMS Credits" value={wallet.smsCredits} icon={Phone} />
        <StatCard title="WhatsApp Credits" value={wallet.whatsappCredits} icon={MessageSquare} />
        <StatCard title="Push (Free)" value="∞" icon={Mail} change="Web push" changeType="positive" />
        <StatCard title="Total Sent" value={wallet.totalSpent} icon={Wallet} />
      </div>

      {/* Info banner */}
      <div className="p-3 rounded-md bg-primary/5 border border-primary/20">
        <p className="text-xs text-foreground">
          <strong>Note:</strong> Message credits are managed by Super Admin. 1 message = 1 credit deducted. Contact Super Admin for top-ups.
        </p>
      </div>

      {/* Message Log */}
      <div className="surface-elevated rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Message History</h3>
        </div>
        <div className="divide-y divide-border/50">
          {logs.map(log => (
            <div key={log.id} className="px-4 py-3 hover:bg-secondary/30">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>{channelIcon(log.channel)}</span>
                    <span className="text-sm font-medium text-foreground">{log.channel.toUpperCase()}</span>
                    <span className="text-xs text-muted-foreground">→ {log.recipient}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5 truncate">{log.message}</p>
                </div>
                <div className="text-right shrink-0">
                  <StatusBadge variant={log.status === "delivered" ? "success" : log.status === "failed" ? "destructive" : "warning"}>{log.status}</StatusBadge>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{log.credits > 0 ? `${log.credits} credits` : "Free"}</p>
                  <p className="text-[10px] text-muted-foreground">{log.sentAt}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Send Dialog */}
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send Bulk Message</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-foreground">Channel</label>
              <select value={form.channel} onChange={e => setForm(p => ({ ...p, channel: e.target.value as any }))} className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground">
                <option value="whatsapp">WhatsApp ({wallet.whatsappCredits} credits)</option>
                <option value="sms">SMS ({wallet.smsCredits} credits)</option>
                <option value="push">Push Notification (Free)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Recipients</label>
              <select value={form.recipients} onChange={e => setForm(p => ({ ...p, recipients: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground">
                {batches.map(b => <option key={b} value={b}>{b}</option>)}
                <option value="Overdue Fee Students">Overdue Fee Students</option>
                <option value="All Parents">All Parents</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Message</label>
              <textarea value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))} placeholder="Type your message..." rows={3} className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground resize-none" />
            </div>
            <Button className="w-full" onClick={handleSend}><Send className="w-4 h-4 mr-1" /> Send</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
