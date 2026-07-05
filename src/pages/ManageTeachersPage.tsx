import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import { GraduationCap, Plus, Edit, Trash2, Search, Eye, Key, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { supabase, isUuid } from "@/lib/supabase";
import { useAuth, AdminUser } from "@/contexts/AuthContext";

interface Batch {
  id: string;
  name: string;
  class_name: string;
}

interface TeacherRecord {
  id: string;
  name: string;
  email: string;
  password: string;
  phone: string;
  subjects: string[];
  assignedClasses: string[];
  status: "active" | "inactive";
  permissions: Record<string, { visible: boolean; read: boolean; write: boolean }>;
}

const allPages = [
  { key: "attendance", label: "Attendance" },
  { key: "students", label: "Students" },
  { key: "materials", label: "Study Materials" },
  { key: "assignments", label: "Assignments" },
  { key: "marks", label: "Marks Entry" },
  { key: "messages", label: "Messages" },
  { key: "analytics", label: "Analytics" },
  { key: "timetable", label: "Timetable" },
  { key: "leaves", label: "Leave Management" },
  { key: "calendar", label: "Calendar" },
];

const defaultPermissions = Object.fromEntries(allPages.map(p => [p.key, { visible: true, read: true, write: false }]));

export default function ManageTeachersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const DEFAULT_UUID = "00000000-0000-0000-0000-000000000001";
  const instId = isAdmin ? (user as AdminUser).instituteId : DEFAULT_UUID;

  const [teachers, setTeachers] = useState<TeacherRecord[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", email: "", password: "", phone: "", subjects: "" as string,
    assignedClasses: [] as string[],
    permissions: defaultPermissions as Record<string, { visible: boolean; read: boolean; write: boolean }>,
  });

  // Fetch batches and teachers from Supabase
  useEffect(() => {
    if (isUuid(instId)) {
      fetchData();
    }
  }, [instId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch batches
      const { data: batchData, error: batchError } = await supabase
        .from("batches")
        .select("id, name, class_name")
        .eq("institute_id", instId)
        .eq("status", "active")
        .order("name", { ascending: true });

      if (batchError) throw batchError;
      setBatches(batchData || []);

      // Fetch teachers from teachers table
      const { data: teacherData, error: teacherError } = await supabase
        .from("teachers")
        .select("*")
        .eq("institute_id", instId)
        .order("created_at", { ascending: false });

      if (teacherError) throw teacherError;

      const mapped: TeacherRecord[] = (teacherData || []).map((t: any) => ({
        id: t.id,
        name: t.name || "",
        email: t.email || "",
        password: t.password || "",
        phone: t.phone || "",
        subjects: t.subjects || [],
        assignedClasses: t.assigned_classes || [],
        status: t.status || "active",
        permissions: (t.permissions && typeof t.permissions === 'object' && !Array.isArray(t.permissions))
          ? t.permissions
          : { ...defaultPermissions },
      }));

      setTeachers(mapped);
    } catch (error: any) {
      console.error("Error fetching data:", error);
      toast({ title: "Error", description: "Failed to load data.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const filtered = teachers.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) || t.email.toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setEditingId(null);
    setForm({ name: "", email: "", password: "", phone: "", subjects: "", assignedClasses: [], permissions: { ...defaultPermissions } });
    setDialogOpen(true);
  };

  const openEdit = (t: TeacherRecord) => {
    setEditingId(t.id);
    setForm({
      name: t.name, email: t.email, password: "", phone: t.phone,
      subjects: t.subjects.join(", "), assignedClasses: [...t.assignedClasses],
      permissions: JSON.parse(JSON.stringify(t.permissions)),
    });
    setDialogOpen(true);
  };

  const toggleClass = (cls: string) => {
    setForm(prev => ({
      ...prev,
      assignedClasses: prev.assignedClasses.includes(cls)
        ? prev.assignedClasses.filter(c => c !== cls)
        : [...prev.assignedClasses, cls],
    }));
  };

  const updatePermission = (page: string, field: "visible" | "read" | "write", value: boolean) => {
    setForm(prev => {
      const updated = { ...prev.permissions };
      updated[page] = { ...updated[page], [field]: value };
      if (field === "visible" && !value) {
        updated[page].read = false;
        updated[page].write = false;
      }
      if (field === "write" && value) {
        updated[page].read = true;
        updated[page].visible = true;
      }
      if (field === "read" && value) {
        updated[page].visible = true;
      }
      return { ...prev, permissions: updated };
    });
  };

  const handleSave = async () => {
    if (!form.name || !form.email || (!editingId && !form.password)) {
      toast({ title: "Error", description: "Name, email and password are required.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const teacherPayload = {
        institute_id: instId,
        name: form.name,
        email: form.email,
        phone: form.phone,
        subjects: form.subjects.split(",").map(s => s.trim()).filter(Boolean),
        assigned_classes: form.assignedClasses,
        permissions: form.permissions,
        status: "active" as const,
        updated_at: new Date().toISOString(),
      };

      if (editingId) {
        // Update existing teacher
        const updatePayload: any = { ...teacherPayload };
        if (form.password) {
          updatePayload.password = form.password;
        }
        delete updatePayload.institute_id;
        delete updatePayload.status;

        const { error } = await supabase
          .from("teachers")
          .update(updatePayload)
          .eq("id", editingId);

        if (error) throw error;

        setTeachers(prev => prev.map(t => t.id === editingId ? {
          ...t,
          name: form.name,
          email: form.email,
          phone: form.phone,
          password: form.password || t.password,
          subjects: form.subjects.split(",").map(s => s.trim()).filter(Boolean),
          assignedClasses: form.assignedClasses,
          permissions: form.permissions,
        } : t));

        toast({ title: "Updated", description: `${form.name} updated.` });
      } else {
        // Create new teacher
        const insertPayload = {
          ...teacherPayload,
          password: form.password,
        };

        const { data, error } = await supabase
          .from("teachers")
          .insert([insertPayload])
          .select()
          .single();

        if (error) throw error;

        const newT: TeacherRecord = {
          id: data.id,
          name: form.name,
          email: form.email,
          password: form.password,
          phone: form.phone,
          subjects: form.subjects.split(",").map(s => s.trim()).filter(Boolean),
          assignedClasses: form.assignedClasses,
          status: "active",
          permissions: form.permissions,
        };

        setTeachers(prev => [newT, ...prev]);
        toast({ title: "Added", description: `${form.name} added with login credentials.` });
      }

      setDialogOpen(false);
    } catch (error: any) {
      console.error("Error saving teacher:", error);
      toast({ title: "Error", description: error.message || "Failed to save teacher.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteTeacher = async (id: string) => {
    try {
      const { error } = await supabase
        .from("teachers")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setTeachers(prev => prev.filter(t => t.id !== id));
      toast({ title: "Deleted", description: "Teacher removed." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const toggleTeacherStatus = async (id: string) => {
    const teacher = teachers.find(t => t.id === id);
    if (!teacher) return;
    const newStatus = teacher.status === "active" ? "inactive" : "active";

    try {
      const { error } = await supabase
        .from("teachers")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;

      setTeachers(prev => prev.map(t => t.id === id ? { ...t, status: newStatus as "active" | "inactive" } : t));
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
        <div className="flex items-center justify-center min-h-[300px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Manage Teachers</h2>
          <p className="text-sm text-muted-foreground">Create login credentials and manage batch assignments</p>
        </div>
        <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Add Teacher</Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search teachers..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="space-y-2">
        {filtered.map(t => (
          <div key={t.id} className="surface-elevated rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-semibold text-primary">{t.name.split(" ").slice(-2).map(n => n[0]).join("")}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{t.name}</p>
                    <StatusBadge variant={t.status === "active" ? "success" : "warning"}>{t.status}</StatusBadge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{t.email}</span>
                    <span>•</span>
                    <button onClick={() => setShowPassword(p => ({ ...p, [t.id]: !p[t.id] }))} className="flex items-center gap-1 text-primary hover:underline">
                      <Key className="w-3 h-3" />
                      {showPassword[t.id] ? t.password : "••••••"}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {t.assignedClasses.map(c => (
                      <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">{c}</span>
                    ))}
                    {t.assignedClasses.length === 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground italic">No batches assigned</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(t)}><Edit className="w-3.5 h-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleTeacherStatus(t.id)}>
                  <Eye className={`w-3.5 h-3.5 ${t.status !== "active" ? "text-muted-foreground" : ""}`} />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteTeacher(t.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}>
                  {expandedId === t.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>
            {expandedId === t.id && (
              <div className="px-4 pb-3 border-t border-border/50">
                <p className="text-xs font-medium text-muted-foreground mt-2 mb-1">Page Permissions</p>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {allPages.map(page => {
                    const perm = t.permissions[page.key];
                    return (
                      <div key={page.key} className={cn(
                        "text-[10px] px-2 py-1 rounded text-center",
                        !perm?.visible ? "bg-secondary text-muted-foreground line-through" :
                          perm.write ? "bg-success/10 text-success" :
                            perm.read ? "bg-primary/10 text-primary" :
                              "bg-secondary text-muted-foreground"
                      )}>
                        {page.label}
                        {perm?.visible && <span className="block">{perm.write ? "R/W" : perm.read ? "Read" : "—"}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && !loading && (
          <div className="p-12 text-center text-muted-foreground">
            <GraduationCap className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No teachers found</p>
            <p className="text-xs mt-1">{batches.length === 0 ? "Create batches first, then add teachers." : "Add your first teacher to get started."}</p>
          </div>
        )}
      </div>

      {/* Add/Edit Teacher Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Teacher" : "Add New Teacher"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium text-foreground">Full Name</label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
              <div><label className="text-xs font-medium text-foreground">Phone</label><Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium text-foreground">Login Email</label><Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
              <div><label className="text-xs font-medium text-foreground">Password</label><Input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder={editingId ? "Leave blank to keep" : "Required"} /></div>
            </div>
            <div><label className="text-xs font-medium text-foreground">Subjects (comma separated)</label><Input value={form.subjects} onChange={e => setForm(p => ({ ...p, subjects: e.target.value }))} placeholder="Physics, Mathematics" /></div>

            <div>
              <label className="text-xs font-medium text-foreground">Assigned Batches</label>
              {batches.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-1 italic">No batches created yet. Create batches in Batch Management first.</p>
              ) : (
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {batches.map(cls => (
                    <button key={cls.id} onClick={() => toggleClass(cls.name)} className={cn(
                      "px-2.5 py-1 text-xs rounded-md border transition-colors",
                      form.assignedClasses.includes(cls.name)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary text-muted-foreground border-border hover:border-primary"
                    )}>
                      {cls.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-foreground">Page Permissions</label>
              <div className="mt-1.5 rounded-md border border-border overflow-hidden">
                <div className="grid grid-cols-4 gap-0 px-3 py-2 bg-secondary/50 text-[10px] font-medium text-muted-foreground uppercase">
                  <span>Page</span><span className="text-center">Show</span><span className="text-center">Read</span><span className="text-center">Write</span>
                </div>
                {allPages.map(page => (
                  <div key={page.key} className="grid grid-cols-4 gap-0 px-3 py-2 border-t border-border/50 items-center">
                    <span className="text-xs text-foreground">{page.label}</span>
                    <div className="flex justify-center"><Switch checked={form.permissions[page.key]?.visible} onCheckedChange={v => updatePermission(page.key, "visible", v)} className="scale-75" /></div>
                    <div className="flex justify-center"><Switch checked={form.permissions[page.key]?.read} onCheckedChange={v => updatePermission(page.key, "read", v)} className="scale-75" disabled={!form.permissions[page.key]?.visible} /></div>
                    <div className="flex justify-center"><Switch checked={form.permissions[page.key]?.write} onCheckedChange={v => updatePermission(page.key, "write", v)} className="scale-75" disabled={!form.permissions[page.key]?.read} /></div>
                  </div>
                ))}
              </div>
            </div>

            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {editingId ? "Update Teacher" : "Add Teacher"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
