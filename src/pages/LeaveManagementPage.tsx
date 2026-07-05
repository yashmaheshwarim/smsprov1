import { useState, useEffect } from "react";
import { useAuth, TeacherUser, AdminUser } from "@/contexts/AuthContext";
import { supabase, isUuid } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/status-badge";
import { CalendarDays, Plus, Check, X, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

interface LeaveRequest {
  id: string;
  teacher_id: string;
  teacher_name: string;
  teacher_email?: string;
  from_date: string;
  to_date: string;
  reason: string;
  type: "casual" | "sick" | "personal";
  status: "pending" | "approved" | "rejected";
  applied_on: string;
  admin_note?: string;
}

export default function LeaveManagementPage() {
  const { user } = useAuth();
  const isTeacher = user?.role === "teacher";
  const isAdmin = user?.role === "admin";
  const teacher = isTeacher ? (user as TeacherUser) : null;
  const instId = isAdmin ? (user as AdminUser).instituteId : "";

  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [noteDialogId, setNoteDialogId] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [form, setForm] = useState({ fromDate: "", toDate: "", reason: "", type: "casual" as LeaveRequest["type"] });
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");

  const fetchLeaves = async () => {
    setLoading(true);
    try {
      if (isAdmin && instId) {
        // Admin: fetch all leaves for this institute
        const { data, error } = await supabase
          .from("leave_requests")
          .select("*")
          .eq("institute_id", instId)
          .order("applied_on", { ascending: false });

        if (error) throw error;
        setLeaves((data || []).map((l: any) => ({
          id: l.id,
          teacher_id: l.teacher_id,
          teacher_name: l.teacher_name || "Unknown Teacher",
          teacher_email: l.teacher_email,
          from_date: l.from_date,
          to_date: l.to_date,
          reason: l.reason,
          type: l.type,
          status: l.status,
          applied_on: l.applied_on,
          admin_note: l.admin_note,
        })));
      } else if (isTeacher) {
        // Teacher: fetch their own leaves via teachers table lookup
        const { data: teacherRecord } = await supabase
          .from("teachers")
          .select("id, name")
          .eq("email", teacher!.email)
          .single();

        if (teacherRecord) {
          const { data, error } = await supabase
            .from("leave_requests")
            .select("*")
            .eq("teacher_id", teacherRecord.id)
            .order("applied_on", { ascending: false });

          if (error) throw error;
          setLeaves((data || []).map((l: any) => ({
            id: l.id,
            teacher_id: l.teacher_id,
            teacher_name: teacherRecord.name || "Unknown",
            from_date: l.from_date,
            to_date: l.to_date,
            reason: l.reason,
            type: l.type,
            status: l.status,
            applied_on: l.applied_on,
            admin_note: l.admin_note,
          })));
        } else {
          setLeaves([]);
        }
      } else {
        setLeaves([]);
      }
    } catch (error: any) {
      console.error("Error fetching leaves:", error);
      toast({ title: "Error", description: "Failed to load leave requests.", variant: "destructive" });
      setLeaves([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaves();
  }, []);

  const displayLeaves = isTeacher
    ? leaves
    : leaves;

  const filtered = filter === "all" ? displayLeaves : displayLeaves.filter(l => l.status === filter);

  const handleApply = async () => {
    if (!form.fromDate || !form.toDate || !form.reason) {
      toast({ title: "Error", description: "All fields required.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { data: teacherRecord, error: teacherError } = await supabase
        .from("teachers")
        .select("id")
        .eq("email", teacher!.email)
        .single();

      if (teacherError || !teacherRecord) {
        throw new Error("Teacher record not found in database.");
      }

      // Find institute_id from teacher record
      const { data: teacherFull } = await supabase
        .from("teachers")
        .select("institute_id")
        .eq("id", teacherRecord.id)
        .single();

      const instituteId = teacherFull?.institute_id;

      const { data, error } = await supabase
        .from("leave_requests")
        .insert([{
          institute_id: instituteId,
          teacher_id: teacherRecord.id,
          teacher_name: teacher!.name,
          teacher_email: teacher!.email,
          from_date: form.fromDate,
          to_date: form.toDate,
          reason: form.reason,
          type: form.type,
          status: "pending",
          applied_on: new Date().toISOString().split("T")[0],
        }])
        .select()
        .single();

      if (error) throw error;

      setLeaves(prev => [{
        id: data.id,
        teacher_id: teacherRecord.id,
        teacher_name: teacher!.name,
        from_date: form.fromDate,
        to_date: form.toDate,
        reason: form.reason,
        type: form.type,
        status: "pending",
        applied_on: data.applied_on,
      }, ...prev]);

      setDialogOpen(false);
      setForm({ fromDate: "", toDate: "", reason: "", type: "casual" });
      toast({ title: "Leave Applied", description: "Your leave request has been submitted to admin." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleAction = async (id: string, action: "approved" | "rejected") => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("leave_requests")
        .update({
          status: action,
          admin_note: adminNote || null,
        })
        .eq("id", id);

      if (error) throw error;

      setLeaves(prev => prev.map(l => l.id === id ? { ...l, status: action, admin_note: adminNote || undefined } : l));
      setNoteDialogId(null);
      setAdminNote("");
      toast({ title: action === "approved" ? "Approved" : "Rejected", description: `Leave request ${action}.` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const getDays = (from: string, to: string) => {
    const diff = (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(1, diff + 1);
  };

  if (loading) {
    return (
      <div className="p-4 lg:p-6 flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Leave Management</h2>
          <p className="text-sm text-muted-foreground">
            {isTeacher ? "Your leave requests are sent to admin for approval" : "Review and manage teacher leave requests"}
          </p>
        </div>
        {isTeacher && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Apply Leave</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Apply for Leave</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-foreground">Leave Type</label>
                  <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as LeaveRequest["type"] }))} className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground">
                    <option value="casual">Casual Leave</option>
                    <option value="sick">Sick Leave</option>
                    <option value="personal">Personal Leave</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-medium text-foreground">From</label><Input type="date" value={form.fromDate} onChange={e => setForm(p => ({ ...p, fromDate: e.target.value }))} /></div>
                  <div><label className="text-xs font-medium text-foreground">To</label><Input type="date" value={form.toDate} onChange={e => setForm(p => ({ ...p, toDate: e.target.value }))} /></div>
                </div>
                <div><label className="text-xs font-medium text-foreground">Reason</label><Textarea value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} rows={3} /></div>
                <Button className="w-full" onClick={handleApply} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Submit Request
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Stats for admin */}
      {!isTeacher && (
        <div className="grid grid-cols-3 gap-3">
          <div className="surface-elevated rounded-lg p-3 text-center">
            <p className="text-2xl font-semibold text-warning tabular-nums">{leaves.filter(l => l.status === "pending").length}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </div>
          <div className="surface-elevated rounded-lg p-3 text-center">
            <p className="text-2xl font-semibold text-success tabular-nums">{leaves.filter(l => l.status === "approved").length}</p>
            <p className="text-xs text-muted-foreground">Approved</p>
          </div>
          <div className="surface-elevated rounded-lg p-3 text-center">
            <p className="text-2xl font-semibold text-destructive tabular-nums">{leaves.filter(l => l.status === "rejected").length}</p>
            <p className="text-xs text-muted-foreground">Rejected</p>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-1 p-1 bg-secondary rounded-lg w-fit">
        {(["all", "pending", "approved", "rejected"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${filter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Leave list */}
      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No leave requests found.</p>}
        {filtered.map(leave => (
          <div key={leave.id} className="surface-elevated rounded-lg p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {!isTeacher && <p className="text-sm font-medium text-foreground">{leave.teacher_name}</p>}
                <div className="flex items-center gap-2 mt-0.5">
                  <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-foreground">{leave.from_date} → {leave.to_date}</span>
                  <span className="text-xs text-muted-foreground">({getDays(leave.from_date, leave.to_date)} day{getDays(leave.from_date, leave.to_date) > 1 ? "s" : ""})</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{leave.reason}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <StatusBadge variant={leave.type === "sick" ? "danger" : leave.type === "casual" ? "info" : "warning"}>
                    {leave.type}
                  </StatusBadge>
                  <StatusBadge variant={leave.status === "approved" ? "success" : leave.status === "rejected" ? "danger" : "warning"}>
                    {leave.status}
                  </StatusBadge>
                </div>
                {leave.admin_note && (
                  <p className="text-xs text-muted-foreground mt-1.5 italic bg-secondary/50 px-2 py-1 rounded">Admin: {leave.admin_note}</p>
                )}
              </div>
              {!isTeacher && leave.status === "pending" && (
                <div className="flex gap-1 shrink-0">
                  <Dialog open={noteDialogId === leave.id} onOpenChange={open => { setNoteDialogId(open ? leave.id : null); setAdminNote(""); }}>
                    <DialogTrigger asChild>
                      <Button size="icon" variant="outline" className="h-8 w-8 text-success border-success/30 hover:bg-success/10">
                        <Check className="w-4 h-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Review Leave - {leave.teacher_name}</DialogTitle></DialogHeader>
                      <div className="space-y-3">
                        <Textarea placeholder="Add a note (optional)..." value={adminNote} onChange={e => setAdminNote(e.target.value)} rows={2} />
                        <div className="flex gap-2">
                          <Button className="flex-1" onClick={() => handleAction(leave.id, "approved")} disabled={saving}>
                            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            Approve
                          </Button>
                          <Button variant="destructive" className="flex-1" onClick={() => handleAction(leave.id, "rejected")} disabled={saving}>
                            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            Reject
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button size="icon" variant="outline" className="h-8 w-8 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => handleAction(leave.id, "rejected")}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
