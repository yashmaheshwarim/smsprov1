import { useState, useEffect } from "react";
import { useAuth, AdminUser, ALL_ADMIN_PAGES } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/ui/stat-card";
import { Switch } from "@/components/ui/switch";
import { Building2, Users, Plus, Trash2, Edit, LogOut, Search, Eye, EyeOff, Settings, CreditCard, Wallet, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import logo from "@/assets/maheshwari-tech-logo.png";

interface Institute {
  id: string;
  name: string;
  adminName: string;
  adminEmail: string;
  students: number;
  teachers: number;
  studentLimit: number;
  teacherLimit: number;
  expiryDate?: string;
  status: "active" | "suspended" | "trial" | "expired";
  createdAt: string;
  smsCredits: number;
  whatsappCredits: number;
  pageAccess: Record<string, boolean>;
  adminRights: {
    canAddTeachers: boolean;
    canAddStudents: boolean;
    canAddParents: boolean;
  };
}

const defaultPageAccess = Object.fromEntries(ALL_ADMIN_PAGES.map(p => [p.key, true]));

export default function SuperAdminDashboard() {
  const { logout, user, registerUser, updateUser, getUserByInstituteInfo, updateUserPassword } = useAuth();
  const navigate = useNavigate();
  
  const [institutes, setInstitutes] = useState<Institute[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [permDialogId, setPermDialogId] = useState<string | null>(null);
  const [topupDialogId, setTopupDialogId] = useState<string | null>(null);
  const [topupAmount, setTopupAmount] = useState("");
  const [form, setForm] = useState({ 
    name: "", adminName: "", adminEmail: "", adminPassword: "", 
    expiryMonths: "12", studentLimit: 2000, teacherLimit: 50, 
    canAddTeachers: true, canAddStudents: true, canAddParents: true 
  });

  useEffect(() => {
    fetchInstitutes();
  }, []);

  const fetchInstitutes = async () => {
    setLoading(true);
    try {
      // Run all queries in parallel for maximum speed
      const [institutesRes, studentsRes, teachersRes] = await Promise.all([
        supabase
          .from("institutes")
          .select(`*, users(id, name, email, role)`)
          .order("created_at", { ascending: false }),
        supabase
          .from("students")
          .select("institute_id"),
        supabase
          .from("teachers")
          .select("institute_id"),
      ]);

      if (institutesRes.error) throw institutesRes.error;

      // Build count maps from flat arrays (avoids N+1 queries)
      const studentCounts: Record<string, number> = {};
      const teacherCounts: Record<string, number> = {};
      for (const s of (studentsRes.data || [])) {
        if (s.institute_id) studentCounts[s.institute_id] = (studentCounts[s.institute_id] || 0) + 1;
      }
      for (const t of (teachersRes.data || [])) {
        if (t.institute_id) teacherCounts[t.institute_id] = (teacherCounts[t.institute_id] || 0) + 1;
      }

      const formatted: Institute[] = (institutesRes.data || []).map((inst: any) => {
        const admin = inst.users?.find((u: any) => u.role === "admin");
        return {
          id: inst.id,
          name: inst.name,
          adminName: admin?.name || "N/A",
          adminEmail: admin?.email || inst.email,
          students: studentCounts[inst.id] || 0,
          teachers: teacherCounts[inst.id] || 0,
          studentLimit: inst.student_limit || 500,
          teacherLimit: inst.teacher_limit || 20,
          expiryDate: inst.valid_until?.split('T')[0],
          status: inst.status,
          createdAt: inst.created_at?.split('T')[0],
          smsCredits: inst.sms_credits || 0,
          whatsappCredits: inst.whatsapp_credits || 0,
          pageAccess: inst.page_access || { ...defaultPageAccess },
          // adminRights stored in Supabase Auth user_metadata, not in users table rows
          adminRights: {
            canAddTeachers: true,
            canAddStudents: true,
            canAddParents: true,
          }
        };
      });

      setInstitutes(formatted);
    } catch (error: any) {
      toast({ title: "Error fetching data", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const filtered = institutes.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.adminName.toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setEditingId(null);
    setForm({ 
      name: "", adminName: "", adminEmail: "", adminPassword: "", 
      expiryMonths: "12", studentLimit: 2000, teacherLimit: 50,
      canAddTeachers: true, canAddStudents: true, canAddParents: true
    });
    setDialogOpen(true);
  };

  const openEdit = (inst: Institute) => {
    setEditingId(inst.id);
    setForm({ 
      name: inst.name, adminName: inst.adminName, adminEmail: inst.adminEmail, adminPassword: "",
      expiryMonths: "0", studentLimit: inst.studentLimit, teacherLimit: inst.teacherLimit,
      canAddTeachers: inst.adminRights.canAddTeachers, canAddStudents: inst.adminRights.canAddStudents, canAddParents: inst.adminRights.canAddParents
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.adminName || !form.adminEmail) {
      toast({ title: "Error", description: "All fields required.", variant: "destructive" });
      return;
    }
    
    setLoading(true);
    try {
      const calculateExpiry = (months: string) => {
        if (!months || months === "0") return undefined;
        const date = new Date();
        date.setMonth(date.getMonth() + parseInt(months));
        return date.toISOString();
      };
      
      const newExpiry = form.expiryMonths !== "0" ? calculateExpiry(form.expiryMonths) : undefined;

      if (editingId) {
        // 1. Update Institute
        const { error: instErr } = await supabase
          .from('institutes')
          .update({
            name: form.name,
            student_limit: form.studentLimit,
            teacher_limit: form.teacherLimit,
            ...(newExpiry ? { valid_until: newExpiry } : {})
          })
          .eq('id', editingId);

        if (instErr) throw instErr;

        // 2. Update Admin (locally for now, usually via Edge function or RLS)
        if (updateUser) {
          const admin = getUserByInstituteInfo(editingId);
          if (admin) {
            updateUser(admin.id, {
              name: form.adminName,
              email: form.adminEmail,
              instituteName: form.name,
              ...(form.adminPassword ? { password: form.adminPassword } : {}),
              canAddTeachers: form.canAddTeachers,
              canAddStudents: form.canAddStudents,
              canAddParents: form.canAddParents
            });
          }
        }

        // 3. Update password in Supabase if provided
        if (form.adminPassword && editingId) {
          const admin = getUserByInstituteInfo(editingId);
          if (admin && updateUserPassword) {
            const success = await updateUserPassword(admin.id, form.adminPassword);
            if (!success) {
              console.error("Failed to update password in Supabase");
            }
          }
        }
        
        toast({ title: "Updated", description: `${form.name} updated successfully.` });
      } else {
        // 1. Create Institute (Let Supabase generate UUID)
        const { data: instData, error: instErr } = await supabase
          .from('institutes')
          .insert([{
            name: form.name,
            email: form.adminEmail,
            student_limit: form.studentLimit,
            teacher_limit: form.teacherLimit,
            valid_until: newExpiry || new Date(Date.now() + 31536000000).toISOString()
          }])
          .select()
          .single();

        if (instErr) {
          console.error("Institute insert error:", instErr);
          if (instErr.message?.includes('duplicate') || instErr.code === '23505') {
            toast({ title: "Error", description: "An institute with this name or email already exists.", variant: "destructive" });
            setLoading(false);
            return;
          }
          throw instErr;
        }

        // 2. Update institute with email and password
        if (instData) {
          const { error: updateErr } = await supabase
            .from('institutes')
            .update({ 
              email: form.adminEmail,
              password: form.adminPassword || "admin123"
            })
            .eq('id', instData.id);

          if (updateErr) {
            console.error("Institute update error:", updateErr);
            throw updateErr;
          }
          console.log("Institute credentials updated");
        }

        // 3. Register locally as well (for fallback login)
        if (registerUser && instData) {
          registerUser({
            id: instData.id,
            name: form.adminName,
            email: form.adminEmail,
            password: form.adminPassword || "admin123",
            role: "admin",
            instituteName: form.name,
            instituteId: instData.id,
            pageAccess: { ...defaultPageAccess },
            canAddTeachers: form.canAddTeachers,
            canAddStudents: form.canAddStudents,
            canAddParents: form.canAddParents
          });
        }

        toast({ title: "Added", description: `${form.name} registered and admin credentials generated.` });
      }
      
      fetchInstitutes();
      setDialogOpen(false);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (instId: string, currentStatus: string) => {
    const newStatus = currentStatus === "suspended" ? "active" : "suspended";
    const { error } = await supabase
      .from('institutes')
      .update({ status: newStatus })
      .eq('id', instId);
    
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    } else {
      fetchInstitutes();
    }
  };

  const deleteInstitute = async (id: string) => {
    const { error } = await supabase
      .from('institutes')
      .delete()
      .eq('id', id);
    
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    } else {
      fetchInstitutes();
      toast({ title: "Deleted", description: "Institute removed." });
    }
  };

  const togglePageAccess = async (instId: string, pageKey: string, currentAccess: Record<string, boolean>) => {
    const newAccess = { ...currentAccess, [pageKey]: !currentAccess[pageKey] };
    const { error } = await supabase
      .from('institutes')
      .update({ page_access: newAccess })
      .eq('id', instId);
    
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    } else {
      fetchInstitutes();
    }
  };

  const handleTopup = async (instId: string, currentSms: number, currentWa: number) => {
    const amount = parseInt(topupAmount);
    if (!amount || amount < 10) {
      toast({ title: "Error", description: "Minimum top-up is 10 credits.", variant: "destructive" });
      return;
    }

    const { error } = await supabase
      .from('institutes')
      .update({ 
        sms_credits: currentSms + amount,
        whatsapp_credits: currentWa + Math.floor(amount * 0.6)
      })
      .eq('id', instId);

    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    } else {
      fetchInstitutes();
      setTopupDialogId(null);
      setTopupAmount("");
      toast({ title: "Credits Added", description: `${amount} SMS + ${Math.floor(amount * 0.6)} WhatsApp credits added.` });
    }
  };

  const permInst = institutes.find(i => i.id === permDialogId);
  const topupInst = institutes.find(i => i.id === topupDialogId);

  return (
    <>
      <div className="p-4 lg:p-6 space-y-4 max-w-6xl mx-auto animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Institute Management</h2>
            <p className="text-sm text-muted-foreground">Manage all institutes, page access, and message credits</p>
          </div>
          <Button variant="outline" onClick={() => navigate('/members')}>
            <Users className="w-4 h-4 mr-2" /> Manage Hierarchy
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard title="Total Institutes" value={institutes.length} icon={Building2} />
          <StatCard title="Active" value={institutes.filter(i => i.status === "active").length} icon={Building2} change="+12% this month" changeType="positive" />
          <StatCard title="Total Students" value={institutes.reduce((a, i) => a + i.students, 0)} icon={Users} />
          <StatCard title="Total Credits" value={institutes.reduce((a, i) => a + i.smsCredits, 0)} icon={Wallet} />
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search institutes..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Add Institute</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit Institute" : "Register New Institute"}</DialogTitle>
              </DialogHeader>
              <div className="max-h-[70vh] overflow-y-auto pr-2 space-y-4">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground/80 border-b pb-1">Basic Details</h3>
                  <div><label className="text-xs font-medium text-foreground">Institute Name</label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
                  <div><label className="text-xs font-medium text-foreground">Admin Name</label><Input value={form.adminName} onChange={e => setForm(p => ({ ...p, adminName: e.target.value }))} /></div>
                  <div><label className="text-xs font-medium text-foreground">Admin Email (Login ID)</label><Input type="email" value={form.adminEmail} onChange={e => setForm(p => ({ ...p, adminEmail: e.target.value }))} /></div>
                  <div><label className="text-xs font-medium text-foreground">Admin Password</label><Input type="password" value={form.adminPassword} onChange={e => setForm(p => ({ ...p, adminPassword: e.target.value }))} placeholder={editingId ? "Leave blank to keep" : ""} /></div>
                </div>
                
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground/80 border-b pb-1">Plan & Limits</h3>
                  <div>
                    <label className="text-xs font-medium text-foreground">Validity / Expiry</label>
                    <select 
                      className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={form.expiryMonths} 
                      onChange={e => setForm(p => ({ ...p, expiryMonths: e.target.value }))}
                    >
                      <option value="0">{editingId ? "Keep Existing Expiry Date" : "No Expiry"}</option>
                      <option value="3">3 Months from now</option>
                      <option value="6">6 Months from now</option>
                      <option value="12">1 Year from now</option>
                      <option value="24">2 Years from now</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-foreground">Student Limit</label>
                      <Input type="number" min="0" value={form.studentLimit} onChange={e => setForm(p => ({ ...p, studentLimit: parseInt(e.target.value) || 0 }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-foreground">Teacher Limit</label>
                      <Input type="number" min="0" value={form.teacherLimit} onChange={e => setForm(p => ({ ...p, teacherLimit: parseInt(e.target.value) || 0 }))} />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground/80 border-b pb-1">Admin Rights</h3>
                  <div className="flex items-center justify-between p-2 rounded-md border text-sm">
                    <span>Can Add Teachers</span>
                    <Switch checked={form.canAddTeachers} onCheckedChange={c => setForm(p => ({ ...p, canAddTeachers: c }))} />
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-md border text-sm">
                    <span>Can Add Students</span>
                    <Switch checked={form.canAddStudents} onCheckedChange={c => setForm(p => ({ ...p, canAddStudents: c }))} />
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-md border text-sm">
                    <span>Can Add Parents</span>
                    <Switch checked={form.canAddParents} onCheckedChange={c => setForm(p => ({ ...p, canAddParents: c }))} />
                  </div>
                </div>

                <Button className="w-full mt-2" onClick={handleSave} disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : (editingId ? "Update Institute" : "Register Institute")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="surface-elevated rounded-lg overflow-hidden border border-border/50">
          <div className="overflow-x-auto">
            {loading && institutes.length === 0 ? (
               <div className="p-12 text-center text-muted-foreground"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" /><p className="text-sm mt-2">Loading live data...</p></div>
            ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Institute</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden md:table-cell">Admin</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Credits</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(inst => (
                  <tr key={inst.id} className="border-b border-border/50 hover:bg-secondary/30">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{inst.name}</p>
                      <p className="text-[10px] text-muted-foreground tabular-nums uppercase font-bold tracking-tight">ID: {inst.id.substring(0, 8)}... · {inst.expiryDate ? `EXP: ${inst.expiryDate}` : 'NO EXP'}</p>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <p className="text-foreground font-semibold">{inst.adminName}</p>
                      <p className="text-xs text-muted-foreground">
                        {inst.students}/{inst.studentLimit} Students · {inst.teachers}/{inst.teacherLimit} Teachers
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs tabular-nums font-bold">
                        <p className="text-success">SMS: {inst.smsCredits}</p>
                        <p className="text-primary">WA: {inst.whatsappCredits}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge variant={inst.status === "active" ? "success" : inst.status === "trial" ? "info" : "danger"}>
                        {inst.status}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(inst)} title="Edit">
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setPermDialogId(inst.id)} title="Page Access">
                          <Settings className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setTopupDialogId(inst.id)} title="Top Up Credits">
                          <CreditCard className="w-3.5 h-3.5 text-primary" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleStatus(inst.id, inst.status)}>
                          {inst.status === "suspended" ? <Eye className="w-3.5 h-3.5 text-success" /> : <EyeOff className="w-3.5 h-3.5 text-warning" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteInstitute(inst.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>
        </div>
      </div>

      {/* Page Access Dialog */}
      <Dialog open={!!permDialogId} onOpenChange={() => setPermDialogId(null)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Page Access — {permInst?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground mb-3 font-bold uppercase tracking-wider">Configure Admin Permissions</p>
          <div className="space-y-1">
            {ALL_ADMIN_PAGES.map(page => (
              <div key={page.key} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-secondary/50 border border-transparent hover:border-border transition-all">
                <span className="text-sm text-foreground font-medium">{page.label}</span>
                <Switch
                  checked={permInst?.pageAccess[page.key] ?? true}
                  onCheckedChange={() => permDialogId && togglePageAccess(permDialogId, page.key, permInst?.pageAccess || {})}
                />
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Top Up Dialog */}
      <Dialog open={!!topupDialogId} onOpenChange={() => setTopupDialogId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Top Up Credits — {topupInst?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/10 text-sm space-y-2">
              <p className="text-foreground font-bold">Current Balances:</p>
              <div className="flex gap-4">
                <p className="text-success font-bold tabular-nums">SMS: {topupInst?.smsCredits}</p>
                <p className="text-primary font-bold tabular-nums">WA: {topupInst?.whatsappCredits}</p>
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Add Base SMS Credits</label>
              <Input type="number" value={topupAmount} onChange={e => setTopupAmount(e.target.value)} placeholder="Min 10" className="h-10 text-lg font-bold" />
              {topupAmount && parseInt(topupAmount) >= 10 && (
                <p className="text-xs text-primary font-bold mt-2 flex items-center gap-1 group">
                  <Plus className="w-3 h-3 group-hover:scale-110 transition-transform" /> {Math.floor(parseInt(topupAmount) * 0.6)} WhatsApp credits included
                </p>
              )}
            </div>
            <Button className="w-full h-11 shadow-lg shadow-primary/20" onClick={() => topupDialogId && handleTopup(topupDialogId, topupInst?.smsCredits || 0, topupInst?.whatsappCredits || 0)}>
              <CreditCard className="w-4 h-4 mr-2" /> Complete Top-up
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
