import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Search, IndianRupee, AlertCircle, CheckCircle, 
  Loader2, MessageSquare, ExternalLink, 
  Filter, Download, Table2
} from "lucide-react";
import * as XLSX from "xlsx";
import { supabase, isUuid } from "@/lib/supabase";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import { useStudentFees, useFeeStats, useStudentFeeOperations, useBatchFees, type StudentFee, feeStatusColors, formatCurrency } from "@/hooks/useFees";
import { toast } from "@/hooks/use-toast";

export default function BatchAppliedFeesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const DEFAULT_UID = "00000000-0000-0000-0000-000000000001";
  const instId = isAdmin ? (user as AdminUser).instituteId : DEFAULT_UID;
  const navigate = useNavigate();
  const pageSize = 20;

  // State
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | StudentFee["status"]>("all");
  const [batchFilter, setBatchFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedStudentFee, setSelectedStudentFee] = useState<StudentFee | null>(null);
  
  // Payment dialog
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    studentFeeId: "",
    paymentAmount: "",
    paymentMethod: "cash",
    paymentDate: new Date().toISOString().split("T")[0],
  });

  // Hooks
  const { studentFees, total, loading, fetchStudentFees } = useStudentFees(instId, currentPage, pageSize);
  const stats = useFeeStats(studentFees);
  const { processing, addPayment, quickCreateAndPay, generateFeeReceiptPDF } = useStudentFeeOperations(instId, fetchStudentFees);
  const { batchFees } = useBatchFees(instId);

  // Extract unique batch names from student fees for the filter
  const batchOptions = useMemo(() => {
    const names = new Set(studentFees.map(f => f.batch_name).filter(Boolean));
    return Array.from(names).sort();
  }, [studentFees]);

  // Filtered data - show all students with batch-applied fees
  // Includes both actual student_fee records AND synthetic rows with a batch fee assigned
  const filteredStudentFees = useMemo(() => {
    return studentFees.filter((fee) => {
      // Include:
      // 1. Actual (non-synthetic) student fee records
      // 2. Synthetic rows that have a batch_fee_id (batch fee is assigned to their batch)
      const isRealRecord = !fee.id.toString().startsWith("synthetic-");
      const hasBatchFee = !!fee.batch_fee_id && fee.original_fee > 0;
      if (!isRealRecord && !hasBatchFee) return false;

      const matchSearch = (fee.student_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (fee.enrollment_no || "").toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || fee.status === statusFilter;
      const matchBatch = batchFilter === "all" || fee.batch_name === batchFilter;
      return matchSearch && matchStatus && matchBatch;
    });
  }, [search, statusFilter, batchFilter, studentFees]);

  // Open payment dialog for a student
  const openPayment = (fee: StudentFee) => {
    setSelectedStudentFee(fee);
    setPaymentForm({
      studentFeeId: fee.id,
      paymentAmount: "",
      paymentMethod: "cash",
      paymentDate: new Date().toISOString().split("T")[0],
    });
    setAddPaymentOpen(true);
  };

  const handlePaymentSubmit = async () => {
    if (!selectedStudentFee || !paymentForm.paymentAmount) {
      toast({ title: "Error", description: "Please enter payment amount.", variant: "destructive" });
      return;
    }

    if (isSynthetic(selectedStudentFee)) {
      if (!selectedStudentFee.batch_fee_id) {
        toast({ title: "Error", description: "No batch fee assigned to this student.", variant: "destructive" });
        return;
      }
      await quickCreateAndPay(
        selectedStudentFee.student_id,
        selectedStudentFee.batch_fee_id,
        selectedStudentFee.original_fee || selectedStudentFee.final_fee,
        parseFloat(paymentForm.paymentAmount),
        paymentForm.paymentMethod,
        currentPage,
        paymentForm.paymentDate
      );
    } else {
      await addPayment(
        selectedStudentFee.id,
        paymentForm.paymentAmount,
        paymentForm.paymentMethod,
        paymentForm.paymentDate,
        currentPage,
        studentFees
      );
    }
    setAddPaymentOpen(false);
    setSelectedStudentFee(null);
  };

  // Helper: check if a fee is synthetic (no student_fee record in DB)
  const isSynthetic = (fee: StudentFee) => fee.id.toString().startsWith("synthetic-");

  // Quick pay: pay full pending amount
  const handlePayFull = async (fee: StudentFee) => {
    const pending = Math.max(0, fee.final_fee - fee.paid_fees);
    if (pending === 0) {
      toast({ title: "Info", description: "This fee is already fully paid.", variant: "default" });
      return;
    }

    if (isSynthetic(fee)) {
      // Need to create student_fee record first, then pay
      if (!fee.batch_fee_id) {
        toast({ title: "Error", description: "No batch fee assigned to this student.", variant: "destructive" });
        return;
      }
      await quickCreateAndPay(
        fee.student_id,
        fee.batch_fee_id,
        fee.original_fee || fee.final_fee,
        pending,
        "cash",
        currentPage
      );
    } else {
      await addPayment(
        fee.id,
        pending.toString(),
        "cash",
        new Date().toISOString().split("T")[0],
        currentPage,
        studentFees
      );
    }
  };

  // Share receipt via WhatsApp (wa.me link)
  const shareViaWhatsApp = (fee: StudentFee) => {
    const pendingAmt = Math.max(0, fee.final_fee - fee.paid_fees);
    const message = `📄 *Fee Receipt*\n\n` +
      `Student: ${fee.student_name}\n` +
      `Enrollment: ${fee.enrollment_no}\n` +
      `Batch: ${fee.batch_name}\n` +
      `Fee Amount: ${formatCurrency(fee.final_fee)}\n` +
      `Paid: ${formatCurrency(fee.paid_fees)}\n` +
      `Pending: ${formatCurrency(pendingAmt)}\n` +
      `Status: ${fee.status.toUpperCase()}\n\n` +
      `Thank you.`;

    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
    toast({ title: "WhatsApp Opened", description: "Receipt summary shared. You can send it from here." });
  };

  // Share receipt via WhatsApp Web
  const shareViaWebWhatsApp = (fee: StudentFee) => {
    const pendingAmt = Math.max(0, fee.final_fee - fee.paid_fees);
    const message = `📄 *Fee Receipt*\n\n` +
      `Student: ${fee.student_name}\n` +
      `Enrollment: ${fee.enrollment_no}\n` +
      `Batch: ${fee.batch_name}\n` +
      `Fee Amount: ${formatCurrency(fee.final_fee)}\n` +
      `Paid: ${formatCurrency(fee.paid_fees)}\n` +
      `Pending: ${formatCurrency(pendingAmt)}\n` +
      `Status: ${fee.status.toUpperCase()}\n\n` +
      `Thank you.`;

    const encoded = encodeURIComponent(message);
    window.open(`https://web.whatsapp.com/send?text=${encoded}`, '_blank');
    toast({ title: "Web WhatsApp Opened", description: "Receipt summary ready to send via web.whatsapp.com." });
  };

  // Download receipt
  const handleDownloadReceipt = async (fee: StudentFee) => {
    await generateFeeReceiptPDF(fee);
  };

  const totalPages = Math.ceil(total / pageSize);

  // ── Excel Export ───────────────────────────────────────────────────────────
  const exportBatchAppliedReport = useCallback(async () => {
    try {
      if (!instId || !isUuid(instId)) return;

      // Fetch ALL student fees for this institute (bypass pagination)
      const { data: allFees, error } = await supabase
        .from("student_fees")
        .select("*")
        .eq("institute_id", instId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!allFees || allFees.length === 0) {
        toast({ title: "No Data", description: "No student fee records to export.", variant: "default" });
        return;
      }

      // Enrich with student & batch fee details
      const studentIds = [...new Set(allFees.map((f: any) => f.student_id).filter(Boolean))];
      const batchFeeIds = [...new Set(allFees.map((f: any) => f.batch_fee_id).filter(Boolean))];

      const [studentRes, batchFeeRes] = await Promise.all([
        studentIds.length > 0
          ? supabase.from("students").select("id, name, enrollment_no, batch_id").in("id", studentIds)
          : { data: [] },
        batchFeeIds.length > 0
          ? supabase.from("batch_fees").select("id, title, total_fees, batches(name)").in("id", batchFeeIds)
          : { data: [] },
      ]);

      const studentMap = new Map((studentRes.data || []).map((s: any) => [s.id, s]));
      const feeMap = new Map((batchFeeRes.data || []).map((b: any) => [b.id, b]));

      const wb = XLSX.utils.book_new();

      // Sheet 1: All Student Fee Records
      const rows = allFees.map((fee: any, i: number) => {
        const student = studentMap.get(fee.student_id);
        const batchFee = feeMap.get(fee.batch_fee_id);
        return {
          "#": i + 1,
          "Student Name": student?.name || "Unknown",
          "Enrollment No": student?.enrollment_no || "",
          "Batch Fee Title": batchFee?.title || "N/A",
          "Original Fee": Number(fee.original_fee || 0),
          "Discount": Number(fee.discount_amount || 0),
          "Final Fee": Math.max(0, Number(fee.original_fee || 0) - Number(fee.discount_amount || 0)),
          "Paid": Number(fee.paid_fees || 0),
          "Pending": Math.max(0, Math.max(0, Number(fee.original_fee || 0) - Number(fee.discount_amount || 0)) - Number(fee.paid_fees || 0)),
          "Status": (fee.status || "pending").toUpperCase(),
          "Last Payment": fee.last_payment_date
            ? new Date(fee.last_payment_date).toLocaleDateString("en-IN")
            : "N/A",
        };
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "Batch Applied Fees");
      const colWidths = Object.keys(rows[0] || {}).map((key) => ({
        wch: Math.max(key.length, ...rows.map((r: any) => String(r[key] || "").length)) + 2,
      }));
      ws["!cols"] = colWidths;

      // Sheet 2: Summary
      const totals = allFees.reduce(
        (acc: any, f: any) => ({
          original: acc.original + Number(f.original_fee || 0),
          discount: acc.discount + Number(f.discount_amount || 0),
          paid: acc.paid + Number(f.paid_fees || 0),
          paidCount: acc.paidCount + (f.status === "paid" ? 1 : 0),
          partialCount: acc.partialCount + (f.status === "partial" ? 1 : 0),
          pendingCount: acc.pendingCount + (f.status === "pending" ? 1 : 0),
          overdueCount: acc.overdueCount + (f.status === "overdue" ? 1 : 0),
        }),
        { original: 0, discount: 0, paid: 0, paidCount: 0, partialCount: 0, pendingCount: 0, overdueCount: 0 }
      );
      const finalTotal = totals.original - totals.discount;

      const summaryData = [
        { "Metric": "Total Original Fees", "Value": totals.original },
        { "Metric": "Total Discount Given", "Value": totals.discount },
        { "Metric": "Total Final Fees", "Value": finalTotal },
        { "Metric": "Total Collected", "Value": totals.paid },
        { "Metric": "Total Pending", "Value": Math.max(0, finalTotal - totals.paid) },
        { "Metric": "Collection Rate", "Value": finalTotal > 0 ? `${((totals.paid / finalTotal) * 100).toFixed(1)}%` : "0%" },
        { "Metric": "", "Value": "" },
        { "Metric": "Fully Paid", "Value": totals.paidCount },
        { "Metric": "Partially Paid", "Value": totals.partialCount },
        { "Metric": "No Payment", "Value": totals.pendingCount },
        { "Metric": "Overdue", "Value": totals.overdueCount },
        { "Metric": "Total Records", "Value": allFees.length },
        { "Metric": "", "Value": "" },
        { "Metric": "Exported At", "Value": new Date().toLocaleString("en-IN") },
      ];
      const wsSummary = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");
      const summaryKeys = Object.keys(summaryData[0] || {});
      wsSummary["!cols"] = summaryKeys.map((key) => ({
        wch: Math.max(key.length, ...summaryData.map((r: any) => String(r[key] || "").length)) + 3,
      }));

      const filename = `Batch_Applied_Fees_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(wb, filename);
      toast({
        title: "Batch Applied Fees Exported",
        description: `${allFees.length} student fee records exported to ${filename}`,
      });
    } catch (err: any) {
      console.error("Export error:", err);
      toast({ title: "Export Failed", description: err.message || "Could not export data", variant: "destructive" });
    }
  }, [instId]);

  // Columns
  const columns = [
    {
      key: "student_name",
      title: "Student",
      render: (fee: StudentFee) => (
        <div>
          <p className="text-sm font-semibold text-foreground">{fee.student_name}</p>
          <p className="text-[10px] text-muted-foreground uppercase font-medium">{fee.enrollment_no}</p>
          <p className="text-[10px] text-muted-foreground">{fee.batch_name}</p>
        </div>
      ),
    },
    {
      key: "final_fee",
      title: "Fee Amount",
      render: (fee: StudentFee) => (
        <span className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(fee.final_fee)}</span>
      ),
    },
    {
      key: "paid_fees",
      title: "Paid",
      render: (fee: StudentFee) => (
        <span className={`text-sm tabular-nums ${fee.paid_fees > 0 ? "text-green-600 font-semibold" : "text-muted-foreground"}`}>
          {formatCurrency(fee.paid_fees)}
        </span>
      ),
    },
    {
      key: "pending",
      title: "Pending",
      render: (fee: StudentFee) => {
        const pending = Math.max(0, fee.final_fee - fee.paid_fees);
        return (
          <span className={`text-sm tabular-nums font-semibold ${pending > 0 ? "text-orange-600" : "text-green-600"}`}>
            {formatCurrency(pending)}
          </span>
        );
      },
    },
    {
      key: "status",
      title: "Status",
      render: (fee: StudentFee) => {
        const v = feeStatusColors[fee.status];
        return <StatusBadge variant={v}>{fee.status}</StatusBadge>;
      },
    },
    {
      key: "actions",
      title: "Actions",
      render: (fee: StudentFee) => {
        const pending = Math.max(0, fee.final_fee - fee.paid_fees);
        return (
          <div className="flex gap-1 flex-wrap">
            {/* Pay Actions */}
            {pending > 0 ? (
              <Button
                size="sm"
                variant="default"
                onClick={() => handlePayFull(fee)}
                disabled={processing}
                className="h-7 text-xs px-2"
              >
                <IndianRupee className="w-3 h-3 mr-1" />
                Pay ₹{pending}
              </Button>
            ) : (
              <span className="inline-flex items-center px-2 py-1 text-[10px] font-medium text-green-700 bg-green-50 dark:bg-green-950/30 dark:text-green-400 rounded">
                <CheckCircle className="w-3 h-3 mr-1" />
                Paid
              </span>
            )}
            {pending > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => openPayment(fee)}
                className="h-7 text-xs"
              >
                Custom
              </Button>
            )}

            {/* Download Receipt */}
            {fee.paid_fees > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDownloadReceipt(fee)}
                className="h-7 text-xs"
                title="Download Receipt"
              >
                <Download className="w-3 h-3" />
              </Button>
            )}

            {/* WhatsApp Share */}
            <div className="flex gap-0.5 border-l border-border/50 pl-1 ml-0.5">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => shareViaWhatsApp(fee)}
                className="h-7 text-xs text-green-600"
                title="Share via WhatsApp"
              >
                <MessageSquare className="w-3 h-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => shareViaWebWhatsApp(fee)}
                className="h-7 text-xs text-blue-600"
                title="Share via Web WhatsApp"
              >
                <ExternalLink className="w-3 h-3" />
              </Button>
            </div>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/fees/batch")}
          >
            ← Batch Fees
          </Button>
          <h1 className="text-3xl font-bold">Batch Applied Fees</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportBatchAppliedReport}
            disabled={studentFees.length === 0}
            className="h-8 gap-1.5"
            title="Export Batch Applied Fees Report to Excel"
          >
            <Table2 className="w-4 h-4" />
            <span>Excel</span>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Batch Fees"
          value={formatCurrency(stats.total)}
          icon={IndianRupee}
        />
        <StatCard
          title="Collected"
          value={formatCurrency(stats.collected)}
          icon={CheckCircle}
          change={stats.total > 0 ? `${((stats.collected / stats.total) * 100).toFixed(0)}%` : "0%"}
          changeType="positive"
        />
        <StatCard
          title="Pending Collection"
          value={formatCurrency(stats.pending)}
          icon={AlertCircle}
          changeType={stats.pending > 0 ? "negative" : "positive"}
        />
        <StatCard
          title="Students with Fees"
          value={filteredStudentFees.length}
          icon={Filter}
        />
      </div>

      {/* Main Content */}
      <div className="rounded-lg border bg-card">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or enrollment..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            {/* Batch Filter */}
            <Select value={batchFilter} onValueChange={setBatchFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Batches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Batches</SelectItem>
                {batchOptions.map(b => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={(value: "all" | StudentFee["status"]) => setStatusFilter(value)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Data Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              Loading fees...
            </div>
          ) : filteredStudentFees.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <IndianRupee className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No batch-applied fees found</p>
              <p className="text-xs mt-2 max-w-md mx-auto">
                {total > 0
                  ? "All students have batch fees assigned but no fee structures are active yet. Create a batch fee from the Batch Fees page."
                  : "No active students found. Add students and create a batch fee to get started."
                }
              </p>
              <div className="flex gap-2 mt-4 justify-center">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate("/fees/batch")}
                >
                  Go to Batch Fees
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate("/fees/student")}
                >
                  View All Student Fees
                </Button>
              </div>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={filteredStudentFees}
              emptyMessage="No fees match your filters."
            />
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t">
            <div className="text-sm text-muted-foreground">
              Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, total)} of {total} students
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const newPage = Math.max(1, currentPage - 1);
                  setCurrentPage(newPage);
                  fetchStudentFees(newPage);
                }}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <span className="flex items-center px-3 text-sm">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const newPage = currentPage + 1;
                  setCurrentPage(newPage);
                  fetchStudentFees(newPage);
                }}
                disabled={currentPage >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Custom Payment Dialog */}
      <Dialog open={addPaymentOpen} onOpenChange={setAddPaymentOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add Payment</DialogTitle>
          </DialogHeader>
          {selectedStudentFee && (
            <div className="space-y-4 py-2">
              <div className="bg-secondary/30 rounded-lg p-3">
                <p className="text-sm font-semibold">{selectedStudentFee.student_name}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedStudentFee.enrollment_no} · {selectedStudentFee.batch_name}
                </p>
                <div className="flex items-center gap-4 mt-2 text-xs">
                  <span>Fee: <strong>{formatCurrency(selectedStudentFee.final_fee)}</strong></span>
                  <span>Paid: <strong>{formatCurrency(selectedStudentFee.paid_fees)}</strong></span>
                  <span>Due: <strong className="text-orange-600">{formatCurrency(Math.max(0, selectedStudentFee.final_fee - selectedStudentFee.paid_fees))}</strong></span>
                </div>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Payment Amount (₹)</label>
                <Input
                  type="number"
                  placeholder="Enter amount"
                  value={paymentForm.paymentAmount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, paymentAmount: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Method</label>
                <Select
                  value={paymentForm.paymentMethod}
                  onValueChange={(value) => setPaymentForm({ ...paymentForm, paymentMethod: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Date</label>
                <Input
                  type="date"
                  value={paymentForm.paymentDate}
                  onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddPaymentOpen(false)}>Cancel</Button>
            <Button onClick={handlePaymentSubmit} disabled={processing}>
              {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Add Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}