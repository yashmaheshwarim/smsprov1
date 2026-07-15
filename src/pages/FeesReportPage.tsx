import { useState, useEffect, useMemo } from "react";
import {
  Download, IndianRupee, AlertCircle, CheckCircle,
  Loader2, BarChart3, RefreshCw, FileDown, Users,
} from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable } from "@/components/ui/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { supabase, isUuid } from "@/lib/supabase";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import * as XLSX from "xlsx";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Batch {
  id: string;
  name: string;
}

interface FeeRecord {
  id: string;
  student_id: string;
  student_name: string;
  enrollment_no: string;
  batch_name: string;
  batch_id: string;
  fee_title: string;
  original_fee: number;
  discount_amount: number;
  discount_reason: string;
  final_fee: number;
  paid_fees: number;
  pending: number;
  status: "paid" | "pending" | "partial" | "overdue";
  last_payment_date: string | null;
  fee_created_at: string | null;
  admission_date: string;
}

interface BatchSummary {
  batch_name: string;
  total_students: number;
  total_original: number;
  total_discount: number;
  total_final: number;
  total_paid: number;
  total_pending: number;
  paid_count: number;
  partial_count: number;
  pending_count: number;
  overdue_count: number;
  collection_rate: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const formatDate = (d: string | null | undefined) => {
  if (!d) return "N/A";
  try {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "N/A";
  }
};

const statusVariant = (s: string) => {
  switch (s) {
    case "paid": return "success" as const;
    case "partial": return "info" as const;
    case "pending": return "warning" as const;
    case "overdue": return "destructive" as const;
    default: return "default" as const;
  }
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function FeesReportPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const DEFAULT_UUID = "00000000-0000-0000-0000-000000000001";
  const instId = isAdmin ? (user as AdminUser).instituteId : DEFAULT_UUID;

  const [allRecords, setAllRecords] = useState<FeeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // ── Fetch Data ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isUuid(instId)) {
      fetchAllFeeRecords();
    }
  }, [instId]);

  const fetchAllFeeRecords = async () => {
    setLoading(true);
    try {
      const { data: students, error: sErr } = await supabase
        .from("students")
        .select("id, name, enrollment_no, batch_id, created_at")
        .eq("institute_id", instId)
        .eq("status", "active")
        .order("name", { ascending: true });

      if (sErr) throw sErr;
      if (!students || students.length === 0) {
        setAllRecords([]);
        setLoading(false);
        return;
      }

      // Fetch batch names
      const batchIds = [...new Set(students.map((s: any) => s.batch_id).filter(Boolean))];
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

      // Fetch all batch fees
      const { data: batchFeesData } = await supabase
        .from("batch_fees")
        .select("id, batch_id, title, total_fees")
        .eq("institute_id", instId)
        .eq("status", "active");

      const batchFeeMap: Record<string, Array<{ id: string; title: string; total_fees: number }>> = {};
      (batchFeesData || []).forEach((bf: any) => {
        if (!batchFeeMap[bf.batch_id]) batchFeeMap[bf.batch_id] = [];
        batchFeeMap[bf.batch_id].push({
          id: bf.id,
          title: bf.title,
          total_fees: Number(bf.total_fees || 0),
        });
      });

      // Fetch all student_fees
      const studentIds = students.map((s: any) => s.id);
      const { data: studentFeesData } = await supabase
        .from("student_fees")
        .select("*")
        .in("student_id", studentIds);

      const sFeeMap: Record<string, any[]> = {};
      (studentFeesData || []).forEach((sf: any) => {
        if (!sFeeMap[sf.student_id]) sFeeMap[sf.student_id] = [];
        sFeeMap[sf.student_id].push(sf);
      });

      // Build records
      const records: FeeRecord[] = [];

      students.forEach((student: any) => {
        const fees = sFeeMap[student.id] || [];
        const batchFees = batchFeeMap[student.batch_id] || [];
        const batchName = batchNameMap[student.batch_id] || "Unknown Batch";

        if (fees.length > 0) {
          fees.forEach((sf: any) => {
            const originalFee = Number(sf.original_fee ?? sf.discounted_fees ?? 0);
            const discountAmount = Number(sf.discount_amount || 0);
            const finalFee = Number(sf.final_fee ?? (originalFee - discountAmount)) || 0;
            const paidFees = Number(sf.paid_fees || 0);

            let feeTitle = "Fee Record";
            if (sf.batch_fee_id && batchFees.length > 0) {
              const matched = batchFees.find((bf) => bf.id === sf.batch_fee_id);
              if (matched) feeTitle = matched.title;
            }

            records.push({
              id: sf.id,
              student_id: student.id,
              student_name: student.name,
              enrollment_no: student.enrollment_no || "",
              batch_name: batchName,
              batch_id: student.batch_id || "",
              fee_title: feeTitle,
              original_fee: originalFee,
              discount_amount: discountAmount,
              discount_reason: sf.discount_reason || "",
              final_fee: finalFee,
              paid_fees: paidFees,
              pending: Math.max(0, finalFee - paidFees),
              status: sf.status || "pending",
              last_payment_date: sf.last_payment_date || null,
              fee_created_at: sf.created_at || null,
              admission_date: student.created_at,
            });
          });
        } else if (batchFees.length > 0) {
          batchFees.forEach((bf) => {
            records.push({
              id: `synthetic-${student.id}-${bf.id}`,
              student_id: student.id,
              student_name: student.name,
              enrollment_no: student.enrollment_no || "",
              batch_name: batchName,
              batch_id: student.batch_id || "",
              fee_title: bf.title,
              original_fee: bf.total_fees,
              discount_amount: 0,
              discount_reason: "",
              final_fee: bf.total_fees,
              paid_fees: 0,
              pending: bf.total_fees,
              status: "pending",
              last_payment_date: null,
              fee_created_at: null,
              admission_date: student.created_at,
            });
          });
        } else {
          records.push({
            id: `synthetic-${student.id}-nofee`,
            student_id: student.id,
            student_name: student.name,
            enrollment_no: student.enrollment_no || "",
            batch_name: batchName,
            batch_id: student.batch_id || "",
            fee_title: "No Fee Structure",
            original_fee: 0,
            discount_amount: 0,
            discount_reason: "",
            final_fee: 0,
            paid_fees: 0,
            pending: 0,
            status: "pending",
            last_payment_date: null,
            fee_created_at: null,
            admission_date: student.created_at,
          });
        }
      });

      setAllRecords(records);
    } catch (err: any) {
      console.error("Error fetching fee records:", err);
      toast({ title: "Error", description: "Failed to load fee records", variant: "destructive" });
      setAllRecords([]);
    } finally {
      setLoading(false);
    }
  };

  // ── Statistics ────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const totalOriginal = allRecords.reduce((s, r) => s + r.original_fee, 0);
    const totalDiscount = allRecords.reduce((s, r) => s + r.discount_amount, 0);
    const totalFinal = allRecords.reduce((s, r) => s + r.final_fee, 0);
    const totalPaid = allRecords.reduce((s, r) => s + r.paid_fees, 0);
    const totalPending = allRecords.reduce((s, r) => s + r.pending, 0);
    const collectionRate = totalFinal > 0 ? (totalPaid / totalFinal) * 100 : 0;
    const paidCount = allRecords.filter(r => r.status === "paid").length;
    const partialCount = allRecords.filter(r => r.status === "partial").length;
    const pendingCount = allRecords.filter(r => r.status === "pending").length;
    const overdueCount = allRecords.filter(r => r.status === "overdue").length;

    return {
      totalOriginal, totalDiscount, totalFinal, totalPaid, totalPending,
      paidCount, partialCount, pendingCount, overdueCount,
      totalRecords: allRecords.length, collectionRate,
    };
  }, [allRecords]);

  // ── Batch Summary ─────────────────────────────────────────────────────────

  const batchSummaries = useMemo(() => {
    const map: Record<string, BatchSummary> = {};
    const uniqueStudents: Record<string, Set<string>> = {};

    allRecords.forEach((rec) => {
      if (!map[rec.batch_name]) {
        map[rec.batch_name] = {
          batch_name: rec.batch_name,
          total_students: 0,
          total_original: 0,
          total_discount: 0,
          total_final: 0,
          total_paid: 0,
          total_pending: 0,
          paid_count: 0,
          partial_count: 0,
          pending_count: 0,
          overdue_count: 0,
          collection_rate: 0,
        };
        uniqueStudents[rec.batch_name] = new Set();
      }

      const b = map[rec.batch_name];
      uniqueStudents[rec.batch_name].add(rec.student_id);
      b.total_original += rec.original_fee;
      b.total_discount += rec.discount_amount;
      b.total_final += rec.final_fee;
      b.total_paid += rec.paid_fees;
      b.total_pending += rec.pending;
      if (rec.status === "paid") b.paid_count++;
      else if (rec.status === "partial") b.partial_count++;
      else if (rec.status === "pending") b.pending_count++;
      else if (rec.status === "overdue") b.overdue_count++;
    });

    return Object.entries(map).map(([name, b]) => ({
      ...b,
      total_students: uniqueStudents[name]?.size || 0,
      collection_rate: b.total_final > 0 ? (b.total_paid / b.total_final) * 100 : 0,
    })).sort((a, b) => a.batch_name.localeCompare(b.batch_name));
  }, [allRecords]);

  // ── Excel Export ──────────────────────────────────────────────────────────

  const exportReport = () => {
    const data = allRecords;
    if (data.length === 0) {
      toast({ title: "Nothing to Export", description: "No fee records available.", variant: "destructive" });
      return;
    }

    setExporting(true);
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Detailed Report
      const detailRows = data.map((rec, i) => ({
        "#": i + 1,
        "Student Name": rec.student_name,
        "Enrollment No": rec.enrollment_no,
        "Batch": rec.batch_name,
        "Original Fee (₹)": rec.original_fee,
        "Discount (₹)": rec.discount_amount,
        "Discount Reason": rec.discount_reason || "-",
        "Final Fee (₹)": rec.final_fee,
        "Paid (₹)": rec.paid_fees,
        "Pending (₹)": rec.pending,
        "Status": rec.status.toUpperCase(),
        "Last Payment Date": formatDate(rec.last_payment_date),
        "Record Date": formatDate(rec.fee_created_at || rec.admission_date),
      }));

      const wsDetail = XLSX.utils.json_to_sheet(detailRows);
      XLSX.utils.book_append_sheet(wb, wsDetail, "Fee Report");

      const detailKeys = Object.keys(detailRows[0] || {});
      wsDetail["!cols"] = detailKeys.map((key) => ({
        wch: Math.max(key.length, ...detailRows.map((r: any) => String(r[key] || "").length)) + 3,
      }));

      // Sheet 2: Batch Summary
      const batchSummaryRows = batchSummaries.map((b, i) => ({
        "#": i + 1,
        "Batch Name": b.batch_name,
        "Total Students": b.total_students,
        "Total Original Fee (₹)": b.total_original,
        "Total Discount (₹)": b.total_discount,
        "Total Fee After Discount (₹)": b.total_final,
        "Total Collected (₹)": b.total_paid,
        "Total Pending (₹)": b.total_pending,
        "Fully Paid": b.paid_count,
        "Partial": b.partial_count,
        "Pending": b.pending_count,
        "Overdue": b.overdue_count,
        "Collection Rate (%)": b.collection_rate.toFixed(1),
      }));

      const wsBatchSummary = XLSX.utils.json_to_sheet(batchSummaryRows);
      XLSX.utils.book_append_sheet(wb, wsBatchSummary, "Batch Summary");
      wsBatchSummary["!cols"] = Object.keys(batchSummaryRows[0] || {}).map((key) => ({
        wch: Math.max(key.length, ...batchSummaryRows.map((r: any) => String(r[key] || "").length)) + 3,
      }));

      // Sheet 3: Status Summary
      const statusSummary = [
        { Status: "Paid (Fully)", Count: stats.paidCount, "Total Amount (₹)": allRecords.filter(r => r.status === "paid").reduce((s, r) => s + r.final_fee, 0) },
        { Status: "Partial", Count: stats.partialCount, "Total Amount (₹)": allRecords.filter(r => r.status === "partial").reduce((s, r) => s + r.final_fee, 0) },
        { Status: "Pending", Count: stats.pendingCount, "Total Amount (₹)": allRecords.filter(r => r.status === "pending").reduce((s, r) => s + r.final_fee, 0) },
        { Status: "Overdue", Count: stats.overdueCount, "Total Amount (₹)": allRecords.filter(r => r.status === "overdue").reduce((s, r) => s + r.final_fee, 0) },
        { Status: "", Count: 0, "Total Amount (₹)": 0 },
        { Status: "TOTAL", Count: allRecords.length, "Total Amount (₹)": stats.totalFinal },
      ];

      const wsStatus = XLSX.utils.json_to_sheet(statusSummary);
      XLSX.utils.book_append_sheet(wb, wsStatus, "Status Summary");
      wsStatus["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 22 }];

      // Sheet 4: Global Summary
      const globalSummary = [
        { Metric: "Report Generated", Value: new Date().toLocaleString("en-IN") },
        { Metric: "Total Records", Value: allRecords.length },
        { Metric: "", Value: "" },
        { Metric: "Total Original Fees (₹)", Value: stats.totalOriginal },
        { Metric: "Total Discount Given (₹)", Value: stats.totalDiscount },
        { Metric: "Total Final Fees (₹)", Value: stats.totalFinal },
        { Metric: "Total Collected (₹)", Value: stats.totalPaid },
        { Metric: "Total Pending (₹)", Value: stats.totalPending },
        { Metric: "Collection Rate", Value: `${stats.collectionRate.toFixed(1)}%` },
        { Metric: "", Value: "" },
        { Metric: `Fully Paid (${stats.paidCount})`, Value: stats.paidCount > 0 ? `${((stats.paidCount / allRecords.length) * 100).toFixed(1)}%` : "0%" },
        { Metric: `Partially Paid (${stats.partialCount})`, Value: stats.partialCount > 0 ? `${((stats.partialCount / allRecords.length) * 100).toFixed(1)}%` : "0%" },
        { Metric: `Pending (${stats.pendingCount})`, Value: stats.pendingCount > 0 ? `${((stats.pendingCount / allRecords.length) * 100).toFixed(1)}%` : "0%" },
        { Metric: `Overdue (${stats.overdueCount})`, Value: stats.overdueCount > 0 ? `${((stats.overdueCount / allRecords.length) * 100).toFixed(1)}%` : "0%" },
      ];

      const wsGlobal = XLSX.utils.json_to_sheet(globalSummary);
      XLSX.utils.book_append_sheet(wb, wsGlobal, "Global Summary");
      wsGlobal["!cols"] = [{ wch: 42 }, { wch: 22 }];

      // Download
      const dateTag = new Date().toISOString().split("T")[0];
      const filename = `Fees_Report_${dateTag}.xlsx`;
      XLSX.writeFile(wb, filename);

      toast({ title: "Report Exported", description: `${allRecords.length} records exported to ${filename} with 4 sheets.` });
    } catch (err: any) {
      console.error("Export error:", err);
      toast({ title: "Export Failed", description: err.message || "Could not export data", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  // ── Table Columns ─────────────────────────────────────────────────────────

  const batchColumns = [
    {
      key: "batch_name",
      title: "Batch",
      render: (b: BatchSummary) => (
        <div>
          <p className="text-sm font-semibold text-foreground">{b.batch_name}</p>
          <p className="text-[10px] text-muted-foreground">{b.total_students} students</p>
        </div>
      ),
    },
    {
      key: "total_final",
      title: "Total Fees",
      render: (b: BatchSummary) => <span className="text-sm font-bold tabular-nums">{formatCurrency(b.total_final)}</span>,
    },
    {
      key: "total_paid",
      title: "Collected",
      render: (b: BatchSummary) => <span className="text-sm text-green-600 tabular-nums">{formatCurrency(b.total_paid)}</span>,
    },
    {
      key: "total_pending",
      title: "Pending",
      render: (b: BatchSummary) => <span className="text-sm text-orange-600 tabular-nums">{formatCurrency(b.total_pending)}</span>,
    },
    {
      key: "collection_rate",
      title: "Rate",
      render: (b: BatchSummary) => (
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(b.collection_rate, 100)}%`,
                backgroundColor: b.collection_rate >= 70 ? "#22c55e" : b.collection_rate >= 40 ? "#eab308" : "#ef4444",
              }}
            />
          </div>
          <span className={`text-xs font-medium tabular-nums ${
            b.collection_rate >= 70 ? "text-green-600" : b.collection_rate >= 40 ? "text-amber-600" : "text-red-600"
          }`}>
            {b.collection_rate.toFixed(0)}%
          </span>
        </div>
      ),
    },
    {
      key: "status_breakdown",
      title: "Breakdown",
      render: (b: BatchSummary) => (
        <div className="flex items-center gap-1.5">
          {b.paid_count > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-medium">{b.paid_count} Paid</span>}
          {b.partial_count > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium">{b.partial_count} Partial</span>}
          {b.pending_count + b.overdue_count > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 font-medium">
              {b.pending_count + b.overdue_count} Due
            </span>
          )}
        </div>
      ),
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-9 w-48 bg-muted/50 rounded-lg animate-pulse" />
            <div className="h-4 w-64 bg-muted/30 rounded-lg animate-pulse mt-2" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-20 bg-muted/50 rounded-lg animate-pulse" />
            <div className="h-9 w-28 bg-muted/50 rounded-lg animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-lg bg-muted/50 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Fees Report</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {allRecords.length > 0
              ? `Comprehensive fee report across ${batchSummaries.length} batches · ${allRecords.length} fee records`
              : "View and export your institute's complete fee statement"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchAllFeeRecords}
            disabled={loading}
            className="h-9 gap-1.5 text-muted-foreground"
            title="Refresh data"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportReport}
            disabled={allRecords.length === 0 || exporting}
            className="h-9 gap-1.5"
            title="Export fee report to Excel with 4 sheets"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            <span className="hidden sm:inline">Export</span>
          </Button>
          <Button
            size="sm"
            onClick={exportReport}
            disabled={allRecords.length === 0 || exporting}
            className="h-9 gap-1.5"
            title="Download complete fee report as Excel"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span className="hidden sm:inline">Full Report</span>
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      {allRecords.length === 0 ? (
        <div className="text-center py-16">
          <IndianRupee className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground">No Fee Records Yet</h3>
          <p className="text-sm text-muted-foreground mt-1">Create batch fees and student fee records to generate a report.</p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              title="Total Final Fees"
              value={formatCurrency(stats.totalFinal)}
              icon={IndianRupee}
              change={`${stats.totalRecords} records across ${batchSummaries.length} batches`}
              changeType="neutral"
            />
            <StatCard
              title="Total Collected"
              value={formatCurrency(stats.totalPaid)}
              icon={BarChart3}
              change={`${stats.collectionRate.toFixed(1)}% collection rate`}
              changeType={stats.collectionRate >= 70 ? "positive" : stats.collectionRate >= 40 ? "neutral" : "negative"}
            />
            <StatCard
              title="Total Pending"
              value={formatCurrency(stats.totalPending)}
              icon={AlertCircle}
              change={`${stats.pendingCount + stats.overdueCount} unpaid of ${stats.totalRecords}`}
              changeType={stats.totalPending === 0 ? "positive" : "negative"}
            />
            <StatCard
              title="Discount Given"
              value={formatCurrency(stats.totalDiscount)}
              icon={CheckCircle}
              change={`${stats.totalDiscount > 0 ? ((stats.totalDiscount / stats.totalOriginal) * 100).toFixed(1) + "% of original" : "No discounts"}`}
              changeType={stats.totalDiscount > 0 ? "positive" : "neutral"}
            />
          </div>

          {/* Status Breakdown */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-green-200/50 dark:border-green-800/30 bg-gradient-to-br from-green-50/50 to-transparent dark:from-green-950/10">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-xs font-medium text-green-600 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Fully Paid
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2 px-4">
                <p className="text-2xl font-bold">{stats.paidCount}</p>
                <p className="text-[10px] text-muted-foreground">
                  {stats.totalRecords > 0 ? `${((stats.paidCount / stats.totalRecords) * 100).toFixed(1)}% of records` : "0%"}
                </p>
              </CardContent>
            </Card>
            <Card className="border-blue-200/50 dark:border-blue-800/30 bg-gradient-to-br from-blue-50/50 to-transparent dark:from-blue-950/10">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-xs font-medium text-blue-600 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Partial
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2 px-4">
                <p className="text-2xl font-bold">{stats.partialCount}</p>
                <p className="text-[10px] text-muted-foreground">
                  {stats.totalRecords > 0 ? `${((stats.partialCount / stats.totalRecords) * 100).toFixed(1)}%` : "0%"}
                </p>
              </CardContent>
            </Card>
            <Card className="border-amber-200/50 dark:border-amber-800/30 bg-gradient-to-br from-amber-50/50 to-transparent dark:from-amber-950/10">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-xs font-medium text-amber-600 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Pending
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2 px-4">
                <p className="text-2xl font-bold">{stats.pendingCount}</p>
                <p className="text-[10px] text-muted-foreground">
                  {stats.totalRecords > 0 ? `${((stats.pendingCount / stats.totalRecords) * 100).toFixed(1)}%` : "0%"}
                </p>
              </CardContent>
            </Card>
            <Card className="border-red-200/50 dark:border-red-800/30 bg-gradient-to-br from-red-50/50 to-transparent dark:from-red-950/10">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-xs font-medium text-red-600 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Overdue
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2 px-4">
                <p className="text-2xl font-bold">{stats.overdueCount}</p>
                <p className="text-[10px] text-muted-foreground">
                  {stats.totalRecords > 0 ? `${((stats.overdueCount / stats.totalRecords) * 100).toFixed(1)}%` : "0%"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Batch-wise Summary */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                Batch-wise Fee Summary
              </h3>
              <p className="text-xs text-muted-foreground">
                {batchSummaries.length} batch{batchSummaries.length !== 1 ? "es" : ""}
              </p>
            </div>
            <DataTable
              columns={batchColumns}
              data={batchSummaries}
              emptyMessage="No batch data available"
            />
          </div>

          {/* Record Count Footer */}
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
            <p>
              {formatCurrency(stats.totalPaid)} collected of {formatCurrency(stats.totalFinal)} total
              {" · "}
              {stats.collectionRate.toFixed(1)}% collection rate
            </p>
            <p>
              Report generated {new Date().toLocaleString("en-IN")}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
