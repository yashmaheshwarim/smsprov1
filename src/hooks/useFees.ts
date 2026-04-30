import { useState, useEffect, useMemo } from "react";
import { supabase, isUuid } from "@/lib/supabase";
import { type StatusVariant } from "@/components/ui/status-badge";
import { toast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ==========================================
// SHARED TYPES
// ==========================================

export interface Batch {
  id: string;
  name: string;
}

export interface BatchFee {
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

export interface StudentFee {
  id: string;
  student_id: string;
  batch_fee_id: string;
  batch_id: string | null;
  discounted_fees?: number;
  paid_fees: number;
  discount_amount: number;
  discount_reason?: string;
  receipt_id?: string;
  status: "paid" | "pending" | "partial" | "overdue";
  last_payment_date?: string;
  student_name: string;
  enrollment_no: string;
  admission_date: string;
  batch_name: string;
  original_fee: number;
  final_fee: number;
  created_at?: string;
}

// ==========================================
// SHARED HELPERS
// ==========================================

export const formatCurrency = (n: number) =>
  `Rs. ${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export const feeStatusColors: Record<StudentFee["status"], StatusVariant> = {
  paid: "success",
  pending: "warning",
  partial: "info",
  overdue: "destructive",
};

// ==========================================
// DATA FETCHING HOOKS
// ==========================================

export function useBatches(instId: string | undefined) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!instId || !isUuid(instId)) {
      setBatches([]);
      setLoading(false);
      return;
    }

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
        setBatches([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBatches();
  }, [instId]);

  return { batches, loading };
}

export function useBatchFees(instId: string | undefined) {
  const [batchFees, setBatchFees] = useState<BatchFee[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBatchFees = async () => {
    if (!instId || !isUuid(instId)) {
      setBatchFees([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("batch_fees")
        .select("*")
        .eq("institute_id", instId)
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const batchFeesWithDetails = await Promise.all(
        (data || []).map(async (fee: any) => {
          const { data: batchData } = await supabase
            .from("batches")
            .select("name")
            .eq("id", fee.batch_id)
            .single();

          const { count: batchStudentCount } = await supabase
            .from("students")
            .select("*", { count: "exact", head: true })
            .eq("institute_id", instId)
            .eq("batch_id", fee.batch_id);

          return {
            id: fee.id,
            batch_id: fee.batch_id,
            title: fee.title,
            total_fees: Number(fee.total_fees),
            description: fee.description,
            due_date: fee.due_date,
            batch_name: batchData?.name || "Unknown Batch",
            student_count: batchStudentCount || 0,
            created_at: fee.created_at,
          };
        })
      );

      setBatchFees(batchFeesWithDetails);
    } catch (error: any) {
      console.error("Error fetching batch fees:", error);
      setBatchFees([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBatchFees();
  }, [instId]);

  return { batchFees, loading, fetchBatchFees };
}

export function useStudentFees(instId: string | undefined, page: number, pageSize: number) {
  const [studentFees, setStudentFees] = useState<StudentFee[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchStudentFees = async (pageNum: number = page) => {
    if (!instId || !isUuid(instId)) {
      setStudentFees([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Step 1: Get all batch_fees for this institute
      const { data: batchFeesData, error: batchFeesError } = await supabase
        .from("batch_fees")
        .select("id, batch_id, total_fees")
        .eq("institute_id", instId)
        .eq("status", "active");

      if (batchFeesError) throw batchFeesError;

      if (!batchFeesData || batchFeesData.length === 0) {
        setStudentFees([]);
        setTotal(0);
        setLoading(false);
        return;
      }

      // Map: batch_id → array of fee records for that batch
      const batchFeesMap: Record<string, Array<{ id: string; total_fees: number }>> = {};
      batchFeesData.forEach((bf: any) => {
        if (!batchFeesMap[bf.batch_id]) batchFeesMap[bf.batch_id] = [];
        batchFeesMap[bf.batch_id].push({
          id: bf.id,
          total_fees: Number(bf.total_fees),
        });
      });

      const batchIds = Object.keys(batchFeesMap);

      // Step 2: Get total count of students in these batches
      const { count, error: countError } = await supabase
        .from("students")
        .select("*", { count: "exact", head: true })
        .eq("institute_id", instId)
        .in("batch_id", batchIds);

      if (countError) throw countError;
      setTotal(count || 0);

      // Step 3: Fetch students with pagination
      const from = (pageNum - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data: studentsData, error: studentsError } = await supabase
        .from("students")
        .select(`
          id,
          name,
          enrollment_no,
          created_at,
          batch_id,
          batches (
            name
          )
        `)
        .eq("institute_id", instId)
        .in("batch_id", batchIds)
        .order("name", { ascending: true })
        .range(from, to);

      if (studentsError) throw studentsError;

      if (!studentsData || studentsData.length === 0) {
        setStudentFees([]);
        setLoading(false);
        return;
      }

      // Step 4: Look up existing student_fees for these students
      const studentIds = studentsData.map((s: any) => s.id);
      const { data: studentFeesData } = await supabase
        .from("student_fees")
        .select("*")
        .in("student_id", studentIds);

      const studentFeesMap: Record<string, any[]> = {};
      (studentFeesData || []).forEach((sf: any) => {
        if (!studentFeesMap[sf.student_id]) studentFeesMap[sf.student_id] = [];
        studentFeesMap[sf.student_id].push(sf);
      });

      // Step 5: Build formatted rows
      // For students with existing student_fees: one row per fee record
      // For students with none: one synthetic row using first batch fee of their batch
      const formatted: StudentFee[] = [];

      studentsData.forEach((student: any) => {
        const fees = studentFeesMap[student.id] || [];
        const batchFeeList = batchFeesMap[student.batch_id] || [];

        if (fees.length > 0) {
          fees.forEach((sf: any) => {
            formatted.push({
              id: sf.id,
              student_id: student.id,
              batch_fee_id: sf.batch_fee_id,
              batch_id: student.batch_id,
              discounted_fees: sf.discounted_fees,
              paid_fees: Number(sf.paid_fees),
              discount_amount: Number(sf.discount_amount || 0),
              discount_reason: sf.discount_reason,
              receipt_id: sf.receipt_id || undefined,
              status: sf.status,
              last_payment_date: sf.last_payment_date,
              student_name: student.name,
              enrollment_no: student.enrollment_no,
              admission_date: student.created_at,
              batch_name: student.batches?.name || "Unknown Batch",
              original_fee: Number(sf.original_fee || 0),
              final_fee: Number(sf.final_fee || 0),
              created_at: sf.created_at,
            });
          });
        } else if (batchFeeList.length > 0) {
          // Create a synthetic row using the first batch fee for this batch
          const firstFee = batchFeeList[0];
          formatted.push({
            id: `synthetic-${student.id}`,
            student_id: student.id,
            batch_fee_id: firstFee.id,
            batch_id: student.batch_id,
            paid_fees: 0,
            discount_amount: 0,
            status: "pending" as const,
            student_name: student.name,
            enrollment_no: student.enrollment_no,
            admission_date: student.created_at,
            batch_name: student.batches?.name || "Unknown Batch",
            original_fee: firstFee.total_fees,
            final_fee: firstFee.total_fees,
            created_at: student.created_at,
          });
        }
        // If batch has no fees at all, skip (shouldn't happen since we filtered by batchIds that have fees)
      });

      setStudentFees(formatted);
    } catch (error: any) {
      console.error("Error fetching student fees:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setStudentFees([]);
    } finally {
      setLoading(false);
    }
   };

  useEffect(() => {
    fetchStudentFees();
  }, [instId, page]);

  return { studentFees, total, loading, fetchStudentFees };
}

export function useFeeStats(studentFees: StudentFee[]) {
  return useMemo(() => {
    const total = studentFees.reduce((s, f) => s + f.final_fee, 0);
    const collected = studentFees.reduce((s, f) => s + f.paid_fees, 0);
    const pending = studentFees.reduce((s, f) => s + (f.final_fee - f.paid_fees), 0);
    const overdue = studentFees.filter(f => f.status === "overdue").length;
    return { total, collected, pending, overdue };
  }, [studentFees]);
}

// ==========================================
// BATCH FEE OPERATIONS
// ==========================================

export function useBatchFeeOperations(
  instId: string | undefined,
  fetchBatchFees: () => Promise<void>
) {
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const createBatchFee = async (formData: {
    batchId: string;
    title: string;
    totalFees: string;
    description: string;
    dueDate: string;
  }) => {
    if (!instId || !isUuid(instId)) return;
    if (!formData.batchId || !formData.title || !formData.totalFees) {
      toast({ title: "Error", description: "Please fill all required fields.", variant: "destructive" });
      return;
    }

    setCreating(true);
    try {
      const { data: batchFeeData, error: batchFeeError } = await supabase
        .from("batch_fees")
        .insert([{
          institute_id: instId,
          batch_id: formData.batchId,
          title: formData.title,
          total_fees: parseFloat(formData.totalFees),
          description: formData.description || null,
          due_date: formData.dueDate || null,
        }])
        .select()
        .single();

      if (batchFeeError) throw batchFeeError;

      const { data: batchStudents, error: studentsError } = await supabase
        .from("students")
        .select("id, name, enrollment_no")
        .eq("institute_id", instId)
        .eq("batch_id", formData.batchId);

      if (studentsError) throw studentsError;

      if (batchStudents && batchStudents.length > 0) {
        const totalFees = parseFloat(formData.totalFees);
        const studentFeeRecords = batchStudents.map(student => ({
          institute_id: instId,
          batch_fee_id: batchFeeData.id,
          student_id: student.id,
          original_fee: totalFees,
          final_fee: totalFees,
          paid_fees: 0,
          discount_amount: 0,
          status: "pending" as const,
        }));

        const { error: studentFeesError } = await supabase
          .from("student_fees")
          .insert(studentFeeRecords);

        if (studentFeesError) throw studentFeesError;
      }

      await fetchBatchFees();
      toast({ title: "Batch Fee Created", description: `Fee structure created for ${batchStudents?.length || 0} students in the batch.` });
    } catch (error: any) {
      console.error("Error creating batch fee:", error);
      toast({ title: "Error", description: error.message || "Failed to create batch fee.", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const updateBatchFee = async (
    formData: { id: string; title: string; totalFees: string; description: string; dueDate: string },
    currentPage: number
  ) => {
    if (!instId || !isUuid(instId)) return;
    if (!formData.id || !formData.title || !formData.totalFees) {
      toast({ title: "Error", description: "Please fill all required fields.", variant: "destructive" });
      return;
    }

    try {
      const { error } = await supabase
        .from("batch_fees")
        .update({
          title: formData.title,
          total_fees: parseFloat(formData.totalFees),
          description: formData.description || null,
          due_date: formData.dueDate || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", formData.id);

      if (error) throw error;

      const { error: updateError } = await supabase
        .from("student_fees")
        .update({
          original_fee: parseFloat(formData.totalFees),
          final_fee: parseFloat(formData.totalFees),
          updated_at: new Date().toISOString(),
        })
        .eq("batch_fee_id", formData.id);

      if (updateError) throw updateError;

      await fetchBatchFees();
      toast({ title: "Batch Fee Updated", description: "Batch fee and related student fees updated." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const deleteBatchFee = async (batchFeeId: string) => {
    if (!instId || !isUuid(instId)) return;
    if (!batchFeeId) return;

    setDeleting(true);
    try {
      const { error: deleteStudentFeesError } = await supabase
        .from("student_fees")
        .delete()
        .eq("batch_fee_id", batchFeeId);

      if (deleteStudentFeesError) throw deleteStudentFeesError;

      const { error } = await supabase
        .from("batch_fees")
        .delete()
        .eq("id", batchFeeId);

      if (error) throw error;

      await fetchBatchFees();
      toast({ title: "Batch Fee Deleted", description: "Batch fee and all associated student fees deleted." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  return { creating, deleting, createBatchFee, updateBatchFee, deleteBatchFee };
}

// ==========================================
// STUDENT FEE OPERATIONS
// ==========================================

export function useStudentFeeOperations(
  instId: string | undefined,
  fetchStudentFees: (page: number) => Promise<void>
) {
  const [processing, setProcessing] = useState(false);

  const addPayment = async (
    studentFeeId: string,
    paymentAmount: string,
    paymentMethod: string,
    paymentDate: string,
    currentPage: number,
    studentFees: StudentFee[]
  ) => {
    if (!instId || !isUuid(instId)) return;
    if (!studentFeeId || !paymentAmount) {
      toast({ title: "Error", description: "Please fill all required fields.", variant: "destructive" });
      return;
    }

    const paymentAmountNum = parseFloat(paymentAmount);
    const studentFee = studentFees.find(f => f.id === studentFeeId);
    if (!studentFee) return;

    const newPaidFees = studentFee.paid_fees + paymentAmountNum;
    let newStatus: StudentFee["status"] = "partial";
    if (newPaidFees >= studentFee.final_fee) newStatus = "paid";
    else if (newPaidFees === 0) newStatus = "pending";

    setProcessing(true);
    try {
      const { error: paymentError } = await supabase
        .from("payments")
        .insert([{
          student_fee_id: studentFeeId,
          amount: paymentAmountNum,
          payment_method: paymentMethod,
          payment_date: paymentDate || new Date().toISOString(),
        }]);

      if (paymentError) console.log("Payments table may not exist, continuing with fee update only");

      const updatePayload: any = {
        paid_fees: newPaidFees,
        status: newStatus,
        last_payment_date: paymentDate || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (!studentFee.receipt_id) {
        const nextReceipt = await generateNextReceiptId();
        updatePayload.receipt_id = nextReceipt;
      }

      const { error } = await supabase
        .from("student_fees")
        .update(updatePayload)
        .eq("id", studentFeeId);

      if (error) throw error;

      await fetchStudentFees(currentPage);
      toast({ title: "Payment Added", description: `Payment of ${formatCurrency(paymentAmountNum)} recorded successfully.` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const applyDiscount = async (
    studentFeeId: string,
    discountAmount: string,
    discountReason: string,
    currentPage: number,
    studentFees: StudentFee[]
  ) => {
    if (!instId || !isUuid(instId)) return;
    if (!studentFeeId || !discountAmount) {
      toast({ title: "Error", description: "Please fill all required fields.", variant: "destructive" });
      return;
    }

    const discountAmountNum = parseFloat(discountAmount);
    const studentFee = studentFees.find(f => f.id === studentFeeId);
    if (!studentFee) return;

    const finalFee = Math.max(0, studentFee.original_fee - discountAmountNum);

    setProcessing(true);
    try {
      const { error } = await supabase
        .from("student_fees")
        .update({
          final_fee: finalFee,
          discount_amount: discountAmountNum,
          discount_reason: discountReason || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", studentFeeId);

      if (error) throw error;

      await fetchStudentFees(currentPage);
      toast({ title: "Discount Applied", description: `Discount of ${formatCurrency(discountAmountNum)} applied. Final fee: ${formatCurrency(finalFee)}` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const deleteStudentFee = async (studentFeeId: string, currentPage: number) => {
    if (!instId || !isUuid(instId)) return;
    if (!studentFeeId) return;

    setProcessing(true);
    try {
      const { error } = await supabase
        .from("student_fees")
        .delete()
        .eq("id", studentFeeId);

      if (error) throw error;

      await fetchStudentFees(currentPage);
      toast({ title: "Student Fee Deleted", description: "Student fee record deleted." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const createStudentFee = async (formData: {
    studentId: string;
    batchFeeId: string;
    originalFee: string;
    discountAmount: string;
    discountReason: string;
    status: StudentFee["status"];
  }) => {
    if (!instId || !isUuid(instId)) return;
    if (!formData.studentId || !formData.batchFeeId || !formData.originalFee) {
      toast({ title: "Error", description: "Please fill all required fields.", variant: "destructive" });
      return;
    }

    setProcessing(true);
    try {
      const originalFeeNum = parseFloat(formData.originalFee);
      const discountAmountNum = parseFloat(formData.discountAmount || "0");
      const finalFeeNum = originalFeeNum - discountAmountNum;

      const { error } = await supabase
        .from("student_fees")
        .insert([{
          institute_id: instId,
          student_id: formData.studentId,
          batch_fee_id: formData.batchFeeId,
          original_fee: originalFeeNum,
          final_fee: finalFeeNum,
          paid_fees: 0,
          discount_amount: discountAmountNum,
          discount_reason: formData.discountReason || null,
          status: formData.status,
        }]);

      if (error) throw error;

      await fetchStudentFees(1);
      toast({ title: "Student Fee Created", description: "Student fee record created successfully." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const updateStudentFee = async (formData: {
    id: string;
    originalFee: string;
    discountAmount: string;
    discountReason: string;
    status: StudentFee["status"];
  }, currentPage: number) => {
    if (!instId || !isUuid(instId)) return;
    if (!formData.id) return;

    setProcessing(true);
    try {
      const originalFeeNum = parseFloat(formData.originalFee);
      const discountAmountNum = parseFloat(formData.discountAmount || "0");
      const finalFeeNum = originalFeeNum - discountAmountNum;

      const updateData: any = {
        original_fee: originalFeeNum,
        final_fee: finalFeeNum,
        discount_amount: discountAmountNum,
        status: formData.status,
        updated_at: new Date().toISOString(),
      };

      if (formData.discountReason !== undefined) {
        updateData.discount_reason = formData.discountReason || null;
      }

      const { error } = await supabase
        .from("student_fees")
        .update(updateData)
        .eq("id", formData.id);

      if (error) throw error;

      await fetchStudentFees(currentPage);
      toast({ title: "Student Fee Updated", description: "Student fee record updated successfully." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const generateNextReceiptId = async () => {
    if (!instId || !isUuid(instId)) return "101";

    const { data, error } = await supabase
      .from("student_fees")
      .select("receipt_id")
      .eq("institute_id", instId)
      .not("receipt_id", "is", null);

    if (error) {
      console.error("Error loading receipt ids:", error);
      return "101";
    }

    const maxId = (data || [])
      .map((row: any) => parseInt(row.receipt_id, 10))
      .filter((num) => !isNaN(num))
      .reduce((max, value) => Math.max(max, value), 100);

    return String(maxId < 101 ? 101 : maxId + 1);
  };

  const ensureReceiptId = async (studentFee: StudentFee) => {
    if (studentFee.receipt_id) return studentFee.receipt_id;

    const receiptId = await generateNextReceiptId();
    const { error } = await supabase
      .from("student_fees")
      .update({ receipt_id: receiptId, updated_at: new Date().toISOString() })
      .eq("id", studentFee.id);

    if (error) {
      console.error("Could not persist receipt_id:", error);
    }

    return receiptId;
  };

  const generateFeeReceiptPDF = async (studentFee: StudentFee) => {
    try {
      const doc = new jsPDF();
      
      doc.setFontSize(20);
      doc.setTextColor(26, 115, 232);
      doc.text("Fee Receipt", 105, 20, { align: "center" });
      
      doc.setFontSize(12);
      doc.setTextColor(100, 100, 100);
      doc.text("Agrawal Group Tuition", 105, 28, { align: "center" });
      
      const receiptId = studentFee.receipt_id || await ensureReceiptId(studentFee);
      doc.setFontSize(10);
      doc.text(`Receipt ID: ${receiptId}`, 105, 34, { align: "center" });
      
      doc.setDrawColor(26, 115, 232);
      doc.setLineWidth(0.5);
      doc.line(20, 38, 190, 38);
      
      const details = [
        ["Student Name:", studentFee.student_name],
        ["Enrollment No:", studentFee.enrollment_no],
        ["Batch:", studentFee.batch_name],
        ["Fee Type:", "Batch Fee"],
        ["Payment Date:", new Date().toLocaleDateString("en-IN")],
        ["Status:", studentFee.status.toUpperCase()],
      ];
      
      let yPos = 50;
      details.forEach(([label, value]) => {
        doc.setFont("helvetica", "bold");
        doc.text(label as string, 30, yPos);
        doc.setFont("helvetica", "normal");
        doc.text(value as string, 90, yPos);
        yPos += 8;
      });
      
      doc.setFillColor(232, 245, 232);
      doc.rect(20, yPos + 5, 170, 20, "F");
      doc.setFontSize(14);
      doc.setTextColor(46, 125, 50);
      doc.setFont("helvetica", "bold");
      doc.text(`Amount Paid: ${formatCurrency(studentFee.paid_fees)}`, 105, yPos + 17, { align: "center" });
      yPos += 35;
      
      const tableData = [["Original Fee", formatCurrency(studentFee.original_fee)]];
      if (studentFee.discount_amount > 0) {
        tableData.push(["Discount Applied", `-${formatCurrency(studentFee.discount_amount)}`]);
      }
      tableData.push(
        ["Final Fee", formatCurrency(studentFee.final_fee)],
        ["Paid Amount", formatCurrency(studentFee.paid_fees)],
        ["Pending Amount", formatCurrency(Math.max(0, studentFee.final_fee - studentFee.paid_fees))]
      );
      
      (autoTable as any)(doc, {
        startY: yPos,
        head: [["Description", "Amount"]],
        body: tableData,
        theme: "grid",
        headStyles: { fillColor: [248, 249, 250], textColor: [0, 0, 0], fontStyle: "bold" },
        styles: { fontSize: 10 },
        columnStyles: {
          0: { fontStyle: "bold", cellWidth: 85 },
          1: { cellWidth: 95, halign: "center" },
        },
        tableWidth: "100%",
      } as any);
      
      const finalY = 200; // Safe fallback after table
       doc.setFontSize(9);
       doc.setTextColor(100, 100, 100);
       doc.text("Note: GST Not Applicable (Tax Inclusive Pricing)", 105, finalY, { align: "center" });
       doc.text("Amount mentioned above is without any GST", 105, finalY + 5, { align: "center" });
      
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text("This is a computer generated receipt.", 105, finalY + 20, { align: "center" });
      doc.text(`Generated on ${new Date().toLocaleDateString("en-IN")} at ${new Date().toLocaleTimeString("en-IN")}`, 105, finalY + 25, { align: "center" });
      
      doc.save(`Fee_Receipt_${studentFee.enrollment_no}_${new Date().toISOString().split("T")[0]}.pdf`);
      toast({ title: "Receipt Generated", description: "Fee receipt downloaded successfully." });
    } catch (error: any) {
      console.error("Error generating PDF:", error);
      toast({ title: "Error", description: "Failed to generate PDF receipt.", variant: "destructive" });
    }
  };

   return { processing, addPayment, applyDiscount, deleteStudentFee, generateFeeReceiptPDF, createStudentFee, updateStudentFee };
}

