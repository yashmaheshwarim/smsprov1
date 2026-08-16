import { useParams, Link, useNavigate } from "react-router-dom";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, Phone, Mail, User, Calendar, 
  BookOpen, IndianRupee, Edit, Download, 
  Hash, CheckCircle2, XCircle, Loader2, Clock, Receipt, MessageCircle
} from "lucide-react";
import { useMemo, useEffect, useState, useRef } from "react";
import { supabase, isUuid } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
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
  guardian_name?: string;
  status: string;
  join_date: string;
  grn_no?: string;
  address?: string;
  home_address?: string;
  date_of_birth?: string;
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
  status: "present" | "absent" | "leave";
  subject?: string | null;
  type?: string | null;
  exam_name?: string | null;
}

interface ExamMarksRecord {
  exam_name: string;
  subject: string;
  marks_obtained: number;
  total_marks: number;
  is_absent: boolean;
  exam_date: string;
}

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const DEFAULT_UUID = "00000000-0000-0000-0000-000000000001";
  const instId = isAdmin ? (user as AdminUser).instituteId : DEFAULT_UUID;
  const navigate = useNavigate();

   const [student, setStudent] = useState<Student | null>(null);
   const [invoices, setInvoices] = useState<Invoice[]>([]);
   const [payments, setPayments] = useState<PaymentRecord[]>([]);
   const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
   const [examMarks, setExamMarks] = useState<ExamMarksRecord[]>([]);
   const [loading, setLoading] = useState(true);
   const [exporting, setExporting] = useState(false);
   const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
   const [editOpen, setEditOpen] = useState(false);
   const [batches, setBatches] = useState<{id: string, name: string}[]>([]);
   const [editForm, setEditForm] = useState({
     name: "",
     email: "",
     studentPhone: "",
     motherPhone: "",
     fatherPhone: "",
     batchId: "",
     status: "active",
     homeAddress: "",
     dateOfBirth: "",
     admissionDate: ""
   });
   const [updating, setUpdating] = useState(false);

   useEffect(() => {
     if (id && isUuid(id)) {
       fetchStudentData();
       fetchBatches();
       subscribeToRealtime();
     }
     return () => {
       if (realtimeRef.current) {
         supabase.removeChannel(realtimeRef.current);
         realtimeRef.current = null;
       }
     };
   }, [id]);

   // ── Realtime: keep attendance + marks live when another device (web or
   //    mobile) changes them. Without this the page would show stale data
   //    until a manual refresh.
   const subscribeToRealtime = () => {
     if (!id || !isUuid(id)) return;
     const channel = supabase
       .channel(`student-detail-realtime-${id}`)
       .on("postgres_changes", { event: "*", schema: "public", table: "attendance", filter: `student_id=eq.${id}` }, () => fetchStudentData())
       .on("postgres_changes", { event: "*", schema: "public", table: "exam_attendance", filter: `student_id=eq.${id}` }, () => fetchStudentData())
       .on("postgres_changes", { event: "*", schema: "public", table: "marks", filter: `student_id=eq.${id}` }, () => fetchStudentData())
       .subscribe();
     realtimeRef.current = channel;
   };

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

       // 3. Fetch Attendance (last 30 days) — both lecture and exam attendance
       const thirtyDaysAgo = new Date();
       thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
       const dateFrom = thirtyDaysAgo.toISOString().split("T")[0];

       // Fetch lecture attendance
       const { data: aData, error: aErr } = await supabase
         .from("attendance")
         .select("*")
         .eq("student_id", id)
         .gte("date", dateFrom)
         .order("date", { ascending: false });

       if (aErr) throw aErr;

       // Fetch exam attendance (using exam_date column)
       const { data: eaData, error: eaErr } = await supabase
         .from("exam_attendance")
         .select("*")
         .eq("student_id", id)
         .gte("exam_date", dateFrom)
         .order("exam_date", { ascending: false });

       if (eaErr) throw eaErr;

       // 3b. Fetch exam marks (all time — used by the Full Report PDF)
       const { data: marksData, error: mErr } = await supabase
         .from("marks")
         .select("exam_name, subject, marks_obtained, total_marks, is_absent, exam_date")
         .eq("student_id", id)
         .order("exam_date", { ascending: false });

       if (mErr) throw mErr;
       setExamMarks((marksData || []) as ExamMarksRecord[]);

       // Merge both — map exam_attendance records to same shape as attendance records
       // Use exam_date as the date field for exam attendance
       const lectureAtt = (aData || []).map((r: any) => ({
         id: r.id,
         date: r.date,
         status: r.status,
         subject: r.subject || null,
         type: 'lecture',
         exam_name: null,
       }));

       const examAtt = (eaData || []).map((r: any) => ({
         id: r.id,
         date: r.exam_date,
         status: r.status,
         subject: r.subject ? `${r.exam_name} (${r.subject})` : r.exam_name,
         type: 'exam',
         exam_name: r.exam_name,
       }));

       setAttendance([...lectureAtt, ...examAtt] as AttendanceRecord[]);

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
     // Format DOB from ISO to YYYY-MM-DD for input[type=date]
     const dob = student.date_of_birth
       ? student.date_of_birth.split('T')[0]
       : '';
     const joinDate = student.join_date
       ? student.join_date.split('T')[0]
       : '';
     setEditForm({
       name: student.name,
       email: student.email || "",
       studentPhone: student.student_phone || "",
       motherPhone: student.mother_phone || "",
       fatherPhone: student.father_phone || "",
       batchId: currentBatch?.id || "",
       status: student.status || "active",
       homeAddress: student.home_address || student.address || "",
       dateOfBirth: dob,
       admissionDate: joinDate
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

       // Date input returns YYYY-MM-DD format, store as-is
       const formattedDob = editForm.dateOfBirth || null;

       const { error } = await supabase
         .from("students")
         .update({
           name: editForm.name,
           email: editForm.email || null,
           student_phone: editForm.studentPhone || null,
           mother_phone: editForm.motherPhone || null,
           father_phone: editForm.fatherPhone || null,
           batch_id: editForm.batchId || null,
           batch_name: selectedBatch?.name || null,
           status: editForm.status,
           address: editForm.homeAddress || null,
           home_address: editForm.homeAddress || null,
           date_of_birth: formattedDob,
           join_date: editForm.admissionDate || null,
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

  // Deduplicate attendance by date — group multiple subject entries per day into
  // one consolidated row. Dates are normalised (strip any timestamp) so a date
  // from lecture attendance and the same date from exam attendance always merge,
  // and the result is sorted newest-first (the raw merge of lecture + exam rows
  // is not in date order).
  const deduplicatedAttendance = useMemo(() => {
    const dateMap = new Map<string, { statuses: string[]; subjects: string[] }>();

    attendance.forEach(record => {
      const day = String(record.date || "").split("T")[0];
      if (!day) return;
      const existing = dateMap.get(day);
      if (existing) {
        existing.statuses.push(record.status);
        if (record.subject) existing.subjects.push(record.subject);
      } else {
        dateMap.set(day, {
          statuses: [record.status],
          subjects: record.subject ? [record.subject] : []
        });
      }
    });

    const result: Array<{
      date: string;
      consolidatedStatus: "present" | "absent" | "leave";
      subjects: string[];
    }> = [];
    dateMap.forEach((group, day) => {
      result.push({
        date: day,
        consolidatedStatus: group.statuses.some(s => s === "present") ? "present" : group.statuses.some(s => s === "leave") ? "leave" : "absent",
        // Deduplicate subject names too, so the same subject never repeats on a day
        subjects: [...new Set(group.subjects)],
      });
    });

    result.sort((a, b) => b.date.localeCompare(a.date));
    return result;
  }, [attendance]);

  // Deduplicate exam marks by exam + subject + date — the same submission can
  // exist more than once in the DB (e.g. rows created before the unique index,
  // or a resubmission), and the PDF must show each exam subject only once.
  const dedupedExamMarks = useMemo(() => {
    const best = new Map<string, ExamMarksRecord>();
    examMarks.forEach(m => {
      const key = `${m.exam_name || ""}|${m.subject || ""}|${(m.exam_date || "").split("T")[0]}`;
      const existing = best.get(key);
      if (!existing) {
        best.set(key, m);
        return;
      }
      // Prefer the row that actually carries marks over a duplicate absent row
      const rank = (r: ExamMarksRecord) => (r.is_absent ? 0 : 1);
      if (rank(m) > rank(existing)) best.set(key, m);
    });
    return Array.from(best.values());
  }, [examMarks]);

  // Stats for attendance
  const attendanceStats = {
    present: deduplicatedAttendance.filter(r => r.consolidatedStatus === "present").length,
    absent: deduplicatedAttendance.filter(r => r.consolidatedStatus === "absent").length,
    leave: deduplicatedAttendance.filter(r => r.consolidatedStatus === "leave").length,
    percentage: deduplicatedAttendance.length > 0 
      ? Math.round((deduplicatedAttendance.filter(r => r.consolidatedStatus === "present").length / deduplicatedAttendance.length) * 100) 
      : 0
  };

  /**
   * Full Report PDF — Attendance summary (overall, deduplicated by date) +
   * Exam Marks, NO fees. Fetches all-time attendance separately from the
   * on-screen last-30-days report, and a date never repeats even when a
   * student has multiple subject rows that day.
   */
  const exportFullReport = async () => {
    if (!student) return;
    setExporting(true);
    try {
      // Fetch all-time attendance (lecture + exam) so the summary reflects the
      // student's overall record — the on-screen report only shows last 30 days.
      const [{ data: fullAttData }, { data: fullExamAttData }] = await Promise.all([
        supabase
          .from("attendance")
          .select("date, status, subject")
          .eq("student_id", student.id),
        supabase
          .from("exam_attendance")
          .select("exam_date, status, exam_name, subject")
          .eq("student_id", student.id),
      ]);

      // Merge + dedupe by date (dates normalised so lecture/exam rows merge),
      // present wins over leave/absent.
      const dayMap = new Map<string, { statuses: string[] }>();
      const pushDay = (date: string, status: string) => {
        const day = String(date || "").split("T")[0];
        if (!day) return;
        const existing = dayMap.get(day);
        if (existing) existing.statuses.push(status);
        else dayMap.set(day, { statuses: [status] });
      };
      (fullAttData || []).forEach((r: any) => pushDay(r.date, r.status));
      (fullExamAttData || []).forEach((r: any) => pushDay(r.exam_date, r.status));

      let overallPresent = 0;
      let overallAbsent = 0;
      let overallLeave = 0;
      dayMap.forEach((group) => {
        if (group.statuses.some((s) => s === "present")) overallPresent++;
        else if (group.statuses.some((s) => s === "leave")) overallLeave++;
        else overallAbsent++;
      });
      const overallTotal = dayMap.size;
      const overallPct = overallTotal > 0 ? Math.round((overallPresent / overallTotal) * 100) : 0;

      // Marks are already fetched in state (all-time) and deduplicated by
      // exam+subject+date so a repeated submission never shows twice.
      const marksRows = dedupedExamMarks.map(m => ({
        exam: m.exam_name || "Exam",
        subject: m.subject || "N/A",
        obtained: m.is_absent ? "AB" : String(m.marks_obtained ?? 0),
        total: m.total_marks ?? 0,
        date: (m.exam_date || "").split("T")[0],
      }));

      const doc = new jsPDF('l', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;

      // ── Header ──
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text("Student Full Report", pageWidth / 2, 16, { align: 'center' });
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(student.name, pageWidth / 2, 23, { align: 'center' });
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100);
      doc.text(`Enrollment: ${student.enrollment_no}  |  Batch: ${student.batch_name || "N/A"}  |  GRN: ${student.grn_no || "N/A"}`, pageWidth / 2, 29, { align: 'center' });
      doc.text(`Generated: ${new Date().toLocaleString("en-IN")}`, pageWidth / 2, 34, { align: 'center' });
      doc.setTextColor(0);

      // ── Attendance Summary (Overall) ──
      let y = 40;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 60, 120);
      doc.text("ATTENDANCE SUMMARY (OVERALL)", margin, y);
      doc.setTextColor(0);
      doc.setFont('helvetica', 'normal');
      autoTable(doc, {
        startY: y + 3,
        margin: { left: margin, right: margin },
        head: [["Present", "Absent", "Leave", "Total Days", "Attendance %"]],
        body: [[
          String(overallPresent),
          String(overallAbsent),
          String(overallLeave),
          String(overallTotal),
          `${overallPct}%`,
        ]],
        styles: { fontSize: 9, halign: 'center', cellPadding: 2 },
        headStyles: { fillColor: [60, 80, 120], textColor: [255, 255, 255], fontSize: 8 },
      });

      // ── Exam Marks ──
      y = (doc as any).lastAutoTable.finalY + 6;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 60, 120);
      doc.text("EXAM MARKS", margin, y);
      doc.setTextColor(0);
      doc.setFont('helvetica', 'normal');
      const marksBody = marksRows.length > 0
        ? marksRows.map(r => [r.date, r.exam, r.subject, r.obtained, r.total, r.obtained !== "AB" && r.total > 0 ? `${((Number(r.obtained) / r.total) * 100).toFixed(1)}%` : "—"])
        : [["—", "No exam marks recorded", "", "", "", ""]];
      autoTable(doc, {
        startY: y + 3,
        margin: { left: margin, right: margin },
        head: [["Date", "Exam", "Subject", "Obtained", "Total", "%"]],
        body: marksBody,
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [60, 80, 120], textColor: [255, 255, 255], fontSize: 8 },
      });

      // ── Footer on every page ──
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(150);
        doc.text(
          `Generated on ${new Date().toLocaleDateString("en-IN")} | Powered by Maheshwari Tech | Page ${i} of ${pageCount}`,
          pageWidth / 2,
          pageHeight - 8,
          { align: 'center' }
        );
      }

      const safeName = student.name.replace(/[^a-zA-Z0-9]+/g, "_") || "Student";
      doc.save(`Full_Report_${safeName}_${new Date().toISOString().split("T")[0]}.pdf`);
      toast({ title: "Full Report Downloaded", description: "Attendance + Exam Marks report downloaded (fees excluded)." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setExporting(false);
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

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <Link to="/students" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" /> Back to Students
        </Link>
         <div className="flex items-center gap-2">
           <Button variant="outline" size="sm" className="h-9" onClick={() => void exportFullReport()} disabled={exporting}>
             {exporting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />} Full Report
           </Button>
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
              <span className="text-[10px] font-bold text-warning px-1.5 py-0.5 rounded bg-warning/10">{attendanceStats.leave} L</span>
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
                      day.consolidatedStatus === "present" ? "bg-success" : day.consolidatedStatus === "leave" ? "bg-warning" : "bg-destructive"
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
                  <StatusBadge variant={day.consolidatedStatus === "present" ? "success" : day.consolidatedStatus === "leave" ? "warning" : "destructive"}>
                    {day.consolidatedStatus === "present" ? <CheckCircle2 className="w-3 h-3 mr-1" /> : day.consolidatedStatus === "leave" ? <Calendar className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                    {day.consolidatedStatus === "leave" ? "Leave" : day.consolidatedStatus}
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
            <Button
              size="sm"
              variant="default"
              onClick={() => navigate(`/fees/student?q=${encodeURIComponent(student.enrollment_no || student.name)}`)}
              className="h-7 text-xs shadow-sm"
            >
              <IndianRupee className="w-3 h-3 mr-1" />
              Pay Fees
            </Button>
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
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Edit Student Profile</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Full Name *</label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                placeholder="John Doe"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Phone Numbers</label>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Mother</label>
                  <Input
                    type="tel"
                    value={editForm.motherPhone}
                    onChange={(e) => setEditForm({...editForm, motherPhone: e.target.value})}
                    placeholder="+91 XXXXX"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Father</label>
                  <Input
                    type="tel"
                    value={editForm.fatherPhone}
                    onChange={(e) => setEditForm({...editForm, fatherPhone: e.target.value})}
                    placeholder="+91 XXXXX"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Student</label>
                  <Input
                    type="tel"
                    value={editForm.studentPhone}
                    onChange={(e) => setEditForm({...editForm, studentPhone: e.target.value})}
                    placeholder="+91 XXXXX"
                  />
                </div>
              </div>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Email Address</label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                placeholder="john@example.com"
              />
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
            <div className="grid gap-2">
              <label className="text-sm font-medium">Address</label>
              <textarea
                value={editForm.homeAddress}
                onChange={(e) => setEditForm({...editForm, homeAddress: e.target.value})}
                placeholder="Enter full home address"
                className="w-full min-h-[60px] px-3 py-2 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 resize-y"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Date of Birth</label>
                <Input
                  type="date"
                  value={editForm.dateOfBirth}
                  onChange={(e) => setEditForm({...editForm, dateOfBirth: e.target.value})}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">
                  Admission Date
                  <span className="text-xs text-muted-foreground font-normal ml-1">(Optional)</span>
                </label>
                <Input
                  type="date"
                  value={editForm.admissionDate}
                  onChange={(e) => setEditForm({...editForm, admissionDate: e.target.value})}
                />
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
