import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Layers, Plus, Edit, Trash2, Users, Loader2 } from "lucide-react";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { DataImportDialog } from "@/components/shared/DataImportDialog";



interface Batch {
  id: string;
  name: string;
  class_name: string;
  studentCount: number;
  subjects: string[];
  status: "active" | "archived";
  createdAt: string;
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
    const { data, error } = await supabase
      .from('batches')
      .select('*')
      .eq('institute_id', instId)
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setBatches((data || []).map((d: any) => ({
        id: d.id,
        name: d.name,
        class_name: d.class_name,
        subjects: d.subjects || [],
        status: d.status,
        studentCount: 0, // In a real scenario, join with students table
        createdAt: new Date(d.created_at).toLocaleDateString("en-IN"),
      })));
    }
    setLoading(false);
  };

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
        {batches.map(batch => (
          <div key={batch.id} className="surface-elevated rounded-lg p-4">
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
