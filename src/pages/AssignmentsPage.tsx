import { useState } from "react";
import { ClipboardList, Plus, Calendar, Users, Upload, Download } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

type Assignment = {
  id: string; title: string; subject: string; batch: string; dueDate: string; submissions: number; total: number; status: string;
  fileUrl?: string; fileName?: string;
};

const initialAssignments: Assignment[] = [
  { id: "A001", title: "Thermodynamics Problem Set", subject: "Physics", batch: "JEE 2025 - Batch A", dueDate: "2025-02-15", submissions: 28, total: 35, status: "active" },
  { id: "A002", title: "Organic Chemistry Worksheet", subject: "Chemistry", batch: "NEET 2025 - Batch B", dueDate: "2025-02-18", submissions: 40, total: 42, status: "active" },
  { id: "A003", title: "Calculus Integration Quiz", subject: "Mathematics", batch: "JEE 2025 - Batch A", dueDate: "2025-02-10", submissions: 35, total: 35, status: "completed" },
  { id: "A004", title: "Cell Biology Diagram Labeling", subject: "Biology", batch: "NEET 2025 - Batch B", dueDate: "2025-02-20", submissions: 12, total: 42, status: "active" },
];

export default function AssignmentsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isTeacher = user?.role === "teacher";
  const canUpload = isAdmin || isTeacher;

  const instId = isAdmin ? (user as any).instituteId : "INST-001";
  const [assignments, setAssignments] = useState<Assignment[]>(instId === "INST-001" ? initialAssignments : []);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ title: "", subject: "Physics", batch: "JEE 2025 - Batch A", dueDate: "" });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleCreate = () => {
    if (!form.title || !form.dueDate) {
      toast({ title: "Error", description: "Title and due date are required.", variant: "destructive" });
      return;
    }
    
    let fileUrl;
    let fileName;

    if (selectedFile) {
      fileUrl = URL.createObjectURL(selectedFile);
      fileName = selectedFile.name;
    }

    const newA: Assignment = {
      id: `A${String(assignments.length + 1).padStart(3, "0")}`,
      title: form.title,
      subject: form.subject,
      batch: form.batch,
      dueDate: form.dueDate,
      submissions: 0,
      total: 40,
      status: "active",
      fileUrl,
      fileName,
    };
    
    setAssignments(prev => [newA, ...prev]);
    setCreateOpen(false);
    setForm({ title: "", subject: "Physics", batch: "JEE 2025 - Batch A", dueDate: "" });
    setSelectedFile(null);
    toast({ title: "Assignment Created", description: `"${form.title}" created successfully.` });
  };

  const handleDownload = (e: React.MouseEvent, a: Assignment) => {
    e.stopPropagation();
    if (a.fileUrl) {
      toast({ title: "Download Started", description: `Downloading "${a.title}"...` });
      const link = document.createElement('a');
      link.href = a.fileUrl;
      link.download = a.fileName || `${a.title}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      toast({ title: "No File", description: "There is no file attached to this assignment.", variant: "destructive" });
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Assignments & Tests</h2>
        {canUpload && (
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-1" /> Create Assignment</Button>
        )}
      </div>

      <div className="space-y-3">
        {assignments.map((a) => (
          <div key={a.id} className="surface-interactive rounded-lg p-4 cursor-pointer">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-md bg-primary/10 shrink-0">
                  <ClipboardList className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{a.title}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <StatusBadge variant="default">{a.subject}</StatusBadge>
                    <span className="text-xs text-muted-foreground">{a.batch}</span>
                    {a.fileUrl && (
                      <Button variant="ghost" size="sm" className="h-5 text-[10px] px-2" onClick={(e) => handleDownload(e, a)}>
                        <Download className="w-3 h-3 mr-1" /> PDF
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 sm:gap-6">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  <span className="tabular-nums">{a.dueDate}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="w-3 h-3" />
                  <span className="tabular-nums">{a.submissions}/{a.total}</span>
                </div>
                <StatusBadge variant={a.status === "completed" ? "success" : "primary"}>
                  {a.status}
                </StatusBadge>
              </div>
            </div>
            <div className="mt-3 h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${(a.submissions / a.total) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Assignment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs font-medium text-foreground">Title</label><Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g., Chapter 1 Test" /></div>
            <div>
              <label className="text-xs font-medium text-foreground">Subject</label>
              <select value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground">
                <option>Physics</option><option>Chemistry</option><option>Mathematics</option><option>Biology</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Batch</label>
              <select value={form.batch} onChange={e => setForm(p => ({ ...p, batch: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground">
                <option>JEE 2025 - Batch A</option><option>NEET 2025 - Batch B</option><option>Foundation 10th</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Due Date</label>
              <Input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Upload PDF (Optional)</label>
              <Input type="file" accept=".pdf" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} className="mt-1" />
            </div>
            <Button className="w-full" onClick={handleCreate}><Upload className="w-4 h-4 mr-1" /> Create Assignment</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
