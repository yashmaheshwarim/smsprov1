import { useState, useEffect, useMemo } from "react";
import { supabase, isUuid } from "@/lib/supabase";
import { type StatusVariant } from "@/components/ui/status-badge";
import { toast } from "@/hooks/use-toast";
import { getNextReceiptId, buildReceiptHTML as buildReceiptHTMLFromService } from "@/lib/receipt-service";

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
  status: "paid" | "pending" | "partial" | "overdue";
  last_payment_date?: string;
  student_name: string;
  enrollment_no: string;
  admission_date: string;
  batch_name: string;
  original_fee: number;
  final_fee: number;
  created_at?: string;
  receipt_id?: string;
}

// ==========================================
// SHARED HELPERS
// ==========================================

export const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

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

export function useStudentFees(instId: string | undefined, page: number, pageSize: number, search: string = "") {
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

       // Step 1: Get all batch_fees for this institute (if any)
       const { data: batchFeesData, error: batchFeesError } = await supabase
         .from("batch_fees")
         .select("id, batch_id, total_fees")
         .eq("institute_id", instId)
         .eq("status", "active");

       if (batchFeesError) throw batchFeesError;

       // Build batch_fees map (batch_id → array of fee records)
       const batchFeesMap: Record<string, Array<{ id: string; total_fees: number }>> = {};
       if (batchFeesData && batchFeesData.length > 0) {
         batchFeesData.forEach((bf: any) => {
           if (!batchFeesMap[bf.batch_id]) batchFeesMap[bf.batch_id] = [];
           batchFeesMap[bf.batch_id].push({
             id: bf.id,
             total_fees: Number(bf.total_fees),
           });
         });
       }

       // Build search filter for students
       const searchFilter = search.trim().toLowerCase();

       // Step 2: Get total count of filtered students first
       let countQuery = supabase
         .from("students")
         .select("*", { count: "exact", head: true })
         .eq("institute_id", instId)
         .eq("status", "active");

       if (searchFilter) {
         countQuery = countQuery.or(
           `name.ilike.%${searchFilter}%,enrollment_no.ilike.%${searchFilter}%`
         );
       }

       const { count, error: countError } = await countQuery;
       if (countError) throw countError;
       setTotal(count || 0);

       // Step 3: Fetch students with pagination (no join - use simple select to avoid FK relationship issues)
       const from = (pageNum - 1) * pageSize;
       const to = from + pageSize - 1;

       let studentQuery = supabase
         .from("students")
         .select("id, name, enrollment_no, created_at, batch_id")
         .eq("institute_id", instId)
         .eq("status", "active")
         .order("name", { ascending: true })
         .range(from, to);

       if (searchFilter) {
         studentQuery = studentQuery.or(
           `name.ilike.%${searchFilter}%,enrollment_no.ilike.%${searchFilter}%`
         );
       }

       const { data: studentsData, error: studentsError } = await studentQuery;
       if (studentsError) throw studentsError;

       if (!studentsData || studentsData.length === 0) {
         setStudentFees([]);
         setLoading(false);
         return;
       }

       // Step 3b: Fetch batch names separately (avoid resource embedding join which can fail)
       const batchIds = [...new Set(studentsData.map((s: any) => s.batch_id).filter(Boolean))];
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
       // For students with none: one synthetic row using first batch fee of their batch (if exists)
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
               status: sf.status,
               last_payment_date: sf.last_payment_date,
               student_name: student.name,
               enrollment_no: student.enrollment_no,
               admission_date: student.created_at,
               batch_name: batchNameMap[student.batch_id] || "Unknown Batch",
               original_fee: Number(sf.original_fee ?? sf.discounted_fees ?? 0),
               final_fee: Number(sf.final_fee ?? sf.discounted_fees ?? 0),
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
             batch_name: batchNameMap[student.batch_id] || "Unknown Batch",
             original_fee: firstFee.total_fees,
             final_fee: firstFee.total_fees,
             created_at: student.created_at,
           });
         } else {
           // No batch fee exists for this student's batch - still show student with zero fees
           formatted.push({
             id: `synthetic-${student.id}`,
             student_id: student.id,
             batch_fee_id: "",
             batch_id: student.batch_id,
             paid_fees: 0,
             discount_amount: 0,
             status: "pending" as const,
             student_name: student.name,
             enrollment_no: student.enrollment_no,
             admission_date: student.created_at,
             batch_name: batchNameMap[student.batch_id] || "Unknown Batch",
             original_fee: 0,
             final_fee: 0,
             created_at: student.created_at,
           });
         }
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
  }, [instId, page, search]);

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
        .eq("batch_id", formData.batchId)
        .eq("status", "active");

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

        // Delete any existing student_fee records for these students + this batch_fee first (in case of re-apply)
        const studentIds = batchStudents.map(s => s.id);
        const { error: deleteError } = await supabase
          .from("student_fees")
          .delete()
          .eq("batch_fee_id", batchFeeData.id)
          .in("student_id", studentIds);
        if (deleteError) {
          console.warn("Could not delete existing student fees (may not exist yet):", deleteError);
        }

        const { error: studentFeesError } = await supabase
          .from("student_fees")
          .insert(studentFeeRecords);

        if (studentFeesError) throw studentFeesError;
      }

      await fetchBatchFees();
      toast({ title: "Batch Fee Created", description: `Fee structure applied to ${batchStudents?.length || 0} students in the batch.` });
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
      // Generate unique receipt ID for this payment
      let receiptId: string | null = null;
      try {
        receiptId = await getNextReceiptId(instId);
      } catch (receiptError) {
        console.warn("Could not generate receipt ID, continuing without it:", receiptError);
      }

      const { error: paymentError } = await supabase
        .from("payments")
        .insert([{
          student_fee_id: studentFeeId,
          amount: paymentAmountNum,
          payment_method: paymentMethod,
          payment_date: paymentDate || new Date().toISOString(),
          receipt_id: receiptId,
        }]);

      if (paymentError) console.log("Payments table may not exist, continuing with fee update only");

      const { error } = await supabase
        .from("student_fees")
        .update({
          paid_fees: newPaidFees,
          status: newStatus,
          last_payment_date: paymentDate || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", studentFeeId);

      if (error) throw error;

      await fetchStudentFees(currentPage);
      toast({ title: "Payment Added", description: `Payment of ${formatCurrency(paymentAmountNum)} recorded. Receipt #${receiptId || 'N/A'}` });
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

  /** Quick create: creates a student fee record and optionally records a payment in one call */
  const quickCreateAndPay = async (
    studentId: string,
    batchFeeId: string,
    originalFee: number,
    paymentAmount: number,
    paymentMethod: string,
    currentPage: number,
    paymentDate?: string
  ): Promise<boolean> => {
    if (!instId || !isUuid(instId)) return false;
    if (!studentId || !batchFeeId) {
      toast({ title: "Error", description: "Missing student or batch fee.", variant: "destructive" });
      return false;
    }

    setProcessing(true);
    try {
      const finalFee = originalFee;
      const paidFees = Math.min(paymentAmount, finalFee);
      const payDate = paymentDate || new Date().toISOString();
      const newStatus: StudentFee["status"] = paidFees >= finalFee ? "paid" : paidFees > 0 ? "partial" : "pending";

      // Insert the student fee record with all fields set
      const { data: newFee, error: insertError } = await supabase
        .from("student_fees")
        .insert([{
          institute_id: instId,
          student_id: studentId,
          batch_fee_id: batchFeeId,
          original_fee: originalFee,
          final_fee: finalFee,
          paid_fees: paidFees,
          discount_amount: 0,
          status: newStatus,
          last_payment_date: paidFees > 0 ? payDate : null,
        }])
        .select()
        .single();

      if (insertError) throw insertError;

      // Record payment if amount > 0
      if (paidFees > 0 && newFee) {
        let receiptId: string | null = null;
        try {
          receiptId = await getNextReceiptId(instId);
        } catch {}

        await supabase
          .from("payments")
          .insert([{
            student_fee_id: newFee.id,
            amount: paidFees,
            payment_method: paymentMethod,
            payment_date: payDate,
            receipt_id: receiptId,
          }]);
      }

      await fetchStudentFees(currentPage);
      toast({
        title: paidFees > 0 ? "Fee Created & Payment Recorded" : "Fee Record Created",
        description: paidFees > 0
          ? `${formatCurrency(paidFees)} payment recorded.`
          : "Student fee record created.",
      });
      return true;
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return false;
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

  const generateFeeReceiptPDF = async (studentFee: StudentFee) => {
    if (!instId || !isUuid(instId)) {
      toast({ title: "Error", description: "Institute not found.", variant: "destructive" });
      return;
    }

    try {
      // Fetch payment history for this student fee
      const { data: payments } = await supabase
        .from("payments")
        .select("*")
        .eq("student_fee_id", studentFee.id)
        .order("payment_date", { ascending: true });

      const paymentHistory = (payments || []).map((p: any) => ({
        date: p.payment_date,
        amount: Number(p.amount),
        method: p.payment_method || "cash",
        receiptId: p.receipt_id || "Pending",
      }));

      // Use the latest receipt ID if available, otherwise generate a new one
      const lastPayment = payments && payments.length > 0 ? payments[payments.length - 1] : null;
      const receiptId = lastPayment?.receipt_id || await getNextReceiptId(instId);

      const receiptContent = buildReceiptHTMLFromService(
        receiptId,
        studentFee.student_name,
        studentFee.enrollment_no,
        studentFee.batch_name,
        studentFee.paid_fees,
        studentFee.original_fee,
        studentFee.discount_amount,
        studentFee.final_fee,
        studentFee.status,
        undefined,
        paymentHistory
      );
      const blob = new Blob([receiptContent], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Fee_Receipt_${receiptId}_${new Date().toISOString().split('T')[0]}.html`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Receipt Generated", description: `Receipt #${receiptId} downloaded with ${paymentHistory.length} payment(s).` });
    } catch (error: any) {
      console.error("Error generating receipt:", error);
      toast({ title: "Error", description: "Failed to generate receipt.", variant: "destructive" });
    }
  };

   return { processing, addPayment, applyDiscount, deleteStudentFee, generateFeeReceiptPDF, createStudentFee, updateStudentFee, quickCreateAndPay };
}

