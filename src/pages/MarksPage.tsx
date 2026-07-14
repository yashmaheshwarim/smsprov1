import { useState, useMemo, useEffect, useRef } from "react";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { FileCheck, Check, X as XIcon, Search, Download, Upload, Loader2, ArrowUpDown, ArrowDownAZ } from "lucide-react";
import { supabase, isUuid } from "@/lib/supabase";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface ExamEntry {
  id: string;
  examName: string;
  batch: string;
  subject: string;
  totalMarks: number;
  examDate: string;
  marks: { studentId: string; studentName: string; obtained: number }[];
  submittedBy: string;
  submittedByRole: "teacher" | "admin";
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
}

interface Batch {
  id: string;
  name: string;
  class_name: string;
  subjects: string[];
  status: "active" | "archived";
}

// Removed static mockExams array to ensure Black/Zero/Fresh state.

export default function MarksPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const DEFAULT_UUID = "00000000-0000-0000-0000-000000000001";
  const instId = isAdmin ? (user as AdminUser).instituteId : DEFAULT_UUID;
  const instituteName = isAdmin ? (user as AdminUser).instituteName : "";

   const [exams, setExams] = useState<ExamEntry[]>([]);
   const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

const [batches, setBatches] = useState<Batch[]>([]);
  const [students, setStudents] = useState<{id: string, name: string, batch_name: string, enrollment_no: string}[]>([]);
  const [batchStudents, setBatchStudents] = useState<{id: string, name: string, batch_name: string, enrollment_no: string}[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState<"a-z" | "newest" | "oldest">("newest");
  const [viewExam, setViewExam] = useState<ExamEntry | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<ExamEntry | null>(null);
  const [loading, setLoading] = useState(true);
    const todayStr = new Date().toISOString().split("T")[0];
    const [form, setForm] = useState({ examName: "", batch: "", subject: "", totalMarks: 0, examDate: todayStr, studentMarks: [] as {studentId: string, studentName: string, obtained: number}[] });
    const [editForm, setEditForm] = useState({ examName: "", batch: "", subject: "", totalMarks: 0, examDate: todayStr });
  const [editingMarks, setEditingMarks] = useState<{studentId: string, studentName: string, obtained: number}[]>([]);

  useEffect(() => {
    if (isUuid(instId)) {
      fetchData();
      subscribeToMarksRealtime();
    }
    return () => {
      // Cleanup Realtime subscription on unmount
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, [instId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const batchesData = await fetchBatches();
      const studentsData = await fetchStudents();
      await fetchMarks();

      // Set default batch and populate batchStudents after both are loaded
      if (batchesData.length > 0 && studentsData.length > 0) {
        const firstBatchName = batchesData[0].name;
        setForm(prev => ({
          ...prev,
          batch: firstBatchName,
          subject: "",
          studentMarks: studentsData
            .filter(s => s.batch_name === firstBatchName)
            .map(student => ({
              studentId: student.id,
              studentName: student.name,
              obtained: 0,
            })),
          totalMarks: 0,
        }));
        setBatchStudents(studentsData.filter(s => s.batch_name === firstBatchName));
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const subscribeToMarksRealtime = () => {
    if (!instId || !isUuid(instId)) return;

    const channel = supabase
      .channel(`marks-realtime-${instId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "marks",
          filter: `institute_id=eq.${instId}`,
        },
        () => {
          // Debounce: re-fetch marks when any change happens in the marks table
          fetchMarks();
        }
      )
      .subscribe();

    realtimeChannelRef.current = channel;
  };

  const fetchMarks = async () => {
    if (!instId || !isUuid(instId)) return;
    try {
      const { data, error } = await supabase
        .from("marks")
        .select(`
          id,
          exam_name,
          subject,
          marks_obtained,
          total_marks,
          status,
          submitted_by,
          created_at,
          batch_id,
          student_id,
          exam_date,
          batch:batch_id (id, name),
          student:student_id (id, name)
        `)
        .eq("institute_id", instId);

      if (error) throw error;

      const grouped: Record<string, ExamEntry> = {};
      data?.forEach((d: any) => {
        const key = `${d.exam_name}|${d.subject}|${d.batch_id}`;
        if (!grouped[key]) {
          grouped[key] = {
            id: `EX-${Math.random().toString(36).substr(2, 9)}`,
            examName: d.exam_name,
            batch: d.batch?.name || "",
            subject: d.subject,
            totalMarks: d.total_marks || 50,
            examDate: d.exam_date || new Date(d.created_at || Date.now()).toISOString().split("T")[0],
            marks: [],
            submittedBy: d.submitted_by || "Admin",
            submittedByRole: "admin",
            status: d.status || "pending",
            submittedAt: new Date(d.created_at || Date.now()).toLocaleString("en-IN"),
          };
        }
        grouped[key].marks.push({
          studentId: d.student_id,
          studentName: d.student?.name || "Unknown",
          obtained: d.marks_obtained || 0,
        });
      });

      // Always replace exams with fresh data from the database
      setExams(Object.values(grouped));
    } catch (error: any) {
      console.error("Error fetching marks:", error);
    }
  };

  const fetchStudents = async (): Promise<{id: string, name: string, batch_name: string, enrollment_no: string}[]> => {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('id, name, batch_name, enrollment_no')
        .eq('institute_id', instId)
        .eq('status', 'active');

      if (error) throw error;
      const result = data || [];
      setStudents(result);
      return result;
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return [];
    }
  };

  const handleBatchChange = (batchName: string) => {
    setForm(prev => ({ ...prev, batch: batchName, subject: "" }));

    // Get students for selected batch
    const selectedBatchStudents = students.filter(s => s.batch_name === batchName);
    setBatchStudents(selectedBatchStudents);

    // Initialize marks for each student (total will be set by totalMarks field)
    const initialMarks = selectedBatchStudents.map(student => ({
      studentId: student.id,
      studentName: student.name,
      obtained: 0
    }));
    setForm(prev => ({ ...prev, studentMarks: initialMarks, totalMarks: 0 }));
  };

  const fetchBatches = async (): Promise<Batch[]> => {
    try {
      const { data, error } = await supabase
        .from('batches')
        .select('*')
        .eq('institute_id', instId)
        .eq('status', 'active')
        .order('name');

      if (error) throw error;

      const formattedBatches: Batch[] = (data || []).map((d: any) => ({
        id: d.id,
        name: d.name,
        class_name: d.class_name,
        subjects: d.subjects || [],
        status: d.status,
      }));

      setBatches(formattedBatches);
      return formattedBatches;
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return [];
    }
  };

  const filtered = exams.filter(e => {
    const matchSearch = (e.examName || '').toLowerCase().includes(search.toLowerCase()) || (e.subject || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || e.status === statusFilter;
    return matchSearch && matchStatus;
  }).sort((a, b) => {
    if (sortOrder === "a-z") {
      return (a.examName || '').localeCompare(b.examName || '');
    } else if (sortOrder === "newest") {
      // Sort by examDate descending (newest first)
      return (b.examDate || '').localeCompare(a.examDate || '');
    } else {
      // oldest first
      return (a.examDate || '').localeCompare(b.examDate || '');
    }
  });

  const approveExam = async (id: string) => {
    // Update status in Supabase
    const exam = exams.find(e => e.id === id);
    if (!exam) return;

    const selectedBatch = batches.find(b => b.name === exam.batch);
    const marksToUpdate = exam.marks.map(mark => ({
      institute_id: instId,
      batch_id: selectedBatch?.id || null,
      student_id: mark.studentId,
      exam_name: exam.examName,
      subject: exam.subject,
      marks_obtained: mark.obtained,
      total_marks: exam.totalMarks,
      exam_date: exam.examDate,
      status: "approved",
      submitted_by: exam.submittedBy,
    }));

    try {
      const { error } = await supabase
        .from("marks")
        .upsert(marksToUpdate, { onConflict: "institute_id,student_id,exam_name,subject,exam_date" })
        .select();

      if (error) throw error;

      toast({ title: "Approved", description: "Marks approved. Report card can now be generated." });
    } catch (error: any) {
      toast({ title: "Error", description: `Failed to approve: ${error.message}`, variant: "destructive" });
    }
  };

  const rejectExam = async (id: string) => {
    const exam = exams.find(e => e.id === id);
    if (!exam) return;

    const selectedBatch = batches.find(b => b.name === exam.batch);
    const marksToUpdate = exam.marks.map(mark => ({
      institute_id: instId,
      batch_id: selectedBatch?.id || null,
      student_id: mark.studentId,
      exam_name: exam.examName,
      subject: exam.subject,
      marks_obtained: mark.obtained,
      total_marks: exam.totalMarks,
      exam_date: exam.examDate,
      status: "rejected",
      submitted_by: exam.submittedBy,
    }));

    try {
      const { error } = await supabase
        .from("marks")
        .upsert(marksToUpdate, { onConflict: "institute_id,student_id,exam_name,subject,exam_date" })
        .select();

      if (error) throw error;

      toast({ title: "Rejected", description: "Marks rejected. Teacher will be notified to re-enter." });
    } catch (error: any) {
      toast({ title: "Error", description: `Failed to reject: ${error.message}`, variant: "destructive" });
    }
  };

  const handleEditExam = (exam: ExamEntry) => {
    setEditingExam(exam);
    setEditForm({
      examName: exam.examName,
      batch: exam.batch,
      subject: exam.subject,
      totalMarks: exam.totalMarks,
      examDate: exam.examDate || todayStr
    });
    setEditingMarks([...exam.marks].sort((a, b) => a.studentName.localeCompare(b.studentName)).map(m => ({ ...m })));
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingExam) return;

    const selectedBatch = batches.find(b => b.name === editingExam.batch);
    const marksToUpsert = editingMarks.map(mark => ({
      institute_id: instId,
      batch_id: selectedBatch?.id || null,
      student_id: mark.studentId,
      exam_name: editForm.examName,
      subject: editForm.subject,
      marks_obtained: mark.obtained,
      total_marks: editForm.totalMarks,
      exam_date: editForm.examDate,
      status: isAdmin ? editingExam.status : "pending",
      submitted_by: editingExam.submittedBy,
    }));

    if (marksToUpsert.length > 0) {
      try {
        const { error } = await supabase
          .from("marks")
          .upsert(marksToUpsert, { onConflict: "institute_id,student_id,exam_name,subject,exam_date" });

        if (error) {
          console.error("Failed to sync marks to DB:", error);
          toast({ title: "Warning", description: "DB sync failed: " + error.message, variant: "destructive" });
        }
      } catch (error: any) {
        console.error("Failed to sync marks to DB:", error);
      }
    }

    // Fetch fresh data from DB (realtime will also update it)
    await fetchMarks();

    setEditOpen(false);
    setEditingExam(null);
    setEditingMarks([]);
    toast({ title: "Updated", description: "Exam details and marks updated successfully." });
  };

  const handleDeleteExam = async (id: string) => {
    if (!confirm("Are you sure you want to delete this exam entry? This action cannot be undone.")) return;

    const exam = exams.find(e => e.id === id);
    if (!exam) return;

    const selectedBatch = batches.find(b => b.name === exam.batch);

    try {
      // Delete all marks records for this exam from Supabase
      const { error } = await supabase
        .from("marks")
        .delete()
        .eq("institute_id", instId)
        .eq("exam_name", exam.examName)
        .eq("subject", exam.subject)
        .eq("batch_id", selectedBatch?.id || null);

      if (error) throw error;

      // Fetch fresh data (realtime will also update)
      await fetchMarks();

      toast({ title: "Deleted", description: "Exam entry deleted from database." });
    } catch (error: any) {
      toast({ title: "Error", description: `Failed to delete: ${error.message}`, variant: "destructive" });
    }
  };

const handleAddMarks = async () => {
    if (!form.examName || !form.batch || !form.subject || form.studentMarks.length === 0) {
      toast({ title: "Error", description: "All fields required.", variant: "destructive" });
      return;
    }

    const selectedBatch = batches.find(b => b.name === form.batch);
    const marksToInsert = form.studentMarks.map(mark => ({
      institute_id: instId,
      batch_id: selectedBatch?.id || null,
      student_id: mark.studentId,
      exam_name: form.examName,
      subject: form.subject,
      marks_obtained: mark.obtained,
      total_marks: form.totalMarks,
      exam_date: form.examDate,
      status: isAdmin ? "approved" : "pending",
      submitted_by: user?.name || "Admin",

    }));

    try {
      const { data, error } = await supabase
        .from("marks")
        .upsert(marksToInsert, { onConflict: "institute_id,student_id,exam_name,subject,exam_date" })
        .select();

      if (error) throw error;

      // Refresh exams from DB (realtime will also update automatically)
      await fetchMarks();

      setAddOpen(false);
      setForm({ examName: "", batch: "", subject: "", totalMarks: 0, examDate: todayStr, studentMarks: [] });
      setBatchStudents([]);
      toast({ title: "Marks Submitted", description: isAdmin ? "Marks added and auto-approved." : "Marks submitted for admin approval." });
    } catch (error: any) {
      toast({ title: "DB Error", description: `Failed to save marks: ${error.message || "Unknown error"}`, variant: "destructive" });
    }
  };

  const generateReportCard = (exam: ExamEntry) => {
    // Find all approved exams for the same batch and exam name
    const relatedExams = exams.filter(e => e.batch === exam.batch && e.examName === exam.examName && e.status === "approved");
    if (relatedExams.length === 0) {
      toast({ title: "Error", description: "No approved marks found for this exam.", variant: "destructive" });
      return;
    }

    // Collect all students and their subjects
    const studentMap = new Map<string, { name: string; subjects: { subject: string; obtained: number; total: number }[] }>();
    const allSubjects = new Set<string>();
    relatedExams.forEach(e => {
      allSubjects.add(e.subject);
      e.marks.forEach(m => {
        if (!studentMap.has(m.studentId)) studentMap.set(m.studentId, { name: m.studentName, subjects: [] });
        studentMap.get(m.studentId)!.subjects.push({ subject: e.subject, obtained: m.obtained, total: e.totalMarks });
      });
    });

    const doc = new jsPDF('l', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;

    // --- Header ---
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(instituteName || 'Institute', pageWidth / 2, 18, { align: 'center' });
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('Report Card', pageWidth / 2, 26, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`${exam.examName} — ${exam.batch}`, pageWidth / 2, 33, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`Exam Date: ${exam.submittedAt}`, pageWidth / 2, 39, { align: 'center' });
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');

    // --- Build columns dynamically based on subjects ---
    const subjectList = Array.from(allSubjects);

    // --- Build table rows ---
    let srNo = 0;
    const rows = Array.from(studentMap.entries()).map(([studentId, data]) => {
      const subjectMap = new Map<string, { obtained: number; total: number }>();
      data.subjects.forEach(s => subjectMap.set(s.subject, s));

      srNo++;
      const row: Record<string, string> = { srno: String(srNo), name: data.name };

      let totalObt = 0;
      let totalMax = 0;
      subjectList.forEach(subj => {
        const marks = subjectMap.get(subj);
        if (marks) {
          row[`subj_${subj}`] = `${marks.obtained}/${marks.total}`;
          totalObt += marks.obtained;
          totalMax += marks.total;
        } else {
          row[`subj_${subj}`] = '-/-';
        }
      });

      const pct = totalMax > 0 ? Math.round((totalObt / totalMax) * 100) : 0;
      row.total = `${totalObt}/${totalMax}`;
      row.pct = `${pct}`;

      return row;
    });

    // --- Auto-table config ---
    autoTable(doc, {
      head: [[
        'Sr No',
        'Student Name',
        ...subjectList,
        'Total',
        '%',
      ]],
      body: rows.map(r => [
        r.srno,
        r.name,
        ...subjectList.map(subj => r[`subj_${subj}`] || '-/-'),
        r.total,
        r.pct,
      ]),
      startY: 44,
      margin: { left: margin, right: margin },
      styles: {
        fontSize: 8,
        cellPadding: 1.5,
        lineColor: [50, 50, 50],
        lineWidth: 0.1,
        valign: 'middle',
        halign: 'center',
      },
      headStyles: {
        fillColor: [60, 80, 120],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'center',
      },
      columnStyles: {
        1: { halign: 'left', cellWidth: 50 },
      },
      didDrawPage: () => {
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(150);
        doc.text(
          `Generated on ${new Date().toLocaleDateString("en-IN")} | Powered by Maheshwari Tech | Page ${doc.getCurrentPageInfo().pageNumber}`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 8,
          { align: 'center' }
        );
      },
    });

    // --- Save ---
    doc.save(`ReportCard_${exam.examName}_${exam.batch}.pdf`);
    toast({ title: "Report Card Generated", description: "PDF report card downloaded." });
  };

  return loading ? (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  ) : (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Marks & Report Cards</h2>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? "Review marks from teachers, approve and generate report cards" : "Enter marks for your assigned subjects"}
          </p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}><FileCheck className="w-4 h-4 mr-1" /> Enter Marks</Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-card border border-border flex-1 sm:max-w-sm">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="Search exams..." value={search} onChange={e => setSearch(e.target.value)}
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground">
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <div className="flex items-center gap-1 bg-card border border-border rounded-md p-0.5">
          <button
            onClick={() => setSortOrder("a-z")}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
              sortOrder === "a-z"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ArrowDownAZ className="w-3.5 h-3.5" />
            A-Z
          </button>
          <button
            onClick={() => setSortOrder("newest")}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
              sortOrder === "newest"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            Newest
          </button>
          <button
            onClick={() => setSortOrder("oldest")}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
              sortOrder === "oldest"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            Oldest
          </button>
        </div>
       </div>

       <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No exam records found. Add marks to get started.</div>
        ) : (
          filtered.map(exam => (
            <div key={exam.id} className="surface-elevated rounded-lg p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-foreground">{exam.examName}</h3>
                    <StatusBadge variant={exam.status === "approved" ? "success" : exam.status === "pending" ? "warning" : "destructive"}>{exam.status}</StatusBadge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{exam.subject} · {exam.batch} · {exam.marks.length} students · {exam.examDate}</p>
                  <p className="text-xs text-muted-foreground">Submitted by {exam.submittedBy} ({exam.submittedByRole}) · {exam.submittedAt}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setViewExam(exam)}>View</Button>
                  {(isAdmin || (exam.submittedByRole === "teacher" && exam.status === "pending")) && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleEditExam(exam)}>
                      Edit
                    </Button>
                  )}
                  {(isAdmin || (exam.submittedByRole === "teacher" && exam.status === "pending")) && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => handleDeleteExam(exam.id)}>
                      Delete
                    </Button>
                  )}
                  {isAdmin && exam.status === "approved" && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => generateReportCard(exam)}>
                      <Download className="w-3 h-3 mr-1" /> Report Card
                    </Button>
                  )}
                  {isAdmin && exam.status === "pending" && (
                    <>
                      <Button size="sm" className="h-7 text-xs" onClick={() => approveExam(exam.id)}>
                        <Check className="w-3 h-3 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => rejectExam(exam.id)}>
                        <XIcon className="w-3 h-3 mr-1" /> Reject
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* View Marks Dialog */}
      <Dialog open={!!viewExam} onOpenChange={() => setViewExam(null)}>          <DialogContent>
          <DialogHeader><DialogTitle>{viewExam?.examName} — {viewExam?.subject}</DialogTitle></DialogHeader>
          <div className="text-sm text-muted-foreground mb-2">
            <span>Date: <span className="font-bold text-foreground">{viewExam?.examDate}</span></span>
            <span className="ml-4">Total Marks: <span className="font-bold text-foreground">{viewExam?.totalMarks}</span></span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border"><th className="text-left py-2 text-xs text-muted-foreground">Student</th><th className="text-center py-2 text-xs text-muted-foreground">Obtained</th><th className="text-center py-2 text-xs text-muted-foreground">%</th></tr>
            </thead>
            <tbody>
              {[...(viewExam?.marks || [])].sort((a, b) => a.studentName.localeCompare(b.studentName)).map(m => (
                <tr key={m.studentId} className="border-b border-border/50">
                  <td className="py-2 text-foreground">{m.studentName}</td>
                  <td className="text-center py-2 tabular-nums text-foreground">{m.obtained}</td>
                  <td className="text-center py-2 tabular-nums">
                    <span className={viewExam && viewExam.totalMarks > 0 && m.obtained / viewExam.totalMarks >= 0.75 ? "text-success" : viewExam && viewExam.totalMarks > 0 && m.obtained / viewExam.totalMarks >= 0.5 ? "text-warning" : "text-destructive"}>
                      {viewExam && viewExam.totalMarks > 0 ? ((m.obtained / viewExam.totalMarks) * 100).toFixed(0) + '%' : 'N/A'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DialogContent>
      </Dialog>

      {/* Add Marks Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Enter Marks</DialogTitle></DialogHeader>
          <div className="space-y-4">              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="sm:col-span-2 lg:col-span-1">
                <label className="text-xs font-medium text-foreground">Exam Name</label>
                <Input value={form.examName} onChange={e => setForm(p => ({ ...p, examName: e.target.value }))} placeholder="e.g., Unit Test 4" />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Batch</label>
                <select
                  value={form.batch}
                  onChange={e => handleBatchChange(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground"
                >
                  <option value="">Select Batch</option>
                  {batches.map(batch => (
                    <option key={batch.id} value={batch.name}>{batch.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Subject</label>
                <select
                  value={form.subject}
                  onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground"
                  disabled={!form.batch}
                >
                  <option value="">Select Subject</option>
                  {form.batch && batches.find(b => b.name === form.batch)?.subjects.map((subject: string) => (
                    <option key={subject} value={subject}>{subject}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Exam Date</label>
                <Input
                  type="date"
                  value={form.examDate}
                  onChange={e => setForm(p => ({ ...p, examDate: e.target.value }))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Total Marks</label>
                <Input
                  type="number"
                  value={form.totalMarks}
                  onChange={e => setForm(p => ({ ...p, totalMarks: parseInt(e.target.value) || 50 }))}
                  placeholder="100"
                  className="w-full"
                  min="1"
                />
              </div>
            </div>

            {form.batch && batchStudents.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Student Marks ({batchStudents.length} students)</h4>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">Total Marks:</label>
                    <Input
                      type="number"
                      value={form.totalMarks}
                      onChange={e => setForm(p => ({ ...p, totalMarks: parseInt(e.target.value) || 50 }))}
                      className="w-20 h-8 text-center"
                      min="1"
                    />
                  </div>
                </div>
                <div className="max-h-60 overflow-y-auto border rounded-md">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/50">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-medium">Student</th>
                        <th className="text-center px-3 py-2 text-xs font-medium w-32">Obtained (out of {form.totalMarks})</th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.studentMarks.map((mark, index) => (
                        <tr key={mark.studentId} className="border-t">
                          <td className="px-3 py-2 text-sm">{mark.studentName}</td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              value={mark.obtained}
                              onChange={e => {
                                const newMarks = [...form.studentMarks];
                                newMarks[index].obtained = parseInt(e.target.value) || 0;
                                setForm(p => ({ ...p, studentMarks: newMarks }));
                              }}
                              className="w-full h-8 text-center"
                              min="0"
                              max={form.totalMarks}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!form.batch && (
              <p className="text-xs text-muted-foreground">Please select a batch to load students.</p>
            )}

            {form.batch && batchStudents.length === 0 && (
              <p className="text-xs text-muted-foreground">No students found in the selected batch.</p>
            )}

            <Button
              className="w-full"
              onClick={handleAddMarks}
              disabled={!form.examName || !form.batch || !form.subject || batchStudents.length === 0}
            >
              {isAdmin ? "Submit & Auto-Approve" : "Submit for Approval"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Exam Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Exam</DialogTitle></DialogHeader>
          <div className="space-y-4">              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="sm:col-span-2 lg:col-span-1">
                <label className="text-xs font-medium text-foreground">Exam Name</label>
                <Input value={editForm.examName} onChange={e => setEditForm(p => ({ ...p, examName: e.target.value }))} placeholder="e.g., Unit Test 4" />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Batch</label>
                <div className="mt-1 px-3 py-2 rounded-md bg-muted border border-border text-sm text-muted-foreground">
                  {editingExam?.batch || editForm.batch}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Subject</label>
                <select
                  value={editForm.subject}
                  onChange={e => setEditForm(p => ({ ...p, subject: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground"
                >
                  <option value="">Select Subject</option>
                  {editingExam && batches.find(b => b.name === editingExam.batch)?.subjects.map((subject: string) => (
                    <option key={subject} value={subject}>{subject}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Exam Date</label>
                <Input
                  type="date"
                  value={editForm.examDate}
                  onChange={e => setEditForm(p => ({ ...p, examDate: e.target.value }))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Total Marks</label>
                <Input
                  type="number"
                  value={editForm.totalMarks}
                  onChange={e => setEditForm(p => ({ ...p, totalMarks: parseInt(e.target.value) || 50 }))}
                  placeholder="100"
                  min="1"
                />
              </div>
            </div>

            {editingMarks.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Student Marks ({editingMarks.length} students)</h4>
                </div>
                <div className="max-h-60 overflow-y-auto border rounded-md">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/50">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-medium">Student</th>
                        <th className="text-center px-3 py-2 text-xs font-medium w-32">Obtained (out of {editForm.totalMarks})</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editingMarks.map((mark, index) => (
                        <tr key={mark.studentId} className="border-t">
                          <td className="px-3 py-2 text-sm">{mark.studentName}</td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              value={mark.obtained}
                              onChange={e => {
                                const newMarks = [...editingMarks];
                                newMarks[index].obtained = parseInt(e.target.value) || 0;
                                setEditingMarks(newMarks);
                              }}
                              className="w-full h-8 text-center"
                              min="0"
                              max={editForm.totalMarks}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <Button className="w-full" onClick={handleSaveEdit}>Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
