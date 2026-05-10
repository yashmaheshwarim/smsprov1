import { useEffect, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import { supabase, isUuid } from "@/lib/supabase";
import { createZavuServiceForInstitute, ZavuChannel, ZavuMessageParams } from "@/lib/zavu-service";

interface StudentRow {
  id: string;
  name: string;
  batch_name?: string;
  mother_phone?: string;
  father_phone?: string;
  student_phone?: string;
}

type RecipientTarget = "student_login" | "parent_login" | "both";

const serviceOptions = [
  { value: "manual_whatsapp", label: "Manual WhatsApp", channel: null },
  { value: "zavu_whatsapp", label: "Zavu WhatsApp", channel: "whatsapp" as ZavuChannel },
];

export default function AnnouncementPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const instId = isAdmin ? (user as AdminUser).instituteId : "00000000-0000-0000-0000-000000000001";

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBatch, setSelectedBatch] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [service, setService] = useState<string>("manual_whatsapp");
  const [target, setTarget] = useState<RecipientTarget>("both");
  const [sending, setSending] = useState(false);

  const fetchStudents = useCallback(async () => {
    if (!isUuid(instId)) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("students")
        .select("id, name, batch_name, mother_phone, father_phone, student_phone")
        .eq("institute_id", instId)
        .eq("status", "active")
        .order("name", { ascending: true });

      if (error) throw error;
      setStudents((data || []) as StudentRow[]);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Could not load students.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [instId]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const batches = useMemo(() => Array.from(new Set(students.map((s) => s.batch_name || "")).values()).filter(Boolean).sort(), [students]);

  const visibleStudents = useMemo(() => {
    return selectedBatch === "all" ? students : students.filter((s) => s.batch_name === selectedBatch);
  }, [students, selectedBatch]);

  const toggleSelect = (id: string) => setSelectedIds((p) => ({ ...p, [id]: !p[id] }));
  const selectAllVisible = (v: boolean) => {
    const map: Record<string, boolean> = {};
    visibleStudents.forEach((s) => (map[s.id] = v));
    setSelectedIds(map);
  };

  const buildRecipients = () => {
    const recipients: Array<{ name: string; phone: string }> = [];
    const ids = Object.keys(selectedIds).filter((id) => selectedIds[id]);
    ids.forEach((id) => {
      const s = students.find((x) => x.id === id);
      if (!s) return;
      if (target === "student_login" || target === "both") {
        const p = (s.student_phone || "").replace(/[^0-9+]/g, "");
        if (p) recipients.push({ name: s.name, phone: p });
      }
      if (target === "parent_login" || target === "both") {
        const m = (s.mother_phone || "").replace(/[^0-9+]/g, "");
        const f = (s.father_phone || "").replace(/[^0-9+]/g, "");
        if (m) recipients.push({ name: s.name, phone: m });
        if (f) recipients.push({ name: s.name, phone: f });
      }
    });
    // dedupe
    const map = new Map<string, { name: string; phone: string }>();
    recipients.forEach((r) => {
      const key = r.phone.replace(/[^0-9]/g, "");
      if (!map.has(key)) map.set(key, r);
    });
    return Array.from(map.values());
  };

  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

  const handleSend = async () => {
    if (!message.trim()) {
      toast({ title: "Validation", description: "Message cannot be empty.", variant: "destructive" });
      return;
    }
    const recipients = buildRecipients();
    if (recipients.length === 0) {
      toast({ title: "No recipients", description: "Select students to notify.", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      if (service === "manual_whatsapp") {
        for (let i = 0; i < recipients.length; i++) {
          const r = recipients[i];
          const link = `https://wa.me/${r.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(message)}`;
          window.open(link, "_blank");
          if (i < recipients.length - 1) await sleep(800);
        }
        toast({ title: "Started", description: `Opened ${recipients.length} WhatsApp links.` });
      } else if (service === "zavu_whatsapp") {
        const zavu = await createZavuServiceForInstitute(instId);
        if (!zavu) {
          toast({ title: "Zavu Missing", description: "Zavu not configured for institute.", variant: "destructive" });
          return;
        }
        let sent = 0;
        for (const r of recipients) {
          try {
            const cleaned = r.phone.startsWith("+") ? r.phone : `+91${r.phone.replace(/[^0-9]/g, "")}`;
            const params: ZavuMessageParams = { to: cleaned, channel: "whatsapp", text: message } as any;
            const res = await zavu.sendMessage(params);
            await supabase.from("message_logs").insert([{ institute_id: instId, channel: "whatsapp", recipient: cleaned, message, status: "sent", zavu_message_id: res.message?.id }]);
            sent++;
            await sleep(500);
          } catch (err) {
            await supabase.from("message_logs").insert([{ institute_id: instId, channel: "whatsapp", recipient: r.phone, message, status: "failed" }]);
          }
        }
        toast({ title: "Done", description: `Sent to ${sent} contacts.` });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Send failed.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Announcements & Notifications</h2>
          <p className="text-sm text-muted-foreground">Compose an announcement and notify student / parent logins by batch.</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="surface-elevated rounded-lg border border-border/50 p-5">
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium">Title (optional)</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium">Message</label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={6} />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="text-xs font-medium">Batch</label>
                <select value={selectedBatch} onChange={(e) => setSelectedBatch(e.target.value)} className="w-full px-3 py-2 rounded-md bg-card border border-border text-sm">
                  <option value="all">All Batches</option>
                  {batches.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium">Target</label>
                <select value={target} onChange={(e) => setTarget(e.target.value as RecipientTarget)} className="w-full px-3 py-2 rounded-md bg-card border border-border text-sm">
                  <option value="both">Both (Parent & Student)</option>
                  <option value="parent_login">Parent Login</option>
                  <option value="student_login">Student Login</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium">Service</label>
                <select value={service} onChange={(e) => setService(e.target.value)} className="w-full px-3 py-2 rounded-md bg-card border border-border text-sm">
                  {serviceOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-2 mt-2">
              <Button onClick={() => selectAllVisible(true)} size="sm">Select All</Button>
              <Button onClick={() => selectAllVisible(false)} size="sm" variant="outline">Clear</Button>
              <Button className="ml-auto" onClick={handleSend} disabled={sending}>
                {sending ? "Sending..." : "Send Announcement"}
              </Button>
            </div>
          </div>
        </div>

        <div className="surface-elevated rounded-lg border border-border/50 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">Students</h3>
            <span className="text-sm text-muted-foreground">{loading ? "Loading..." : `${visibleStudents.length} shown`}</span>
          </div>

          <div className="mt-4 max-h-[520px] overflow-y-auto space-y-2">
            {loading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Loading students...</div>
            ) : visibleStudents.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No students in this batch.</div>
            ) : (
              visibleStudents.map((s) => (
                <div key={s.id} className="rounded-xl border border-border/50 bg-card p-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">Mother: {s.mother_phone || "-"} • Father: {s.father_phone || "-"} • Student: {s.student_phone || "-"}</p>
                  </div>
                  <div className="flex flex-col items-end">
                    <input type="checkbox" checked={!!selectedIds[s.id]} onChange={() => toggleSelect(s.id)} />
                    <span className="text-xs text-muted-foreground mt-2">{s.batch_name}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
