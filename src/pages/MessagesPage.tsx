import { MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect } from "react";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

interface Announcement {
  id: string;
  title: string;
  message: string;
  date: string;
  type: "announcement" | "fee_reminder" | "material_update";
  author: string;
}

const typeVariants: Record<string, "primary" | "warning" | "success"> = {
  announcement: "primary",
  fee_reminder: "warning",
  material_update: "success",
};

export default function MessagesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const instId = isAdmin ? (user as AdminUser).instituteId : "INST-001";

  const [announcements, setAnnouncements] = useState<Announcement[]>(() => {
    const saved = localStorage.getItem(`sms_announcements_${instId}`);
    return saved ? JSON.parse(saved) : [];
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", message: "", type: "announcement" as const });

  const handleCreate = () => {
    if (!form.title || !form.message) {
      toast({ title: "Error", description: "Title and message are required.", variant: "destructive" });
      return;
    }
    const newA: Announcement = {
      id: Math.random().toString(36).substr(2, 9),
      title: form.title,
      message: form.message,
      type: form.type,
      date: new Date().toISOString().split("T")[0],
      author: user?.name || "Admin",
    };
    const updated = [newA, ...announcements];
    setAnnouncements(updated);
    localStorage.setItem(`sms_announcements_${instId}`, JSON.stringify(updated));
    setOpen(false);
    setForm({ title: "", message: "", type: "announcement" });
    toast({ title: "Announcement Published", description: "All users in your institute can now see this message." });
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Messages & Announcements</h2>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Send className="w-4 h-4 mr-1" /> New Announcement</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Announcement</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><label className="text-xs font-medium">Title</label><Input value={form.title} onChange={e => setForm(p => ({...p, title: e.target.value}))} /></div>
                <div><label className="text-xs font-medium">Type</label>
                  <select value={form.type} onChange={e => setForm(p => ({...p, type: e.target.value as any}))} className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm">
                    <option value="announcement">Announcement</option>
                    <option value="fee_reminder">Fee Reminder</option>
                    <option value="material_update">Material Update</option>
                  </select>
                </div>
                <div><label className="text-xs font-medium">Message</label><Textarea value={form.message} onChange={e => setForm(p => ({...p, message: e.target.value}))} /></div>
                <Button className="w-full" onClick={handleCreate}>Publish</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="space-y-3">
        {announcements.length === 0 ? (
          <div className="surface-elevated rounded-lg p-8 text-center text-muted-foreground">
            No announcements yet.
          </div>
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
                      <span className="text-xs text-muted-foreground tabular-nums">{a.date}</span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{a.message}</p>
                  <p className="text-xs text-muted-foreground mt-2">— {a.author}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

