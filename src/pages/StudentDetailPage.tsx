import { useParams, Link } from "react-router-dom";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, Phone, Mail, User, Calendar, 
  BookOpen, IndianRupee, Edit, Download, 
  Hash, CheckCircle2, XCircle, Loader2, Clock
} from "lucide-react";
import { useMemo, useEffect, useState } from "react";
import { supabase, isUuid } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface Student {
  id: string;
  name: string;
  enrollment_no: string;
  batch_name: string;
  phone: string;
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

interface AttendanceRecord {
  id: string;
  date: string;
  status: "present" | "absent";
}

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const DEFAULT_UUID = "00000000-0000-0000-0000-000000000001";
  const instId = isAdmin ? (user as AdminUser).instituteId : DEFAULT_UUID;

  const [student, setStudent] = useState<Student | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id && isUuid(id)) {
      fetchStudentData();
    }
  }, [id]);

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

      // 3. Fetch Attendance
      const { data: aData, error: aErr } = await supabase
        .from("attendance")
        .select("*")
        .eq("student_id", id)
        .order("date", { ascending: false })
        .limit(30); // Show last 30 days

      if (aErr) throw aErr;
      setAttendance(aData || []);

    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
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

  // Stats for attendance
  const attendanceStats = {
    present: attendance.filter(r => r.status === "present").length,
    absent: attendance.filter(r => r.status === "absent").length,
    percentage: attendance.length > 0 
      ? Math.round((attendance.filter(r => r.status === "present").length / attendance.length) * 100) 
      : 0
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <Link to="/students" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" /> Back to Students
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9"><Download className="w-4 h-4 mr-1" /> Export Profile</Button>
          <Button size="sm" className="h-9 shadow-md"><Edit className="w-4 h-4 mr-1" /> Edit Profile</Button>
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
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Phone</p>
              <p className="text-sm font-semibold text-foreground tabular-nums">{student.phone}</p>
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
            {attendance.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm italic">No attendance records found.</div>
            ) : (
              attendance.map((record) => (
                <div key={record.id} className="flex items-center justify-between px-4 py-3 hover:bg-secondary/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      record.status === "present" ? "bg-success" : "bg-destructive"
                    )} />
                    <p className="text-sm font-medium text-foreground tabular-nums">{record.date}</p>
                  </div>
                  <StatusBadge variant={record.status === "present" ? "success" : "destructive"}>
                    {record.status === "present" ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                    {record.status}
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
            {invoices.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm italic">No fee records found.</div>
            ) : (
              invoices.map((inv) => (
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
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
