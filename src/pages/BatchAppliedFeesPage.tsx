import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Search, IndianRupee, AlertCircle, CheckCircle, 
  Loader2, MessageSquare, ExternalLink, 
  Filter, Download 
} from "lucide-react";
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