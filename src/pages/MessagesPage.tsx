import { MessageSquare, Send, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect, useCallback } from "react";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { supabase, isUuid } from "@/lib/supabase";
import { createZavuServiceForInstitute, ZavuChannel, ZavuMessageParams } from "@/lib/zavu-service";

interface Announcement {
  id: string;
  title: string;
  message: string;
  type: "announcement" | "fee_reminder" | "material_update" | "assignment";
  batch_filter: string | null;
  created_at: string;
}

interface MessageRecipient {
  id: string;
  name: string;
  batchName: string;
  contactNumber: string;
  contactSource: "Mother" | "Father" | "Student";
}

interface Student {
  id: string;
  name: string;
  batch_name?: string;
  mother_phone?: string;
  father_phone?: string;
  student_phone?: string;
}

type MessageService =
  | "manual_whatsapp"
  | "zavu_whatsapp"
  | "zavu_sms"
  | "zavu_email"
  | "zavu_voice"
  | "zavu_telegram"
  | "zavu_instagram";

interface ServiceOption {
  value: MessageService;
  label: string;
  channel: ZavuChannel | null;
  description: string;
}

const typeVariants: Record<string, "primary" | "warning" | "success"> = {
  announcement: "primary",
  fee_reminder: "warning",
  material_update: "success",
};

const serviceOptions: ServiceOption[] = [
  { value: "manual_whatsapp", label: "Manual WhatsApp", channel: null, description: "Opens wa.me links in browser tabs" },
  { value: "zavu_whatsapp", label: "Zavu WhatsApp", channel: "whatsapp", description: "Send via Zavu WhatsApp API" },
  { value: "zavu_sms", label: "Zavu SMS", channel: "sms", description: "Send via Zavu SMS API" },
  { value: "zavu_email", label: "Zavu Email", channel: "email", description: "Send via Zavu Email API" },
  { value: "zavu_voice", label: "Zavu Voice", channel: "voice", description: "Send via Zavu Voice API" },
  { value: "zavu_telegram", label: "Zavu Telegram", channel: "telegram", description: "Send via Zavu Telegram API" },
  { value: "zavu_instagram", label: "Zavu Instagram", channel: "instagram", description: "Send via Zavu Instagram API" },
];

type AnnouncementForm = {
  title: string;
  message: string;
  type: Announcement["type"];
  batchFilter: string;
};

