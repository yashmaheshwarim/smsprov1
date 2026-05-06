import { useState, useMemo, useEffect } from "react";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { FileCheck, Check, X as XIcon, Search, Download, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface ExamEntry {
  id: string;
  examName: string;
  batch: string;
  subject: string;
  totalMarks: number;
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
  const instId = isAdmin ? (user as AdminUser).instituteId : "INST-001";

   const [exams, setExams] = useState<ExamEntry[]>(() => {
     const saved = localStorage.getItem(`sms_exams_${instId}`);
     if (!saved) return [];
     try {
       const parsed: any[] = JSON.parse(saved);
       // Normalize: ensure each exam has totalMarks (derive from first student's total or default 50)
       return parsed.map(e => {
         // If new format already has totalMarks, keep it
         if (e.totalMarks !== undefined) return e as ExamEntry;
         // Otherwise, derive from first student's total or use default
         const firstTotal = e.marks?.[0]?.total;
         return {
           ...e,
           totalMarks: firstTotal,
           marks: e.marks?.map((m: any) => ({ studentId: m.studentId, studentName: m.studentName, obtained: m.obtained })) || []
         };
       });
     } catch {
       return [];
     }
   });

  const saveExams = (newExams: ExamEntry[]) => {
    setExams(newExams);
    localStorage.setItem(`sms_exams_${instId}`, JSON.stringify(newExams));
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
  const [editForm, setEditForm] = useState({ examName: "", batch: "", subject: "", totalMarks: 0 });

  useEffect(() => {
    fetchBatches();
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('id, name, batch_name, enrollment_no')
        .eq('institute_id', instId)
        .eq('status', 'active');

      if (error) throw error;
      setStudents(data || []);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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

  const fetchBatches = async () => {
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

      // Set default batch if available
      if (formattedBatches.length > 0 && !form.batch) {
        setForm(prev => ({ ...prev, batch: formattedBatches[0].name }));
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const filtered = exams.filter(e => {
    const matchSearch = e.examName.toLowerCase().includes(search.toLowerCase()) || e.subject.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || e.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const approveExam = (id: string) => {
    const updated = exams.map(e => e.id === id ? { ...e, status: "approved" as const } : e);
    saveExams(updated);
    toast({ title: "Approved", description: "Marks approved. Report card can now be generated." });
  };

  const rejectExam = (id: string) => {
    const updated = exams.map(e => e.id === id ? { ...e, status: "rejected" as const } : e);
    saveExams(updated);
    toast({ title: "Rejected", description: "Marks rejected. Teacher will be notified to re-enter." });
  };

  const handleEditExam = (exam: ExamEntry) => {
    setEditingExam(exam);
    setEditForm({
      examName: exam.examName,
      batch: exam.batch,
      subject: exam.subject,
      totalMarks: exam.totalMarks
    });
    setEditOpen(true);
  };

  const handleEditBatchChange = (batchName: string) => {
    setEditForm(prev => ({ ...prev, batch: batchName, subject: "" }));
  };

  const handleSaveEdit = () => {
    if (!editingExam) return;

    const updated = exams.map(e =>
      e.id === editingExam.id
        ? { ...e, examName: editForm.examName, batch: editForm.batch, subject: editForm.subject, totalMarks: editForm.totalMarks }
        : e
    );
    saveExams(updated);
    setEditOpen(false);
    setEditingExam(null);
    toast({ title: "Updated", description: "Exam details updated successfully." });
  };

  const handleDeleteExam = (id: string) => {
    if (!confirm("Are you sure you want to delete this exam entry? This action cannot be undone.")) return;

    const updated = exams.filter(e => e.id !== id);
    saveExams(updated);
    toast({ title: "Deleted", description: "Exam entry deleted successfully." });
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
    } catch (error: any) {
      toast({
        title: "DB Error",
        description: error?.message || "Failed to save marks.",
        variant: "destructive",
      });
      return;
    }

    // 2) Keep existing local behavior
    const newExam: ExamEntry = {
      id: `EX-${String(exams.length + 1).padStart(3, "0")}`,
      examName: form.examName,
      batch: form.batch,
      subject: form.subject,
      totalMarks: form.totalMarks,
      marks: form.studentMarks,
      submittedBy: user?.name || "Admin",
      submittedByRole: isAdmin ? "admin" : "teacher",
      status: isAdmin ? "approved" : "pending",
      submittedAt: new Date().toLocaleString("en-IN"),
    };

    const updated = [newExam, ...exams];
    saveExams(updated);
    setAddOpen(false);
    setForm({ examName: "", batch: "", subject: "", totalMarks: 0, studentMarks: [] });
    setBatchStudents([]);
    toast({ title: "Marks Submitted", description: isAdmin ? "Marks saved and auto-approved." : "Marks saved for admin approval." });
  };

  const generateReportCard = (exam: ExamEntry) => {
    // Find all approved exams for the same batch and exam name
    const relatedExams = exams.filter(e => e.batch === exam.batch && e.examName === exam.examName && e.status === "approved");
    if (relatedExams.length === 0) {
      toast({ title: "Error", description: "No approved marks found for this exam.", variant: "destructive" });
      return;
    }

    // Collect all students
    const studentMap = new Map<string, { name: string; subjects: { subject: string; obtained: number; total: number }[] }>();
    relatedExams.forEach(e => {
      e.marks.forEach(m => {
        if (!studentMap.has(m.studentId)) studentMap.set(m.studentId, { name: m.studentName, subjects: [] });
        studentMap.get(m.studentId)!.subjects.push({ subject: e.subject, obtained: m.obtained, total: e.totalMarks });
      });
    });

    let html = `<!DOCTYPE html><html><head><title>Report Card - ${exam.examName}</title>
<style>
body { font-family: Arial; padding: 30px; }
h1 { text-align: center; }
h2 { color: #333; }
table { width: 100%; border-collapse: collapse; margin: 15px 0; }
th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
th { background: #f5f5f5; }
.header { text-align: center; margin-bottom: 20px; }
.student-card { page-break-after: always; margin-bottom: 30px; border: 2px solid #333; padding: 20px; }
.footer { text-align: center; font-size: 12px; color: #999; margin-top: 20px; }
</style></head><body>`;

    studentMap.forEach((data, studentId) => {
      const totalObt = data.subjects.reduce((s, sub) => s + sub.obtained, 0);
      const totalMax = data.subjects.reduce((s, sub) => s + sub.total, 0);
      const percentage = totalMax > 0 ? ((totalObt / totalMax) * 100).toFixed(1) : "0";
      html += `<div class="student-card">
<div class="header"><h1>Report Card</h1><p>${exam.examName} — ${exam.batch}</p></div>
<p><strong>Student:</strong> ${data.name} &nbsp; <strong>ID:</strong> ${studentId}</p>
<table><tr><th>Subject</th><th>Marks Obtained</th><th>Total</th><th>%</th></tr>`;
      data.subjects.forEach(s => {
        const subjectPercent = s.total > 0 ? ((s.obtained / s.total) * 100).toFixed(0) : '0';
        html += `<tr><td>${s.subject}</td><td>${s.obtained}</td><td>${s.total}</td><td>${subjectPercent}%</td></tr>`;
      });
      html += `<tr style="font-weight:bold"><td>Total</td><td>${totalObt}</td><td>${totalMax}</td><td>${percentage}%</td></tr></table>
<p><strong>Grade:</strong> ${totalMax > 0 && parseFloat(percentage) >= 90 ? 'A+' : totalMax > 0 && parseFloat(percentage) >= 75 ? 'A' : totalMax > 0 && parseFloat(percentage) >= 60 ? 'B' : 'C'}</p>
<div class="footer"><p>Generated on ${new Date().toLocaleDateString("en-IN")}</p><p>Powered by Maheshwari Tech</p></div></div>`;
    });

    html += `</body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ReportCard_${exam.examName}_${exam.batch}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Report Card Generated", description: "Report card downloaded." });
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
        ))}
      </div>

      {/* View Marks Dialog */}
      <Dialog open={!!viewExam} onOpenChange={() => setViewExam(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{viewExam?.examName} — {viewExam?.subject}</DialogTitle></DialogHeader>
          <div className="text-sm text-muted-foreground mb-2">
            Total Marks: <span className="font-bold text-foreground">{viewExam?.totalMarks}</span>
          </div>
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
            <Button className="w-full" onClick={handleSaveEdit}>Update Exam</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
