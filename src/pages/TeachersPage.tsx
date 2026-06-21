import { useState, useEffect, useMemo } from "react";
import { Mail, Phone, Search, Filter, Plus, Edit2, Trash2, ChevronDown, ChevronUp, Eye } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { supabase, isUuid } from "@/lib/supabase";
import { useAuth, AdminUser } from "@/contexts/AuthContext";

interface Teacher {
  id: string;
  user_id?: string;
  name: string;
  email: string;
  phone?: string;
  subjects: string[];
  assignedClasses: string[];
  timetableEntries: TimetableEntry[];
  status: "active" | "inactive";
  permissions: Record<string, { visible: boolean; read: boolean; write: boolean }>;
}

interface TimetableEntry {
  id: string;
  day: string;
  start_time: string;
  end_time: string;
  subject: string;
  room?: string;
  batch: string;
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

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const timeSlots = ["08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00"];

export default function TeachersPage() {
  const { user } = useAuth();
  const instId = user?.role === "admin" ? (user as AdminUser).instituteId : undefined;
  const isAdmin = user?.role === "admin";

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [batches, setBatches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    subjects: "",
    assignedClasses: [] as string[],
    permissions: defaultPermissions as Record<string, { visible: boolean; read: boolean; write: boolean }>,
  });

  const allSubjects = useMemo(() => {
    const subjectsSet = new Set<string>();
    teachers.forEach(t => t.subjects.forEach(s => subjectsSet.add(s)));
    return Array.from(subjectsSet);
  }, [teachers]);

  useEffect(() => {
    if (isAdmin && isUuid(instId)) {
      fetchBatches();
      fetchTeachers();
    }
  }, [instId, isAdmin]);

  const fetchBatches = async () => {
    try {
      const { data, error } = await supabase
        .from("batches")
        .select("name")
        .eq("institute_id", instId)
        .eq("status", "active")
        .order("name");

      if (error) throw error;
      setBatches((data || []).map((b: any) => b.name));
    } catch (error: any) {
      console.error("Error fetching batches:", error);
      setBatches([]);
    }
  };

