import { useState, useMemo, useEffect } from "react";
import { Search, Download, Send, IndianRupee, AlertCircle, CheckCircle, Plus, Loader2, FileText, Users, Percent } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { supabase, isUuid } from "@/lib/supabase";
import { useAuth, AdminUser } from "@/contexts/AuthContext";

interface BatchFee {
  id: string;
  batch_id: string;
  title: string;
  total_fees: number;
  description?: string;
  due_date?: string;
  batch_name: string;
  student_count: number;
  created_at: string;
}

interface StudentFee {
  id: string;
  student_id: string;
  batch_fee_id: string;
  discounted_fees?: number;
  paid_fees: number;
  discount_amount: number;
  discount_reason?: string;
  status: "paid" | "pending" | "partial" | "overdue";
  last_payment_date?: string;
  student_name: string;
  enrollment_no: string;
  batch_name: string;
  original_fee: number;
  final_fee: number;
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
  const [viewMode, setViewMode] = useState<"batch" | "student">("batch");

  const [batchFees, setBatchFees] = useState<BatchFee[]>([]);
  const [studentFees, setStudentFees] = useState<StudentFee[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [addBatchFeeOpen, setAddBatchFeeOpen] = useState(false);
  const [addStudentDiscountOpen, setAddStudentDiscountOpen] = useState(false);
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [selectedStudentFee, setSelectedStudentFee] = useState<StudentFee | null>(null);
  const [creatingBatchFee, setCreatingBatchFee] = useState(false);

  const [batchFeeForm, setBatchFeeForm] = useState({ batchId: "", title: "", totalFees: "", description: "", dueDate: "" });
  const [discountForm, setDiscountForm] = useState({ studentFeeId: "", discountAmount: "", discountReason: "" });
  const [paymentForm, setPaymentForm] = useState({ studentFeeId: "", paymentAmount: "" });

  useEffect(() => {
    if (isUuid(instId)) {
      fetchBatches();
      fetchBatchFees();
      fetchStudentFees();
    }
  }, [instId]);

  const fetchBatches = async () => {
    try {
      const { data, error } = await supabase
        .from("batches")
        .select("id, name")
        .eq("institute_id", instId)
        .eq("status", "active");

      if (error) throw error;
      setBatches(data || []);
    } catch (error: any) {
      console.error("Error fetching batches:", error);
    }
  };

  const fetchBatchFees = async () => {
    try {
      // Try new batch_fees table first (without joins to avoid FK issues)
      const { data: batchFeesData, error } = await supabase
        .from("batch_fees")
        .select("*")
        .eq("institute_id", instId)
        .eq("status", "active")
        .order("created_at", { ascending: false });

      console.log("Batch fees query result:", { data: batchFeesData, error });

      if (error) {
        // Fallback: use empty array if batch_fees doesn't exist
        console.log("Batch fees table not found, using fallback data. Error:", error);
        setBatchFees([]);
        return;
      }

      if (!batchFeesData || batchFeesData.length === 0) {
        console.log("No batch fees found");
        setBatchFees([]);
        return;
      }

      // Get batch names and student counts separately
      const batchFeesWithDetails = await Promise.all(
        batchFeesData.map(async (fee: any) => {
          // Get batch name
          const { data: batchData } = await supabase
            .from("batches")
            .select("name")
            .eq("id", fee.batch_id)
            .single();

          // Get student count (try student_fees first, fallback to 0)
          let studentCount = 0;
          try {
            const { count } = await supabase
              .from("student_fees")
              .select("*", { count: "exact", head: true })
              .eq("batch_fee_id", fee.id);
            studentCount = count || 0;
          } catch (countError) {
            console.log("Could not count students for batch fee:", fee.id);
            studentCount = 0;
          }

          return {
            id: fee.id,
            batch_id: fee.batch_id,
            title: fee.title,
            total_fees: Number(fee.total_fees),
            description: fee.description,
            due_date: fee.due_date,
            batch_name: batchData?.name || "Unknown Batch",
            student_count: studentCount,
            created_at: fee.created_at,
          };
        })
      );

      console.log("Final batch fees with details:", batchFeesWithDetails);
      setBatchFees(batchFeesWithDetails);
    } catch (error: any) {
      console.error("Error fetching batch fees:", error);
      setBatchFees([]);
    }
  };
  const fetchStudentFees = async () => {
    setLoading(true);
    try {
      // Try new student_fees table first (without joins to avoid FK issues)
      const { data, error } = await supabase
        .from("student_fees")
        .select("*")
        .eq("institute_id", instId)
        .order("created_at", { ascending: false });

      console.log("Student fees query result:", { data: data?.length, error });

      if (error) {
        // Fallback to invoices table if student_fees doesn't exist
        console.log("Student fees table not found, falling back to invoices. Error:", error);
        const { data: fallbackData, error: fallbackError } = await supabase
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

        console.log("Invoices fallback query result:", { data: fallbackData?.length, error: fallbackError });

        if (fallbackError) throw fallbackError;

        const formatted: StudentFee[] = (fallbackData || []).map((inv: any) => ({
          id: inv.id,
          student_id: inv.student_id,
          batch_fee_id: "", // No batch fee reference in old system
          discounted_fees: undefined,
          paid_fees: Number(inv.amount),
          discount_amount: 0,
          discount_reason: undefined,
          status: inv.status,
          last_payment_date: inv.paid_date,
          student_name: inv.students?.name || "Unknown Student",
          enrollment_no: inv.students?.enrollment_no || "",
          batch_name: "Legacy Data",
          original_fee: Number(inv.amount),
          final_fee: Number(inv.amount),
        }));

        setStudentFees(formatted);
        setLoading(false);
        return;
      }

      // Get additional details separately to avoid join issues
      const formatted: StudentFee[] = await Promise.all(
        (data || []).map(async (fee: any) => {
          // Get student details
          const { data: studentData } = await supabase
            .from("students")
            .select("name, enrollment_no")
            .eq("id", fee.student_id)
            .single();

          // Get batch fee details
          let batchFeeData = null;
          let batchName = "Unknown Batch";
          try {
            const { data: batchResult } = await supabase
              .from("batch_fees")
              .select(`
                title,
                total_fees,
                batches (
                  name
                )
              `)
              .eq("id", fee.batch_fee_id)
              .single();

            if (batchResult) {
              batchFeeData = batchResult;
              batchName = batchResult.batches?.name || "Unknown Batch";
            }
          } catch (batchError) {
            console.log("Could not fetch batch details for fee:", fee.id);
          }

          const originalFee = Number(batchFeeData?.total_fees || 0);
          const discountAmount = Number(fee.discount_amount || 0);
          const discountedFee = fee.discounted_fees ? Number(fee.discounted_fees) : (originalFee - discountAmount);
          const finalFee = Math.max(0, discountedFee); // Ensure final fee is not negative

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
            student_name: studentData?.name || "Unknown Student",
            enrollment_no: studentData?.enrollment_no || "",
            batch_name: batchName,
            original_fee: originalFee,
            final_fee: finalFee,
          };
        })
      );

      setStudentFees(formatted);
    } catch (error: any) {
      console.error("Error fetching student fees:", error);
      toast({ title: "Error", description: "Failed to load fee data", variant: "destructive" });
      setStudentFees([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredData = useMemo(() => {
    const data = viewMode === "batch" ? batchFees : studentFees;
    return data.filter((item) => {
      if (viewMode === "batch") {
        const fee = item as BatchFee;
        const matchSearch = fee.title.toLowerCase().includes(search.toLowerCase()) ||
          fee.batch_name.toLowerCase().includes(search.toLowerCase()) ||
          fee.id.toLowerCase().includes(search.toLowerCase());
        return matchSearch;
      } else {
        const fee = item as StudentFee;
        const matchSearch = (fee.student_name || "").toLowerCase().includes(search.toLowerCase()) ||
          fee.id.toLowerCase().includes(search.toLowerCase()) ||
          (fee.enrollment_no || "").toLowerCase().includes(search.toLowerCase());
        const matchStatus = statusFilter === "all" || fee.status === statusFilter;
        return matchSearch && matchStatus;
      }
    });
  }, [search, statusFilter, batchFees, studentFees, viewMode]);

  const stats = useMemo(() => {
    const total = studentFees.reduce((s, f) => s + f.final_fee, 0);
    const collected = studentFees.reduce((s, f) => s + f.paid_fees, 0);
    const pending = studentFees.reduce((s, f) => s + (f.final_fee - f.paid_fees), 0);
    const overdue = studentFees.filter(f => f.status === "overdue").length;
    return { total, collected, pending, overdue };
  }, [studentFees]);

  const handleCreateBatchFee = async () => {
    if (!batchFeeForm.batchId || !batchFeeForm.title || !batchFeeForm.totalFees) {
      toast({ title: "Error", description: "Please fill all required fields.", variant: "destructive" });
      return;
    }

    setCreatingBatchFee(true);
    try {
      console.log("Creating batch fee with data:", {
        institute_id: instId,
        batch_id: batchFeeForm.batchId,
        title: batchFeeForm.title,
        total_fees: parseFloat(batchFeeForm.totalFees),
        description: batchFeeForm.description || null,
        due_date: batchFeeForm.dueDate || null,
      });

      // First, create the batch fee
      const { data: batchFeeData, error: batchFeeError } = await supabase
        .from("batch_fees")
        .insert([{
          institute_id: instId,
          batch_id: batchFeeForm.batchId,
          title: batchFeeForm.title,
          total_fees: parseFloat(batchFeeForm.totalFees),
          description: batchFeeForm.description || null,
          due_date: batchFeeForm.dueDate || null,
        }])
        .select()
        .single();

      console.log("Batch fee creation result:", { data: batchFeeData, error: batchFeeError });

      if (batchFeeError) {
        // Fallback: Create individual student fee records using invoices table
        console.log("Batch fees table not found, creating individual records. Error:", batchFeeError);
        await createIndividualFeeRecords();
        return;
      }

      // Then, get all students in this batch and create student fee records
      const { data: students, error: studentsError } = await supabase
        .from("students")
        .select("id")
        .eq("institute_id", instId)
        .eq("batch_id", batchFeeForm.batchId)
        .eq("status", "active");

      if (studentsError) throw studentsError;

      if (students && students.length > 0) {
        const studentFeeRecords = students.map(student => ({
          institute_id: instId,
          batch_fee_id: batchFeeData.id,
          student_id: student.id,
          paid_fees: 0,
          discount_amount: 0,
        }));

        const { error: studentFeesError } = await supabase
          .from("student_fees")
          .insert(studentFeeRecords);

        if (studentFeesError) throw studentFeesError;
      }

      // Refresh data
      await fetchBatchFees();
      await fetchStudentFees();

      setAddBatchFeeOpen(false);
      setBatchFeeForm({ batchId: "", title: "", totalFees: "", description: "", dueDate: "" });
      toast({ title: "Batch Fee Created", description: `Fee structure created for ${students?.length || 0} students.` });
    } catch (error: any) {
      console.error("Error creating batch fee:", error);
      toast({ title: "Error", description: "Failed to create batch fee. Please try again.", variant: "destructive" });
    } finally {
      setCreatingBatchFee(false);
    }
  };

  const createIndividualFeeRecords = async () => {
    try {
      // Get all students in this batch
      const { data: students, error: studentsError } = await supabase
        .from("students")
        .select("id, name, enrollment_no")
        .eq("institute_id", instId)
        .eq("batch_id", batchFeeForm.batchId)
        .eq("status", "active");

      if (studentsError) throw studentsError;

      if (students && students.length > 0) {
        // Create individual invoice records for each student
        const invoiceRecords = students.map(student => ({
          institute_id: instId,
          student_id: student.id,
          amount: parseFloat(batchFeeForm.totalFees),
          status: "pending",
          due_date: batchFeeForm.dueDate || new Date().toISOString().split('T')[0],
        }));

        const { error: invoiceError } = await supabase
          .from("invoices")
          .insert(invoiceRecords);

        if (invoiceError) throw invoiceError;
      }

      // Refresh data
      await fetchBatchFees();
      await fetchStudentFees();

      setAddBatchFeeOpen(false);
      setBatchFeeForm({ batchId: "", title: "", totalFees: "", description: "", dueDate: "" });
      toast({ title: "Fees Created", description: `Individual fee records created for ${students?.length || 0} students.` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleApplyDiscount = async () => {
    if (!discountForm.studentFeeId || !discountForm.discountAmount) {
      toast({ title: "Error", description: "Please fill all required fields.", variant: "destructive" });
      return;
    }

    const studentFee = studentFees.find(f => f.id === discountForm.studentFeeId);
    if (!studentFee) return;

    const discountAmount = parseFloat(discountForm.discountAmount);
    const discountedFees = Math.max(0, studentFee.original_fee - discountAmount);

    try {
      // Try student_fees table first
      const { error } = await supabase
        .from("student_fees")
        .update({
          discounted_fees: discountedFees,
          discount_amount: discountAmount,
          discount_reason: discountForm.discountReason || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', discountForm.studentFeeId);

      if (error) {
        // Fallback: Update invoices table
        const { error: fallbackError } = await supabase
          .from("invoices")
          .update({
            amount: discountedFees,
            updated_at: new Date().toISOString()
          })
          .eq('id', discountForm.studentFeeId);

        if (fallbackError) throw fallbackError;
      }

      await fetchStudentFees();
      setAddStudentDiscountOpen(false);
      setDiscountForm({ studentFeeId: "", discountAmount: "", discountReason: "" });
      toast({ title: "Discount Applied", description: `Discount of ₹${discountAmount} applied successfully.` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleAddPayment = async () => {
    if (!paymentForm.studentFeeId || !paymentForm.paymentAmount) {
      toast({ title: "Error", description: "Please fill all required fields.", variant: "destructive" });
      return;
    }

    const studentFee = studentFees.find(f => f.id === paymentForm.studentFeeId);
    if (!studentFee) return;

    const paymentAmount = parseFloat(paymentForm.paymentAmount);
    const newPaidFees = studentFee.paid_fees + paymentAmount;
    const remainingFees = studentFee.final_fee - newPaidFees;

    let newStatus: StudentFee['status'] = 'partial';
    if (newPaidFees >= studentFee.final_fee) {
      newStatus = 'paid';
    } else if (newPaidFees > 0) {
      newStatus = 'partial';
    } else {
      newStatus = 'pending';
    }

    try {
      // Try student_fees table first
      const { error } = await supabase
        .from("student_fees")
        .update({
          paid_fees: newPaidFees,
          status: newStatus,
          last_payment_date: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', paymentForm.studentFeeId);

      if (error) {
        // Fallback: Update invoices table
        const { error: fallbackError } = await supabase
          .from("invoices")
          .update({
            amount: remainingFees, // Update remaining amount
            status: newStatus,
            paid_date: new Date().toISOString()
          })
          .eq('id', paymentForm.studentFeeId);

        if (fallbackError) throw fallbackError;
      }

      await fetchStudentFees();
      setAddPaymentOpen(false);
      setPaymentForm({ studentFeeId: "", paymentAmount: "" });
      setSelectedStudentFee(null);
      toast({ title: "Payment Added", description: `Payment of ₹${paymentAmount} recorded successfully.` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const generateFeeReceiptPDF = (studentFee: StudentFee) => {
    const receiptContent = `
<!DOCTYPE html>
<html>
<head><title>Fee Receipt - ${studentFee.enrollment_no}</title>
<style>
body { font-family: Arial, sans-serif; padding: 40px; color: #333; max-width: 600px; margin: 0 auto; }
.header { text-align: center; border-bottom: 2px solid #1a73e8; padding-bottom: 20px; margin-bottom: 30px; }
.header h1 { color: #1a73e8; margin: 0; font-size: 28px; }
.header p { color: #666; margin: 5px 0; }
.details { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
.details table { width: 100%; border-collapse: collapse; }
.details td { padding: 8px 0; border-bottom: 1px solid #e0e0e0; }
.details td:first-child { font-weight: bold; width: 40%; }
.amount { background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center; }
.amount .total { font-size: 24px; font-weight: bold; color: #2e7d32; }
.footer { text-align: center; margin-top: 40px; color: #666; font-size: 12px; }
.status { display: inline-block; padding: 5px 15px; border-radius: 20px; font-size: 12px; font-weight: bold; }
.status.paid { background: #e8f5e8; color: #2e7d32; }
.status.pending { background: #fff3e0; color: #f57c00; }
.status.partial { background: #e3f2fd; color: #1976d2; }
</style></head>
<body>
<div class="header">
<h1>Fee Receipt</h1>
<p>Institute Management System</p>
<p>Receipt ID: ${studentFee.id.substring(0, 8).toUpperCase()}</p>
</div>

<div class="details">
<table>
<tr><td>Student Name:</td><td>${studentFee.student_name}</td></tr>
<tr><td>Enrollment No:</td><td>${studentFee.enrollment_no}</td></tr>
<tr><td>Batch:</td><td>${studentFee.batch_name}</td></tr>
<tr><td>Fee Type:</td><td>Batch Fee</td></tr>
<tr><td>Payment Date:</td><td>${new Date().toLocaleDateString('en-IN')}</td></tr>
<tr><td>Status:</td><td><span class="status ${studentFee.status}">${studentFee.status.toUpperCase()}</span></td></tr>
</table>
</div>

<div class="amount">
<div class="total">₹${formatCurrency(studentFee.paid_fees)}</div>
<p>Amount Paid</p>
</div>

<div class="details">
<table>
<tr><td>Original Fee:</td><td>₹${formatCurrency(studentFee.original_fee)}</td></tr>
${studentFee.discount_amount > 0 ? `<tr><td>Discount Applied:</td><td>-₹${formatCurrency(studentFee.discount_amount)}</td></tr>` : ''}
<tr><td>Final Fee:</td><td>₹${formatCurrency(studentFee.final_fee)}</td></tr>
<tr><td>Paid Amount:</td><td>₹${formatCurrency(studentFee.paid_fees)}</td></tr>
<tr><td>Pending Amount:</td><td>₹${formatCurrency(Math.max(0, studentFee.final_fee - studentFee.paid_fees))}</td></tr>
</table>
</div>

<div class="footer">
<p>This is a computer generated receipt.</p>
<p>Generated on ${new Date().toLocaleDateString('en-IN')} at ${new Date().toLocaleTimeString('en-IN')}</p>
</div>
</body></html>`;

    const blob = new Blob([receiptContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Fee_Receipt_${studentFee.enrollment_no}_${new Date().toISOString().split('T')[0]}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Receipt Generated", description: "Fee receipt downloaded successfully." });
  };

  const batchColumns = [
    {
      key: "title",
      title: "Fee Title",
      render: (fee: BatchFee) => (
        <div>
          <p className="text-sm font-semibold text-foreground">{fee.title}</p>
          <p className="text-xs text-muted-foreground">{fee.batch_name}</p>
        </div>
      ),
    },
    {
      key: "total_fees",
      title: "Total Fee",
      render: (fee: BatchFee) => <span className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(fee.total_fees)}</span>,
    },
    {
      key: "student_count",
      title: "Students",
      render: (fee: BatchFee) => <span className="text-sm tabular-nums">{fee.student_count}</span>,
    },
    {
      key: "due_date",
      title: "Due Date",
      render: (fee: BatchFee) => <span className="text-xs text-muted-foreground tabular-nums">{fee.due_date || "Not set"}</span>,
    },
    {
      key: "created_at",
      title: "Created",
      render: (fee: BatchFee) => <span className="text-xs text-muted-foreground">{new Date(fee.created_at).toLocaleDateString()}</span>,
    },
    {
      key: "actions",
      title: "",
      render: (fee: BatchFee) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setViewMode("student");
            // Could add filtering logic here to show only students for this batch fee
          }}
          className="h-7 text-xs"
        >
          View Students
        </Button>
      ),
    },
  ];

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
      key: "original_fee",
      title: "Original Fee",
      render: (fee: StudentFee) => <span className="text-sm tabular-nums">{formatCurrency(fee.original_fee)}</span>,
    },
    {
      key: "discount",
      title: "Discount",
      render: (fee: StudentFee) => (
        <span className={`text-sm tabular-nums ${fee.discount_amount > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
          {fee.discount_amount > 0 ? `-₹${formatCurrency(fee.discount_amount)}` : 'None'}
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
        const v = fee.status === "paid" ? "success" : fee.status === "pending" ? "warning" : fee.status === "partial" ? "info" : fee.status === "overdue" ? "destructive" : "default";
        return <StatusBadge variant={v}>{fee.status}</StatusBadge>;
      },
    },
    {
      key: "actions",
      title: "",
      render: (fee: StudentFee) => (
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSelectedStudentFee(fee);
              setPaymentForm({ studentFeeId: fee.id, paymentAmount: "" });
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
            <FileText className="w-3 h-3 mr-1" />
            Receipt
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Fee Management</h1>
      </div>

      <div className="text-center py-8">
        <p className="text-muted-foreground">Fee management system is currently being updated.</p>
        <p className="text-sm text-muted-foreground mt-2">Please check back later.</p>
      </div>
    </div>
  );
}
