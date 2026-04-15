import { useState, useMemo, useEffect } from "react";
import { Search, Download, Send, IndianRupee, AlertCircle, CheckCircle, Plus, FileText, Loader2 } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { supabase, isUuid } from "@/lib/supabase";
import { useAuth, AdminUser } from "@/contexts/AuthContext";

interface Invoice {
  id: string;
  student_id: string;
  amount: number;
  status: "paid" | "pending" | "overdue" | "cancelled";
  due_date: string;
  paid_date?: string;
  student_name?: string;
  enrollment_no?: string;
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export default function FeesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const DEFAULT_UUID = "00000000-0000-0000-0000-000000000001";
  const instId = isAdmin ? (user as AdminUser).instituteId : DEFAULT_UUID;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ studentId: "", studentName: "", enrollmentNo: "", amount: "", dueDate: "" });
  const [lookupLoading, setLookupLoading] = useState(false);

  useEffect(() => {
    if (isUuid(instId)) {
      fetchData();
    }
  }, [instId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select(`
          *,
          students (
            name,
            enrollment_no
          )
        `)
        .eq("institute_id", instId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const formatted: Invoice[] = (data || []).map((inv: any) => ({
        id: inv.id,
        student_id: inv.student_id,
        amount: Number(inv.amount),
        status: inv.status,
        due_date: inv.due_date,
        paid_date: inv.paid_date,
        student_name: inv.students?.name,
        enrollment_no: inv.students?.enrollment_no,
      }));

      setInvoices(formatted);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      const matchSearch = (inv.student_name || "").toLowerCase().includes(search.toLowerCase()) ||
        inv.id.toLowerCase().includes(search.toLowerCase()) ||
        (inv.enrollment_no || "").toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || inv.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [search, statusFilter, invoices]);

  const stats = useMemo(() => {
    const total = invoices.reduce((s, i) => s + i.amount, 0);
    const collected = invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.amount, 0);
    const pending = total - collected;
    const overdue = invoices.filter(i => i.status === "overdue").length;
    return { total, collected, pending, overdue };
  }, [invoices]);

  const handleAddEntry = async () => {
    if (!form.studentId || !form.amount || !form.dueDate) {
      toast({ title: "Error", description: "Please select a student and fill all fields.", variant: "destructive" });
      return;
    }

    try {
      const { data, error } = await supabase
        .from("invoices")
        .insert([{
          institute_id: instId,
          student_id: form.studentId,
          amount: parseFloat(form.amount),
          due_date: form.dueDate,
          status: "pending",
        }])
        .select(`
          *,
          students (
            name,
            enrollment_no
          )
        `)
        .single();

      if (error) throw error;

      const newInv: Invoice = {
        id: data.id,
        student_id: data.student_id,
        amount: Number(data.amount),
        status: data.status,
        due_date: data.due_date,
        student_name: data.students?.name,
        enrollment_no: data.students?.enrollment_no,
      };

      setInvoices(prev => [newInv, ...prev]);
      setAddOpen(false);
      setForm({ studentId: "", studentName: "", enrollmentNo: "", amount: "", dueDate: "" });
      toast({ title: "Invoice Created", description: `Invoice for ${newInv.student_name} generated.` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleLookup = async (val: string) => {
    setForm(p => ({ ...p, enrollmentNo: val }));
    if (val.length < 3) return;

    setLookupLoading(true);
    const { data } = await supabase
      .from("students")
      .select("id, name, enrollment_no")
      .eq("institute_id", instId)
      .or(`enrollment_no.ilike.%${val}%,name.ilike.%${val}%`)
      .limit(1)
      .single();

    if (data) {
      setForm(p => ({ ...p, studentId: data.id, studentName: data.name, enrollmentNo: data.enrollment_no }));
    }
    setLookupLoading(false);
  };

  const generateReceiptPDF = (inv: Invoice) => {
    const receiptContent = `
<!DOCTYPE html>
<html>
<head><title>Fee Receipt - ${inv.id.substring(0, 8)}</title>
<style>
body { font-family: sans-serif; padding: 40px; color: #111; }
.header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 15px; }
.details { margin: 20px 0; }
.details table { width: 100%; border-collapse: collapse; }
.details td { padding: 10px 0; border-bottom: 1px solid #eee; }
.total { background: #f9f9f9; padding: 15px; border-radius: 8px; margin-top: 20px; }
.footer { text-align: center; margin-top: 40px; color: #888; font-size: 12px; }
</style></head>
<body>
<div class="header"><h1>INSTITUTE RECEIPT</h1><p>Invoice ID: ${inv.id}</p></div>
<div class="details">
<table>
<tr><td>Student Name</td><td align="right"><b>${inv.student_name}</b></td></tr>
<tr><td>Enrollment No</td><td align="right">${inv.enrollment_no}</td></tr>
<tr><td>Due Date</td><td align="right">${inv.due_date}</td></tr>
<tr><td>Status</td><td align="right"><b style="color: ${inv.status === 'paid' ? 'green' : 'red'}">${inv.status.toUpperCase()}</b></td></tr>
</table>
</div>
<div class="total">
<table width="100%">
<tr><td><b>TOTAL AMOUNT</b></td><td align="right"><b>${formatCurrency(inv.amount)}</b></td></tr>
</table>
</div>
<div class="footer"><p>Powered by Apex SMS</p></div>
</body></html>`;

    const blob = new Blob([receiptContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Receipt_${inv.id.substring(0, 8)}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Success", description: "Receipt generated for download." });
  };

  const columns = [
    {
      key: "id",
      title: "Invoice ID",
      render: (inv: Invoice) => <span className="text-xs font-mono text-muted-foreground">{inv.id.substring(0, 8)}...</span>,
    },
    {
      key: "student_name",
      title: "Student",
      render: (inv: Invoice) => (
        <div>
          <p className="text-sm font-semibold text-foreground">{inv.student_name}</p>
          <p className="text-[10px] text-muted-foreground uppercase font-medium">{inv.enrollment_no}</p>
        </div>
      ),
    },
    {
      key: "amount",
      title: "Amount",
      render: (inv: Invoice) => <span className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(inv.amount)}</span>,
    },
    {
      key: "due_date",
      title: "Due Date",
      hideOnMobile: true,
      render: (inv: Invoice) => <span className="text-xs text-muted-foreground tabular-nums">{inv.due_date}</span>,
    },
    {
      key: "status",
      title: "Status",
      render: (inv: Invoice) => {
        const v = inv.status === "paid" ? "success" : inv.status === "pending" ? "warning" : inv.status === "overdue" ? "destructive" : "default";
        return <StatusBadge variant={v}>{inv.status}</StatusBadge>;
      },
    },
    {
      key: "actions",
      title: "",
      render: (inv: Invoice) => (
        <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-primary/10" onClick={() => generateReceiptPDF(inv)}>
          <FileText className="w-4 h-4 text-primary" />
        </Button>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Total Billed" value={formatCurrency(stats.total)} icon={IndianRupee} />
        <StatCard title="Collected" value={formatCurrency(stats.collected)} icon={CheckCircle} changeType="positive" />
        <StatCard title="Pending" value={formatCurrency(stats.pending)} icon={AlertCircle} changeType="neutral" />
        <StatCard title="Overdue" value={stats.overdue} icon={AlertCircle} changeType="negative" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-card border border-border flex-1 sm:w-64 shadow-sm">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input type="text" placeholder="Search invoices..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-sm text-foreground outline-none w-full" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-md bg-card border border-border text-xs font-medium text-foreground outline-none">
            <option value="all">All Status</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} className="h-9">Refresh</Button>
          <Button size="sm" onClick={() => setAddOpen(true)} className="h-9 shadow-md">
            <Plus className="w-4 h-4 mr-1" /> Add Fee Entry
          </Button>
        </div>
      </div>

      <DataTable data={filtered} columns={columns} />

      {/* Add Fee Entry Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create Fee Invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Search Student (Name/Enrollment)</label>
              <div className="relative">
                <Input 
                  value={form.enrollmentNo} 
                  onChange={e => handleLookup(e.target.value)} 
                  placeholder="Type to search..."
                />
                {lookupLoading && <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-3 text-muted-foreground" />}
              </div>
              {form.studentName && (
                <p className="text-xs text-success font-medium flex items-center gap-1">
                   <CheckCircle className="w-3 h-3" /> Found: {form.studentName}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Amount (₹)</label>
                <Input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Due Date</label>
                <Input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddEntry}>Generate Invoice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
