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

// Add searchTerm to the hook parameters
export function useStudentFees(instId: string | undefined, page: number, pageSize: number, initialSearchTerm: string = "") {
  const [studentFees, setStudentFees] = useState<StudentFee[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Accept searchTerm here
  const fetchStudentFees = async (pageNum: number = page, searchTerm: string = "") => {
    if (!instId || !isUuid(instId)) {
      setStudentFees([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

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

      const batchFeesMap: Record<string, Array<{ id: string; total_fees: number }>> = {};
      batchFeesData.forEach((bf: any) => {
        if (!batchFeesMap[bf.batch_id]) batchFeesMap[bf.batch_id] = [];
        batchFeesMap[bf.batch_id].push({ id: bf.id, total_fees: Number(bf.total_fees) });
      });

      const batchIds = Object.keys(batchFeesMap);

      // --- STEP 2: APPLY SEARCH TO TOTAL COUNT ---
      let countQuery = supabase
        .from("students")
        .select("*", { count: "exact", head: true })
        .eq("institute_id", instId)
        .in("batch_id", batchIds);

      if (searchTerm) {
        countQuery = countQuery.or(`name.ilike.%${searchTerm}%,enrollment_no.ilike.%${searchTerm}%`);
      }

      const { count, error: countError } = await countQuery;
      if (countError) throw countError;
      setTotal(count || 0);

      // --- STEP 3: APPLY SEARCH TO PAGINATED DATA ---
      const from = (pageNum - 1) * pageSize;
      const to = from + pageSize - 1;

      let studentsQuery = supabase
        .from("students")
        .select(`id, name, enrollment_no, created_at, batch_id, batches ( name )`)
        .eq("institute_id", instId)
        .in("batch_id", batchIds)
        .order("name", { ascending: true })
        .range(from, to);

      if (searchTerm) {
        studentsQuery = studentsQuery.or(`name.ilike.%${searchTerm}%,enrollment_no.ilike.%${searchTerm}%`);
      }

      const { data: studentsData, error: studentsError } = await studentsQuery;
      if (studentsError) throw studentsError;

      if (!studentsData || studentsData.length === 0) {
        setStudentFees([]);
        setLoading(false);
        return;
      }

      // Step 4 & 5 remain identical to your original code...
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
              paid_fees: Number(sf.paid_fees),
              discount_amount: Number(sf.discount_amount || 0),
              receipt_id: sf.receipt_id || undefined,
              status: sf.status,
              last_payment_date: sf.last_payment_date || undefined,
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
          const firstFee = batchFeeList[0];
          formatted.push({
            id: `synthetic-${student.id}`,
            student_id: student.id,
            batch_fee_id: firstFee.id,
            batch_id: student.batch_id,
            paid_fees: 0,
            discount_amount: 0,
            status: "pending",
            student_name: student.name,
            enrollment_no: student.enrollment_no,
            admission_date: student.created_at,
            batch_name: student.batches?.name || "Unknown Batch",
            original_fee: firstFee.total_fees,
            final_fee: firstFee.total_fees,
            created_at: student.created_at,
          });
        }
      });

      setStudentFees(formatted);
    } catch (error: any) {
      console.error("Error:", error);
      setStudentFees([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudentFees(page, initialSearchTerm);
  }, [instId, page, initialSearchTerm]);

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

      let receiptIdToUse = studentFee.receipt_id;
      const updatePayload: any = {
        paid_fees: newPaidFees,
        status: newStatus,
        last_payment_date: paymentDate || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (!studentFee.receipt_id) {
        receiptIdToUse = await generateNextReceiptId();
        updatePayload.receipt_id = receiptIdToUse;
      }

      const { error } = await supabase
        .from("student_fees")
        .update(updatePayload)
        .eq("id", studentFeeId);

      if (error) throw error;

      // Send email notification after successful payment
      const updatedStudentFee = { ...studentFee, paid_fees: newPaidFees, status: newStatus, receipt_id: receiptIdToUse };
      sendFeePaymentEmail(updatedStudentFee, paymentAmountNum, paymentMethod).catch(err => 
        console.log("Email notification failed (non-blocking):", err)
      );

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
      // 1. Generate the next receipt ID based on the pattern from settings
      const nextReceiptId = await generateNextReceiptId();

     const originalFeeNum = parseFloat(formData.originalFee);
     const discountAmountNum = parseFloat(formData.discountAmount || "0");
     const finalFeeNum = originalFeeNum - discountAmountNum;

     // 3. Insert with the calculated receipt_id
     const { error: insertError } = await supabase
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
         receipt_id: nextReceiptId.toString(), // Store as string for flexibility
       }]);

     if (insertError) throw insertError;

     await fetchStudentFees(1);
     toast({ title: "Student Fee Created", description: `Record created successfully. Receipt ID: ${nextReceiptId}` });
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

  const getReceiptIdPattern = async (): Promise<{ pattern: string; prefix: string; startNum: number }> => {
    if (!instId || !isUuid(instId)) return { pattern: "101", prefix: "", startNum: 101 };

    const { data, error } = await supabase
      .from("institutes")
      .select("receipt_id_pattern, receipt_id_start")
      .eq("id", instId)
      .single();

    if (error) {
      console.log("Could not fetch receipt_id_pattern, using default 101");
      return { pattern: "101", prefix: "", startNum: 101 };
    }

    const pattern = data?.receipt_id_pattern || String(data?.receipt_id_start || "101");
    const prefix = pattern.replace(/[0-9]/g, '');
    const numStr = pattern.replace(/[^0-9]/g, '');
    const startNum = parseInt(numStr) || 101;
    return { pattern, prefix, startNum };
  };

  /**
   * Generate the next receipt ID based on the pattern from settings.
   * Pattern examples: "AGT-500" → AGT-500, AGT-501, AGT-502...
   *                   "101" → 101, 102, 103...
   *                   "RCPT-001" → RCPT-001, RCPT-002...
   */
  const generateNextReceiptId = async () => {
    if (!instId || !isUuid(instId)) return "101";

    const { pattern, prefix, startNum } = await getReceiptIdPattern();
    const numStr = pattern.replace(/[^0-9]/g, '');
    const paddedLength = numStr.length;

    // Fetch all existing receipt_ids for this institute
    const { data, error } = await supabase
      .from("student_fees")
      .select("receipt_id")
      .eq("institute_id", instId)
      .not("receipt_id", "is", null);

    if (error) {
      console.error("Error loading receipt ids:", error);
      return pattern;
    }

    // Extract numeric parts from existing receipt IDs that match the prefix
    const existingNums = (data || [])
      .filter((row: any) => row.receipt_id && row.receipt_id.startsWith(prefix))
      .map((row: any) => {
        const numPart = row.receipt_id.substring(prefix.length);
        return parseInt(numPart, 10);
      })
      .filter((num: number) => !isNaN(num));

    // Find the max number, or use startNum - 1 if none exist
    const maxNum = existingNums.reduce((max: number, val: number) => Math.max(max, val), startNum - 1);
    const nextNum = maxNum < startNum ? startNum : maxNum + 1;
    const nextPadded = String(nextNum).padStart(paddedLength, '0');

    return prefix + nextPadded;
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
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 40;
      const centerX = pageWidth / 2;
      let y = margin;

      // Fetch institute name
      const { data: institute } = instId ? await supabase
        .from("institutes")
        .select("name")
        .eq("id", instId)
        .single() : { data: null };
      const instituteName = institute?.name || "Institute Name";

      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(20, 20, 20);
      doc.text("FEE RECEIPT", centerX, y, { align: "center" });
      y += 24;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(90, 90, 90);
      doc.text(instituteName, centerX, y, { align: "center" });
      y += 16;
      doc.text("Computer Generated Receipt", centerX, y, { align: "center" });
      y += 20;

      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.6);
      doc.line(margin, y, pageWidth - margin, y);
      y += 18;

const receiptId = studentFee.receipt_id || (await ensureReceiptId(studentFee));
       const paymentDateStr = studentFee.last_payment_date
         ? new Date(studentFee.last_payment_date).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })
         : new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
       const generatedAt = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) + " " + new Date().toLocaleTimeString("en-IN");

       // Fetch all payment records for this student fee
       const { data: paymentRecords } = await supabase
         .from("payments")
         .select("id, amount, payment_date, payment_method, transaction_id")
         .eq("student_fee_id", studentFee.id)
         .order("payment_date", { ascending: false });

      // Receipt metadata top-right
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(30, 30, 30);
      doc.text("RECEIPT ID", pageWidth - margin - 110, y - 10, { align: "left" });
      doc.setFont("helvetica", "normal");
      doc.text(String(receiptId), pageWidth - margin - 110, y + 6, { align: "left" });
      doc.setFont("helvetica", "bold");
      doc.text("DATE", pageWidth - margin - 220, y - 10, { align: "left" });
      doc.setFont("helvetica", "normal");
      doc.text(paymentDateStr, pageWidth - margin - 220, y + 6, { align: "left" });

      y += 42;

      const rows = [
        ["Student Name", studentFee.student_name],
        ["Enrollment No", studentFee.enrollment_no],
        ["Batch", studentFee.batch_name],
        ["Fee Type", "Batch Fee"],
        ["Payment Date", paymentDateStr],
        ["Status", studentFee.status.toUpperCase()],
      ];

      rows.forEach(([label, value]) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(30, 30, 30);
        doc.text(label, margin, y);
        doc.setFont("helvetica", "normal");
        doc.text(value, margin + 160, y);
        y += 18;
      });

      y += 12;

      const paidBoxY = y;
      const paidBoxHeight = 56;
      doc.setFillColor(230, 245, 230);
      doc.roundedRect(margin, paidBoxY, pageWidth - margin * 2, paidBoxHeight, 10, 10, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(20, 100, 30);
      doc.text("AMOUNT PAID", centerX, paidBoxY + 22, { align: "center" });
      doc.setFontSize(22);
      doc.text(formatCurrency(studentFee.paid_fees), centerX, paidBoxY + 44, { align: "center" });
      y = paidBoxY + paidBoxHeight + 18;

      const breakdownData: [string, string][] = [
        ["Original Fee", formatCurrency(studentFee.original_fee)],
      ];
      if (studentFee.discount_amount > 0) {
        breakdownData.push(["Discount Applied", "-" + formatCurrency(studentFee.discount_amount)]);
      }
      breakdownData.push(
        ["Final Fee", formatCurrency(studentFee.final_fee)],
        ["Paid Amount", formatCurrency(studentFee.paid_fees)],
        ["Pending Amount", formatCurrency(Math.max(0, studentFee.final_fee - studentFee.paid_fees))]
      );

      (autoTable as any)(doc, {
        startY: y,
        head: [["Description", "Amount"]],
        body: breakdownData,
        theme: "grid",
        headStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0], fontStyle: "bold", fontSize: 10 },
        styles: { fontSize: 9.5, cellPadding: 6 },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 220 }, 1: { cellWidth: 220, halign: "right" } },
        tableWidth: pageWidth - margin * 2,
        margin: { left: margin, right: margin },
      });

