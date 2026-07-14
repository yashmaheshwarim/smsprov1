import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, IndianRupee, AlertCircle, CheckCircle, Plus, Loader2, FileText, Printer, Pencil, Trash2, CreditCard, List, Table2 } from "lucide-react";
import * as XLSX from "xlsx";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import { useStudentFees, useFeeStats, useStudentFeeOperations, useBatchFees, type StudentFee, feeStatusColors, formatCurrency } from "@/hooks/useFees";
import { supabase, isUuid } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

export default function StudentFeePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const DEFAULT_UID = "00000000-0000-0000-0000-000000000001";
  const instId = isAdmin ? (user as AdminUser).instituteId : DEFAULT_UID;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pageSize = 10;

  // State
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | StudentFee["status"]>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedStudentFee, setSelectedStudentFee] = useState<StudentFee | null>(null);
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [addDiscountOpen, setAddDiscountOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [addStudentFeeOpen, setAddStudentFeeOpen] = useState(false);
  const [editStudentFeeOpen, setEditStudentFeeOpen] = useState(false);
  const [quickPayOpen, setQuickPayOpen] = useState(false);
  const [quickPayFee, setQuickPayFee] = useState<StudentFee | null>(null);
  const [studentFeeForm, setStudentFeeForm] = useState({
    studentId: "",
    batchFeeId: "",
    originalFee: "",
    discountAmount: "",
    discountReason: "",
    status: "pending" as StudentFee["status"],
  });
  const [studentsList, setStudentsList] = useState<any[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    studentFeeId: "",
    paymentAmount: "",
    paymentMethod: "cash",
    paymentDate: new Date().toISOString().split("T")[0],
  });
  const [discountForm, setDiscountForm] = useState({
    studentFeeId: "",
    discountAmount: "",
    discountReason: "",
  });

  // Auto-set search from URL query param `q` (e.g. from StudentDetailPage "Pay Fees" button)
  useEffect(() => {
    const q = searchParams.get("q");
    if (q) {
      setSearch(q);
      setCurrentPage(1);
    }
  }, [searchParams]);

  // Hooks — pass search to enable server-side filtering across ALL students, not just current page
  const { studentFees, total, loading, fetchStudentFees } = useStudentFees(instId, currentPage, pageSize, search);
  const stats = useFeeStats(studentFees);
  const { processing, addPayment, applyDiscount, deleteStudentFee, generateFeeReceiptPDF, createStudentFee, updateStudentFee, quickCreateAndPay } = useStudentFeeOperations(instId, fetchStudentFees);
  const { batchFees } = useBatchFees(instId);

  // Fetch students for add dialog
  const fetchStudentsList = async () => {
    setLoadingStudents(true);
    try {
      const { data: students, error } = await supabase
        .from("students")
        .select("id, name, enrollment_no, batch_id")
        .eq("institute_id", instId)
        .order("name", { ascending: true });
      if (error) throw error;

      // Fetch batch names separately to avoid FK join issues
      const batchIds = [...new Set((students || []).map((s: any) => s.batch_id).filter(Boolean))];
      const batchNameMap: Record<string, string> = {};
      if (batchIds.length > 0) {
        const { data: batchData } = await supabase
          .from("batches")
          .select("id, name")
          .in("id", batchIds);
        (batchData || []).forEach((b: any) => {
          batchNameMap[b.id] = b.name;
        });
      }

      const enriched = (students || []).map((s: any) => ({
        ...s,
        batches: s.batch_id ? { name: batchNameMap[s.batch_id] || "Unknown" } : null,
      }));

      setStudentsList(enriched);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoadingStudents(false);
    }
  };

  useEffect(() => {
    if (isUuid(instId)) {
      fetchStudentsList();
    }
  }, [instId]);

  // Handlers
  const handleAddStudentFee = async () => {
    await createStudentFee({
      studentId: studentFeeForm.studentId,
      batchFeeId: studentFeeForm.batchFeeId,
      originalFee: studentFeeForm.originalFee,
      discountAmount: studentFeeForm.discountAmount,
      discountReason: studentFeeForm.discountReason,
      status: studentFeeForm.status,
    });
    setAddStudentFeeOpen(false);
    setStudentFeeForm({ studentId: "", batchFeeId: "", originalFee: "", discountAmount: "", discountReason: "", status: "pending" });
  };

  const handleEditStudentFee = async () => {
    if (!selectedStudentFee) return;
    await updateStudentFee({
      id: selectedStudentFee.id,
      originalFee: studentFeeForm.originalFee,
      discountAmount: studentFeeForm.discountAmount,
      discountReason: studentFeeForm.discountReason,
      status: studentFeeForm.status,
    }, currentPage);
    setEditStudentFeeOpen(false);
    setSelectedStudentFee(null);
  };

  const openAddDialog = () => {
    setStudentFeeForm({ studentId: "", batchFeeId: "", originalFee: "", discountAmount: "", discountReason: "", status: "pending" });
    setAddStudentFeeOpen(true);
  };

  const openEditDialog = (fee: StudentFee) => {
    setSelectedStudentFee(fee);
    setStudentFeeForm({
      studentId: fee.student_id,
      batchFeeId: fee.batch_fee_id,
      originalFee: fee.original_fee.toString(),
      discountAmount: fee.discount_amount.toString(),
      discountReason: fee.discount_reason || "",
      status: fee.status,
    });
    setEditStudentFeeOpen(true);
  };

  // Auto-populate original fee when batch fee changes
  const handleBatchFeeChange = (batchFeeId: string) => {
    const bf = batchFees.find(b => b.id === batchFeeId);
    setStudentFeeForm(prev => ({
      ...prev,
      batchFeeId,
      originalFee: bf ? bf.total_fees.toString() : "",
    }));
  };

  // Filtered data
  const filteredStudentFees = useMemo(() => {
    return studentFees.filter((fee) => {
      const matchSearch = (fee.student_name || "").toLowerCase().includes(search.toLowerCase()) ||
        fee.id.toLowerCase().includes(search.toLowerCase()) ||
        (fee.enrollment_no || "").toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || fee.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [search, statusFilter, studentFees]);

  const isSynthetic = (fee: StudentFee) => fee.id.toString().startsWith("synthetic-");

  // Open quick pay dialog
  const openQuickPay = (fee: StudentFee) => {
    setQuickPayFee(fee);
    setPaymentForm({
      studentFeeId: fee.id,
      paymentAmount: "",
      paymentMethod: "cash",
      paymentDate: new Date().toISOString().split("T")[0],
    });
    setQuickPayOpen(true);
  };

  // Handle quick pay with preset amount
  const handleQuickPay = async (amount: number) => {
    if (!quickPayFee) return;

    if (isSynthetic(quickPayFee)) {
      // Need to create student_fee record first, then pay
      if (!quickPayFee.batch_fee_id) {
        toast({ title: "Error", description: "No batch fee assigned to this student. Create a fee structure first.", variant: "destructive" });
        return;
      }
      const success = await quickCreateAndPay(
        quickPayFee.student_id,
        quickPayFee.batch_fee_id,
        quickPayFee.original_fee || quickPayFee.final_fee,
        amount,
        paymentForm.paymentMethod,
        currentPage
      );
      if (success) {
        setQuickPayOpen(false);
        setQuickPayFee(null);
      }
    } else {
      // Existing student_fee record - normal payment
      await addPayment(
        quickPayFee.id,
        amount.toString(),
        paymentForm.paymentMethod,
        paymentForm.paymentDate,
        currentPage,
        studentFees
      );
      setQuickPayOpen(false);
      setQuickPayFee(null);
    }
  };

  const handlePaymentSubmit = async () => {
    if (!selectedStudentFee) return;
    if (!paymentForm.paymentAmount) {
      toast({ title: "Error", description: "Please enter payment amount.", variant: "destructive" });
      return;
    }

    if (isSynthetic(selectedStudentFee)) {
      if (!selectedStudentFee.batch_fee_id) {
        toast({ title: "Error", description: "No batch fee assigned. Create a fee structure first.", variant: "destructive" });
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

  const handleDiscountSubmit = async () => {
    await applyDiscount(
      discountForm.studentFeeId,
      discountForm.discountAmount,
      discountForm.discountReason,
      currentPage,
      studentFees
    );
    setAddDiscountOpen(false);
  };

  const handleDeleteSubmit = async () => {
    if (!selectedStudentFee) return;
    await deleteStudentFee(selectedStudentFee.id, currentPage);
    setDeleteConfirmOpen(false);
    setSelectedStudentFee(null);
  };

  const totalPages = Math.ceil(total / pageSize);

  // ── Excel Export ───────────────────────────────────────────────────────────
  const exportStudentsFeeReport = useCallback(async () => {
    try {
      // Fetch ALL student fees from Supabase (bypass pagination)
      const { data: allFees, error } = await supabase
        .from("student_fees")
        .select("*")
        .eq("institute_id", instId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Enrich with student & batch details
      const studentIds = [...new Set((allFees || []).map((f: any) => f.student_id).filter(Boolean))];
      const batchFeeIds = [...new Set((allFees || []).map((f: any) => f.batch_fee_id).filter(Boolean))];

      const [studentData, batchFeeData] = await Promise.all([
        studentIds.length > 0
          ? supabase.from("students").select("id, name, enrollment_no").in("id", studentIds)
          : { data: [] },
        batchFeeIds.length > 0
          ? supabase.from("batch_fees").select("id, title, total_fees, batches(name)")
            .in("id", batchFeeIds)
          : { data: [] },
      ]);

      const studentMap = new Map((studentData.data || []).map((s: any) => [s.id, s]));
      const feeMap = new Map((batchFeeData.data || []).map((b: any) => [b.id, b]));

      const wb = XLSX.utils.book_new();

      // Sheet 1: All Student Fee Records
      const rows = (allFees || []).map((fee: any, i: number) => {
        const student = studentMap.get(fee.student_id);
        const batchFee = feeMap.get(fee.batch_fee_id);
        return {
          "#": i + 1,
          "Student Name": student?.name || "Unknown",
          "Enrollment No": student?.enrollment_no || "",
          "Batch Fee Title": batchFee?.title || "N/A",
          "Original Fee": Number(fee.original_fee || 0),
          "Discount Amount": Number(fee.discount_amount || 0),
          "Discount Reason": fee.discount_reason || "",
          "Final Fee": Math.max(0, Number(fee.original_fee || 0) - Number(fee.discount_amount || 0)),
          "Paid Amount": Number(fee.paid_fees || 0),
          "Pending Amount": Math.max(0, Math.max(0, Number(fee.original_fee || 0) - Number(fee.discount_amount || 0)) - Number(fee.paid_fees || 0)),
          "Status": (fee.status || "pending").toUpperCase(),
          "Last Payment": fee.last_payment_date
            ? new Date(fee.last_payment_date).toLocaleDateString("en-IN")
            : "N/A",
        };
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "Student Fees");
      const colWidths = Object.keys(rows[0] || {}).map((key) => ({
        wch: Math.max(key.length, ...rows.map((r: any) => String(r[key] || "").length)) + 2,
      }));
      ws["!cols"] = colWidths;

      // Sheet 2: Summary
      const totals = (allFees || []).reduce(
        (acc, f: any) => ({
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
        { "Metric": "Total Final Fees (after discounts)", "Value": finalTotal },
        { "Metric": "Total Collected", "Value": totals.paid },
        { "Metric": "Total Pending", "Value": Math.max(0, finalTotal - totals.paid) },
        { "Metric": "Collection Rate", "Value": finalTotal > 0 ? `${((totals.paid / finalTotal) * 100).toFixed(1)}%` : "0%" },
        { "Metric": "", "Value": "" },
        { "Metric": "Fully Paid", "Value": totals.paidCount },
        { "Metric": "Partially Paid", "Value": totals.partialCount },
        { "Metric": "No Payment (Pending)", "Value": totals.pendingCount },
        { "Metric": "Overdue", "Value": totals.overdueCount },
        { "Metric": "Total Records", "Value": (allFees || []).length },
        { "Metric": "", "Value": "" },
        { "Metric": "Exported At", "Value": new Date().toLocaleString("en-IN") },
      ];
      const wsSummary = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");
      const summaryKeys = Object.keys(summaryData[0] || {});
      wsSummary["!cols"] = summaryKeys.map((key) => ({
        wch: Math.max(key.length, ...summaryData.map((r: any) => String(r[key] || "").length)) + 3,
      }));

      const filename = `All_Student_Fees_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(wb, filename);
      toast({
        title: "Students Report Exported",
        description: `${(allFees || []).length} student fee records exported to ${filename}`,
      });
    } catch (err: any) {
      console.error("Export error:", err);
      toast({ title: "Export Failed", description: err.message || "Could not export data", variant: "destructive" });
    }
  }, [instId]);

  // Student columns
  const studentColumns = [
    {
      key: "student_name",
      title: "Student",
      render: (fee: StudentFee) => (
        <div>
          <p className="text-sm font-semibold text-foreground">{fee.student_name}</p>
          <p className="text-[10px] text-muted-foreground uppercase font-medium">{fee.enrollment_no}</p>
          <p className="text-[10px] text-muted-foreground">{fee.batch_name}</p>
          {isSynthetic(fee) && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 mt-0.5">
              No Fee Record
            </span>
          )}
        </div>
      ),
    },
    {
      key: "due_date",
      title: "Admission",
      render: (fee: StudentFee) => (
        <span className="text-xs text-muted-foreground tabular-nums">
          {fee.admission_date ? new Date(fee.admission_date).toLocaleDateString() : "N/A"}
        </span>
      ),
    },
    {
      key: "original_fee",
      title: "Fee Amount",
      render: (fee: StudentFee) => <span className="text-sm tabular-nums">{formatCurrency(fee.original_fee)}</span>,
    },
    {
      key: "discount",
      title: "Discount",
      render: (fee: StudentFee) => (
        <span className={`text-sm tabular-nums ${fee.discount_amount > 0 ? "text-green-600" : "text-muted-foreground"}`}>
          {fee.discount_amount > 0 ? `-${formatCurrency(fee.discount_amount)}` : "—"}
        </span>
      ),
    },
    {
      key: "final_fee",
      title: "Net Fee",
      render: (fee: StudentFee) => <span className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(fee.final_fee)}</span>,
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
        const pendingAmt = Math.max(0, fee.final_fee - fee.paid_fees);
        return (
          <span className={`text-sm tabular-nums ${pendingAmt > 0 ? "text-orange-600 font-semibold" : "text-green-600"}`}>
            {formatCurrency(pendingAmt)}
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
        const synthetic = isSynthetic(fee);
        const hasBatchFee = !!fee.batch_fee_id && fee.original_fee > 0;
        return (
          <div className="flex gap-1">
            {synthetic ? (
              <>
                {hasBatchFee ? (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => openQuickPay(fee)}
                    className="h-7 text-xs px-2"
                  >
                    <CreditCard className="w-3 h-3 mr-1" />
                    Create & Pay
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setStudentFeeForm({
                        studentId: fee.student_id,
                        batchFeeId: "",
                        originalFee: "",
                        discountAmount: "",
                        discountReason: "",
                        status: "pending",
                      });
                      setAddStudentFeeOpen(true);
                    }}
                    className="h-7 text-xs"
                  >
                    + Fee
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => openQuickPay(fee)}
                  className="h-7 text-xs px-2"
                  disabled={fee.status === "paid"}
                >
                  <IndianRupee className="w-3 h-3 mr-1" />
                  Pay
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => generateFeeReceiptPDF(fee)}
                  className="h-7 text-xs"
                  disabled={fee.paid_fees === 0}
                >
                  <Printer className="w-3 h-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDiscountForm({ studentFeeId: fee.id, discountAmount: "", discountReason: "" });
                    setAddDiscountOpen(true);
                  }}
                  className="h-7 text-xs"
                >
                  −%
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => openEditDialog(fee)}
                  className="h-7 text-xs"
                >
                  <Pencil className="w-3 h-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSelectedStudentFee(fee);
                    setDeleteConfirmOpen(true);
                  }}
                  className="h-7 text-xs text-red-600"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </>
            )}
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
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/fees/batch-applied")}
          >
            <List className="w-3 h-3 mr-1" />
            Batch Applied
          </Button>
          <h1 className="text-3xl font-bold">Student Fees</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportStudentsFeeReport}
            disabled={studentFees.length === 0}
            className="h-8 gap-1.5"
            title="Export All Student Fees Report to Excel"
          >
            <Table2 className="w-4 h-4" />
            <span>Excel</span>
          </Button>
          <Button
            size="sm"
            onClick={openAddDialog}
          >
            <Plus className="w-3 h-3 mr-1" />
            Add Student Fee
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Fees"
          value={formatCurrency(stats.total)}
          icon={IndianRupee}
        />
        <StatCard
          title="Collected"
          value={formatCurrency(stats.collected)}
          icon={CheckCircle}
          change={
            stats.total > 0
              ? `${((stats.collected / stats.total) * 100).toFixed(0)}%`
              : "0%"
          }
          changeType="positive"
        />
        <StatCard
          title="Pending"
          value={formatCurrency(stats.pending)}
          icon={AlertCircle}
          changeType={stats.pending > 0 ? "negative" : "positive"}
        />
        <StatCard
          title="Overdue"
          value={stats.overdue}
          icon={AlertCircle}
          changeType={stats.overdue > 0 ? "negative" : "positive"}
        />
      </div>

      {/* Main Content */}
      <div className="rounded-lg border bg-card">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search students..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <Select
              value={statusFilter}
              onValueChange={(value: "all" | StudentFee["status"]) => setStatusFilter(value)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
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
            <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
          ) : (
            <DataTable
              columns={studentColumns}
              data={filteredStudentFees}
              emptyMessage="No student fees found."
            />
          )}
        </div>

        {/* Pagination */}
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
      </div>

      {/* Quick Pay Dialog - with preset amounts */}
      <Dialog open={quickPayOpen} onOpenChange={(open) => { if (!open) { setQuickPayOpen(false); setQuickPayFee(null); } }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {quickPayFee && isSynthetic(quickPayFee) ? "Create Fee & Make Payment" : "Add Payment"}
            </DialogTitle>
          </DialogHeader>
          {quickPayFee && (
            <div className="space-y-4 py-2">
              {/* Student info */}
              <div className="bg-secondary/30 rounded-lg p-3 space-y-1">
                <p className="text-sm font-semibold">{quickPayFee.student_name}</p>
                <p className="text-xs text-muted-foreground">{quickPayFee.enrollment_no} · {quickPayFee.batch_name}</p>
                <div className="flex items-center gap-4 mt-2 text-xs">
                  <span>Fee: <strong>{formatCurrency(quickPayFee.final_fee)}</strong></span>
                  <span>Paid: <strong>{formatCurrency(quickPayFee.paid_fees)}</strong></span>
                  <span>Due: <strong className="text-orange-600">{formatCurrency(Math.max(0, quickPayFee.final_fee - quickPayFee.paid_fees))}</strong></span>
                </div>
              </div>

              {/* Payment method */}
              <div className="grid gap-2">
                <label className="text-sm font-medium">Payment Method</label>
                <Select
                  value={paymentForm.paymentMethod}
                  onValueChange={(value) => setPaymentForm(prev => ({ ...prev, paymentMethod: value }))}
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

              {/* Quick amount buttons */}
              <div>
                <label className="text-sm font-medium mb-2 block">Quick Pay Amount</label>
                <div className="grid grid-cols-3 gap-2">
                  {(() => {
                    const due = Math.max(0, quickPayFee.final_fee - quickPayFee.paid_fees);
                    const half = Math.ceil(due / 2);
                    const full = due;
                    return (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleQuickPay(half)}
                          disabled={processing || due === 0}
                          className="h-12 flex flex-col items-center justify-center"
                        >
                          <span className="text-xs font-medium">50%</span>
                          <span className="text-[10px] text-muted-foreground">{formatCurrency(half)}</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleQuickPay(full)}
                          disabled={processing || due === 0}
                          className="h-12 flex flex-col items-center justify-center"
                        >
                          <span className="text-xs font-medium">Full</span>
                          <span className="text-[10px] text-muted-foreground">{formatCurrency(full)}</span>
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => {
                            setSelectedStudentFee(quickPayFee);
                            setAddPaymentOpen(true);
                            setQuickPayOpen(false);
                          }}
                          className="h-12 flex flex-col items-center justify-center"
                        >
                          <span className="text-xs font-medium">Custom</span>
                          <span className="text-[10px] text-muted-foreground">Enter amount</span>
                        </Button>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setQuickPayOpen(false); setQuickPayFee(null); }}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog (Custom Amount) */}
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
                  Fee: {formatCurrency(selectedStudentFee.final_fee)} · Paid: {formatCurrency(selectedStudentFee.paid_fees)} · Due: <strong>{formatCurrency(Math.max(0, selectedStudentFee.final_fee - selectedStudentFee.paid_fees))}</strong>
                </p>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Payment Amount</label>
                <Input
                  type="number"
                  placeholder="Enter payment amount"
                  value={paymentForm.paymentAmount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, paymentAmount: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Payment Method</label>
                <Select
                  value={paymentForm.paymentMethod}
                  onValueChange={(value) => setPaymentForm({ ...paymentForm, paymentMethod: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select payment method" />
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
                <label className="text-sm font-medium">Payment Date</label>
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

      {/* Discount Dialog */}
      <Dialog open={addDiscountOpen} onOpenChange={setAddDiscountOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Apply Discount</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Discount Amount</label>
              <Input
                type="number"
                placeholder="Enter discount amount"
                value={discountForm.discountAmount}
                onChange={(e) => setDiscountForm({ ...discountForm, discountAmount: e.target.value })}
              />
              {discountForm.studentFeeId && (
                <p className="text-xs text-muted-foreground">
                  {(() => {
                    const fee = studentFees.find(f => f.id === discountForm.studentFeeId);
                    const discount = parseFloat(discountForm.discountAmount || "0");
                    const final = fee ? Math.max(0, fee.original_fee - discount) : 0;
                    return `Final fee after discount: ${formatCurrency(final)}`;
                  })()}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Discount Reason (Optional)</label>
              <Input
                placeholder="Enter reason for discount"
                value={discountForm.discountReason}
                onChange={(e) => setDiscountForm({ ...discountForm, discountReason: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDiscountOpen(false)}>Cancel</Button>
            <Button onClick={handleDiscountSubmit} disabled={processing}>
              {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Apply Discount
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete Student Fee</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this student fee record? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSubmit}
              disabled={processing}
            >
              {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Student Fee Dialog */}
      <Dialog open={addStudentFeeOpen} onOpenChange={setAddStudentFeeOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Student Fee</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Student</label>
              <Select value={studentFeeForm.studentId} onValueChange={(value) => setStudentFeeForm(prev => ({ ...prev, studentId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select student" />
                </SelectTrigger>
                <SelectContent>
                  {loadingStudents ? (
                    <SelectItem value="loading" disabled>Loading students...</SelectItem>
                  ) : studentsList.length === 0 ? (
                    <SelectItem value="none" disabled>No students found</SelectItem>
                  ) : (
                    studentsList.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.enrollment_no}) {s.batches?.name ? `- ${s.batches.name}` : ''}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Batch Fee</label>
              <Select value={studentFeeForm.batchFeeId} onValueChange={handleBatchFeeChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select batch fee" />
                </SelectTrigger>
                <SelectContent>
                  {batchFees.map((bf: any) => (
                    <SelectItem key={bf.id} value={bf.id}>
                      {bf.title} - {bf.batch_name} ({formatCurrency(bf.total_fees)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Original Fee (₹)</label>
              <Input
                type="number"
                placeholder="Enter original fee"
                value={studentFeeForm.originalFee}
                onChange={(e) => setStudentFeeForm(prev => ({ ...prev, originalFee: e.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Discount Amount (₹)</label>
              <Input
                type="number"
                placeholder="Enter discount amount"
                value={studentFeeForm.discountAmount}
                onChange={(e) => setStudentFeeForm(prev => ({ ...prev, discountAmount: e.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Discount Reason (Optional)</label>
              <Input
                placeholder="Enter reason for discount"
                value={studentFeeForm.discountReason}
                onChange={(e) => setStudentFeeForm(prev => ({ ...prev, discountReason: e.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={studentFeeForm.status} onValueChange={(value: StudentFee["status"]) => setStudentFeeForm(prev => ({ ...prev, status: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddStudentFeeOpen(false)}>Cancel</Button>
            <Button onClick={handleAddStudentFee} disabled={processing}>
              {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Create Student Fee
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Student Fee Dialog */}
      <Dialog open={editStudentFeeOpen} onOpenChange={setEditStudentFeeOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Student Fee</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Student</label>
              <Input
                value={selectedStudentFee ? `${selectedStudentFee.student_name} (${selectedStudentFee.enrollment_no})` : ''}
                disabled
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Batch Fee</label>
              <Input
                value={selectedStudentFee ? `${selectedStudentFee.batch_name} - ${formatCurrency(selectedStudentFee.original_fee)}` : ''}
                disabled
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Original Fee (₹)</label>
              <Input
                type="number"
                value={studentFeeForm.originalFee}
                onChange={(e) => setStudentFeeForm(prev => ({ ...prev, originalFee: e.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Discount Amount (₹)</label>
              <Input
                type="number"
                value={studentFeeForm.discountAmount}
                onChange={(e) => setStudentFeeForm(prev => ({ ...prev, discountAmount: e.target.value }))}
              />
              {studentFeeForm.discountAmount && (
                <p className="text-xs text-muted-foreground">
                  Final fee after discount: {formatCurrency(parseFloat(studentFeeForm.originalFee || '0') - parseFloat(studentFeeForm.discountAmount || '0'))}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Discount Reason (Optional)</label>
              <Input
                value={studentFeeForm.discountReason}
                onChange={(e) => setStudentFeeForm(prev => ({ ...prev, discountReason: e.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={studentFeeForm.status} onValueChange={(value: StudentFee["status"]) => setStudentFeeForm(prev => ({ ...prev, status: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditStudentFeeOpen(false); setSelectedStudentFee(null); }}>Cancel</Button>
            <Button onClick={handleEditStudentFee} disabled={processing}>
              {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}