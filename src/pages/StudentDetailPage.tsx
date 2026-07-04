import { useParams, Link } from "react-router-dom";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, Phone, Mail, User, Calendar, 
  BookOpen, IndianRupee, Edit, Download, 
  Hash, CheckCircle2, XCircle, Loader2, Clock, Receipt, MessageCircle
} from "lucide-react";
import { useMemo, useEffect, useState } from "react";
import { supabase, isUuid } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Student {
  id: string;
  name: string;
  enrollment_no: string;
  batch_name: string;
  student_phone?: string;
  mother_phone?: string;
  father_phone?: string;
  email: string;
  guardian_name: string;
  status: string;
  join_date: string;
  grn_no?: string;
}

interface Invoice {
  id: string;
  amount: number;
  status: string;
  due_date: string;
  paid_date?: string;
}

interface PaymentRecord {
  id: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  receipt_id?: string;
  student_fee_id: string;
}

interface AttendanceRecord {
  id: string;
  date: string;
  status: "present" | "absent";
  subject?: string | null;
}

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const DEFAULT_UUID = "00000000-0000-0000-0000-000000000001";
  const instId = isAdmin ? (user as AdminUser).instituteId : DEFAULT_UUID;

   const [student, setStudent] = useState<Student | null>(null);
   const [invoices, setInvoices] = useState<Invoice[]>([]);
   const [payments, setPayments] = useState<PaymentRecord[]>([]);
   const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
   const [loading, setLoading] = useState(true);
   const [editOpen, setEditOpen] = useState(false);
   const [batches, setBatches] = useState<{id: string, name: string}[]>([]);
   const [editForm, setEditForm] = useState({
     name: "",
     email: "",
     studentPhone: "",
     motherPhone: "",
     fatherPhone: "",
     guardianName: "",
     batchId: "",
     status: "active",
     grnNo: ""
   });
   const [updating, setUpdating] = useState(false);

   useEffect(() => {
     if (id && isUuid(id)) {
       fetchStudentData();
       fetchBatches();
     }
   }, [id]);

   const fetchBatches = async () => {
     try {
       const { data } = await supabase
         .from("batches")
         .select("id, name")
         .eq("institute_id", instId)
         .eq("status", "active")
         .order("name", { ascending: true });
       setBatches(data || []);
     } catch (error: any) {
       console.error("Error fetching batches:", error);
     }
   };

   const fetchStudentData = async () => {
     setLoading(true);
     try {
       // 1. Fetch Student
       const { data: sData, error: sErr } = await supabase
         .from("students")
         .select("*")
         .eq("id", id)
         .single();

       if (sErr) throw sErr;
       setStudent(sData);

       // 2. Fetch Invoices
       const { data: iData, error: iErr } = await supabase
         .from("invoices")
         .select("*")
         .eq("student_id", id)
         .order("due_date", { ascending: false });

       if (iErr) throw iErr;
       setInvoices(iData || []);

       // 2b. Fetch Payments (from student_fees → payments join)
       const { data: feeIds } = await supabase
         .from("student_fees")
         .select("id")
         .eq("student_id", id);

       if (feeIds && feeIds.length > 0) {
         const { data: pData } = await supabase
           .from("payments")
           .select("*")
           .in("student_fee_id", feeIds.map(f => f.id))
           .order("payment_date", { ascending: false });
         setPayments(pData || []);
       }

       // 3. Fetch Attendance (last 30 days)
       const thirtyDaysAgo = new Date();
       thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
       const { data: aData, error: aErr } = await supabase
         .from("attendance")
         .select("*")
         .eq("student_id", id)
         .gte("date", thirtyDaysAgo.toISOString().split("T")[0])
         .order("date", { ascending: false });

       if (aErr) throw aErr;
       setAttendance(aData || []);

     } catch (error: any) {
       toast({ title: "Error", description: error.message, variant: "destructive" });
     } finally {
       setLoading(false);
     }
   };

   const openEditDialog = () => {
     if (!student) return;
     // Find batch ID from batches list
     const currentBatch = batches.find(b => b.name === student.batch_name);
     setEditForm({
       name: student.name,
       email: student.email || "",
       studentPhone: student.student_phone || "",
       motherPhone: student.mother_phone || "",
       fatherPhone: student.father_phone || "",
       guardianName: student.guardian_name || "",
       batchId: currentBatch?.id || "",
       status: student.status || "active",
       grnNo: student.grn_no || ""
     });
     setEditOpen(true);
   };

   const handleUpdateStudent = async () => {
     if (!editForm.name.trim()) {
       toast({ title: "Error", description: "Student name is required", variant: "destructive" });
       return;
     }

     setUpdating(true);
     try {
       // Get selected batch name
       const selectedBatch = batches.find(b => b.id === editForm.batchId);

       const { error } = await supabase
         .from("students")
         .update({
           name: editForm.name,
           email: editForm.email || null,
           student_phone: editForm.studentPhone || null,
           mother_phone: editForm.motherPhone || null,
           father_phone: editForm.fatherPhone || null,
           guardian_name: editForm.guardianName || null,
           batch_id: editForm.batchId || null,
           batch_name: selectedBatch?.name || null,
           status: editForm.status,
           grn_no: editForm.grnNo || null,
           updated_at: new Date().toISOString()
         })
         .eq("id", student?.id);

       if (error) throw error;

       // Refresh student data
       await fetchStudentData();
       setEditOpen(false);
       toast({ title: "Success", description: "Student profile updated successfully." });
     } catch (error: any) {
       toast({ title: "Error", description: error.message, variant: "destructive" });
     } finally {
       setUpdating(false);
     }
   };

  // Deduplicate attendance by date — group multiple subject entries per day into one consolidated row
  const deduplicatedAttendance = useMemo(() => {
    const dateMap = new Map<string, { statuses: string[]; subjects: string[] }>();

    attendance.forEach(record => {
      const existing = dateMap.get(record.date);
      if (existing) {
        existing.statuses.push(record.status);
        if (record.subject) existing.subjects.push(record.subject);
      } else {
        dateMap.set(record.date, {
          statuses: [record.status],
          subjects: record.subject ? [record.subject] : []
        });
      }
    });

    // Preserve descending date order from the original data
    const seen = new Set<string>();
    const result: Array<{
      date: string;
      consolidatedStatus: "present" | "absent";
      subjects: string[];
    }> = [];
    attendance.forEach(record => {
      if (!seen.has(record.date)) {
        seen.add(record.date);
        const group = dateMap.get(record.date)!;
        result.push({
          date: record.date,
          consolidatedStatus: group.statuses.some(s => s === "present") ? "present" : "absent",
          subjects: group.subjects,
        });
      }
    });

    return result;
  }, [attendance]);

  // Stats for attendance
  const attendanceStats = {
    present: deduplicatedAttendance.filter(r => r.consolidatedStatus === "present").length,
    absent: deduplicatedAttendance.filter(r => r.consolidatedStatus === "absent").length,
    percentage: deduplicatedAttendance.length > 0 
      ? Math.round((deduplicatedAttendance.filter(r => r.consolidatedStatus === "present").length / deduplicatedAttendance.length) * 100) 
      : 0
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Student not found.</p>
        <Link to="/students" className="text-primary text-sm hover:underline mt-2 inline-block">← Back to Students</Link>
      </div>
    );
  }

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
  
  const initials = student.name.split(" ").filter(Boolean).map((n) => n[0]).join("");

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <Link to="/students" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" /> Back to Students
        </Link>
         <div className="flex items-center gap-2">
           <Button variant="outline" size="sm" className="h-9"><Download className="w-4 h-4 mr-1" /> Export Profile</Button>
           <Button size="sm" className="h-9 shadow-md" onClick={openEditDialog}><Edit className="w-4 h-4 mr-1" /> Edit Profile</Button>
         </div>
      </div>

      {/* Profile Card */}
      <div className="surface-elevated rounded-lg p-5 border border-border/50 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
            <span className="text-xl font-bold text-primary">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-foreground">{student.name}</h2>
              <StatusBadge variant={student.status === "active" ? "success" : "default"}>
                {student.status}
              </StatusBadge>
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-[10px] font-bold text-muted-foreground uppercase border border-border/50">
                <Clock className="w-3 h-3" /> {attendanceStats.percentage}% Attendance
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5 font-mono">{student.enrollment_no}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6 pt-6 border-t border-border/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-secondary/50 flex items-center justify-center">
              <Hash className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">GRN</p>
              <p className="text-sm font-semibold text-foreground font-mono">{student.grn_no || "PENDING"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-secondary/50 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Batch</p>
              <p className="text-sm font-semibold text-foreground">{student.batch_name || "N/A"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-secondary/50 flex items-center justify-center">
              <Phone className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Phone Numbers</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {student.student_phone && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-xs font-medium text-primary">
                    <Phone className="w-3 h-3" /> Student: {student.student_phone}
                    <button
                      onClick={() => window.open(`https://web.whatsapp.com/send?phone=${student.student_phone.replace(/\D/g, '')}`, '_blank')}
                      className="p-0.5 rounded hover:bg-primary/20 transition-colors"
                      title="Send WhatsApp"
                    >
                      <MessageCircle className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {student.mother_phone && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-xs font-medium text-blue-500">
                    <Phone className="w-3 h-3" /> Mother: {student.mother_phone}
                    <button
                      onClick={() => window.open(`https://web.whatsapp.com/send?phone=${student.mother_phone.replace(/\D/g, '')}`, '_blank')}
                      className="p-0.5 rounded hover:bg-blue-500/20 transition-colors"
                      title="Send WhatsApp"
                    >
                      <MessageCircle className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {student.father_phone && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-xs font-medium text-emerald-500">
                    <Phone className="w-3 h-3" /> Father: {student.father_phone}
                    <button
                      onClick={() => window.open(`https://web.whatsapp.com/send?phone=${student.father_phone.replace(/\D/g, '')}`, '_blank')}
                      className="p-0.5 rounded hover:bg-emerald-500/20 transition-colors"
                      title="Send WhatsApp"
                    >
                      <MessageCircle className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {!student.student_phone && !student.mother_phone && !student.father_phone && (
                  <span className="text-xs text-muted-foreground">N/A</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-secondary/50 flex items-center justify-center">
              <Mail className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Email</p>
              <p className="text-sm font-semibold text-foreground truncate">{student.email}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Attendance Report */}
        <div className="surface-elevated rounded-lg border border-border/50 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-border/50 bg-secondary/30">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Attendance Report (Last 30 Days)
            </h3>
            <div className="flex gap-2">
              <span className="text-[10px] font-bold text-success px-1.5 py-0.5 rounded bg-success/10">{attendanceStats.present} P</span>
              <span className="text-[10px] font-bold text-destructive px-1.5 py-0.5 rounded bg-destructive/10">{attendanceStats.absent} A</span>
            </div>
          </div>
          <div className="max-h-[300px] overflow-y-auto divide-y divide-border/50">
            {deduplicatedAttendance.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm italic">No attendance records found.</div>
            ) : (
              deduplicatedAttendance.map((day) => (
                <div key={day.date} className="flex items-center justify-between px-4 py-3 hover:bg-secondary/20 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      day.consolidatedStatus === "present" ? "bg-success" : "bg-destructive"
                    )} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground tabular-nums">{day.date}</p>
                      {day.subjects.length > 0 && (
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                          {day.subjects.length <= 2
                            ? day.subjects.join(", ")
                            : `${day.subjects.slice(0, 2).join(", ")} +${day.subjects.length - 2} more`
                          }
                        </p>
                      )}
                    </div>
                  </div>
                  <StatusBadge variant={day.consolidatedStatus === "present" ? "success" : "destructive"}>
                    {day.consolidatedStatus === "present" ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                    {day.consolidatedStatus}
                  </StatusBadge>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Fee Info */}
        <div className="surface-elevated rounded-lg border border-border/50 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-border/50 bg-secondary/30">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <IndianRupee className="w-4 h-4" /> Fee Details
            </h3>
          </div>
          <div className="max-h-[300px] overflow-y-auto divide-y divide-border/50">
            {invoices.length === 0 && payments.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm italic">No fee records found.</div>
            ) : (
              <>
                {/* Payment History Section */}
                {payments.length > 0 && (
                  <>
                    <div className="px-4 py-2 bg-primary/5 border-b border-border/50">
                      <p className="text-[10px] font-bold text-primary uppercase tracking-wider flex items-center gap-1">
                        <Receipt className="w-3 h-3" /> Payment History
                      </p>
                    </div>
                    {payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-secondary/20 transition-colors">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(p.amount)}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground uppercase font-bold">{p.payment_method}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-muted-foreground tabular-nums">
                              {new Date(p.payment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                            {p.receipt_id && (
                              <span className="text-[10px] font-mono text-primary">#{p.receipt_id}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {/* Invoices Section */}
                {invoices.length > 0 && (
                  <>
                    <div className="px-4 py-2 bg-secondary/30 border-b border-border/50">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Invoices</p>
                    </div>
                    {invoices.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between px-4 py-3 hover:bg-secondary/20 transition-colors">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-foreground truncate">Invoice #{inv.id.substring(0, 8)}</p>
                          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">Due: {inv.due_date}</p>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <div className="text-right">
                            <p className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(inv.amount)}</p>
                          </div>
                          <StatusBadge variant={inv.status === "paid" ? "success" : inv.status === "pending" ? "warning" : "destructive"}>
                            {inv.status}
                          </StatusBadge>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Edit Student Profile Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Student Profile</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Student Name *</label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                placeholder="Enter full name"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Email</label>
                <Input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                  placeholder="email@example.com"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">GRN No</label>
                <Input
                  value={editForm.grnNo}
                  onChange={(e) => setEditForm({...editForm, grnNo: e.target.value})}
                  placeholder="GRN number"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Student Phone</label>
                <Input
                  type="tel"
                  value={editForm.studentPhone}
                  onChange={(e) => setEditForm({...editForm, studentPhone: e.target.value})}
                  placeholder="Student contact"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Mother's Phone</label>
                <Input
                  type="tel"
                  value={editForm.motherPhone}
                  onChange={(e) => setEditForm({...editForm, motherPhone: e.target.value})}
                  placeholder="Mother's contact"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Father's Phone</label>
                <Input
                  type="tel"
                  value={editForm.fatherPhone}
                  onChange={(e) => setEditForm({...editForm, fatherPhone: e.target.value})}
                  placeholder="Father's contact"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Guardian Name</label>
                <Input
                  value={editForm.guardianName}
                  onChange={(e) => setEditForm({...editForm, guardianName: e.target.value})}
                  placeholder="Guardian name"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Batch</label>
                <Select
                  value={editForm.batchId}
                  onValueChange={(v) => setEditForm({...editForm, batchId: v})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select batch" />
                  </SelectTrigger>
                  <SelectContent>
                    {batches.map((batch) => (
                      <SelectItem key={batch.id} value={batch.id}>
                        {batch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Status</label>
                <Select
                  value={editForm.status}
                  onValueChange={(v) => setEditForm({...editForm, status: v})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="alumni">Alumni</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateStudent} disabled={updating}>
              {updating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
