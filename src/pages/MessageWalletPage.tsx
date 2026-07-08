import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { supabase, isUuid } from "@/lib/supabase";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import { MessageSquare, Send, Wallet, Phone, Mail, Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";

interface MessageLog {
  id: string;
  channel: "whatsapp" | "sms" | "push";
  recipient: string;
  message: string;
  credits: number;
  sentAt: string;
  status: "sent" | "delivered" | "read" | "failed" | "pending";
  delivered_at?: string;
  read_at?: string;
}

interface WalletTransaction {
  id: string;
  type: "credit" | "debit";
  amount: number;
  description: string;
  reference_type: string;
  created_at: string;
}

const batches = ["All Students", "JEE 2025 - Batch A", "NEET 2025 - Batch B", "Foundation 10th", "Foundation 11th", "CET 2025"];

export default function MessageWalletPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const instId = isAdmin ? (user as AdminUser).instituteId : "00000000-0000-0000-0000-000000000001";

  const [walletCredits, setWalletCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [sendOpen, setSendOpen] = useState(false);
  const [form, setForm] = useState({ channel: "whatsapp" as "whatsapp" | "sms" | "push", recipients: batches[0], message: "" });

  useEffect(() => {
    if (isUuid(instId)) {
      fetchWalletData();
    }
  }, [instId]);

  const fetchWalletData = async () => {
    setLoading(true);
    try {
      // Fetch wallet credits
      const { data: inst } = await supabase
        .from("institutes")
        .select("wallet_credits")
        .eq("id", instId)
        .single();

      if (inst) {
        setWalletCredits(inst.wallet_credits || 0);
      }

      // Fetch recent wallet transactions
      const { data: txns } = await supabase
        .from("wallet_transactions")
        .select("*")
        .eq("institute_id", instId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (txns) {
        setTransactions(txns);
      }

      // Fetch recent message logs
      const { data: msgLogs } = await supabase
        .from("message_logs")
        .select("*")
        .eq("institute_id", instId)
        .order("sent_at", { ascending: false })
        .limit(20);

      if (msgLogs) {
        setLogs(msgLogs.map((m: any) => ({
          id: m.id,
          channel: m.channel || "whatsapp",
          recipient: m.recipient,
          message: m.message,
          credits: m.credits_used || 1,
          sentAt: new Date(m.sent_at).toLocaleString("en-IN"),
          status: m.status || "sent",
          delivered_at: m.delivered_at,
          read_at: m.read_at,
        })));
      }
    } catch (err) {
      console.error("Failed to fetch wallet data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!form.message.trim()) {
      toast({ title: "Error", description: "Message cannot be empty.", variant: "destructive" });
      return;
    }

    if (walletCredits < 1) {
      toast({ title: "Insufficient Credits", description: "No wallet credits left. Contact super admin to recharge.", variant: "destructive" });
      return;
    }

    const now = new Date().toISOString();

    // Debit 1 credit
    const { error: debitErr } = await supabase
      .from("institutes")
      .update({ wallet_credits: walletCredits - 1 })
      .eq("id", instId);

    if (debitErr) {
      toast({ title: "Failed", description: "Could not process payment. Please try again.", variant: "destructive" });
      return;
    }

    // Log wallet transaction
    await supabase.from("wallet_transactions").insert([{
      institute_id: instId,
      type: "debit",
      amount: 1,
      description: "Manual message send",
      reference_type: form.channel,
      balance_before: walletCredits,
      balance_after: walletCredits - 1,
    }]);

    const newLog: MessageLog = {
      id: `MSG-${String(logs.length + 1).padStart(3, "0")}`,
      channel: form.channel,
      recipient: form.recipients,
      message: form.message,
      credits: 1,
      sentAt: new Date().toLocaleString("en-IN"),
      status: "delivered",
    };
    setLogs(prev => [newLog, ...prev]);
    setWalletCredits(prev => prev - 1);

    setSendOpen(false);
    setForm({ channel: "whatsapp", recipients: batches[0], message: "" });
    toast({ title: "Message Sent ✓", description: "1 credit deducted." });
  };

  const channelIcon = (ch: string) => ch === "whatsapp" ? "💬" : ch === "sms" ? "📱" : "🔔";

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Messages & Wallet</h2>
          <p className="text-sm text-muted-foreground">Unified wallet · 1 message = 1 credit</p>
        </div>
        <Button size="sm" onClick={() => setSendOpen(true)} disabled={walletCredits < 1}>
          <Send className="w-4 h-4 mr-1" /> Send Message
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[200px]">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard title="Wallet Credits" value={walletCredits} icon={Wallet} />
            <StatCard title="Messages Sent" value={logs.length} icon={Send} changeType="positive" />
            <StatCard title="Push (Free)" value="∞" icon={Mail} change="Web push" changeType="positive" />
            <StatCard title="Total Spent" value={transactions.filter(t => t.type === "debit").reduce((a, t) => a + t.amount, 0)} icon={MessageSquare} />
          </div>

          {/* Info banner */}
          <div className="p-3 rounded-md bg-primary/5 border border-primary/20">
            <p className="text-xs text-foreground">
              <strong>Unified Wallet:</strong> 1 message = 1 credit deducted. Contact Super Admin to recharge wallet credits.
            </p>
          </div>

          {/* Recent Transactions */}
          {transactions.length > 0 && (
            <div className="surface-elevated rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">Wallet Transactions</h3>
              </div>
              <div className="divide-y divide-border/50">
                {transactions.map(txn => (
                  <div key={txn.id} className="px-4 py-2.5 hover:bg-secondary/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {txn.type === "credit" ? (
                          <CheckCircle2 className="w-4 h-4 text-success" />
                        ) : (
                          <Send className="w-4 h-4 text-primary" />
                        )}
                        <span className="text-sm text-foreground">{txn.description || txn.reference_type}</span>
                      </div>
                      <div className="text-right">
                        <span className={`text-sm font-bold ${txn.type === "credit" ? "text-success" : "text-destructive"}`}>
                          {txn.type === "credit" ? "+" : "-"}{txn.amount}
                        </span>
                        <p className="text-[10px] text-muted-foreground">{new Date(txn.created_at).toLocaleString("en-IN")}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Message Log */}
          {logs.length > 0 && (
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
                        <StatusBadge variant={
                          log.status === "read" ? "info" :
                          log.status === "delivered" ? "success" :
                          log.status === "failed" ? "destructive" :
                          log.status === "sent" ? "default" : "warning"
                        }>
                          {log.status === "read" ? "✓✓ Read" :
                           log.status === "delivered" ? "✓✓ Delivered" :
                           log.status === "sent" ? "✓ Sent" :
                           log.status}
                        </StatusBadge>
                        {log.delivered_at && (
                          <p className="text-[9px] text-muted-foreground">
                            Delivered: {new Date(log.delivered_at).toLocaleString("en-IN")}
                          </p>
                        )}
                        {log.read_at && (
                          <p className="text-[9px] text-primary">
                            Read: {new Date(log.read_at).toLocaleString("en-IN")}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-0.5">{log.credits > 0 ? `${log.credits} credit` : "Free"}</p>
                        <p className="text-[10px] text-muted-foreground">{log.sentAt}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {transactions.length === 0 && logs.length === 0 && (
            <div className="p-12 text-center text-muted-foreground">
              <Wallet className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No transactions yet</p>
              <p className="text-xs mt-1">Send a message to get started</p>
            </div>
          )}
        </>
      )}

      {/* Send Dialog */}
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send Message</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 text-sm">
              <p className="font-semibold text-foreground">Wallet Balance: {walletCredits} credits</p>
              <p className="text-xs text-muted-foreground">1 message = 1 credit</p>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Channel</label>
              <select value={form.channel} onChange={e => setForm(p => ({ ...p, channel: e.target.value as any }))} className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground">
                <option value="whatsapp">WhatsApp</option>
                <option value="sms">SMS</option>
                <option value="push">Push Notification (Free)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Recipients</label>
              <select value={form.recipients} onChange={e => setForm(p => ({ ...p, recipients: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground">
                {batches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Message</label>
              <textarea value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))} placeholder="Type your message..." rows={3} className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground resize-none" />
            </div>
            <Button className="w-full" onClick={handleSend} disabled={walletCredits < 1}>
              <Send className="w-4 h-4 mr-1" /> Send (1 credit)
            </Button>
            {walletCredits < 1 && (
              <p className="text-xs text-destructive text-center">Insufficient credits. Contact Super Admin to recharge.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