  const fetchTeachers = async () => {
    if (!instId || !isUuid(instId)) {
      setTeachers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("teachers")
        .select(`
          id,
          user_id,
          phone,
          subjects,
          assigned_classes,
          permissions,
          status,
          users ( id, name, email )
        `)
        .eq("institute_id", instId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const teachersWithDetails: Teacher[] = await Promise.all(
        (data || []).map(async (t: any) => {
          let timetableEntries: TimetableEntry[] = [];
          try {
            const { data: ttData } = await supabase
              .from("timetable_entries")
              .select("*")
              .eq("teacher_id", t.id);
            timetableEntries = (ttData || []).map((entry: any) => ({
              id: entry.id,
              day: entry.day,
              start_time: entry.start_time,
              end_time: entry.end_time,
              subject: entry.subject,
              room: entry.room,
              batch: entry.batch,
            }));
          } catch (e) {
            console.log("Could not fetch timetable for teacher:", t.id);
          }

          return {
            id: t.id,
            user_id: t.user_id,
            name: t.users?.name || "Unknown Teacher",
            email: t.users?.email || "",
            phone: t.phone,
            subjects: t.subjects || [],
            assignedClasses: t.assigned_classes || [],
            timetableEntries,
            status: t.status || "active",
            permissions: t.permissions || defaultPermissions,
          };
        })
      );

      setTeachers(teachersWithDetails);
    } catch (error: any) {
      console.error("Error fetching teachers:", error);
      setTeachers([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredTeachers = useMemo(() => {
    return teachers.filter(t => {
      const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) || t.email.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || t.status === statusFilter;
      const matchSubject = subjectFilter === "all" || t.subjects.includes(subjectFilter);
      return matchSearch && matchStatus && matchSubject;
    });
  }, [search, statusFilter, subjectFilter, teachers]);

  const openAdd = () => {
    setEditingId(null);
    setForm({ name: "", email: "", password: "", phone: "", subjects: "", assignedClasses: [], permissions: { ...defaultPermissions } });
    setDialogOpen(true);
  };

  const openEdit = (teacher: Teacher) => {
    setEditingId(teacher.id);
    setForm({
      name: teacher.name,
      email: teacher.email,
      password: "",
      phone: teacher.phone || "",
      subjects: teacher.subjects.join(", "),
      assignedClasses: [...teacher.assignedClasses],
      permissions: JSON.parse(JSON.stringify(teacher.permissions)),
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

    if (!instId || !isUuid(instId)) return;

    try {
      let userRecord;
      if (editingId) {
        const teacher = teachers.find(t => t.id === editingId);
        if (!teacher) return;

        const { data: updateData, error: userError } = await supabase
          .from("users")
          .update({
            name: form.name,
            email: form.email,
          })
          .eq("id", teacher.user_id)
          .select()
          .single();

        if (userError) throw userError;
        userRecord = updateData;

        const { error: teacherError } = await supabase
          .from("teachers")
          .update({
            phone: form.phone || null,
            subjects: form.subjects.split(",").map(s => s.trim()).filter(Boolean),
            assigned_classes: form.assignedClasses,
            permissions: form.permissions,
            status: "active",
          })
          .eq("id", editingId);

        if (teacherError) throw teacherError;
        toast({ title: "Updated", description: `${form.name} updated.` });
      } else {
        const { data: newUser, error: userError } = await supabase
          .from("users")
          .insert([{
            institute_id: instId,
            name: form.name,
            email: form.email,
            role: "teacher",
          }])
          .select()
          .single();

        if (userError) throw userError;
        userRecord = newUser;

        const { data: newTeacher, error: teacherError } = await supabase
          .from("teachers")
          .insert([{
            institute_id: instId,
            user_id: userRecord.id,
            phone: form.phone || null,
            subjects: form.subjects.split(",").map(s => s.trim()).filter(Boolean),
            assigned_classes: form.assignedClasses,
            permissions: form.permissions,
            status: "active",
          }])
          .select()
          .single();

        if (teacherError) throw teacherError;
        toast({ title: "Added", description: `${form.name} added with login credentials.` });
      }

      setDialogOpen(false);
      await fetchTeachers();
    } catch (error: any) {
      console.error("Error saving teacher:", error);
      toast({ title: "Error", description: error.message || "Failed to save teacher.", variant: "destructive" });
    }
  };

  const deleteTeacher = async (id: string) => {
    const teacher = teachers.find(t => t.id === id);
    if (!teacher) return;

    try {
      await supabase.from("teachers").delete().eq("id", id);
      if (teacher.user_id) {
        await supabase.from("users").delete().eq("id", teacher.user_id);
      }
      toast({ title: "Deleted", description: "Teacher removed." });
      await fetchTeachers();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const toggleTeacherStatus = async (id: string) => {
    const teacher = teachers.find(t => t.id === id);
    if (!teacher) return;

    try {
      const newStatus = teacher.status === "active" ? "inactive" : "active";
      await supabase
        .from("teachers")
        .update({ status: newStatus })
        .eq("id", id);
      await fetchTeachers();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const openAddTimetable = (teacher: Teacher) => {
    openEdit(teacher);
  };

  if (!isAdmin) {
    return <div className="p-4 lg:p-6"><p>Access denied. Admin only.</p></div>;
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Teachers Management</h2>
          <p className="text-sm text-muted-foreground">Create teachers, assign batches, subjects, and timetables</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openAdd}>
              <Plus className="w-4 h-4 mr-1" /> Add Teacher
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Teacher" : "Add New Teacher"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-foreground">Full Name</label>
                  <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground">Phone</label>
                  <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-foreground">Login Email</label>
                  <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground">Password</label>
                  <Input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder={editingId ? "Keep existing" : ""} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Subjects (comma separated)</label>
                <Input value={form.subjects} onChange={e => setForm(p => ({ ...p, subjects: e.target.value }))} placeholder="Physics, Mathematics" />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground">Assigned Batches</label>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {batches.map(batch => (
                    <button
                      key={batch}
                      onClick={() => toggleClass(batch)}
                      className={cn(
                        "px-2.5 py-1 text-xs rounded-md border transition-colors",
                        form.assignedClasses.includes(batch)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-secondary text-muted-foreground border-border hover:border-primary"
                      )}
                    >
                      {batch}
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
                      <div className="flex justify-center">
                        <Switch checked={form.permissions[page.key]?.visible} onCheckedChange={v => updatePermission(page.key, "visible", v)} className="scale-75" />
                      </div>
                      <div className="flex justify-center">
                        <Switch checked={form.permissions[page.key]?.read} onCheckedChange={v => updatePermission(page.key, "read", v)} className="scale-75" disabled={!form.permissions[page.key]?.visible} />
                      </div>
                      <div className="flex justify-center">
                        <Switch checked={form.permissions[page.key]?.write} onCheckedChange={v => updatePermission(page.key, "write", v)} className="scale-75" disabled={!form.permissions[page.key]?.read} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Button className="w-full" onClick={handleSave}>{editingId ? "Update Teacher" : "Add Teacher"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-card border border-border flex-1 sm:flex-initial sm:w-64">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search teachers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
                <Filter className="w-4 h-4 mr-2" /> Filters
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72">
              <div className="space-y-4">
                <h4 className="font-medium text-sm">Filter Teachers</h4>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Status</label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
                      className="w-full px-3 py-2 rounded-md bg-secondary border-none text-sm text-foreground outline-none"
                    >
                      <option value="all">All Status</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Subject</label>
                    <select
                      value={subjectFilter}
                      onChange={(e) => setSubjectFilter(e.target.value)}
                      className="w-full px-3 py-2 rounded-md bg-secondary border-none text-sm text-foreground outline-none"
                    >
                      <option value="all">All Subjects</option>
                      {allSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                {(statusFilter !== "all" || subjectFilter !== "all") && (
                  <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => { setStatusFilter("all"); setSubjectFilter("all"); }}>
                    Clear Filters
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading teachers...</div>
        ) : filteredTeachers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No teachers found</div>
        ) : (
          filteredTeachers.map(t => (
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
                      <Mail className="w-3 h-3" />
                      <span className="truncate">{t.email}</span>
                      {t.phone && (
                        <>
                          <span>•</span>
                          <Phone className="w-3 h-3" />
                          <span>{t.phone}</span>
                        </>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {t.subjects.map(subject => (
                        <span key={subject} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">{subject}</span>
                      ))}
                      {t.assignedClasses.map(c => (
                        <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{c}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(t)}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleTeacherStatus(t.id)}>
                    {t.status === "active" ? <Eye className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5 text-muted-foreground" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteTeacher(t.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}>
                    {expandedId === t.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>
              {expandedId === t.id && (
                <div className="px-4 pb-3 border-t border-border/50">
                  <div className="mt-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Page Permissions</p>
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
                  {t.timetableEntries && t.timetableEntries.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Timetable</p>
                      <div className="space-y-1">
                        {t.timetableEntries.map(entry => (
                          <div key={entry.id} className="flex items-center gap-2 text-xs bg-secondary/30 px-2 py-1 rounded">
                            <span className="font-medium">{entry.day}:</span>
                            <span>{entry.start_time} - {entry.end_time}</span>
                            <span className="text-primary">• {entry.subject}</span>
                            {entry.room && <span className="text-muted-foreground">(Room {entry.room})</span>}
                            <span className="text-muted-foreground">[{entry.batch}]</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}