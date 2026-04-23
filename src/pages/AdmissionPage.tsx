import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { UserPlus, Users, Clock, CheckCircle, XCircle, Search, Plus, ArrowRight, Phone, Mail, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import { DataImportDialog } from "@/components/shared/DataImportDialog";


interface Inquiry {
  id: string;
  studentName: string;
  parentName: string;
  motherPhone?: string;
  fatherPhone?: string;
  studentPhone?: string;
  email?: string;
  class: string;
  source: string;
  status: "new" | "contacted" | "interested" | "applied" | "approved" | "rejected" | "converted";
  notes: string;
  createdAt: string;
}

const sources = ["Walk-in", "Phone Call", "Website", "Referral", "Social Media", "Advertisement"];
const classes = ["Foundation 10th", "Foundation 11th", "JEE 2025 - Batch A", "NEET 2025 - Batch B", "CET 2025", "Board 12th Science"];

// Initial inquiries are now handled by fetching from Supabase.


const statusColors: Record<string, "default" | "primary" | "success" | "warning" | "destructive" | "info"> = {
  new: "info", contacted: "primary", interested: "warning", applied: "primary", approved: "success", rejected: "destructive", converted: "success",
};


export default function AdmissionPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const instId = isAdmin ? (user as AdminUser).instituteId : "00000000-0000-0000-0000-000000000001";
  
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);

  const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

  useEffect(() => {
    if (isUuid(instId)) {
      fetchInquiries();
    } else {
      setLoading(false);
      setInquiries([]);
    }
  }, [instId]);


  const fetchInquiries = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('inquiries')
      .select('*')
      .eq('institute_id', instId)
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setInquiries((data || []).map((d: any) => ({
        id: d.id,
        studentName: d.student_name,
        parentName: d.parent_name,
        motherPhone: d.mother_phone,
        fatherPhone: d.father_phone,
        studentPhone: d.student_phone,
        email: d.email,
        class: d.class_name,
        source: d.source,
        status: d.status,
        notes: d.notes,
        createdAt: new Date(d.created_at).toLocaleDateString("en-IN"),
      })));
    }
    setLoading(false);
  };

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState<Inquiry | null>(null);
  const [form, setForm] = useState({ studentName: "", parentName: "", motherPhone: "", fatherPhone: "", studentPhone: "", email: "", class: classes[0], source: sources[0], notes: "" });

  const filtered = inquiries.filter(i => {
    const matchSearch = i.studentName.toLowerCase().includes(search.toLowerCase()) ||
                       i.parentName.toLowerCase().includes(search.toLowerCase()) ||
                       (i.motherPhone && i.motherPhone.includes(search)) ||
                       (i.fatherPhone && i.fatherPhone.includes(search)) ||
                       (i.studentPhone && i.studentPhone.includes(search));
    const matchStatus = statusFilter === "all" || i.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleAdd = async () => {
    if (!form.studentName) {
      toast({ title: "Error", description: "Student name is required.", variant: "destructive" });
      return;
    }

    const payload = {
      institute_id: instId,
      student_name: form.studentName,
      parent_name: form.parentName,
      mother_phone: form.motherPhone || null,
      father_phone: form.fatherPhone || null,
      student_phone: form.studentPhone || null,
      email: form.email || null,
      class_name: form.class,
      source: form.source,
      notes: form.notes,
      status: "new",
    };

    const { data, error } = await supabase
      .from('inquiries')
      .insert([payload])
      .select()
      .single();

    if (error) {
      toast({ title: "Database Error", description: error.message, variant: "destructive" });
      return;
    }

    const newInq: Inquiry = {
      id: data.id,
      studentName: data.student_name,
      parentName: data.parent_name,
      motherPhone: data.mother_phone,
      fatherPhone: data.father_phone,
      studentPhone: data.student_phone,
      email: data.email,
      class: data.class_name,
      source: data.source,
      status: data.status,
      notes: data.notes,
      createdAt: new Date(data.created_at).toLocaleDateString("en-IN"),
    };

    setInquiries(prev => [newInq, ...prev]);
    setDialogOpen(false);
    setForm({ studentName: "", parentName: "", motherPhone: "", fatherPhone: "", studentPhone: "", email: "", class: classes[0], source: sources[0], notes: "" });
    toast({ title: "Inquiry Added", description: `${form.studentName} added to database.` });
  };

  const updateStatus = async (id: string, status: Inquiry["status"]) => {
    const { error } = await supabase
      .from('inquiries')
      .update({ status })
      .eq('id', id);

    if (error) {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
      return;
    }

    setInquiries(prev => prev.map(i => i.id === id ? { ...i, status } : i));
    toast({ title: "Status Updated", description: `Inquiry marked as ${status}.` });
    setDetailOpen(null);
  };

  const convertToStudent = (inq: Inquiry) => {
    updateStatus(inq.id, "converted");
    toast({ title: "Converted!", description: `${inq.studentName} has been converted to a student record.` });
  };

  const stats = {
    total: inquiries.length,
    new: inquiries.filter(i => i.status === "new" || i.status === "contacted" || i.status === "interested").length,
    applied: inquiries.filter(i => i.status === "applied").length,
    converted: inquiries.filter(i => i.status === "converted").length,
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Admission Management</h2>
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">Track inquiries, manage applications, convert leads</p>
            {loading && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DataImportDialog type="inquiries" instituteId={instId} onSuccess={fetchInquiries} />
          <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4 mr-1" /> New Inquiry</Button>
        </div>

      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Total Inquiries" value={stats.total} icon={Users} />
        <StatCard title="Active Leads" value={stats.new} icon={Clock} change="In pipeline" changeType="positive" />
        <StatCard title="Applications" value={stats.applied} icon={UserPlus} />
        <StatCard title="Converted" value={stats.converted} icon={CheckCircle} change="This month" changeType="positive" />
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-card border border-border flex-1 sm:max-w-xs">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="Search inquiries..." value={search} onChange={e => setSearch(e.target.value)} className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground">
          <option value="all">All Status</option>
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="interested">Interested</option>
          <option value="applied">Applied</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="converted">Converted</option>
        </select>
      </div>

      <div className="surface-elevated rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Student</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden md:table-cell">Parent / Phone</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden lg:table-cell">Class</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden lg:table-cell">Source</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inq => (
                <tr key={inq.id} className="border-b border-border/50 hover:bg-secondary/30 cursor-pointer" onClick={() => setDetailOpen(inq)}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{inq.studentName}</p>
                    <p className="text-xs text-muted-foreground">{inq.id} · {inq.createdAt}</p>
                  </td>
                   <td className="px-4 py-3 hidden md:table-cell">
                     <p className="text-foreground">{inq.parentName}</p>
                     <p className="text-xs text-muted-foreground">
                       {inq.studentPhone && `Student: ${inq.studentPhone}`}
                       {inq.motherPhone && ` | Mother: ${inq.motherPhone}`}
                       {inq.fatherPhone && ` | Father: ${inq.fatherPhone}`}
                     </p>
                   </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-foreground">{inq.class}</td>
                  <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{inq.source}</td>
                  <td className="px-4 py-3"><StatusBadge variant={statusColors[inq.status]}>{inq.status}</StatusBadge></td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1">
                      {inq.status === "approved" && (
                        <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => convertToStudent(inq)}>
                          <ArrowRight className="w-3 h-3 mr-1" /> Convert
                        </Button>
                      )}
                      {inq.status !== "converted" && inq.status !== "rejected" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateStatus(inq.id, "approved")}>Approve</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Inquiry Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Inquiry</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs font-medium text-foreground">Student Name *</label><Input value={form.studentName} onChange={e => setForm(p => ({ ...p, studentName: e.target.value }))} /></div>
            <div><label className="text-xs font-medium text-foreground">Parent Name</label><Input value={form.parentName} onChange={e => setForm(p => ({ ...p, parentName: e.target.value }))} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="text-xs font-medium text-foreground">Student Phone</label><Input value={form.studentPhone} onChange={e => setForm(p => ({ ...p, studentPhone: e.target.value }))} /></div>
              <div><label className="text-xs font-medium text-foreground">Mother Phone</label><Input value={form.motherPhone} onChange={e => setForm(p => ({ ...p, motherPhone: e.target.value }))} /></div>
              <div><label className="text-xs font-medium text-foreground">Father Phone</label><Input value={form.fatherPhone} onChange={e => setForm(p => ({ ...p, fatherPhone: e.target.value }))} /></div>
            </div>
            <div><label className="text-xs font-medium text-foreground">Email</label><Input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground">Class</label>
                <select value={form.class} onChange={e => setForm(p => ({ ...p, class: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground">
                  {classes.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Source</label>
                <select value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground">
                  {sources.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div><label className="text-xs font-medium text-foreground">Notes</label><Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Any additional info" /></div>
            <Button className="w-full" onClick={handleAdd}>Add Inquiry</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailOpen} onOpenChange={() => setDetailOpen(null)}>
        <DialogContent>
          {detailOpen && (
            <>
              <DialogHeader><DialogTitle>Inquiry: {detailOpen.studentName}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">ID:</span> <span className="text-foreground font-medium">{detailOpen.id}</span></div>
                  <div><span className="text-muted-foreground">Date:</span> <span className="text-foreground">{detailOpen.createdAt}</span></div>
                  <div><span className="text-muted-foreground">Parent:</span> <span className="text-foreground">{detailOpen.parentName}</span></div>
                  <div><span className="text-muted-foreground">Class:</span> <span className="text-foreground">{detailOpen.class}</span></div>
                  <div className="flex items-center gap-1"><Phone className="w-3 h-3 text-muted-foreground" />
                    <span className="text-foreground">
                      {detailOpen.studentPhone && `Student: ${detailOpen.studentPhone}`}
                      {detailOpen.motherPhone && ` | Mother: ${detailOpen.motherPhone}`}
                      {detailOpen.fatherPhone && ` | Father: ${detailOpen.fatherPhone}`}
                      {!detailOpen.studentPhone && !detailOpen.motherPhone && !detailOpen.fatherPhone && "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1"><Mail className="w-3 h-3 text-muted-foreground" /> <span className="text-foreground">{detailOpen.email || "N/A"}</span></div>
                </div>
                <div><span className="text-xs text-muted-foreground">Source:</span> <span className="text-sm text-foreground">{detailOpen.source}</span></div>
                <div><span className="text-xs text-muted-foreground">Notes:</span> <p className="text-sm text-foreground">{detailOpen.notes}</p></div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Status:</span>
                  <StatusBadge variant={statusColors[detailOpen.status]}>{detailOpen.status}</StatusBadge>
                </div>
                {detailOpen.status !== "converted" && detailOpen.status !== "rejected" && (
                  <div className="flex gap-2 pt-2">
                    {detailOpen.status === "new" && <Button size="sm" onClick={() => updateStatus(detailOpen.id, "contacted")}>Mark Contacted</Button>}
                    {detailOpen.status === "contacted" && <Button size="sm" onClick={() => updateStatus(detailOpen.id, "interested")}>Mark Interested</Button>}
                    {detailOpen.status === "interested" && <Button size="sm" onClick={() => updateStatus(detailOpen.id, "applied")}>Mark Applied</Button>}
                    {detailOpen.status === "applied" && <Button size="sm" onClick={() => updateStatus(detailOpen.id, "approved")}>Approve</Button>}
                    {detailOpen.status === "approved" && <Button size="sm" onClick={() => convertToStudent(detailOpen)}>Convert to Student</Button>}
                    <Button size="sm" variant="destructive" onClick={() => updateStatus(detailOpen.id, "rejected")}>Reject</Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
