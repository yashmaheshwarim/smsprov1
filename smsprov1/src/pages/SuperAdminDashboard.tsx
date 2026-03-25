import { useState } from "react";
import { useAuth, AdminUser, ALL_ADMIN_PAGES } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/ui/stat-card";
import { Switch } from "@/components/ui/switch";
import { Building2, Users, Plus, Trash2, Edit, LogOut, Search, Eye, EyeOff, Settings, CreditCard, Wallet } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import logo from "@/assets/maheshwari-tech-logo.png";

interface Institute {
  id: string;
  name: string;
  adminName: string;
  adminEmail: string;
  city: string;
  students: number;
  status: "active" | "suspended" | "trial";
  createdAt: string;
  smsCredits: number;
  whatsappCredits: number;
  pageAccess: Record<string, boolean>;
}

const defaultPageAccess = Object.fromEntries(ALL_ADMIN_PAGES.map(p => [p.key, true]));

const initialInstitutes: Institute[] = [
  { id: "INST-001", name: "Excel Coaching Classes", adminName: "Rajesh Admin", adminEmail: "admin@institute.com", city: "Mumbai", students: 450, status: "active", createdAt: "2024-01-15", smsCredits: 500, whatsappCredits: 300, pageAccess: { ...defaultPageAccess } },
  { id: "INST-002", name: "Pinnacle Academy", adminName: "Suresh Patel", adminEmail: "suresh@pinnacle.com", city: "Pune", students: 320, status: "active", createdAt: "2024-03-10", smsCredits: 200, whatsappCredits: 100, pageAccess: { ...defaultPageAccess } },
  { id: "INST-003", name: "Bright Future Institute", adminName: "Kavita Nair", adminEmail: "kavita@brightfuture.com", city: "Delhi", students: 280, status: "trial", createdAt: "2025-01-05", smsCredits: 50, whatsappCredits: 30, pageAccess: { ...defaultPageAccess } },
  { id: "INST-004", name: "Scholar's Hub", adminName: "Amit Kumar", adminEmail: "amit@scholars.com", city: "Bangalore", students: 150, status: "suspended", createdAt: "2024-06-20", smsCredits: 0, whatsappCredits: 0, pageAccess: { ...defaultPageAccess } },
];

