import { useState, useMemo } from "react";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { FileCheck, Check, X as XIcon, Search, Download, Upload } from "lucide-react";

interface ExamEntry {
  id: string;
  examName: string;
  batch: string;
  subject: string;
  marks: { studentId: string; studentName: string; obtained: number; total: number }[];
  submittedBy: string;
  submittedByRole: "teacher" | "admin";
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
}

const mockExams: ExamEntry[] = [
  {
    id: "EX-001", examName: "Unit Test 3", batch: "JEE 2025 - Batch A", subject: "Physics",
    marks: [
      { studentId: "STU-0001", studentName: "Aarav Gupta", obtained: 42, total: 50 },
      { studentId: "STU-0002", studentName: "Vivaan Joshi", obtained: 38, total: 50 },
      { studentId: "STU-0003", studentName: "Aditya Singh", obtained: 45, total: 50 },
    ],
    submittedBy: "Dr. Rajesh Sharma", submittedByRole: "teacher", status: "pending", submittedAt: "2025-03-14 10:30",
  },
  {
    id: "EX-002", examName: "Unit Test 3", batch: "JEE 2025 - Batch A", subject: "Chemistry",
    marks: [
      { studentId: "STU-0001", studentName: "Aarav Gupta", obtained: 38, total: 50 },
      { studentId: "STU-0002", studentName: "Vivaan Joshi", obtained: 35, total: 50 },
      { studentId: "STU-0003", studentName: "Aditya Singh", obtained: 41, total: 50 },
    ],
    submittedBy: "Prof. Anita Verma", submittedByRole: "teacher", status: "pending", submittedAt: "2025-03-14 11:00",
  },
  {
    id: "EX-003", examName: "Mid-Term Exam", batch: "NEET 2025 - Batch B", subject: "Biology",
    marks: [
      { studentId: "STU-0004", studentName: "Ananya Kumar", obtained: 78, total: 100 },
      { studentId: "STU-0005", studentName: "Diya Gupta", obtained: 85, total: 100 },
    ],
    submittedBy: "Prof. Anita Verma", submittedByRole: "teacher", status: "approved", submittedAt: "2025-03-10 09:00",
  },
];

export default function MarksPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [exams, setExams] = useState(mockExams);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewExam, setViewExam] = useState<ExamEntry | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ examName: "", batch: "JEE 2025 - Batch A", subject: "", studentMarks: "" });

  const filtered = exams.filter(e => {
    const matchSearch = e.examName.toLowerCase().includes(search.toLowerCase()) || e.subject.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || e.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const approveExam = (id: string) => {
    setExams(prev => prev.map(e => e.id === id ? { ...e, status: "approved" } : e));
    toast({ title: "Approved", description: "Marks approved. Report card can now be generated." });
  };

  const rejectExam = (id: string) => {
    setExams(prev => prev.map(e => e.id === id ? { ...e, status: "rejected" } : e));
    toast({ title: "Rejected", description: "Marks rejected. Teacher will be notified to re-enter." });
  };

  const handleAddMarks = () => {
    if (!form.examName || !form.subject) {
      toast({ title: "Error", description: "All fields required.", variant: "destructive" });
      return;
    }
    const newExam: ExamEntry = {
      id: `EX-${String(exams.length + 1).padStart(3, "0")}`,
      examName: form.examName, batch: form.batch, subject: form.subject,
      marks: [
        { studentId: "STU-0001", studentName: "Aarav Gupta", obtained: Math.floor(Math.random() * 20) + 30, total: 50 },
        { studentId: "STU-0002", studentName: "Vivaan Joshi", obtained: Math.floor(Math.random() * 20) + 30, total: 50 },
      ],
      submittedBy: user?.name || "Admin", submittedByRole: isAdmin ? "admin" : "teacher",
      status: isAdmin ? "approved" : "pending",
      submittedAt: new Date().toLocaleString("en-IN"),
    };
    setExams(prev => [newExam, ...prev]);
    setAddOpen(false);
    setForm({ examName: "", batch: "JEE 2025 - Batch A", subject: "", studentMarks: "" });
    toast({ title: "Marks Submitted", description: isAdmin ? "Marks added and auto-approved." : "Marks submitted for admin approval." });
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
        studentMap.get(m.studentId)!.subjects.push({ subject: e.subject, obtained: m.obtained, total: m.total });
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
      const percentage = ((totalObt / totalMax) * 100).toFixed(1);
      html += `<div class="student-card">
<div class="header"><h1>Apex SMS</h1><h2>Report Card</h2><p>${exam.examName} — ${exam.batch}</p></div>
<p><strong>Student:</strong> ${data.name} &nbsp; <strong>ID:</strong> ${studentId}</p>
<table><tr><th>Subject</th><th>Marks Obtained</th><th>Total</th><th>%</th></tr>`;
      data.subjects.forEach(s => {
        html += `<tr><td>${s.subject}</td><td>${s.obtained}</td><td>${s.total}</td><td>${((s.obtained / s.total) * 100).toFixed(0)}%</td></tr>`;
      });
      html += `<tr style="font-weight:bold"><td>Total</td><td>${totalObt}</td><td>${totalMax}</td><td>${percentage}%</td></tr></table>
<p><strong>Grade:</strong> ${parseFloat(percentage) >= 90 ? 'A+' : parseFloat(percentage) >= 75 ? 'A' : parseFloat(percentage) >= 60 ? 'B' : 'C'}</p>
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border"><th className="text-left py-2 text-xs text-muted-foreground">Student</th><th className="text-center py-2 text-xs text-muted-foreground">Obtained</th><th className="text-center py-2 text-xs text-muted-foreground">Total</th><th className="text-center py-2 text-xs text-muted-foreground">%</th></tr>
            </thead>
            <tbody>
              {viewExam?.marks.map(m => (
                <tr key={m.studentId} className="border-b border-border/50">
                  <td className="py-2 text-foreground">{m.studentName}</td>
                  <td className="text-center py-2 tabular-nums text-foreground">{m.obtained}</td>
                  <td className="text-center py-2 tabular-nums text-muted-foreground">{m.total}</td>
                  <td className="text-center py-2 tabular-nums">
                    <span className={m.obtained / m.total >= 0.75 ? "text-success" : m.obtained / m.total >= 0.5 ? "text-warning" : "text-destructive"}>
                      {((m.obtained / m.total) * 100).toFixed(0)}%
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
        <DialogContent>
          <DialogHeader><DialogTitle>Enter Marks</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs font-medium text-foreground">Exam Name</label><Input value={form.examName} onChange={e => setForm(p => ({ ...p, examName: e.target.value }))} placeholder="e.g., Unit Test 4" /></div>
            <div>
              <label className="text-xs font-medium text-foreground">Batch</label>
              <select value={form.batch} onChange={e => setForm(p => ({ ...p, batch: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground">
                <option>JEE 2025 - Batch A</option>
                <option>NEET 2025 - Batch B</option>
                <option>Foundation 10th</option>
                <option>Foundation 11th</option>
              </select>
            </div>
            <div><label className="text-xs font-medium text-foreground">Subject</label><Input value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} placeholder="e.g., Physics" /></div>
            <p className="text-xs text-muted-foreground">Marks will be auto-populated for students in the selected batch. You can edit them after submission.</p>
            <Button className="w-full" onClick={handleAddMarks}>
              {isAdmin ? "Submit & Auto-Approve" : "Submit for Approval"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
