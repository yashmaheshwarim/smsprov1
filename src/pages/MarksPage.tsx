import { useState, useEffect } from "react";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { FileCheck, Check, X as XIcon, Search, Download, FileSpreadsheet } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

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

interface MarkData {
  id: string;
  student_id: string;
  institute_id: string;
  exam_name: string;
  subject: string;
  batch_id: string | null;
  batches: { name: string }[] | null;
  marks_obtained: number;
  total_marks: number;
  status: string;
  submitted_by: string | null;
  created_at: string;
  students: { id: string; name: string }[] | { id: string; name: string } | null;
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
  const instId = isAdmin ? (user as AdminUser).instituteId : "INST-001";

  const [exams, setExams] = useState<ExamEntry[]>([]);

  const fetchExams = async () => {
    try {
      const response = await supabase
        .from('marks')
        .select(`
          id,
          student_id,
          institute_id,
          exam_name,
          subject,
          batch_id,
          batches(name),
          marks_obtained,
          total_marks,
          status,
          submitted_by,
          created_at,
          students(id, name)
        `)
        .eq('institute_id', instId)
        .order('created_at', { ascending: false });
      const data = response.data as MarkData[] | null;
      const error = response.error;

      if (error) throw error;

      // Group marks by exam (exam_name + subject + batch)
      const examMap = new Map<string, ExamEntry>();

      (data || []).forEach((mark: MarkData) => {
        const examKey = `${mark.exam_name}-${mark.subject}-${mark.batch_id || 'unknown'}`;
        const batchName = mark.batches?.[0]?.name || 'Unknown';
        const student = Array.isArray(mark.students) ? mark.students[0] : mark.students;
        const studentName = student?.name || 'Unknown Student';
        const studentId = student?.id || mark.student_id || 'unknown';

        if (!examMap.has(examKey)) {
          examMap.set(examKey, {
            id: examKey,
            examName: mark.exam_name,
            batch: batchName,
            subject: mark.subject,
            totalMarks: mark.total_marks,
            examDate: mark.created_at,
            marks: [],
            submittedBy: mark.submitted_by || 'Unknown',
            submittedByRole: 'teacher', // Default, could be enhanced
            status: mark.status as "pending" | "approved" | "rejected",
            submittedAt: new Date(mark.created_at).toLocaleString("en-IN"),
          });
        }

        const exam = examMap.get(examKey)!;
        exam.marks.push({
          studentId,
          studentName,
          obtained: mark.marks_obtained,
        });
      });

      setExams(Array.from(examMap.values()).map(exam => ({
        ...exam,
        marks: [...exam.marks].sort((a, b) => a.studentName.localeCompare(b.studentName)),
      })));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const [batches, setBatches] = useState<Batch[]>([]);
  const [students, setStudents] = useState<{id: string, name: string, batch_name: string, enrollment_no: string}[]>([]);
  const [batchStudents, setBatchStudents] = useState<{id: string, name: string, batch_name: string, enrollment_no: string}[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewExam, setViewExam] = useState<ExamEntry | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<ExamEntry | null>(null);
  const [form, setForm] = useState({ examName: "", batch: "", subject: "", totalMarks: 0, studentMarks: [] as {studentId: string, studentName: string, obtained: number}[] });
  const [editForm, setEditForm] = useState({ examName: "", batch: "", subject: "", totalMarks: 0, studentMarks: [] as {studentId: string, studentName: string, obtained: number}[] });

  useEffect(() => {
    fetchBatches();
    fetchStudents();
    fetchExams();
  }, [instId]); // Added instId as dependency

  const fetchStudents = async () => {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('id, name, batch_name, enrollment_no')
        .eq('institute_id', instId)
        .eq('status', 'active');

      if (error) throw error;
      setStudents(data || []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const handleBatchChange = (batchName: string) => {
    setForm(prev => ({ ...prev, batch: batchName, subject: "" }));

    // Get students for selected batch
    const selectedBatchStudents = students.filter(s => s.batch_name === batchName).sort((a, b) => a.name.localeCompare(b.name));
    setBatchStudents(selectedBatchStudents);

    // Initialize marks for each student (total will be set by totalMarks field)
    const initialMarks = selectedBatchStudents.map(student => ({
      studentId: student.id,
      studentName: student.name,
      obtained: 0
    }));
    setForm(prev => ({ ...prev, studentMarks: initialMarks, totalMarks: 0 }));
  };

  const fetchBatches = async () => {
    try {
      const { data, error } = await supabase
        .from('batches')
        .select('*')
        .eq('institute_id', instId)
        .eq('status', 'active')
        .order('name');

      if (error) throw error;

      const formattedBatches: Batch[] = (data || []).map((d: Batch) => ({
        id: d.id,
        name: d.name,
        class_name: d.class_name,
        subjects: d.subjects || [],
        status: d.status as "active" | "archived",
      }));

      setBatches(formattedBatches);

      // Set default batch if available
      if (formattedBatches.length > 0 && !form.batch) {
        setForm(prev => ({ ...prev, batch: formattedBatches[0].name }));
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const filtered = exams.filter(e => {
    const matchSearch = e.examName.toLowerCase().includes(search.toLowerCase()) || e.subject.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || e.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const approveExam = async (examKey: string) => {
    try {
      const exam = exams.find(e => e.id === examKey);
      if (!exam) return;

      const { error } = await supabase
        .from('marks')
        .update({ status: 'approved' })
        .eq('institute_id', instId)
        .eq('exam_name', exam.examName)
        .eq('subject', exam.subject)
        .eq('batch_id', batches.find(b => b.name === exam.batch)?.id);

      if (error) throw error;

      await fetchExams();
      toast({ title: "Approved", description: "Marks approved. Report card can now be generated." });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const rejectExam = async (examKey: string) => {
    try {
      const exam = exams.find(e => e.id === examKey);
      if (!exam) return;

      const { error } = await supabase
        .from('marks')
        .update({ status: 'rejected' })
        .eq('institute_id', instId)
        .eq('exam_name', exam.examName)
        .eq('subject', exam.subject)
        .eq('batch_id', batches.find(b => b.name === exam.batch)?.id);

      if (error) throw error;

      await fetchExams();
      toast({ title: "Rejected", description: "Marks rejected. Teacher will be notified to re-enter." });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const handleEditExam = (exam: ExamEntry) => {
    setEditingExam(exam);
    setEditForm({
      examName: exam.examName,
      batch: exam.batch,
      subject: exam.subject,
      totalMarks: exam.totalMarks,
      studentMarks: exam.marks.map(mark => ({
        studentId: mark.studentId,
        studentName: mark.studentName,
        obtained: mark.obtained,
      })).sort((a, b) => a.studentName.localeCompare(b.studentName)),
    });
    setEditOpen(true);
  };

  const handleEditBatchChange = (batchName: string) => {
    setEditForm(prev => ({ ...prev, batch: batchName, subject: "" }));
  };

  const handleSaveEdit = async () => {
    if (!editingExam) return;

    try {
      const oldBatchId = batches.find(b => b.name === editingExam.batch)?.id;
      const newBatchId = batches.find(b => b.name === editForm.batch)?.id;
      const updates = editForm.studentMarks.map((mark) => {
        return supabase
          .from('marks')
          .update({
            exam_name: editForm.examName,
            subject: editForm.subject,
            total_marks: editForm.totalMarks,
            batch_id: newBatchId || null,
            marks_obtained: mark.obtained,
          })
          .eq('institute_id', instId)
          .eq('exam_name', editingExam.examName)
          .eq('subject', editingExam.subject)
          .eq('batch_id', oldBatchId)
          .eq('student_id', mark.studentId);
      });

      const results = await Promise.all(updates);
      const updateError = results.find(result => result.error)?.error;
      if (updateError) throw updateError;

      await fetchExams();
      setEditOpen(false);
      setEditingExam(null);
      toast({ title: "Updated", description: "Exam details and student marks updated successfully." });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const handleDeleteExam = async (examKey: string) => {
    if (!confirm("Are you sure you want to delete this exam entry? This action cannot be undone.")) return;

    try {
      const exam = exams.find(e => e.id === examKey);
      if (!exam) return;

      const { error } = await supabase
        .from('marks')
        .delete()
        .eq('institute_id', instId)
        .eq('exam_name', exam.examName)
        .eq('subject', exam.subject)
        .eq('batch_id', batches.find(b => b.name === exam.batch)?.id);

      if (error) throw error;

      await fetchExams();
      toast({ title: "Deleted", description: "Exam entry deleted successfully." });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const handleAddMarks = async () => {
    if (!form.examName || !form.batch || !form.subject || form.studentMarks.length === 0) {
      toast({ title: "Error", description: "All fields required.", variant: "destructive" });
      return;
    }

    // 1) Persist to DB
    try {
      const marksPayload = form.studentMarks.map((m) => ({
        institute_id: instId,
        batch_id: batches.find((b) => b.name === form.batch)?.id ?? null,
        student_id: m.studentId,
        exam_name: form.examName,
        subject: form.subject,
        marks_obtained: m.obtained,
        total_marks: form.totalMarks,
        status: isAdmin ? "approved" : "pending",
        submitted_by: user?.name || "Admin",
      }));

      const { error } = await supabase.from("marks").insert(marksPayload);
      if (error) throw error;

      await fetchExams();
      setAddOpen(false);
      setForm({ examName: "", batch: "", subject: "", totalMarks: 0, studentMarks: [] });
      setBatchStudents([]);
      toast({ title: "Marks Submitted", description: isAdmin ? "Marks saved and auto-approved." : "Marks saved for admin approval." });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to save marks.";
      toast({
        title: "DB Error",
        description: message,
        variant: "destructive",
      });
      return;
    }
  };

  const createReportFileName = (exam: ExamEntry, ext: string) => {
    const sanitize = (value: string) => value.replace(/[<>:"/\\|?*]+/g, "").trim().replace(/\s+/g, "_");
    const examName = sanitize(exam.examName || "ReportCard");
    const batchName = exam.batch && exam.batch !== "Unknown" ? `_${sanitize(exam.batch)}` : "";
    return `ReportCard_${examName}${batchName}.${ext}`;
  };

  const exportReportPDF = (exam: ExamEntry) => {
    const instituteName = isAdmin ? (user as AdminUser).instituteName : "Institute";
    const examDate = exam.examDate ? new Date(exam.examDate).toLocaleDateString("en-IN") : exam.submittedAt;
    const doc = new jsPDF({ unit: "pt", format: "a4" });

    doc.setFontSize(18);
    doc.setTextColor(24, 60, 120);
    doc.text(instituteName, 297.5, 40, { align: "center" });

    doc.setFontSize(13);
    doc.setTextColor(60, 60, 60);
    doc.text(`${exam.examName} - ${examDate}`, 297.5, 60, { align: "center" });

    doc.setFontSize(11);
    doc.setTextColor(90, 90, 90);
    doc.text(`Batch: ${exam.batch}`, 297.5, 78, { align: "center" });

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(40, 92, 555, 92);

    const body = exam.marks.map((mark) => {
      const percentage = exam.totalMarks > 0 ? ((mark.obtained / exam.totalMarks) * 100).toFixed(1) : "0";
      return [mark.studentName, `${mark.obtained}`, `${exam.totalMarks}`, `${percentage}%`];
    });

    (autoTable as any)(doc, {
      startY: 110,
      head: [["Student Name", "Marks Obtained", "Total", "Percentage (%)"]],
      body,
      theme: "grid",
      headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
      styles: { fontSize: 10, cellPadding: 6 },
      columnStyles: {
        0: { cellWidth: 220 },
        1: { halign: "center", cellWidth: 96 },
        2: { halign: "center", cellWidth: 96 },
        3: { halign: "center", cellWidth: 96 },
      },
      tableWidth: "auto",
    });

    doc.save(createReportFileName(exam, "pdf"));
    toast({ title: "PDF Downloaded", description: "Report card saved as PDF." });
  };

  const exportReportExcel = (exam: ExamEntry) => {
    const instituteName = isAdmin ? (user as AdminUser).instituteName : "Institute";
    const examDate = exam.examDate ? new Date(exam.examDate).toLocaleDateString("en-IN") : exam.submittedAt;

    const headerRows = [
      [instituteName],
      [`${exam.examName} - ${examDate}`],
      [`Batch: ${exam.batch}`],
      [],
    ];

    const exportData = exam.marks.map((mark) => ({
      "Student Name": mark.studentName,
      "Marks Obtained": mark.obtained,
      Total: exam.totalMarks,
      "Percentage (%)": exam.totalMarks > 0 ? ((mark.obtained / exam.totalMarks) * 100).toFixed(1) : "0",
    }));

    const worksheet = XLSX.utils.aoa_to_sheet(headerRows);
    XLSX.utils.sheet_add_json(worksheet, exportData, { origin: "A5", skipHeader: false });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Report Card");

    const fileName = createReportFileName(exam, "xlsx");
    XLSX.writeFile(workbook, fileName);
    toast({ title: "Excel Downloaded", description: "Report card saved as Excel." });
  };

  return (
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

      <div className="flex items-center gap-2">
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
      </div>

      <div className="space-y-2">
        {filtered.map(exam => (
          <div key={exam.id} className="surface-elevated rounded-lg p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-foreground">{exam.examName}</h3>
                  <StatusBadge variant={exam.status === "approved" ? "success" : exam.status === "pending" ? "warning" : "destructive"}>{exam.status}</StatusBadge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{exam.subject} · {exam.batch} · {exam.marks.length} students</p>
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
                  <>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => exportReportPDF(exam)}>
                      <Download className="w-3 h-3 mr-1" /> PDF
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => exportReportExcel(exam)}>
                      <FileSpreadsheet className="w-3 h-3 mr-1" /> Excel
                    </Button>
                  </>
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
        ))}
      </div>

      {/* View Marks Dialog */}
      <Dialog open={!!viewExam} onOpenChange={() => setViewExam(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{viewExam?.examName} — {viewExam?.subject}</DialogTitle></DialogHeader>
          <div className="text-sm text-muted-foreground mb-2">
            Total Marks: <span className="font-bold text-foreground">{viewExam?.totalMarks}</span>
          </div>
          <div className="max-h-[55vh] overflow-y-auto border rounded-md">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border"><th className="text-left py-2 text-xs text-muted-foreground">Student</th><th className="text-center py-2 text-xs text-muted-foreground">Obtained</th><th className="text-center py-2 text-xs text-muted-foreground">%</th></tr>
              </thead>
              <tbody>
                {viewExam?.marks.map(m => (
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
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Marks Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Enter Marks</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                <label className="text-xs font-medium text-foreground">Total Marks</label>
                <Input
                  type="number"
                  value={form.totalMarks}
                  onChange={e => setForm(p => ({ ...p, totalMarks: parseInt(e.target.value) }))}
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
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Exam</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs font-medium text-foreground">Exam Name</label><Input value={editForm.examName} onChange={e => setEditForm(p => ({ ...p, examName: e.target.value }))} placeholder="e.g., Unit Test 4" /></div>
            <div>
              <label className="text-xs font-medium text-foreground">Batch</label>
              <select value={editForm.batch} onChange={e => handleEditBatchChange(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground">
                {batches.map(batch => (
                  <option key={batch.id} value={batch.name}>{batch.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Subject</label>
              <select value={editForm.subject} onChange={e => setEditForm(p => ({ ...p, subject: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground">
                <option value="">Select Subject</option>
                {editForm.batch && batches.find(b => b.name === editForm.batch)?.subjects.map((subject: string) => (
                  <option key={subject} value={subject}>{subject}</option>
                ))}
              </select>
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

            {editForm.studentMarks.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Edit Student Marks</h4>
                  <div className="text-xs text-muted-foreground">Sorted alphabetically</div>
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
                      {editForm.studentMarks.map((mark, index) => (
                        <tr key={mark.studentId} className="border-t">
                          <td className="px-3 py-2 text-sm">{mark.studentName}</td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              value={mark.obtained}
                              onChange={e => {
                                const newMarks = [...editForm.studentMarks];
                                newMarks[index].obtained = parseInt(e.target.value) || 0;
                                setEditForm(p => ({ ...p, studentMarks: newMarks }));
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

            <Button className="w-full" onClick={handleSaveEdit}>Update Exam</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
