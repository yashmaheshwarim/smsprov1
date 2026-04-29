import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import { GraduationCap, Plus, Edit, Trash2, Search, Eye, Key, ChevronDown, ChevronUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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
  { key: "messages", label: "Messages" },
  { key: "fees", label: "Fees" },
  { key: "analytics", label: "Analytics" },
  { key: "timetable", label: "Timetable" },
  { key: "leaves", label: "Leave Management" },
];

const defaultPermissions = Object.fromEntries(allPages.map(p => [p.key, { visible: true, read: true, write: false }]));

const allClasses = ["JEE 2025 - Batch A", "NEET 2025 - Batch B", "Foundation 10th", "Foundation 11th", "CET 2025", "Board 12th Science"];

const initialTeachers: TeacherRecord[] = [
  { id: "T001", name: "Dr. Rajesh Sharma", email: "rajesh@institute.com", password: "teacher123", phone: "+91 9876543210", subjects: ["Physics", "Mathematics"], assignedClasses: ["JEE 2025 - Batch A", "Foundation 11th"], status: "active", permissions: { ...defaultPermissions, fees: { visible: false, read: false, write: false } } },
  { id: "T002", name: "Prof. Anita Verma", email: "anita@institute.com", password: "teacher123", phone: "+91 9876543211", subjects: ["Chemistry"], assignedClasses: ["NEET 2025 - Batch B"], status: "active", permissions: { ...defaultPermissions, fees: { visible: false, read: false, write: false }, analytics: { visible: false, read: false, write: false } } },
  { id: "T003", name: "Mr. Suresh Patel", email: "suresh@institute.com", password: "teacher123", phone: "+91 9876543212", subjects: ["Biology"], assignedClasses: ["NEET 2025 - Batch B", "Foundation 10th"], status: "active", permissions: defaultPermissions },
  { id: "T004", name: "Ms. Kavita Nair", email: "kavita@institute.com", password: "teacher123", phone: "+91 9876543213", subjects: ["English", "Hindi"], assignedClasses: ["Foundation 10th", "Board 12th Science"], status: "active", permissions: defaultPermissions },
  { id: "T005", name: "Dr. Amit Kumar", email: "amit@institute.com", password: "teacher123", phone: "+91 9876543214", subjects: ["Mathematics"], assignedClasses: ["CET 2025"], status: "inactive", permissions: defaultPermissions },
];

import { useAuth, AdminUser } from "@/contexts/AuthContext";

export default function ManageTeachersPage() {
  const { user } = useAuth();
  const instId = user?.role === "admin" ? (user as AdminUser).instituteId : "INST-001";
  const [teachers, setTeachers] = useState(instId === "INST-001" ? initialTeachers : []);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({
    name: "", email: "", password: "", phone: "", subjects: "" as string,
    assignedClasses: [] as string[],
    permissions: defaultPermissions as Record<string, { visible: boolean; read: boolean; write: boolean }>,
  });

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
      name: t.name, email: t.email, password: t.password, phone: t.phone,
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

  const handleSave = () => {
    if (!form.name || !form.email || (!editingId && !form.password)) {
      toast({ title: "Error", description: "Name, email and password are required.", variant: "destructive" });
      return;
    }
    if (editingId) {
      setTeachers(prev => prev.map(t => t.id === editingId ? {
        ...t, name: form.name, email: form.email, phone: form.phone,
        password: form.password || t.password,
        subjects: form.subjects.split(",").map(s => s.trim()).filter(Boolean),
        assignedClasses: form.assignedClasses,
        permissions: form.permissions,
      } : t));
      toast({ title: "Updated", description: `${form.name} updated.` });
    } else {
      const newT: TeacherRecord = {
        id: `T${String(teachers.length + 1).padStart(3, "0")}`,
        name: form.name, email: form.email, password: form.password, phone: form.phone,
        subjects: form.subjects.split(",").map(s => s.trim()).filter(Boolean),
        assignedClasses: form.assignedClasses, status: "active",
        permissions: form.permissions,
      };
      setTeachers(prev => [...prev, newT]);
      toast({ title: "Added", description: `${form.name} added with login credentials.` });
    }
    setDialogOpen(false);
  };

  const deleteTeacher = (id: string) => {
    setTeachers(prev => prev.filter(t => t.id !== id));
    toast({ title: "Deleted", description: "Teacher removed." });
  };

  const toggleTeacherStatus = (id: string) => {
    setTeachers(prev => prev.map(t => t.id === id ? { ...t, status: t.status === "active" ? "inactive" : "active" } : t));
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Manage Teachers</h2>
          <p className="text-sm text-muted-foreground">Create login credentials and manage page permissions</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Add Teacher</Button>
          </DialogTrigger>
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
                <div><label className="text-xs font-medium text-foreground">Password</label><Input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder={editingId ? "Keep existing" : ""} /></div>
              </div>
              <div><label className="text-xs font-medium text-foreground">Subjects (comma separated)</label><Input value={form.subjects} onChange={e => setForm(p => ({ ...p, subjects: e.target.value }))} placeholder="Physics, Mathematics" /></div>

              <div>
                <label className="text-xs font-medium text-foreground">Assigned Classes</label>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {allClasses.map(cls => (
                    <button key={cls} onClick={() => toggleClass(cls)} className={cn(
                      "px-2.5 py-1 text-xs rounded-md border transition-colors",
                      form.assignedClasses.includes(cls)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary text-muted-foreground border-border hover:border-primary"
                    )}>
                      {cls}
                    </button>
                  ))}
                </div>
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

              <Button className="w-full" onClick={handleSave}>{editingId ? "Update Teacher" : "Add Teacher"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search teachers..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="space-y-2">
        {filtered.map(t => (
          <div key={t.id} className="surface-elevated rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-semibold text-primary">{t.name.split(" ").slice(-2).map(n => n[0]).join("")}</span>
                </div>
                <div className="min-w-0">
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
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(t)}><Edit className="w-3.5 h-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleTeacherStatus(t.id)}>
                  {t.status === "active" ? <Eye className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5 text-muted-foreground" />}
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
      </div>
    </div>
  );
}