export default function SuperAdminDashboard() {
  const { logout, user } = useAuth();
  const [institutes, setInstitutes] = useState(initialInstitutes);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [permDialogId, setPermDialogId] = useState<string | null>(null);
  const [topupDialogId, setTopupDialogId] = useState<string | null>(null);
  const [topupAmount, setTopupAmount] = useState("");
  const [form, setForm] = useState({ name: "", adminName: "", adminEmail: "", adminPassword: "", city: "" });

  const filtered = institutes.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.adminName.toLowerCase().includes(search.toLowerCase()) ||
    i.city.toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setEditingId(null);
    setForm({ name: "", adminName: "", adminEmail: "", adminPassword: "", city: "" });
    setDialogOpen(true);
  };

  const openEdit = (inst: Institute) => {
    setEditingId(inst.id);
    setForm({ name: inst.name, adminName: inst.adminName, adminEmail: inst.adminEmail, adminPassword: "", city: inst.city });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name || !form.adminName || !form.adminEmail || !form.city) {
      toast({ title: "Error", description: "All fields required.", variant: "destructive" });
      return;
    }
    if (editingId) {
      setInstitutes(prev => prev.map(i => i.id === editingId ? { ...i, name: form.name, adminName: form.adminName, adminEmail: form.adminEmail, city: form.city } : i));
      toast({ title: "Updated", description: `${form.name} updated.` });
    } else {
      const newInst: Institute = {
        id: `INST-${String(institutes.length + 1).padStart(3, "0")}`,
        name: form.name, adminName: form.adminName, adminEmail: form.adminEmail,
        city: form.city, students: 0, status: "trial",
        createdAt: new Date().toISOString().split("T")[0],
        smsCredits: 0, whatsappCredits: 0,
        pageAccess: { ...defaultPageAccess },
      };
      setInstitutes(prev => [...prev, newInst]);
      toast({ title: "Added", description: `${form.name} registered.` });
    }
    setDialogOpen(false);
  };

  const toggleStatus = (id: string) => {
    setInstitutes(prev => prev.map(i => i.id === id ? { ...i, status: i.status === "suspended" ? "active" : "suspended" } : i));
  };

  const deleteInstitute = (id: string) => {
    setInstitutes(prev => prev.filter(i => i.id !== id));
    toast({ title: "Deleted", description: "Institute removed." });
  };

  const togglePageAccess = (instId: string, pageKey: string) => {
    setInstitutes(prev => prev.map(i =>
      i.id === instId ? { ...i, pageAccess: { ...i.pageAccess, [pageKey]: !i.pageAccess[pageKey] } } : i
    ));
  };

  const handleTopup = (instId: string) => {
    const amount = parseInt(topupAmount);
    if (!amount || amount < 10) {
      toast({ title: "Error", description: "Minimum top-up is 10 credits.", variant: "destructive" });
      return;
    }
    setInstitutes(prev => prev.map(i =>
      i.id === instId ? {
        ...i,
        smsCredits: i.smsCredits + amount,
        whatsappCredits: i.whatsappCredits + Math.floor(amount * 0.6),
      } : i
    ));
    setTopupDialogId(null);
    setTopupAmount("");
    toast({ title: "Credits Added", description: `${amount} SMS + ${Math.floor(amount * 0.6)} WhatsApp credits added.` });
  };

  const permInst = institutes.find(i => i.id === permDialogId);
  const topupInst = institutes.find(i => i.id === topupDialogId);

  return (
    <div className="min-h-screen bg-surface">
      <header className="h-14 bg-card border-b border-border flex items-center justify-between px-4 lg:px-6">
        <div className="flex items-center gap-2">
          <img src={logo} alt="Apex SMS" className="h-8 object-contain" />
          <span className="text-sm font-bold text-foreground">Apex SMS</span>
          <StatusBadge variant="info">Super Admin</StatusBadge>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground hidden sm:block">{user?.name}</span>
          <Button size="sm" variant="outline" onClick={logout}>
            <LogOut className="w-4 h-4 mr-1" /> Logout
          </Button>
        </div>
      </header>

      <div className="p-4 lg:p-6 space-y-4 max-w-6xl mx-auto animate-fade-in">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Institute Management</h2>
          <p className="text-sm text-muted-foreground">Manage all institutes, page access, and message credits</p>
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
              <div className="space-y-3">
                <div><label className="text-xs font-medium text-foreground">Institute Name</label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
                <div><label className="text-xs font-medium text-foreground">Admin Name</label><Input value={form.adminName} onChange={e => setForm(p => ({ ...p, adminName: e.target.value }))} /></div>
                <div><label className="text-xs font-medium text-foreground">Admin Email (Login ID)</label><Input type="email" value={form.adminEmail} onChange={e => setForm(p => ({ ...p, adminEmail: e.target.value }))} /></div>
                <div><label className="text-xs font-medium text-foreground">Admin Password</label><Input type="password" value={form.adminPassword} onChange={e => setForm(p => ({ ...p, adminPassword: e.target.value }))} placeholder={editingId ? "Leave blank to keep" : ""} /></div>
                <div><label className="text-xs font-medium text-foreground">City</label><Input value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} /></div>
                <Button className="w-full" onClick={handleSave}>{editingId ? "Update" : "Register"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="surface-elevated rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Institute</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden md:table-cell">Admin</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden sm:table-cell">City</th>
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
                      <p className="text-xs text-muted-foreground">{inst.id} · {inst.students} students</p>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <p className="text-foreground">{inst.adminName}</p>
                      <p className="text-xs text-muted-foreground">{inst.adminEmail}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-foreground">{inst.city}</td>
                    <td className="px-4 py-3">
                      <div className="text-xs tabular-nums">
                        <p className="text-foreground">SMS: {inst.smsCredits}</p>
                        <p className="text-muted-foreground">WA: {inst.whatsappCredits}</p>
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
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleStatus(inst.id)}>
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
          </div>
        </div>
      </div>

      {/* Page Access Dialog */}
      <Dialog open={!!permDialogId} onOpenChange={() => setPermDialogId(null)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Page Access — {permInst?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground mb-3">Toggle pages On/Off for this admin. If Off, the page won't appear in their sidebar.</p>
          <div className="space-y-1">
            {ALL_ADMIN_PAGES.map(page => (
              <div key={page.key} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-secondary/50">
                <span className="text-sm text-foreground">{page.label}</span>
                <Switch
                  checked={permInst?.pageAccess[page.key] ?? true}
                  onCheckedChange={() => permDialogId && togglePageAccess(permDialogId, page.key)}
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
          <div className="space-y-3">
            <div className="p-3 rounded-md bg-secondary text-sm space-y-1">
              <p className="text-foreground">Current SMS Credits: <strong>{topupInst?.smsCredits}</strong></p>
              <p className="text-foreground">Current WhatsApp Credits: <strong>{topupInst?.whatsappCredits}</strong></p>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Add SMS Credits</label>
              <Input type="number" value={topupAmount} onChange={e => setTopupAmount(e.target.value)} placeholder="Min 10" />
              {topupAmount && parseInt(topupAmount) >= 10 && (
                <p className="text-xs text-muted-foreground mt-1">+ {Math.floor(parseInt(topupAmount) * 0.6)} WhatsApp credits included</p>
              )}
            </div>
            <Button className="w-full" onClick={() => topupDialogId && handleTopup(topupDialogId)}>
              <CreditCard className="w-4 h-4 mr-1" /> Add Credits
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
