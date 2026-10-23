import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Layers, Plus, Edit, Trash2, Users, Loader2, Search, X, Download, BarChart3 } from "lucide-react";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { DataImportDialog } from "@/components/shared/DataImportDialog";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Batch {
  id: string;
  name: string;
  class_name: string;
  studentCount: number;
  subjects: string[];
  status: "active" | "archived";
  createdAt: string;
}

interface BatchStudent {
  id: string;
  name: string;
  enrollment_no: string;
  status: "active" | "inactive" | "graduated";
  created_at: string;
}

// Initial batches are now handled via Supabase.


import { useAuth, AdminUser } from "@/contexts/AuthContext";

export default function BatchManagementPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const DEFAULT_UUID = "00000000-0000-0000-0000-000000000001";
  const instId = isAdmin ? (user as AdminUser).instituteId : DEFAULT_UUID;

  const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);


  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [batchStudents, setBatchStudents] = useState<BatchStudent[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [searchStudents, setSearchStudents] = useState("");
  const [studentPage, setStudentPage] = useState(0);
  const STUDENT_PAGE_SIZE = 15;
  const [batchPage, setBatchPage] = useState(0);
  const BATCH_PAGE_SIZE = 9;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", class: "", subjects: "" });

  useEffect(() => {
    if (isUuid(instId)) {
      fetchBatches();
    } else {
      setLoading(false);
      setBatches([]);
    }
  }, [instId]);


  const fetchBatches = async () => {
    setLoading(true);

    // First, get all batches
    const { data: batchesData, error: batchesError } = await supabase
      .from('batches')
      .select('*')
      .eq('institute_id', instId)
      .order('created_at', { ascending: false });

    if (batchesError) {
      toast({ title: "Error", description: batchesError.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    // Then, get student counts for each batch
    const batchesWithCounts = await Promise.all(
      (batchesData || []).map(async (batch: any) => {
        const { count, error: countError } = await supabase
          .from('students')
          .select('*', { count: 'exact', head: true })
          .eq('institute_id', instId)
          .eq('batch_id', batch.id)
          .eq('status', 'active');

        return {
          id: batch.id,
          name: batch.name,
          class_name: batch.class_name,
          subjects: batch.subjects || [],
          status: batch.status,
          studentCount: countError ? 0 : (count || 0),
          createdAt: new Date(batch.created_at).toLocaleDateString("en-IN"),
        };
      })
    );

    setBatches(batchesWithCounts);
    setBatchPage(0);
    setLoading(false);
  };

  const fetchBatchStudents = async (batchId: string) => {
    setLoadingStudents(true);
    try {
      const { data, error } = await supabase
        .from("students")
        .select("id, name, enrollment_no, status, created_at")
        .eq("institute_id", instId)
        .eq("batch_id", batchId)
        .order("name", { ascending: true });

      if (error) throw error;
      setBatchStudents(data || []);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setBatchStudents([]);
    } finally {
      setLoadingStudents(false);
    }
  };

  const handleBatchClick = (batch: Batch) => {
    if (selectedBatch?.id === batch.id) {
      // Deselect if same batch clicked again
      setSelectedBatch(null);
      setBatchStudents([]);
      setSearchStudents("");
      setStudentPage(0);
    } else {
      setSelectedBatch(batch);
      setSearchStudents("");
      setStudentPage(0);
      fetchBatchStudents(batch.id);
    }
  };

  const filteredStudents = useMemo(() => {
    if (!searchStudents) return batchStudents;
    const search = searchStudents.toLowerCase();
    return batchStudents.filter(
      s =>
        s.name.toLowerCase().includes(search) ||
        s.enrollment_no.toLowerCase().includes(search)
    );
  }, [batchStudents, searchStudents]);

  const paginatedStudents = useMemo(() => {
    const start = studentPage * STUDENT_PAGE_SIZE;
    return filteredStudents.slice(start, start + STUDENT_PAGE_SIZE);
  }, [filteredStudents, studentPage]);

  const studentTotalPages = Math.max(1, Math.ceil(filteredStudents.length / STUDENT_PAGE_SIZE));

  const paginatedBatches = useMemo(() => {
    const start = batchPage * BATCH_PAGE_SIZE;
    return batches.slice(start, start + BATCH_PAGE_SIZE);
  }, [batches, batchPage]);

  const batchTotalPages = Math.max(1, Math.ceil(batches.length / BATCH_PAGE_SIZE));

  const studentColumns = [
    {
      key: "name",
      title: "Student Name",
      render: (student: BatchStudent) => (
        <div>
          <p className="text-sm font-semibold">{student.name}</p>
          <p className="text-[10px] text-muted-foreground uppercase">{student.enrollment_no}</p>
        </div>
      ),
    },
    {
      key: "enrollment_no",
      title: "Enrollment No",
      render: (student: BatchStudent) => <span className="text-sm tabular-nums">{student.enrollment_no}</span>,
    },
    {
      key: "status",
      title: "Status",
      render: (student: BatchStudent) => (
        <StatusBadge variant={student.status === "active" ? "success" : "default"}>{student.status}</StatusBadge>
      ),
    },
    {
      key: "created_at",
      title: "Joined",
      render: (student: BatchStudent) => (
        <span className="text-xs text-muted-foreground">{new Date(student.created_at).toLocaleDateString()}</span>
      ),
    },
  ];

  const openAdd = () => {
    setEditingId(null);
    setForm({ name: "", class: "", subjects: "" });
    setDialogOpen(true);
  };

  const openEdit = (b: Batch) => {
    setEditingId(b.id);
    setForm({ name: b.name, class: b.class_name, subjects: b.subjects.join(", ") });
    setDialogOpen(true);
  };


  const handleSave = async () => {
    if (!form.name || !form.class) {
      toast({ title: "Error", description: "Batch name and class are required.", variant: "destructive" });
      return;
    }
    const subjects = form.subjects.split(",").map(s => s.trim()).filter(Boolean);
    
    if (editingId) {
      const { error } = await supabase
        .from('batches')
        .update({ name: form.name, class_name: form.class, subjects })
        .eq('id', editingId);

      if (error) {
        toast({ title: "Update Failed", description: error.message, variant: "destructive" });
        return;
      }

      setBatches(prev => prev.map(b => b.id === editingId ? { ...b, name: form.name, class_name: form.class, subjects } : b));
      toast({ title: "Updated", description: `${form.name} updated.` });
    } else {
      const { data, error } = await supabase
        .from('batches')
        .insert([{ institute_id: instId, name: form.name, class_name: form.class, subjects, status: "active" }])
        .select()
        .single();

      if (error) {
        toast({ title: "Creation Failed", description: error.message, variant: "destructive" });
        return;
      }

      const newBatch: Batch = {
        id: data.id,
        name: data.name,
        class_name: data.class_name,
        subjects: data.subjects,
        studentCount: 0,
        status: data.status,
        createdAt: new Date(data.created_at).toLocaleDateString("en-IN"),
      };

      setBatches(prev => [newBatch, ...prev]);
      setBatchPage(0);
      toast({ title: "Created", description: `Batch "${form.name}" created.` });
    }
    setDialogOpen(false);
  };


  const deleteBatch = async (id: string) => {
    const { error } = await supabase.from('batches').delete().eq('id', id);
    if (error) {
      toast({ title: "Delete Failed", description: error.message, variant: "destructive" });
      return;
    }
    setBatches(prev => prev.filter(b => b.id !== id));
    toast({ title: "Deleted", description: "Batch removed." });
  };

  const toggleArchive = async (id: string) => {
    const batch = batches.find(b => b.id === id);
    if (!batch) return;
    const newStatus = batch.status === "active" ? "archived" : "active";

    const { error } = await supabase.from('batches').update({ status: newStatus }).eq('id', id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    setBatches(prev => prev.map(b => b.id === id ? { ...b, status: newStatus } : b));
  };

  // ── Batch Reports ───────────────────────────────────────────────────────
  const [exportingBatch, setExportingBatch] = useState<string | null>(null);

  interface StudentAttSummary {
    total: number;
    present: number;
    absent: number;
    leave: number;
    monthly: Array<{ month: string; present: number; absent: number; leave: number; total: number; pct: number }>;
  }

  interface StudentReport {
    id: string;
    name: string;
    enrollment_no: string;
    att: StudentAttSummary;
    attPct: number;
    examAvg: number | null;
    subjectGroups: Array<{ subject: string; rows: Array<{ exam: string; date: string; obtained: string; total: number }> }>;
  }

  /** Fetch every active student of a batch + their all-time attendance and marks. */
  const fetchBatchReportData = async (batchId: string) => {
    // Chunk .in() queries so large batches never exceed URL/query limits
    const chunk = <T,>(arr: T[], size: number): T[][] => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    };

    const { data: students, error: sErr } = await supabase
      .from("students")
      .select("id, name, enrollment_no, status, batch_name")
      .eq("batch_id", batchId)
      .eq("status", "active")
      .order("name");
    if (sErr) throw sErr;
    const studentList = students || [];
    const ids = studentList.map(s => s.id);
    if (ids.length === 0) throw new Error("No active students in this batch.");

    const fetchChunked = async (table: string, cols: string, dateCol: string) => {
      const results: any[] = [];
      for (const part of chunk(ids, 100)) {
        const { data, error } = await supabase.from(table).select(cols).in("student_id", part);
        if (error) throw error;
        if (data) results.push(...data);
      }
      // Normalize date fields
      return results.map((r: any) => ({
        ...r,
        date: String(r[dateCol] || "").split("T")[0],
      }));
    };

    const [attendance, examAttendance, marks] = await Promise.all([
      fetchChunked("attendance", "student_id, date, status", "date"),
      fetchChunked("exam_attendance", "student_id, exam_date, status", "exam_date"),
      fetchChunked("marks", "student_id, exam_name, subject, marks_obtained, total_marks, is_absent, exam_date", "exam_date"),
    ]);

    return { studentList, attendance, examAttendance, marks };
  };

  /** Build per-student summaries from the raw rows (dedupe days by date, present wins). */
  const buildStudentReport = (
    s: { id: string; name: string; enrollment_no: string },
    attendance: any[],
    examAttendance: any[],
    marks: any[]
  ): StudentReport => {
    // Days: merge lecture + exam attendance per date; present > leave > absent
    const dayMap = new Map<string, string[]>();
    attendance.filter(r => r.student_id === s.id).forEach((r: any) => {
      const list = dayMap.get(r.date) || [];
      list.push(r.status);
      dayMap.set(r.date, list);
    });
    examAttendance.filter(r => r.student_id === s.id).forEach((r: any) => {
      const list = dayMap.get(r.date) || [];
      list.push(r.status);
      dayMap.set(r.date, list);
    });

    const monthly = new Map<string, { present: number; absent: number; leave: number }>();
    let present = 0, absent = 0, leave = 0;
    dayMap.forEach((statuses, day) => {
      let bucket: "present" | "leave" | "absent" = "absent";
      if (statuses.some(st => st === "present" || st === "late" || st === "half-day")) bucket = "present";
      else if (statuses.some(st => st === "leave")) bucket = "leave";
      if (bucket === "present") present++; else if (bucket === "leave") leave++; else absent++;
      const month = day.slice(0, 7);
      const agg = monthly.get(month) ?? { present: 0, absent: 0, leave: 0 };
      if (bucket === "present") agg.present++; else if (bucket === "leave") agg.leave++; else agg.absent++;
      monthly.set(month, agg);
    });

    const total = present + absent + leave;
    const monthlyRows = Array.from(monthly.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, m]) => {
        const mTotal = m.present + m.absent + m.leave;
        return {
          month: new Date(`${month}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "numeric" }),
          present: m.present,
          absent: m.absent,
          leave: m.leave,
          total: mTotal,
          pct: mTotal > 0 ? Math.round((m.present / mTotal) * 100) : 0,
        };
      });

    // Marks: dedupe by exam+subject+date, group by SUBJECT with each exam as a row
    const seen = new Set<string>();
    const subjectGroups = new Map<string, Array<{ exam: string; date: string; obtained: string; total: number }>>();
    const weighted: Array<{ obtained: number; total: number }> = [];
    marks.filter(r => r.student_id === s.id).forEach((m: any) => {
      const date = String(m.exam_date || "").split("T")[0];
      const key = `${m.exam_name || ""}|${m.subject || ""}|${date}`;
      if (seen.has(key)) return;
      seen.add(key);
      const obtained = m.is_absent ? "AB" : String(m.marks_obtained ?? 0);
      const totalMarks = Number(m.total_marks || 0);
      const list = subjectGroups.get(m.subject || "N/A") || [];
      list.push({ exam: m.exam_name || "Exam", date, obtained, total: totalMarks });
      subjectGroups.set(m.subject || "N/A", list);
      if (!m.is_absent && totalMarks > 0) weighted.push({ obtained: Number(m.marks_obtained ?? 0), total: totalMarks });
    });

    const groups = Array.from(subjectGroups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([subject, rows]) => ({ subject, rows: rows.sort((a, b) => a.date.localeCompare(b.date)) }));

    const examAvg = weighted.length > 0
      ? Math.round(
          (weighted.reduce((sum, w) => sum + (w.obtained / w.total) * 100, 0) / weighted.length) * 10
        ) / 10
      : null;

    return {
      id: s.id,
      name: s.name,
      enrollment_no: s.enrollment_no,
      att: {
        total,
        present,
        absent,
        leave,
        monthly: monthlyRows,
      },
      attPct: total > 0 ? Math.round((present / total) * 100) : 0,
      examAvg,
      subjectGroups: groups,
    };
  };

  /**
   * Download a batch report as PDF.
   * - full: one section per student (month-wise attendance + subject-grouped exam results)
   * - progress: single table with attendance % and average exam % per student
   */
  const exportBatchReport = async (batch: Batch, mode: "full" | "progress") => {
    setExportingBatch(batch.id);
    try {
      const { studentList, attendance, examAttendance, marks } = await fetchBatchReportData(batch.id);
      const reports = studentList.map(s => buildStudentReport(s, attendance, examAttendance, marks));

      const doc = new jsPDF(mode === "full" ? "l" : "p", "mm", "a4");
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;

      const header = (title: string, y: number) => {
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text(title, pageWidth / 2, y, { align: "center" });
        doc.setFontSize(12);
        doc.text(batch.name, pageWidth / 2, y + 7, { align: "center" });
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100);
        doc.text(`Class: ${batch.class_name || "N/A"}  |  Students: ${reports.length}  |  Generated: ${new Date().toLocaleString("en-IN")}`, pageWidth / 2, y + 13, { align: "center" });
        doc.setTextColor(0);
        return y + 19;
      };

      let y = header(mode === "full" ? "Batch Full Report" : "Batch Progress Report", 16);

      if (reports.length === 0) {
        doc.setFontSize(10);
        doc.text("No active students in this batch.", margin, y);
      } else if (mode === "progress") {
        // ── Progress report: one row per student ──
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 60, 120);
        doc.text("STUDENT PROGRESS SUMMARY", margin, y);
        doc.setTextColor(0);
        doc.setFont("helvetica", "normal");

        const body = reports.map((r, i) => [
          String(i + 1),
          r.name,
          r.enrollment_no,
          String(r.att.total),
          String(r.att.present),
          String(r.att.absent),
          String(r.att.leave),
          `${r.attPct}%`,
          r.examAvg === null ? "—" : `${r.examAvg}%`,
        ]);
        const sum = (key: keyof StudentAttSummary) => reports.reduce((s, r) => s + (r.att[key] as number), 0);
        autoTable(doc, {
          startY: y + 5,
          margin: { left: margin, right: margin },
          head: [["#", "Student", "Enrollment", "Days", "Present", "Absent", "Leave", "Attendance %", "Exam Avg %"]],
          body,
          foot: [["", "Overall", "", String(sum("total")), String(sum("present")), String(sum("absent")), String(sum("leave")), "", ""]],
          styles: { fontSize: 9, halign: "center", cellPadding: 2 },
          columnStyles: { 1: { halign: "left" } },
          headStyles: { fillColor: [60, 80, 120], textColor: [255, 255, 255], fontSize: 8 },
          footStyles: { fillColor: [226, 232, 240], textColor: [0, 0, 0], fontSize: 9, halign: "center", fontStyle: "bold" },
        });
      } else {
        // ── Full report: one section per student ──
        let firstStudent = true;
        for (const r of reports) {
          y = firstStudent ? y + 4 : (doc as any).lastAutoTable.finalY + 10;
          firstStudent = false;
          if (y > pageHeight - 40) {
            doc.addPage();
            y = 20;
          }
          doc.setFontSize(12);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(30, 60, 120);
          doc.text(`${r.name}  (${r.enrollment_no})`, margin, y);
          doc.setTextColor(0);
          doc.setFont("helvetica", "normal");

          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.text(
            `Attendance: ${r.att.present}P / ${r.att.absent}A / ${r.att.leave}L  —  ${r.attPct}%   |   Exam Average: ${r.examAvg === null ? "—" : `${r.examAvg}%`}`,
            margin,
            y + 5
          );
          doc.setFont("helvetica", "normal");

          autoTable(doc, {
            startY: y + 8,
            margin: { left: margin, right: margin },
            head: [["Month", "Present", "Absent", "Leave", "Total Days", "Attendance %"]],
            body: r.att.monthly.map(m => [m.month, String(m.present), String(m.absent), String(m.leave), String(m.total), `${m.pct}%`]),
            foot: [["Total", String(r.att.present), String(r.att.absent), String(r.att.leave), String(r.att.total), `${r.attPct}%`]],
            styles: { fontSize: 9, halign: "center", cellPadding: 2 },
            headStyles: { fillColor: [60, 80, 120], textColor: [255, 255, 255], fontSize: 8 },
            footStyles: { fillColor: [226, 232, 240], textColor: [0, 0, 0], fontSize: 9, halign: "center", fontStyle: "bold" },
          });

          let firstSubject = true;
          for (const group of r.subjectGroups) {
            y = firstSubject ? (doc as any).lastAutoTable.finalY + 6 : (doc as any).lastAutoTable.finalY + 6;
            firstSubject = false;
            if (y > pageHeight - 50) {
              doc.addPage();
              y = 20;
            }
            doc.setFontSize(10);
            doc.setFont("helvetica", "bold");
            doc.text(`${group.subject} — Exam Results`, margin, y);
            doc.setFont("helvetica", "normal");
            const sumObtained = group.rows.reduce((s2, row) => s2 + (row.obtained !== "AB" ? Number(row.obtained) : 0), 0);
            const sumTotal = group.rows.reduce((s2, row) => s2 + row.total, 0);
            autoTable(doc, {
              startY: y + 4,
              margin: { left: margin, right: margin },
              head: [["Exam", "Exam Date", "Obtained", "Total", "%"]],
              body: group.rows.map(row => [
                row.exam,
                row.date || "N/A",
                row.obtained,
                String(row.total),
                row.obtained !== "AB" && row.total > 0 ? `${((Number(row.obtained) / row.total) * 100).toFixed(1)}%` : "—",
              ]),
              foot: [["Subject Total", "", String(sumObtained), String(sumTotal), sumTotal > 0 ? `${((sumObtained / sumTotal) * 100).toFixed(1)}%` : "—"]],
              styles: { fontSize: 9, halign: "center", cellPadding: 2 },
              headStyles: { fillColor: [60, 80, 120], textColor: [255, 255, 255], fontSize: 8 },
              footStyles: { fillColor: [226, 232, 240], textColor: [0, 0, 0], fontSize: 9, halign: "center", fontStyle: "bold" },
            });
          }
          if (r.subjectGroups.length === 0) {
            y = (doc as any).lastAutoTable.finalY + 6;
            if (y > pageHeight - 50) {
              doc.addPage();
              y = 20;
            }
            autoTable(doc, {
              startY: y,
              margin: { left: margin, right: margin },
              head: [["Exam", "Exam Date", "Obtained", "Total", "%"]],
              body: [["No exam marks recorded", "", "", "", ""]],
              styles: { fontSize: 9, cellPadding: 2 },
              headStyles: { fillColor: [60, 80, 120], textColor: [255, 255, 255], fontSize: 8 },
            });
          }
        }
      }

      // Footer on every page
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(150);
        doc.text(
          `Generated on ${new Date().toLocaleDateString("en-IN")} | Powered by Maheshwari Tech | Page ${i} of ${pageCount}`,
          pageWidth / 2,
          pageHeight - 8,
          { align: "center" }
        );
      }

      const safeName = batch.name.replace(/[^a-zA-Z0-9]+/g, "_") || "Batch";
      doc.save(`${mode === "full" ? "Full" : "Progress"}_Report_${safeName}_${new Date().toISOString().split("T")[0]}.pdf`);
      toast({
        title: mode === "full" ? "Batch Full Report Downloaded" : "Batch Progress Report Downloaded",
        description: `${reports.length} student${reports.length === 1 ? "" : "s"} included in the PDF.`,
      });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Could not generate batch report.", variant: "destructive" });
    } finally {
      setExportingBatch(null);
    }
  };


  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Batch Management</h2>
          <p className="text-sm text-muted-foreground">Create and customize your own batches and classes</p>
        </div>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
          <DataImportDialog type="batches" instituteId={instId} onSuccess={fetchBatches} />
          <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Create Batch</Button>
        </div>

      </div>

      <div className="p-3 rounded-md bg-primary/5 border border-primary/20">
        <p className="text-xs text-foreground">
          <strong>💡 Tip:</strong> Create custom batches based on your institute's needs. You can organize by class, exam type, or any custom grouping.
          Assign students and teachers to batches for organized management.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {paginatedBatches.map(batch => (
          <div
            key={batch.id}
            className={`surface-elevated rounded-lg p-4 cursor-pointer transition-all ${
              selectedBatch?.id === batch.id ? "ring-2 ring-primary" : "hover:bg-secondary/30"
            }`}
            onClick={() => handleBatchClick(batch)}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">{batch.name}</h3>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Class: {batch.class_name}</p>
              </div>
              <StatusBadge variant={batch.status === "active" ? "success" : "default"}>{batch.status}</StatusBadge>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <Users className="w-3.5 h-3.5" />
              <span>{batch.studentCount} students</span>
            </div>
            <div className="flex flex-wrap gap-1 mb-3">
              {batch.subjects.map(s => (
                <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">{s}</span>
              ))}
            </div>
            <div className="flex flex-wrap gap-1 pt-2 border-t border-border" onClick={(e) => e.stopPropagation()}>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openEdit(batch)}><Edit className="w-3 h-3 mr-1" /> Edit</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => toggleArchive(batch.id)}>
                {batch.status === "active" ? "Archive" : "Activate"}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => deleteBatch(batch.id)}><Trash2 className="w-3 h-3 mr-1" /> Delete</Button>
            </div>
            {/* Batch-wise report downloads */}
            <div className="flex flex-wrap gap-1 pt-2 mt-2 border-t border-border" onClick={(e) => e.stopPropagation()}>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-primary"
                onClick={() => exportBatchReport(batch, "full")}
                disabled={!!exportingBatch}
                title="Download the batch full report: per-student attendance + exam results PDF"
              >
                {exportingBatch === batch.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
                Full Report
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-primary"
                onClick={() => exportBatchReport(batch, "progress")}
                disabled={!!exportingBatch}
                title="Download the batch progress report: per-student attendance % and exam average PDF"
              >
                <BarChart3 className="w-3 h-3 mr-1" />
                Progress Report
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Batch Pagination Controls */}
      {batchTotalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-muted-foreground">
            Showing {batchPage * BATCH_PAGE_SIZE + 1}–{Math.min((batchPage + 1) * BATCH_PAGE_SIZE, batches.length)} of {batches.length} batches
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setBatchPage(p => Math.max(0, p - 1))}
              disabled={batchPage === 0}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card text-foreground hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            {Array.from({ length: batchTotalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => setBatchPage(i)}
                className={`w-7 h-7 text-xs font-medium rounded-md transition-colors ${
                  i === batchPage
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                {i + 1}
              </button>
            ))}
            <button
              onClick={() => setBatchPage(p => Math.min(batchTotalPages - 1, p + 1))}
              disabled={batchPage >= batchTotalPages - 1}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card text-foreground hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Student List Section */}
      {selectedBatch && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSelectedBatch(null);
                  setBatchStudents([]);
                  setSearchStudents("");
                }}
              >
                <X className="w-4 h-4 mr-1" />
                Back
              </Button>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Students in {selectedBatch.name}</h3>
              <p className="text-sm text-muted-foreground">Class: {selectedBatch.class_name}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-9"
                onClick={() => exportBatchReport(selectedBatch, "full")}
                disabled={!!exportingBatch}
              >
                {exportingBatch === selectedBatch.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
                Full Report
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9"
                onClick={() => exportBatchReport(selectedBatch, "progress")}
                disabled={!!exportingBatch}
              >
                <BarChart3 className="w-4 h-4 mr-1" />
                Progress Report
              </Button>
            </div>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
              placeholder="Search students..."
              value={searchStudents}
              onChange={(e) => { setSearchStudents(e.target.value); setStudentPage(0); }}
                className="pl-9"
              />
            </div>
          </div>

          {loadingStudents ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              Loading students...
            </div>
          ) : (
            <>
              <DataTable
                columns={studentColumns}
                data={paginatedStudents}
                emptyMessage="No students enrolled in this batch."
              />

              {studentTotalPages > 1 && (
                <div className="flex items-center justify-between px-1 pt-3">
                  <p className="text-xs text-muted-foreground">
                    Showing {studentPage * STUDENT_PAGE_SIZE + 1}–{Math.min((studentPage + 1) * STUDENT_PAGE_SIZE, filteredStudents.length)} of {filteredStudents.length} students
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setStudentPage(p => Math.max(0, p - 1))}
                      disabled={studentPage === 0}
                      className="px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card text-foreground hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    {Array.from({ length: studentTotalPages }, (_, i) => (
                      <button
                        key={i}
                        onClick={() => setStudentPage(i)}
                        className={`w-7 h-7 text-xs font-medium rounded-md transition-colors ${
                          i === studentPage
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <button
                      onClick={() => setStudentPage(p => Math.min(studentTotalPages - 1, p + 1))}
                      disabled={studentPage >= studentTotalPages - 1}
                      className="px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card text-foreground hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
 
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "Edit Batch" : "Create New Batch"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs font-medium text-foreground">Batch Name</label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g., JEE 2026 - Batch A" /></div>
            <div><label className="text-xs font-medium text-foreground">Class / Standard</label><Input value={form.class} onChange={e => setForm(p => ({ ...p, class: e.target.value }))} placeholder="e.g., 12th Science, 10th, etc." /></div>
            <div><label className="text-xs font-medium text-foreground">Subjects (comma separated)</label><Input value={form.subjects} onChange={e => setForm(p => ({ ...p, subjects: e.target.value }))} placeholder="Physics, Chemistry, Maths" /></div>
            <Button className="w-full" onClick={handleSave}>{editingId ? "Update" : "Create Batch"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
