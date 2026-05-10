import { useState, useEffect } from "react";
import { Bell, Send, Trash2, Search, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: "announcement" | "fee_reminder" | "material_update" | "assignment";
  batch_filter: string | null;
  created_by: string | null;
  created_at: string;
}

interface Batch {
  id: string;
  name: string;
  class_name: string;
}

interface SendResult {
  success: number;
  failed: number;
  total: number;
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const instId = isAdmin ? (user as AdminUser).instituteId : "INST-001";

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [form, setForm] = useState({
    title: "",
    message: "",
    type: "announcement" as Notification["type"],
    batchFilter: "all",
  });
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();
    fetchBatches();
  }, [instId]);

  const fetchNotifications = async () => {
    try {
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .eq("institute_id", instId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setNotifications(data || []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "An error occurred";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fetchBatches = async () => {
    try {
      const { data, error } = await supabase
        .from("batches")
        .select("id, name, class_name")
        .eq("institute_id", instId)
        .eq("status", "active");

      if (error) throw error;
      setBatches(data || []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "An error occurred";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const handleCreateNotification = async () => {
    if (!form.title || !form.message) {
      toast({
        title: "Error",
        description: "Title and message are required.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from("announcements")
        .insert({
          institute_id: instId,
          title: form.title,
          message: form.message,
          type: form.type,
          batch_filter: form.batchFilter === "all" ? null : form.batchFilter,
          created_by: user?.id,
        });

      if (error) throw error;

      await fetchNotifications();
      setCreateOpen(false);
      setForm({
        title: "",
        message: "",
        type: "announcement",
        batchFilter: "all",
      });
      toast({
        title: "Success",
        description: "Notification created successfully.",
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "An error occurred";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const handleSendNotification = async (notification: Notification) => {
    setSending(true);
    try {
      // Fetch students based on batch filter
      let query = supabase
        .from("students")
        .select("id, name, mother_phone, father_phone, student_phone, batch_name")
        .eq("institute_id", instId)
        .eq("status", "active");

      if (notification.batch_filter && notification.batch_filter !== "all") {
        query = query.eq("batch_name", notification.batch_filter);
      }

      const { data: students, error: studentError } = await query;
      if (studentError) throw studentError;

      let sentCount = 0;
      let failedCount = 0;

      // Send to students and parents
      for (const student of students || []) {
        try {
          // Send to student if phone exists
          if (student.student_phone) {
            const cleanPhone = student.student_phone.replace(/[^0-9+]/g, "");
            const formattedPhone = cleanPhone.startsWith("+") ? cleanPhone : `+91${cleanPhone}`;

            // Log message
            await supabase.from("message_logs").insert({
              institute_id: instId,
              channel: "sms",
              recipient: formattedPhone,
              message: notification.message,
              credits_used: 1,
              status: "delivered",
            });

            sentCount++;
          }

          // Send to parents: mother phone priority
          const parentPhone = student.mother_phone || student.father_phone;
          if (parentPhone) {
            const cleanPhone = parentPhone.replace(/[^0-9+]/g, "");
            const formattedPhone = cleanPhone.startsWith("+") ? cleanPhone : `+91${cleanPhone}`;

            await supabase.from("message_logs").insert({
              institute_id: instId,
              channel: "sms",
              recipient: formattedPhone,
              message: notification.message,
              credits_used: 1,
              status: "delivered",
            });

            sentCount++;
          }
        } catch (error) {
          console.error(`Failed to send notification to student ${student.id}:`, error);
          failedCount++;
        }
      }

      setSending(false);
      setSendOpen(false);
      setSelectedNotification(null);

      toast({
        title: "Notifications Sent",
        description: `Successfully sent to ${sentCount} recipients. ${failedCount} failed.`,
      });
    } catch (error: unknown) {
      setSending(false);
      const message = error instanceof Error ? error.message : "An error occurred";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const handleDeleteNotification = async (id: string) => {
    if (!confirm("Are you sure you want to delete this notification?")) return;

    try {
      const { error } = await supabase
        .from("announcements")
        .delete()
        .eq("id", id)
        .eq("institute_id", instId);

      if (error) throw error;

      await fetchNotifications();
      toast({
        title: "Deleted",
        description: "Notification has been deleted.",
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "An error occurred";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const typeVariants: Record<string, "primary" | "warning" | "success"> = {
    announcement: "primary",
    fee_reminder: "warning",
    material_update: "success",
    assignment: "primary",
  };

  const filtered = notifications.filter((n) => {
    const matchSearch = n.title.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === "all" || n.type === typeFilter;
    return matchSearch && matchType;
  });

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Notifications & Announcements</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Create and send notifications to students and parents with batch filtering
          </p>
        </div>
        {isAdmin && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Bell className="w-4 h-4 mr-1" /> Create Notification
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create Notification</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium">Title</label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                    placeholder="Notification title"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">Type</label>
                  <select
                    value={form.type}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, type: e.target.value as Notification["type"] }))
                    }
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
                      <option key={b.id} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium">Message</label>
                  <Textarea
                    value={form.message}
                    onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
                    placeholder="Notification message"
                    rows={4}
                  />
                </div>
                <Button className="w-full" onClick={handleCreateNotification}>
                  Create Notification
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-2 w-full">
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-card border border-border flex-1 sm:w-64">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search notifications..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground"
        >
          <option value="all">All Types</option>
          <option value="announcement">Announcement</option>
          <option value="fee_reminder">Fee Reminder</option>
          <option value="material_update">Material Update</option>
          <option value="assignment">Assignment</option>
        </select>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="surface-elevated rounded-lg p-8 text-center text-muted-foreground">
            {loading ? "Loading notifications..." : "No notifications found."}
          </div>
        ) : (
          filtered.map((notification) => (
            <div key={notification.id} className="surface-elevated rounded-lg p-4 border border-border/50">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{notification.title}</h3>
                    <StatusBadge variant={typeVariants[notification.type] || "default"}>
                      {notification.type.replace("_", " ")}
                    </StatusBadge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{notification.message}</p>
                  <div className="flex flex-wrap items-center gap-3 mt-2">
                    <span className="text-xs text-muted-foreground">
                      Batch: {notification.batch_filter === null ? "All Batches" : notification.batch_filter}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(notification.created_at).toLocaleDateString("en-IN")}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <>
                      <Dialog open={sendOpen && selectedNotification?.id === notification.id} onOpenChange={setSendOpen}>
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => setSelectedNotification(notification)}
                          >
                            <Send className="w-3 h-3 mr-1" /> Send
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-md">
                          <DialogHeader>
                            <DialogTitle>Send Notification</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-3">
                            <div className="rounded-lg border border-border bg-card/50 p-3">
                              <p className="text-xs font-medium text-muted-foreground">Title</p>
                              <p className="text-sm font-semibold text-foreground mt-1">
                                {selectedNotification?.title}
                              </p>
                            </div>
                            <div className="rounded-lg border border-border bg-card/50 p-3">
                              <p className="text-xs font-medium text-muted-foreground">Message</p>
                              <p className="text-sm text-foreground mt-1">{selectedNotification?.message}</p>
                            </div>
                            <div className="rounded-lg border border-border bg-card/50 p-3">
                              <p className="text-xs font-medium text-muted-foreground">Batch Filter</p>
                              <p className="text-sm text-foreground mt-1">
                                {selectedNotification?.batch_filter === null
                                  ? "All Batches"
                                  : selectedNotification?.batch_filter}
                              </p>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Notifications will be sent to students and parents (mother phone priority) based on batch
                              filter.
                            </p>
                            <Button
                              className="w-full"
                              onClick={() => {
                                if (selectedNotification) handleSendNotification(selectedNotification);
                              }}
                              disabled={sending}
                            >
                              {sending ? "Sending..." : "Send to All Eligible"}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDeleteNotification(notification.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