export default function MessagesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const instId = isAdmin ? (user as AdminUser).instituteId : "INST-001";

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [recipients, setRecipients] = useState<MessageRecipient[]>([]);
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [recipientType, setRecipientType] = useState<"primary" | "student" | "parent" | "both">("primary");
  const [totalStudents, setTotalStudents] = useState(0);
  const [loadingRecipients, setLoadingRecipients] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AnnouncementForm>({
    title: "",
    message: "",
    type: "announcement",
    batchFilter: "all",
  });
  const [messageText, setMessageText] = useState("");
  const [sleepSeconds, setSleepSeconds] = useState(5);
  const [selectedService, setSelectedService] = useState<MessageService>("manual_whatsapp");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchAnnouncements();
  }, [instId]);

  const fetchAnnouncements = async () => {
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .eq('institute_id', instId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAnnouncements(data || []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const fetchRecipients = useCallback(async () => {
    if (!instId || !isUuid(instId)) {
      setRecipients([]);
      setTotalStudents(0);
      setLoadingRecipients(false);
      return;
    }

    setLoadingRecipients(true);
    try {
      const { data, error } = await supabase
        .from("students")
        .select("id, name, batch_name, mother_phone, father_phone, student_phone")
        .eq("institute_id", instId)
        .order("name", { ascending: true });

      if (error) throw error;

      const allStudents = data || [];
      setTotalStudents(allStudents.length);

      const mapped = allStudents.map((student: Student) => {
        const contactNumber = (student.mother_phone || student.father_phone || student.student_phone || "").replace(/\D/g, "");
        const contactSource = student.mother_phone
          ? "Mother"
          : student.father_phone
          ? "Father"
          : student.student_phone
          ? "Student"
          : "Student";

        return {
          id: student.id,
          name: student.name,
          batchName: student.batch_name || "N/A",
          contactNumber,
          contactSource: contactSource as MessageRecipient["contactSource"],
        };
      });

      setRecipients(mapped.filter((recipient) => recipient.contactNumber));
    } catch (error: unknown) {
      const err = error as Error;
      toast({ title: "Error", description: err.message || "Could not load students.", variant: "destructive" });
      setRecipients([]);
      setTotalStudents(0);
    } finally {
      setLoadingRecipients(false);
    }
  }, [instId]);

  useEffect(() => {
    fetchRecipients();
    const interval = setInterval(fetchRecipients, 30000);
    return () => clearInterval(interval);
  }, [fetchRecipients]);

  const batches = Array.from(new Set(recipients.map((r) => r.batchName))).filter(Boolean).sort();

  const displayedRecipients = (() => {
    const filtered = recipients.filter((r) => batchFilter === "all" || r.batchName === batchFilter);
    const targets: MessageRecipient[] = [];

    filtered.forEach((r) => {
      const primary = r.contactNumber || "";
      const studentPhone = r.contactSource === "Student" ? r.contactNumber : "";
      const parentNumber = r.contactSource === "Mother" || r.contactSource === "Father" ? r.contactNumber : "";

      if (recipientType === "primary") {
        if (primary) targets.push({ ...r, contactNumber: primary });
      } else if (recipientType === "student") {
        if (studentPhone) targets.push({ ...r, contactNumber: studentPhone, contactSource: "Student" as any });
      } else if (recipientType === "parent") {
        if (parentNumber) targets.push({ ...r, contactNumber: parentNumber, contactSource: "Mother" as any });
      } else if (recipientType === "both") {
        if (parentNumber) targets.push({ ...r, contactNumber: parentNumber, contactSource: "Mother" as any });
        if (studentPhone) targets.push({ ...r, contactNumber: studentPhone, contactSource: "Student" as any });
      }
    });

    const dedupKey = (x: MessageRecipient) => x.contactNumber.replace(/[^0-9]/g, "");
    const map = new Map<string, MessageRecipient>();
    targets.forEach((t) => {
      const k = dedupKey(t);
      if (!map.has(k)) map.set(k, t);
    });
    return Array.from(map.values());
  })();

  const handleCreate = async () => {
    if (!form.title || !form.message) {
      toast({ title: "Error", description: "Title and message are required.", variant: "destructive" });
      return;
    }

    try {
      const { error } = await supabase
        .from('announcements')
        .insert({
          institute_id: instId,
          title: form.title,
          message: form.message,
          type: form.type,
          batch_filter: form.batchFilter === "all" ? null : form.batchFilter,
          created_by: user?.id,
        });

      if (error) throw error;

      await fetchAnnouncements();
      setOpen(false);
      setForm({ title: "", message: "", type: "announcement", batchFilter: "all" });
      toast({ title: "Announcement Created", description: "Announcement has been posted." });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };
    toast({ title: "Announcement Published", description: "All users in your institute can now see this message." });
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const handleSendMessage = async () => {
    if (!messageText.trim()) {
      toast({ title: "Error", description: "Please type the announcement message.", variant: "destructive" });
      return;
    }

    // Build filtered recipient list according to selected batch and recipient type
    const filtered = recipients.filter((r) => batchFilter === "all" || r.batchName === batchFilter);

    const targets: Array<{ name: string; contactNumber: string; contactSource: string }> = [];

    filtered.forEach((r) => {
      // original mapping used contactNumber as the primary available contact
      const primary = r.contactNumber || "";
      const studentPhone = r.contactSource === "Student" ? r.contactNumber : "";
      const parentNumber = r.contactSource === "Mother" || r.contactSource === "Father" ? r.contactNumber : "";

      if (recipientType === "primary") {
        if (primary) targets.push({ name: r.name, contactNumber: primary, contactSource: r.contactSource });
      } else if (recipientType === "student") {
        if (studentPhone) targets.push({ name: r.name, contactNumber: studentPhone, contactSource: "Student" });
      } else if (recipientType === "parent") {
        if (parentNumber) targets.push({ name: r.name, contactNumber: parentNumber, contactSource: "Parent" });
      } else if (recipientType === "both") {
        if (parentNumber) targets.push({ name: r.name, contactNumber: parentNumber, contactSource: "Parent" });
        if (studentPhone) targets.push({ name: r.name, contactNumber: studentPhone, contactSource: "Student" });
      }
    });

    // dedupe by contactNumber
    const dedupedMap = new Map<string, { name: string; contactNumber: string; contactSource: string }>();
    targets.forEach((t) => {
      const key = t.contactNumber.replace(/[^0-9]/g, "");
      if (!dedupedMap.has(key)) dedupedMap.set(key, t);
    });

    const finalRecipients = Array.from(dedupedMap.values());

    if (finalRecipients.length === 0) {
      toast({ title: "No recipients", description: "No students with a valid contact number were found.", variant: "destructive" });
      return;
    }

    const selectedOption = serviceOptions.find((opt) => opt.value === selectedService);
    if (!selectedOption) {
      toast({ title: "Error", description: "Invalid service selected.", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      if (selectedService === "manual_whatsapp") {
        for (let index = 0; index < finalRecipients.length; index += 1) {
          const recipient = finalRecipients[index];
          const encodedMessage = encodeURIComponent(messageText.trim());
          const waLink = `https://wa.me/${recipient.contactNumber}?text=${encodedMessage}`;
          window.open(waLink, "_blank");

          if (index < finalRecipients.length - 1) {
            await sleep(Math.max(500, sleepSeconds * 1000));
          }
        }
        toast({ title: "Message sending started", description: `WhatsApp links opened for ${finalRecipients.length} contacts.` });
      } else {
        const zavuSvc = await createZavuServiceForInstitute(instId);
        if (!zavuSvc) {
          toast({ title: "Error", description: "Zavu service is not configured for this institute.", variant: "destructive" });
          return;
        }

        let sentCount = 0;
        let failedCount = 0;

        for (const recipient of finalRecipients) {
          try {
            const cleanPhone = recipient.contactNumber.replace(/[^0-9+]/g, "");
            const formattedPhone = cleanPhone.startsWith("+") ? cleanPhone : `+91${cleanPhone}`;

            const params: ZavuMessageParams = {
              to: formattedPhone,
              channel: selectedOption.channel as ZavuChannel,
              ...(selectedOption.channel === "email"
                ? {
                    subject: "School Announcement",
                    htmlBody: `<p>${messageText.trim()}</p>`,
                  }
                : {
                    text: messageText.trim(),
                  }),
            };

            const result = await zavuSvc.sendMessage(params);

            await supabase.from("message_logs").insert([
              {
                institute_id: instId,
                channel: selectedOption.channel || "unknown",
                recipient: formattedPhone,
                message: messageText.trim(),
                status: "sent",
                zavu_message_id: result.message.id,
              },
            ]);

            sentCount++;

            if (sentCount < recipients.length) {
              await sleep(Math.max(500, sleepSeconds * 1000));
            }
          } catch (error) {
            console.error(`Failed to send to ${recipient.name}:`, error);
            failedCount++;

            await supabase.from("message_logs").insert([
              {
                institute_id: instId,
                channel: selectedOption.channel || "unknown",
                recipient: recipient.contactNumber,
                message: messageText.trim(),
                status: "failed",
              },
            ]);
          }
        }

        toast({
          title: "Messages sent",
          description: `Successfully sent to ${sentCount} students${failedCount > 0 ? `, ${failedCount} failed` : ""}.`,
          variant: failedCount > 0 ? "destructive" : "default",
        });
      }
    } catch (error: unknown) {
      const err = error as Error;
      toast({ title: "Error", description: err.message || "Could not send messages.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Messages & Announcements</h2>
          <p className="text-sm text-muted-foreground mt-1">Send announcements via multiple channels to students using their primary contact.</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Send className="w-4 h-4 mr-1" /> New Announcement
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Announcement</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium">Title</label>
                  <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium">Type</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as Announcement["type"] }))}
                    className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm"
                  >
                    <option value="announcement">Announcement</option>
                    <option value="fee_reminder">Fee Reminder</option>
                    <option value="material_update">Material Update</option>
                    <option value="assignment">Assignment</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium">Batch Filter</label>
                  <select
                    value={form.batchFilter}
                    onChange={(e) => setForm((p) => ({ ...p, batchFilter: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm"
                  >
                    <option value="all">All Batches</option>
                    {batches.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium">Message</label>
                  <Textarea value={form.message} onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))} />
                </div>
                <Button className="w-full" onClick={handleCreate}>
                  Publish
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.8fr_1fr]">
        <div className="surface-elevated rounded-lg border border-border/50 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">Message Broadcast</h3>
              <p className="text-sm text-muted-foreground mt-1">Auto-imported students from the Students page with batch and primary contact selection.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={fetchRecipients} disabled={loadingRecipients}>
                <RefreshCcw className="w-4 h-4 mr-1" /> Refresh students
              </Button>
              <span className="text-xs text-muted-foreground">Updated every 30s</span>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="text-xs uppercase font-bold text-muted-foreground tracking-wider">Message</label>
              <Textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Type a common announcement message here..."
                rows={6}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border/50 bg-card p-4">
                <p className="text-xs uppercase font-bold text-muted-foreground tracking-wider">Batch Filter</p>
                <div className="mt-2">
                  <select
                    value={batchFilter}
                    onChange={(e) => setBatchFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-md bg-card border border-border text-sm"
                  >
                    <option value="all">All Batches</option>
                    {batches.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-lg border border-border/50 bg-card p-4">
                <p className="text-xs uppercase font-bold text-muted-foreground tracking-wider">Recipients</p>
                <div className="mt-2">
                  <select
                    value={recipientType}
                    onChange={(e) => setRecipientType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-md bg-card border border-border text-sm"
                  >
                    <option value="primary">Primary Contact (Mother/Father/Student)</option>
                    <option value="parent">Parent (Mother or Father)</option>
                    <option value="student">Student (Student phone)</option>
                    <option value="both">Both (Parent + Student)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border/50 bg-card p-4">
                <p className="text-xs uppercase font-bold text-muted-foreground tracking-wider">Service</p>
                <div className="mt-2">
                  <select
                    value={selectedService}
                    onChange={(e) => setSelectedService(e.target.value as MessageService)}
                    className="w-full px-3 py-2 rounded-md bg-card border border-border text-sm"
                  >
                    {serviceOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {serviceOptions.find((opt) => opt.value === selectedService)?.description}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-border/50 bg-card p-4">
                <p className="text-xs uppercase font-bold text-muted-foreground tracking-wider">Sleep time</p>
                <div className="mt-2 flex items-center gap-3">
                  <Input
                    type="number"
                    min={1}
                    value={sleepSeconds}
                    onChange={(e) => setSleepSeconds(Number(e.target.value) || 1)}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">seconds between messages</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">This adds a delay before sending the next message.</p>
              </div>
            </div>

            <Button className="w-full" onClick={handleSendMessage} disabled={sending || !messageText.trim() || recipients.length === 0}>
              <Send className="w-4 h-4 mr-2" /> {sending ? "Sending messages..." : `Send via ${serviceOptions.find((opt) => opt.value === selectedService)?.label}`}
            </Button>
          </div>
        </div>

        <div className="surface-elevated rounded-lg border border-border/50 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-foreground">Student Contacts</h3>
              <p className="text-sm text-muted-foreground mt-1">Primary contact picks mother first, then father, then student.</p>
            </div>
            <span className="text-sm text-muted-foreground">{loadingRecipients ? "Loading..." : `${displayedRecipients.length} ready`}</span>
          </div>

          <div className="mt-4 space-y-2 max-h-[520px] overflow-y-auto">
            {loadingRecipients ? (
              <div className="rounded-lg border border-dashed border-border/50 p-6 text-center text-sm text-muted-foreground">Loading students...</div>
            ) : recipients.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/50 p-6 text-center text-sm text-muted-foreground">No students found with a valid WhatsApp contact.</div>
            ) : (
              displayedRecipients.map((recipient) => (
                <div key={recipient.id} className="rounded-xl border border-border/50 bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{recipient.name}</p>
                      <p className="text-xs text-muted-foreground">Batch: {recipient.batchName}</p>
                    </div>
                    <span className="text-xs uppercase font-semibold text-muted-foreground">{recipient.contactSource}</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">+{recipient.contactNumber}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {announcements.length === 0 ? (
          <div className="surface-elevated rounded-lg p-8 text-center text-muted-foreground">No announcements yet.</div>
        ) : (
          announcements.map((a) => (
            <div key={a.id} className="surface-elevated rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-md bg-primary/10 shrink-0 mt-0.5">
                  <MessageSquare className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <p className="text-sm font-semibold text-foreground">{a.title}</p>
                  <div className="flex items-center gap-2">
                      <StatusBadge variant={typeVariants[a.type] || "default"}>
                        {a.type.replace("_", " ")}
                      </StatusBadge>
                      <span className="text-xs text-muted-foreground tabular-nums">{new Date(a.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{a.message}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}