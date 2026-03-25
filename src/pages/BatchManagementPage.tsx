import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Layers, Plus, Edit, Trash2, Users } from "lucide-react";

interface Batch {
  id: string;
  name: string;
  class: string;
  studentCount: number;
  subjects: string[];
  status: "active" | "archived";
  createdAt: string;
}

const initialBatches: Batch[] = [
  { id: "B001", name: "JEE 2025 - Batch A", class: "12th Science", studentCount: 45, subjects: ["Physics", "Chemistry", "Mathematics"], status: "active", createdAt: "2024-06-01" },
  { id: "B002", name: "NEET 2025 - Batch B", class: "12th Science", studentCount: 38, subjects: ["Physics", "Chemistry", "Biology"], status: "active", createdAt: "2024-06-01" },
  { id: "B003", name: "Foundation 10th", class: "10th", studentCount: 52, subjects: ["Science", "Mathematics", "English"], status: "active", createdAt: "2024-04-15" },
  { id: "B004", name: "Foundation 11th", class: "11th Science", studentCount: 40, subjects: ["Physics", "Chemistry", "Mathematics", "Biology"], status: "active", createdAt: "2024-04-15" },
];

export default function BatchManagementPage() {
  const [batches, setBatches] = useState(initialBatches);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", class: "", subjects: "" });

  const openAdd = () => {
    setEditingId(null);
    setForm({ name: "", class: "", subjects: "" });
    setDialogOpen(true);
  };

  const openEdit = (b: Batch) => {
    setEditingId(b.id);
    setForm({ name: b.name, class: b.class, subjects: b.subjects.join(", ") });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name || !form.class) {
      toast({ title: "Error", description: "Batch name and class are required.", variant: "destructive" });
      return;
    }
    const subjects = form.subjects.split(",").map(s => s.trim()).filter(Boolean);
    if (editingId) {
      setBatches(prev => prev.map(b => b.id === editingId ? { ...b, name: form.name, class: form.class, subjects } : b));
      toast({ title: "Updated", description: `${form.name} updated.` });
    } else {
      setBatches(prev => [...prev, {
        id: `B${String(prev.length + 1).padStart(3, "0")}`,
        name: form.name, class: form.class, subjects, studentCount: 0,
        status: "active", createdAt: new Date().toISOString().split("T")[0],
      }]);
      toast({ title: "Created", description: `Batch "${form.name}" created.` });
    }
    setDialogOpen(false);
  };

  const deleteBatch = (id: string) => {
    setBatches(prev => prev.filter(b => b.id !== id));
    toast({ title: "Deleted", description: "Batch removed." });
  };

  const toggleArchive = (id: string) => {
    setBatches(prev => prev.map(b => b.id === id ? { ...b, status: b.status === "active" ? "archived" : "active" } : b));
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Batch Management</h2>
          <p className="text-sm text-muted-foreground">Create and customize your own batches and classes</p>
        </div>
        <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Create Batch</Button>
      </div>

      <div className="p-3 rounded-md bg-primary/5 border border-primary/20">
        <p className="text-xs text-foreground">
          <strong>💡 Tip:</strong> Create custom batches based on your institute's needs. You can organize by class, exam type, or any custom grouping.
          Assign students and teachers to batches for organized management.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {batches.map(batch => (
          <div key={batch.id} className="surface-elevated rounded-lg p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">{batch.name}</h3>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Class: {batch.class}</p>
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
            <div className="flex gap-1 pt-2 border-t border-border">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openEdit(batch)}><Edit className="w-3 h-3 mr-1" /> Edit</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => toggleArchive(batch.id)}>
                {batch.status === "active" ? "Archive" : "Activate"}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => deleteBatch(batch.id)}><Trash2 className="w-3 h-3 mr-1" /> Delete</Button>
            </div>
          </div>
        ))}
      </div>

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