const finalY = Math.min(pageHeight - 90, (doc as any).lastAutoTable?.finalY || y + 180);

       // Payment History Section
       const paymentRows: [string, string, string, string][] = (paymentRecords || []).map((p: any) => [
         new Date(p.payment_date).toLocaleDateString("en-IN"),
         formatCurrency(p.amount),
         p.payment_method || "-",
         p.transaction_id || "-"
       ]);

       if (paymentRows.length > 0) {
         doc.setFont("helvetica", "bold");
         doc.setFontSize(11);
         doc.setTextColor(30, 30, 30);
         doc.text("Payment History", margin, finalY + 80);

         (autoTable as any)(doc, {
           startY: finalY + 95,
           head: [["Date", "Amount", "Method", "Transaction"]],
           body: paymentRows,
           theme: "grid",
           headStyles: { fillColor: [230, 240, 230], textColor: [0, 0, 0], fontStyle: "bold", fontSize: 9 },
           styles: { fontSize: 8.5, cellPadding: 5 },
           columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: 100, halign: "right" }, 2: { cellWidth: 100 }, 3: { cellWidth: 120 } },
           tableWidth: pageWidth - margin * 2,
           margin: { left: margin, right: margin },
         });
       }

       doc.setFont("helvetica", "normal");
       doc.setFontSize(9);
       doc.setTextColor(100, 100, 100);
       const noteY = paymentRows.length > 0
         ? Math.min(pageHeight - 90, (doc as any).lastAutoTable?.finalY || finalY + 180)
         : finalY;
       doc.text("Note: GST Not Applicable (Tax Inclusive Pricing)", centerX, noteY + 16, { align: "center" });
       doc.text("Amount mentioned above is without any GST", centerX, noteY + 30, { align: "center" });
       doc.text("This is a computer generated receipt.", centerX, noteY + 50, { align: "center" });
       doc.text("Generated on " + generatedAt, centerX, noteY + 64, { align: "center" });

      doc.save(`Fee_Receipt_${studentFee.enrollment_no}_${new Date().toISOString().split("T")[0]}.pdf`);
      toast({ title: "Receipt Generated", description: "Fee receipt downloaded successfully." });
    } catch (error: any) {
      console.error("Error generating PDF:", error);
      toast({ title: "Error", description: "Failed to generate PDF receipt.", variant: "destructive" });
    }
  };

