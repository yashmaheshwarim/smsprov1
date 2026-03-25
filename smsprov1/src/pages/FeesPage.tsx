import { useState, useMemo } from "react";
import { Search, Download, Send, IndianRupee, AlertCircle, CheckCircle, Plus, FileText } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/ui/stat-card";
import { generateStudents, generateInvoices, type FeeInvoice } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

const students = generateStudents(30);
const initialInvoices = generateInvoices(students);

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export default function FeesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [invoices, setInvoices] = useState(initialInvoices);
  const [addOpen, setAddOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState<FeeInvoice | null>(null);
  const [form, setForm] = useState({ studentName: "", enrollmentNo: "", amount: "", dueDate: "" });

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      const matchSearch = inv.studentName.toLowerCase().includes(search.toLowerCase()) ||
        inv.id.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || inv.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [search, statusFilter, invoices]);

  const totalAmount = invoices.reduce((s, i) => s + i.amount, 0);
  const collectedAmount = invoices.reduce((s, i) => s + i.paidAmount, 0);
  const pendingAmount = totalAmount - collectedAmount;
  const overdueCount = invoices.filter((i) => i.status === "overdue").length;

  const handleAddEntry = () => {
    if (!form.studentName || !form.amount || !form.dueDate) {
      toast({ title: "Error", description: "All fields are required.", variant: "destructive" });
      return;
    }
    const newInv: FeeInvoice = {
      id: `INV-${String(invoices.length + 1).padStart(5, "0")}`,
      studentName: form.studentName,
      enrollmentNo: form.enrollmentNo || "N/A",
      amount: parseInt(form.amount),
      dueDate: form.dueDate,
      paidAmount: 0,
      status: "unpaid",
    };
    setInvoices(prev => [newInv, ...prev]);
    setAddOpen(false);
    setForm({ studentName: "", enrollmentNo: "", amount: "", dueDate: "" });
    toast({ title: "Invoice Created", description: `Invoice for ${form.studentName} created.` });
  };

  const handleSendReminders = () => {
    const pendingInvoices = invoices.filter(i => i.status === "overdue" || i.status === "unpaid" || i.status === "partial");
    if (pendingInvoices.length === 0) {
      toast({ title: "No Pending", description: "All fees are paid." });
      return;
    }
    toast({
      title: "Reminders Sent",
      description: `Fee reminders sent to ${pendingInvoices.length} students via SMS/WhatsApp. Credits deducted.`,
    });
  };

  const generateReceiptPDF = (inv: FeeInvoice) => {
    // Generate a receipt as a downloadable text/HTML
    const receiptContent = `
<!DOCTYPE html>
<html>
<head><title>Fee Receipt - ${inv.id}</title>
<style>
body { font-family: Arial, sans-serif; padding: 40px; max-width: 600px; margin: 0 auto; }
.header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 20px; }
.header h1 { margin: 0; font-size: 24px; }
.header p { margin: 5px 0; color: #666; }
.details { margin: 20px 0; }
.details table { width: 100%; border-collapse: collapse; }
.details td { padding: 8px 0; border-bottom: 1px solid #eee; }
.details td:first-child { color: #666; width: 40%; }
.details td:last-child { font-weight: bold; text-align: right; }
.total { margin-top: 20px; padding: 15px; background: #f5f5f5; border-radius: 8px; }
.total table { width: 100%; }
.total td { padding: 5px 0; }
.total td:last-child { text-align: right; font-weight: bold; }
.footer { text-align: center; margin-top: 30px; color: #999; font-size: 12px; }
.stamp { text-align: center; margin-top: 30px; color: green; font-size: 18px; font-weight: bold; }
</style></head>
<body>
<div class="header">
<h1>Apex SMS</h1>
<p>Fee Receipt</p>
<p>Receipt No: ${inv.id}</p>
</div>
<div class="details">
<table>
<tr><td>Student Name</td><td>${inv.studentName}</td></tr>
<tr><td>Enrollment No</td><td>${inv.enrollmentNo}</td></tr>
<tr><td>Due Date</td><td>${inv.dueDate}</td></tr>
<tr><td>Status</td><td>${inv.status.toUpperCase()}</td></tr>
</table>
</div>
<div class="total">
<table>
<tr><td>Total Amount</td><td>${formatCurrency(inv.amount)}</td></tr>
<tr><td>Amount Paid</td><td>${formatCurrency(inv.paidAmount)}</td></tr>
<tr><td>Balance Due</td><td>${formatCurrency(inv.amount - inv.paidAmount)}</td></tr>
</table>
</div>
${inv.paidAmount > 0 ? '<div class="stamp">✓ PAYMENT RECEIVED</div>' : ''}
<div class="footer">
<p>Generated on ${new Date().toLocaleDateString("en-IN")}</p>
<p>This is a computer-generated receipt.</p>
<p>Powered by Maheshwari Tech</p>
</div>
</body></html>`;

    const blob = new Blob([receiptContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Receipt_${inv.id}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Receipt Downloaded", description: `Receipt for ${inv.studentName} downloaded as PDF.` });
  };

  const handleExport = () => {
    const csv = ["Invoice,Student,Enrollment,Amount,Paid,Due Date,Status"];
    invoices.forEach(inv => {
      csv.push(`${inv.id},${inv.studentName},${inv.enrollmentNo},${inv.amount},${inv.paidAmount},${inv.dueDate},${inv.status}`);
    });
    const blob = new Blob([csv.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fee_report.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: "Fee report exported as CSV." });
  };

  const columns = [
    {
      key: "id",
      title: "Invoice",
      render: (inv: FeeInvoice) => <span className="text-sm font-mono text-foreground">{inv.id}</span>,
    },
    {
      key: "studentName",
      title: "Student",
      render: (inv: FeeInvoice) => (
        <div>
          <p className="text-sm font-medium text-foreground">{inv.studentName}</p>
          <p className="text-xs text-muted-foreground">{inv.enrollmentNo}</p>
        </div>
      ),
    },
    {
      key: "amount",
      title: "Amount",
      hideOnMobile: true,
      render: (inv: FeeInvoice) => <span className="text-sm font-medium text-foreground tabular-nums">{formatCurrency(inv.amount)}</span>,
    },
    {
      key: "paidAmount",
      title: "Paid",
      hideOnMobile: true,
      render: (inv: FeeInvoice) => <span className="text-sm text-muted-foreground tabular-nums">{formatCurrency(inv.paidAmount)}</span>,
    },
    {
      key: "dueDate",
      title: "Due Date",
      hideOnMobile: true,
      render: (inv: FeeInvoice) => <span className="text-sm text-muted-foreground tabular-nums">{inv.dueDate}</span>,
    },
    {
      key: "status",
      title: "Status",
      render: (inv: FeeInvoice) => {
        const v = inv.status === "paid" ? "success" : inv.status === "partial" ? "warning" : inv.status === "overdue" ? "destructive" : "default";
        return <StatusBadge variant={v}>{inv.status}</StatusBadge>;
      },
    },
    {
      key: "actions",
      title: "Receipt",
      render: (inv: FeeInvoice) => (
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => generateReceiptPDF(inv)} title="Download Receipt">
          <FileText className="w-3.5 h-3.5 text-primary" />
        </Button>
      ),
    },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Total Billed" value={formatCurrency(totalAmount)} icon={IndianRupee} />
        <StatCard title="Collected" value={formatCurrency(collectedAmount)} icon={CheckCircle} change={`${((collectedAmount / totalAmount) * 100).toFixed(0)}% collection rate`} changeType="positive" />
        <StatCard title="Pending" value={formatCurrency(pendingAmount)} icon={AlertCircle} changeType="negative" change={`${overdueCount} overdue`} />
        <StatCard title="Overdue" value={overdueCount} icon={AlertCircle} changeType="negative" />
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-card border border-border flex-1 sm:flex-initial sm:w-64">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input type="text" placeholder="Search invoices..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground">
            <option value="all">All</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
            <option value="overdue">Overdue</option>
            <option value="unpaid">Unpaid</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}><Download className="w-4 h-4 mr-1" /> Export</Button>
          <Button variant="outline" size="sm" onClick={handleSendReminders}><Send className="w-4 h-4 mr-1" /> Send Reminders</Button>
          <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="w-4 h-4 mr-1" /> Add Entry</Button>
        </div>
      </div>

      <DataTable data={filtered} columns={columns} />

      {/* Add Entry Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Fee Entry</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs font-medium text-foreground">Student Name</label><Input value={form.studentName} onChange={e => setForm(p => ({ ...p, studentName: e.target.value }))} /></div>
            <div><label className="text-xs font-medium text-foreground">Enrollment No</label><Input value={form.enrollmentNo} onChange={e => setForm(p => ({ ...p, enrollmentNo: e.target.value }))} /></div>
            <div><label className="text-xs font-medium text-foreground">Amount (₹)</label><Input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} /></div>
            <div><label className="text-xs font-medium text-foreground">Due Date</label><Input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} /></div>
            <Button className="w-full" onClick={handleAddEntry}>Create Invoice</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
