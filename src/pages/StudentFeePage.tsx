import { useState, useMemo, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, Download, IndianRupee, AlertCircle, CheckCircle, Plus, Loader2, FileText, Printer, Pencil, Trash2 } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import { useStudentFees, useFeeStats, useStudentFeeOperations, useBatchFees, type StudentFee, feeStatusColors, formatCurrency } from "@/hooks/useFees";
import { supabase } from "@/lib/supabase";
import { isUuid } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { useCallback, useRef } from "react";

export default function StudentFeePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const DEFAULT_UID = "00000000-0000-0000-0000-000000000001";
  const instId = isAdmin ? (user as AdminUser).instituteId : DEFAULT_UID;
  const navigate = useNavigate();
  const location = useLocation();
  const pageSize = 10;

   const debounceRef = useRef<NodeJS.Timeout>();

   const initialStudentQuery = new URLSearchParams(location.search).get("student") || "";

   // State
   const [search, setSearch] = useState(initialStudentQuery);
   const [statusFilter, setStatusFilter] = useState<"all" | StudentFee["status"]>("all");
   const [currentPage, setCurrentPage] = useState(1);
   const [selectedStudentFee, setSelectedStudentFee] = useState<StudentFee | null>(null);
   const [addPaymentOpen, setAddPaymentOpen] = useState(false);
   const [addDiscountOpen, setAddDiscountOpen] = useState(false);
   const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
   const [addStudentFeeOpen, setAddStudentFeeOpen] = useState(false);
   const [editStudentFeeOpen, setEditStudentFeeOpen] = useState(false);
    const [studentFeeForm, setStudentFeeForm] = useState({
     studentId: "",
     batchFeeId: "",
     originalFee: "",
     discountAmount: "",
     discountReason: "",
     receiptId: "",
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
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportMode, setExportMode] = useState<"filtered" | "all">("filtered");
  const allColumns = [
    { key: "Student Fee ID", label: "Student Fee ID" },
    { key: "Enrollment No", label: "Enrollment No" },
    { key: "Student Name", label: "Student Name" },
    { key: "Batch", label: "Batch" },
    { key: "Original Fee", label: "Original Fee" },
    { key: "Discount Amount", label: "Discount Amount" },
    { key: "Final Fee", label: "Final Fee" },
    { key: "Paid Fees", label: "Paid Fees" },
    { key: "Pending Amount", label: "Pending Amount" },
    { key: "Status", label: "Status" },
   { key: "Last Payment Date", label: "Last Payment Date" },
   { key: "Receipt Number", label: "Receipt Number" },
 ];
  const [selectedColumns, setSelectedColumns] = useState<string[]>(allColumns.map(c => c.key));

   // Hooks
   const { studentFees, total, loading, fetchStudentFees } = useStudentFees(instId, currentPage, pageSize, initialStudentQuery);
   const stats = useFeeStats(studentFees);
   const { processing, addPayment, applyDiscount, deleteStudentFee, generateFeeReceiptPDF, createStudentFee, updateStudentFee } = useStudentFeeOperations(instId, fetchStudentFees);
   const { batchFees } = useBatchFees(instId); // For batch fee select in dialogs if needed

   // Fetch students for add dialog
   const fetchStudentsList = async () => {
     setLoadingStudents(true);
     try {
       const { data, error } = await supabase
         .from("students")
         .select(`
           id,
           name,
           enrollment_no,
           batch_id,
           batches ( name )
         `)
         .eq("institute_id", instId)
         .order("name", { ascending: true });
       if (error) throw error;
       setStudentsList(data || []);
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
       receiptId: studentFeeForm.receiptId,
       status: studentFeeForm.status,
     });
     setAddStudentFeeOpen(false);
     setStudentFeeForm({ studentId: "", batchFeeId: "", originalFee: "", discountAmount: "", discountReason: "", receiptId: "", status: "pending" });
   };
    const handleEditStudentFee = async () => {
     if (!selectedStudentFee) return;
     await updateStudentFee({
       id: selectedStudentFee.id,
       originalFee: studentFeeForm.originalFee,
       discountAmount: studentFeeForm.discountAmount,
       discountReason: studentFeeForm.discountReason,
       receiptId: studentFeeForm.receiptId,
       status: studentFeeForm.status,
     }, currentPage);
     setEditStudentFeeOpen(false);
     setSelectedStudentFee(null);
   };

   const openAddDialog = () => {
     setStudentFeeForm({ studentId: "", batchFeeId: "", originalFee: "", discountAmount: "", discountReason: "", receiptId: "", status: "pending" });
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
       receiptId: fee.receipt_id || "",
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
         </div>
       ),
     },
     {
       key: "admission_date",
       title: "Admission Date",
       render: (fee: StudentFee) => (
         <span className="text-xs text-muted-foreground tabular-nums">
           {fee.admission_date ? new Date(fee.admission_date).toLocaleDateString() : "N/A"}
         </span>
       ),
      },
{        key: "receipt_id",
        title: "Receipt ID",
        render: (fee: StudentFee) => (
          <span className="text-sm text-muted-foreground tabular-nums">
            {fee.receipt_id || "—"}
          </span>
        ),
      },
      {        key: "original_fee",
        title: "Fees Structure",
       render: (fee: StudentFee) => <span className="text-sm tabular-nums">{formatCurrency(fee.original_fee)}</span>,
     },
    {
      key: "discount",
      title: "Discount",
      render: (fee: StudentFee) => (
        <span className={`text-sm tabular-nums ${fee.discount_amount > 0 ? "text-green-600" : "text-muted-foreground"}`}>
          {fee.discount_amount > 0 ? `-${formatCurrency(fee.discount_amount)}` : "None"}
        </span>
      ),
    },
    {
      key: "final_fee",
      title: "Final Fee",
      render: (fee: StudentFee) => <span className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(fee.final_fee)}</span>,
    },
    {
      key: "paid_fees",
      title: "Paid",
      render: (fee: StudentFee) => <span className="text-sm text-green-600 tabular-nums">{formatCurrency(fee.paid_fees)}</span>,
    },
    {
      key: "pending",
      title: "Pending",
      render: (fee: StudentFee) => (
        <span className="text-sm text-orange-600 tabular-nums">
          {formatCurrency(Math.max(0, fee.final_fee - fee.paid_fees))}
        </span>
      ),
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
       key: "last_payment",
       title: "Last Payment",
       render: (fee: StudentFee) => (
         <span className="text-xs text-muted-foreground tabular-nums">
           {fee.last_payment_date ? new Date(fee.last_payment_date).toLocaleDateString() : "N/A"}
         </span>
       ),
     },
     {
       key: "receipt_id",
       title: "Receipt Number",
       render: (fee: StudentFee) => (
         <span className="text-xs text-muted-foreground tabular-nums">
           {fee.receipt_id || "—"}
         </span>
       ),
     },
     {
       key: "actions",
       title: "",
       render: (fee: StudentFee) => {
         const isSynthetic = fee.id.toString().startsWith("synthetic-");
         return (
           <div className="flex gap-1">
             {isSynthetic ? (
               <Button
                 size="sm"
                 variant="ghost"
                 onClick={() => {
                   // Pre-fill Add dialog with this student and batch fee
                     setStudentFeeForm({
                      studentId: fee.student_id,
                      batchFeeId: fee.batch_fee_id,
                      originalFee: fee.original_fee.toString(),
                      discountAmount: "",
                      discountReason: "",
                      receiptId: "",
                      status: "pending",
                    });
                   setAddStudentFeeOpen(true);
                 }}
                 className="h-7 text-xs"
               >
                 Add Fee
               </Button>
             ) : (
               <>
                 <Button
                   size="sm"
                   variant="ghost"
                   onClick={() => {
                     setPaymentForm({
                       studentFeeId: fee.id,
                       paymentAmount: "",
                       paymentMethod: "cash",
                       paymentDate: new Date().toISOString().split("T")[0],
                     });
                     setAddPaymentOpen(true);
                   }}
                   className="h-7 text-xs"
                   disabled={fee.status === "paid"}
                 >
                   Pay
                 </Button>
                 <Button
                   size="sm"
                   variant="ghost"
                   onClick={() => generateFeeReceiptPDF(fee)}
                   className="h-7 text-xs"
                   disabled={fee.paid_fees === 0}
                 >
                   <Printer className="w-3 h-3 mr-1" />
                   Receipt
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
                   Discount
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

  const handlePaymentSubmit = async () => {
    await addPayment(
      paymentForm.studentFeeId,
      paymentForm.paymentAmount,
      paymentForm.paymentMethod,
      paymentForm.paymentDate,
      currentPage,
      studentFees
    );
    setAddPaymentOpen(false);
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

  const downloadXlsx = async (fileName: string, rows: Record<string, any>[]) => {
    if (!rows || rows.length === 0) {
      toast({ title: "No data", description: "Nothing to export.", variant: "destructive" });
      return;
    }

    const XLSX: typeof import("xlsx") = (await import("xlsx")) as any;
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Students");
    const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Downloaded", description: fileName });
  };

  const exportStudentFees = async (mode: "filtered" | "all") => {
    try {
      // If user requested all data, fetch entire dataset from backend
      let source: StudentFee[] = [];
      if (mode === "all") {
        // Fetch all student_fees without pagination
        const { data } = await supabase
          .from("student_fees")
          .select("*")
          .eq("institute_id", instId)
          .order("created_at", { ascending: false });

        const allFees = data || [];

        // Map to StudentFee with student and batch info (similar to fetchStudentFees)
        source = await Promise.all(
          (allFees as any[]).map(async (fee: any) => {
            // Fetch student with batch relation so we can prefer the student's enrolled batch name
            const { data: studentData } = await supabase
              .from("students")
              .select(`
                name,
                enrollment_no,
                batch_id,
                batches ( name )
              `)
              .eq("id", fee.student_id)
              .single();

            // Fallback to batch_fees -> batches if student's batch is not available
            let batchName = (studentData as any)?.batches?.name || "Unknown Batch";
            let batchTotal = 0;
            try {
              const { data: batchResult } = await supabase
                .from("batch_fees")
                .select(`
                  total_fees,
                  batches ( name )
                `)
                .eq("id", fee.batch_fee_id)
                .single();
              const batchesAny = (batchResult as any)?.batches;
              if (!batchName) batchName = batchesAny?.name || batchName;
              batchTotal = Number((batchResult as any)?.total_fees || 0);
            } catch (e) {
              // ignore
            }

            const originalFee = Number((fee as any).original_fee || batchTotal || 0);
            const discountAmount = Number(fee.discount_amount || 0);
            const discountedFee = fee.discounted_fees ? Number(fee.discounted_fees) : (originalFee - discountAmount);
            const finalFee = Math.max(0, discountedFee);

            return {
              id: fee.id,
              student_id: fee.student_id,
              batch_fee_id: fee.batch_fee_id,
              discounted_fees: fee.discounted_fees,
              paid_fees: Number(fee.paid_fees),
              discount_amount: discountAmount,
              discount_reason: fee.discount_reason,
               status: fee.status,
               last_payment_date: fee.last_payment_date,
               receipt_id: fee.receipt_id,
               student_name: studentData?.name || "Unknown Student",
              enrollment_no: studentData?.enrollment_no || "",
              batch_name: batchName,
              original_fee: originalFee,
              final_fee: finalFee,
            } as StudentFee;
          })
        );
      } else {
        source = filteredStudentFees;
      }

      // Build rows according to selectedColumns
      const rows = source.map((s: StudentFee) => {
        const map: Record<string, any> = {
          "Student Fee ID": s.id,
          "Enrollment No": s.enrollment_no,
          "Student Name": s.student_name,
          "Batch": s.batch_name,
          "Original Fee": s.original_fee,
          "Discount Amount": s.discount_amount,
          "Final Fee": s.final_fee,
          "Paid Fees": s.paid_fees,
          "Pending Amount": Math.max(0, s.final_fee - s.paid_fees),
           "Status": s.status,
           "Last Payment Date": s.last_payment_date ? new Date(s.last_payment_date).toLocaleDateString("en-GB") : "",
           "Receipt Number": s.receipt_id || "",
         };
        const filtered: Record<string, any> = {};
        selectedColumns.forEach(col => filtered[col] = map[col]);
        return filtered;
      });

      await downloadXlsx(`student_fees_${mode}_${new Date().toISOString().slice(0,10)}.xlsx`, rows);
    } catch (error: any) {
      console.error("Export failed:", error);
      toast({ title: "Export failed", description: error?.message || "Could not export report", variant: "destructive" });
    }
  };

  const isSearching = search.trim().length > 0;
  const filteredTotal = isSearching ? filteredStudentFees.length : total;
  const totalPages = Math.ceil(filteredTotal / pageSize);

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
             ← Back to Batch Fees
           </Button>
           <h1 className="text-3xl font-bold">Student Fees</h1>
         </div>
        <div className="flex items-center gap-2">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Students</p>
            <p className="text-lg font-bold text-primary tabular-nums leading-none mt-1">{studentsList.length}</p>
          </div>
          <div className="h-8 w-px bg-border hidden sm:block" />
          <div>
            <Button
              size="sm"
              onClick={openAddDialog}
            >
              <Plus className="w-3 h-3 mr-1" />
              Add Student Fee
            </Button>
          </div>
        </div>
       </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Fees"
          value={formatCurrency(stats.total)}
          icon={IndianRupee}
          change="↑"
          changeType="positive"
        />
        <StatCard
          title="Collected"
          value={formatCurrency(stats.collected)}
          icon={CheckCircle}
          change="↑"
          changeType="positive"
        />
        <StatCard
          title="Pending"
          value={formatCurrency(stats.pending)}
          icon={AlertCircle}
          change="↓"
          changeType="negative"
        />
        <StatCard
          title="Overdue"
          value={stats.overdue}
          icon={AlertCircle}
          change="↓"
          changeType="negative"
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
                onChange={useCallback((e) => {
                  const value = e.target.value;
                  setSearch(value);
                  setCurrentPage(1);
                  if (debounceRef.current) {
                    clearTimeout(debounceRef.current);
                  }
                  debounceRef.current = setTimeout(() => {
                    fetchStudentFees(1, value.trim());
                  }, 300);
                }, [fetchStudentFees])}
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
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => { setExportMode("filtered"); setExportDialogOpen(true); }}>
                <Download className="w-4 h-4 mr-2" />
                Download Filtered
              </Button>
              <Button size="sm" onClick={() => { setExportMode("all"); setExportDialogOpen(true); }}>
                <Download className="w-4 h-4 mr-2" />
                Download All
              </Button>
            </div>
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
            {isSearching 
              ? `Filtered: ${filteredStudentFees.length} matches (resets to page 1)` 
              : `Showing ${((currentPage - 1) * pageSize) + 1} to ${Math.min(currentPage * pageSize, total)} of ${total} students`
            }
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

      {/* Payment Dialog */}
      <Dialog open={addPaymentOpen} onOpenChange={setAddPaymentOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add Payment</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
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
             {/* Student Selection */}
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

             {/* Batch Fee Selection */}
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

             {/* Original Fee */}
             <div className="grid gap-2">
               <label className="text-sm font-medium">Original Fee (₹)</label>
               <Input
                 type="number"
                 placeholder="Enter original fee"
                 value={studentFeeForm.originalFee}
                 onChange={(e) => setStudentFeeForm(prev => ({ ...prev, originalFee: e.target.value }))}
               />
             </div>

             {/* Discount Amount */}
             <div className="grid gap-2">
               <label className="text-sm font-medium">Discount Amount (₹)</label>
               <Input
                 type="number"
                 placeholder="Enter discount amount"
                 value={studentFeeForm.discountAmount}
                 onChange={(e) => setStudentFeeForm(prev => ({ ...prev, discountAmount: e.target.value }))}
               />
             </div>

              {/* Discount Reason */}
              <div className="grid gap-2">
                <label className="text-sm font-medium">Discount Reason (Optional)</label>
                <Input
                  placeholder="Enter reason for discount"
                  value={studentFeeForm.discountReason}
                  onChange={(e) => setStudentFeeForm(prev => ({ ...prev, discountReason: e.target.value }))}
                />
              </div>

              {/* Receipt Number */}
              <div className="grid gap-2">
                <label className="text-sm font-medium">Receipt Number / Series</label>
                <Input
                  placeholder="e.g. AGR-2026-001"
                  value={studentFeeForm.receiptId}
                  onChange={(e) => setStudentFeeForm(prev => ({ ...prev, receiptId: e.target.value }))}
                />
              </div>

              {/* Status */}
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

      {/* Export Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Export Student Fees</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <p className="text-sm text-muted-foreground">Scope: <strong>{exportMode === "all" ? "All Records" : "Filtered (current results)"}</strong></p>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Select columns to include</label>
              <div className="grid grid-cols-2 gap-2 max-h-52 overflow-auto p-2 border rounded">
                {allColumns.map(c => (
                  <label key={c.key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedColumns.includes(c.key)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedColumns(prev => Array.from(new Set([...prev, c.key])));
                        else setSelectedColumns(prev => prev.filter(x => x !== c.key));
                      }}
                    />
                    <span>{c.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>Cancel</Button>
            <Button onClick={async () => { setExportDialogOpen(false); await exportStudentFees(exportMode); }}>Export</Button>
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
             {/* Student (read-only) */}
             <div className="grid gap-2">
               <label className="text-sm font-medium">Student</label>
               <Input
                 value={selectedStudentFee ? `${selectedStudentFee.student_name} (${selectedStudentFee.enrollment_no})` : ''}
                 disabled
               />
             </div>

             {/* Batch Fee (read-only display) */}
      <div className="grid gap-2">
        <label className="text-sm font-medium">Batch Fee</label>
        <Input
          value={selectedStudentFee ? `${selectedStudentFee.batch_name} - ${formatCurrency(selectedStudentFee.original_fee)}` : ''}
          disabled
        />
      </div>

             {/* Original Fee */}
             <div className="grid gap-2">
               <label className="text-sm font-medium">Original Fee (₹)</label>
               <Input
                 type="number"
                 value={studentFeeForm.originalFee}
                 onChange={(e) => setStudentFeeForm(prev => ({ ...prev, originalFee: e.target.value }))}
               />
             </div>

             {/* Discount Amount */}
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

              {/* Discount Reason */}
              <div className="grid gap-2">
                <label className="text-sm font-medium">Discount Reason (Optional)</label>
                <Input
                  value={studentFeeForm.discountReason}
                  onChange={(e) => setStudentFeeForm(prev => ({ ...prev, discountReason: e.target.value }))}
                />
              </div>

              {/* Receipt Number */}
              <div className="grid gap-2">
                <label className="text-sm font-medium">Receipt Number / Series</label>
                <Input
                  value={studentFeeForm.receiptId}
                  onChange={(e) => setStudentFeeForm(prev => ({ ...prev, receiptId: e.target.value }))}
                />
              </div>

              {/* Status */}
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