const sendFeePaymentEmail = async (studentFee: StudentFee, paymentAmount: number, paymentMethod?: string) => {
    if (!instId || !isUuid(instId)) return;

    // Check if email notifications are enabled
    const { data: instituteData } = await supabase
      .from("institutes")
      .select("notification_email, fee_email_notifications_enabled")
      .eq("id", instId)
      .single();

    const notificationEmail = instituteData?.notification_email;
    const notificationsEnabled = instituteData?.fee_email_notifications_enabled !== false;

    if (!notificationsEnabled || !notificationEmail) return;

    // Get student and fee details for email
    const [{ data: studentData }, { data: batchFeeData }] = await Promise.all([
      supabase
        .from("students")
        .select(`name, enrollment_no, batch_name, email, batch_id, batches ( name )`)
        .eq("id", studentFee.student_id)
        .single(),
      studentFee.batch_fee_id ? supabase
        .from("batch_fees")
        .select("title, description, total_fees, due_date")
        .eq("id", studentFee.batch_fee_id)
        .single() : { data: null }
    ]);

    // Fetch all payment history for this student fee
    const { data: paymentHistory } = await supabase
      .from("payments")
      .select("id, amount, payment_date, payment_method, transaction_id")
      .eq("student_fee_id", studentFee.id)
      .order("payment_date", { ascending: false });

    const receiptId = studentFee.receipt_id || "N/A";

    // Generate payment history table rows
    const paymentHistoryRows = (paymentHistory || []).map((p: any) => `
      <tr>
        <td style="padding: 8px; border: 1px solid #e0e0e0;">${new Date(p.payment_date).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</td>
        <td style="padding: 8px; border: 1px solid #e0e0e0; text-align: right;">₹${Number(p.amount).toLocaleString("en-IN")}</td>
        <td style="padding: 8px; border: 1px solid #e0e0e0;">${p.payment_method || "-"}</td>
        <td style="padding: 8px; border: 1px solid #e0e0e0;">${p.transaction_id || "-"}</td>
      </tr>
    `).join("");

    const paymentDate = new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    });

    const subject = `Fee Payment Received - ${studentData?.name || studentFee.student_name} (Receipt: ${receiptId})`;
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a73e8;">Fee Payment Receipt Notification</h2>
        <p>A fee payment has been recorded successfully. Here are the complete payment details:</p>
        
        <h3 style="color: #333; border-bottom: 1px solid #e0e0e0; padding-bottom: 8px;">Student Information</h3>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="background: #f8f9fa;">
            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Student Name</td>
            <td style="padding: 10px; border: 1px solid #e0e0e0;">${studentData?.name || studentFee.student_name}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Enrollment No</td>
            <td style="padding: 10px; border: 1px solid #e0e0e0;">${studentData?.enrollment_no || studentFee.enrollment_no}</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Batch</td>
            <td style="padding: 10px; border: 1px solid #e0e0e0;">${studentData?.batches?.[0]?.name || studentFee.batch_name}</td>
          </tr>
        </table>

        <h3 style="color: #333; border-bottom: 1px solid #e0e0e0; padding-bottom: 8px;">Fee Details</h3>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="background: #f8f9fa;">
            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Receipt ID</td>
            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold; font-family: monospace;">${receiptId}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Fee Title</td>
            <td style="padding: 10px; border: 1px solid #e0e0e0;">${batchFeeData?.title || "Batch Fee"}</td>
          </tr>
          ${batchFeeData?.description ? `
          <tr style="background: #f8f9fa;">
            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Description</td>
            <td style="padding: 10px; border: 1px solid #e0e0e0;">${batchFeeData.description}</td>
          </tr>` : ''}
          ${batchFeeData?.due_date ? `
          <tr>
            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Due Date</td>
            <td style="padding: 10px; border: 1px solid #e0e0e0;">${new Date(batchFeeData.due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</td>
          </tr>` : ''}
        </table>

        <h3 style="color: #333; border-bottom: 1px solid #e0e0e0; padding-bottom: 8px;">All Payment History</h3>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background: #f8f9fa;">
              <th style="padding: 8px; border: 1px solid #e0e0e0; text-align: left;">Date</th>
              <th style="padding: 8px; border: 1px solid #e0e0e0; text-align: right;">Amount</th>
              <th style="padding: 8px; border: 1px solid #e0e0e0;">Method</th>
              <th style="padding: 8px; border: 1px solid #e0e0e0;">Transaction ID</th>
            </tr>
          </thead>
          <tbody>
            ${paymentHistoryRows || '<tr><td colspan="4" style="padding: 8px; text-align: center; color: #666;">No payment records found</td></tr>'}
          </tbody>
        </table>

        <h3 style="color: #333; border-bottom: 1px solid #e0e0e0; padding-bottom: 8px;">Payment Summary</h3>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="background: #f8f9fa;">
            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Original Fee</td>
            <td style="padding: 10px; border: 1px solid #e0e0e0;">₹${studentFee.original_fee.toLocaleString("en-IN")}</td>
          </tr>
          ${studentFee.discount_amount > 0 ? `
          <tr>
            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Discount Applied</td>
            <td style="padding: 10px; border: 1px solid #e0e0e0; color: #c62828;">-₹${studentFee.discount_amount.toLocaleString("en-IN")}</td>
          </tr>` : ''}
          <tr style="background: #f8f9fa;">
            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Final Fee</td>
            <td style="padding: 10px; border: 1px solid #e0e0e0;">₹${studentFee.final_fee.toLocaleString("en-IN")}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Total Paid</td>
            <td style="padding: 10px; border: 1px solid #e0e0e0; color: #2e7d32; font-weight: bold;">₹${studentFee.paid_fees.toLocaleString("en-IN")}</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Pending Amount</td>
            <td style="padding: 10px; border: 1px solid #e0e0e0;">₹${Math.max(0, studentFee.final_fee - studentFee.paid_fees).toLocaleString("en-IN")}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Payment Date</td>
            <td style="padding: 10px; border: 1px solid #e0e0e0;">${paymentDate}</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Status</td>
            <td style="padding: 10px; border: 1px solid #e0e0e0;">${studentFee.status.toUpperCase()}</td>
          </tr>
        </table>

        <p style="color: #666; font-size: 12px; margin-top: 20px;">This is an automated notification from your InstituteOS.</p>
        <p style="color: #999; font-size: 11px;">Generated on ${new Date().toLocaleString("en-IN")}</p>
      </div>
    `;

    try {
      await fetch("/.netlify/functions/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institute_id: instId,
          to: notificationEmail,
          subject: subject,
          html: htmlBody,
        }),
      });
      console.log("Fee payment email notification sent successfully");
    } catch (error) {
      console.error("Failed to send fee payment email:", error);
    }
  };

   return { processing, addPayment, applyDiscount, deleteStudentFee, generateFeeReceiptPDF, createStudentFee, updateStudentFee, sendFeePaymentEmail };
}


