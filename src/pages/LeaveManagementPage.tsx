import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/status-badge";
import { CalendarDays, Plus, Check, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

interface LeaveRequest {
  id: string;
  teacherId: string;
  teacherName: string;
  fromDate: string;
  toDate: string;
  reason: string;
  type: "casual" | "sick" | "personal";
  status: "pending" | "approved" | "rejected";
  appliedOn: string;
  adminNote?: string;
}

const initialLeaves: LeaveRequest[] = [
  { id: "LV-001", teacherId: "T001", teacherName: "Dr. Rajesh Sharma", fromDate: "2025-03-20", toDate: "2025-03-21", reason: "Family function", type: "casual", status: "pending", appliedOn: "2025-03-15" },
  { id: "LV-002", teacherId: "T002", teacherName: "Prof. Anita Verma", fromDate: "2025-03-18", toDate: "2025-03-18", reason: "Not feeling well", type: "sick", status: "approved", appliedOn: "2025-03-17", adminNote: "Approved. Take care." },
  { id: "LV-003", teacherId: "T003", teacherName: "Mr. Suresh Patel", fromDate: "2025-03-25", toDate: "2025-03-28", reason: "Personal work at hometown", type: "personal", status: "rejected", appliedOn: "2025-03-14", adminNote: "Exams week. Cannot approve." },
  { id: "LV-004", teacherId: "T001", teacherName: "Dr. Rajesh Sharma", fromDate: "2025-02-10", toDate: "2025-02-11", reason: "Medical checkup", type: "sick", status: "approved", appliedOn: "2025-02-08" },
];

import { AdminUser } from "@/contexts/AuthContext";

export default function LeaveManagementPage() {
  const { user } = useAuth();
  const isTeacher = user?.role === "teacher";
  const instId = user?.role === "admin" ? (user as AdminUser).instituteId : "INST-001";
  const [leaves, setLeaves] = useState(instId === "INST-001" ? initialLeaves : []);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [noteDialogId, setNoteDialogId] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [form, setForm] = useState({ fromDate: "", toDate: "", reason: "", type: "casual" as LeaveRequest["type"] });
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");

  const displayLeaves = isTeacher
    ? leaves.filter(l => l.teacherId === user?.id)
    : leaves;

  const filtered = filter === "all" ? displayLeaves : displayLeaves.filter(l => l.status === filter);

  const handleApply = () => {
    if (!form.fromDate || !form.toDate || !form.reason) {
      toast({ title: "Error", description: "All fields required.", variant: "destructive" });
      return;
    }
    const newLeave: LeaveRequest = {
      id: `LV-${String(leaves.length + 1).padStart(3, "0")}`,
      teacherId: user?.id || "",
      teacherName: user?.name || "",
      fromDate: form.fromDate,
      toDate: form.toDate,
      reason: form.reason,
      type: form.type,
      status: "pending",
      appliedOn: new Date().toISOString().split("T")[0],
    };
    setLeaves(prev => [newLeave, ...prev]);
    setDialogOpen(false);
    setForm({ fromDate: "", toDate: "", reason: "", type: "casual" });
    toast({ title: "Leave Applied", description: "Your leave request has been submitted." });
  };

  const handleAction = (id: string, action: "approved" | "rejected") => {
    setLeaves(prev => prev.map(l => l.id === id ? { ...l, status: action, adminNote: adminNote || undefined } : l));
    setNoteDialogId(null);
    setAdminNote("");
    toast({ title: action === "approved" ? "Approved" : "Rejected", description: `Leave request ${action}.` });
  };

  const getDays = (from: string, to: string) => {
    const diff = (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(1, diff + 1);
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Leave Management</h2>
          <p className="text-sm text-muted-foreground">{isTeacher ? "Apply and track your leaves" : "Manage all teacher leaves"}</p>
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
                <Button className="w-full" onClick={handleApply}>Submit Request</Button>
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
                {!isTeacher && <p className="text-sm font-medium text-foreground">{leave.teacherName}</p>}
                <div className="flex items-center gap-2 mt-0.5">
                  <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-foreground">{leave.fromDate} → {leave.toDate}</span>
                  <span className="text-xs text-muted-foreground">({getDays(leave.fromDate, leave.toDate)} day{getDays(leave.fromDate, leave.toDate) > 1 ? "s" : ""})</span>
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
                {leave.adminNote && (
                  <p className="text-xs text-muted-foreground mt-1.5 italic bg-secondary/50 px-2 py-1 rounded">Admin: {leave.adminNote}</p>
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
                      <DialogHeader><DialogTitle>Approve Leave - {leave.teacherName}</DialogTitle></DialogHeader>
                      <div className="space-y-3">
                        <Textarea placeholder="Add a note (optional)..." value={adminNote} onChange={e => setAdminNote(e.target.value)} rows={2} />
                        <div className="flex gap-2">
                          <Button className="flex-1" onClick={() => handleAction(leave.id, "approved")}>Approve</Button>
                          <Button variant="destructive" className="flex-1" onClick={() => handleAction(leave.id, "rejected")}>Reject</Button>
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
