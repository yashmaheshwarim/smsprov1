import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus, Pencil, Trash2, IndianRupee, Users, Eye, RefreshCw, List, Table2 } from "lucide-react";
import * as XLSX from "xlsx";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import { useBatches, useBatchFees, useBatchFeeOperations, type BatchFee, formatCurrency } from "@/hooks/useFees";
import { supabase, isUuid } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

export default function BatchFeePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const DEFAULT_UID = "00000000-0000-0000-0000-000000000001";
  const instId = isAdmin ? (user as AdminUser).instituteId : DEFAULT_UID;
  const navigate = useNavigate();

  // State
  const [search, setSearch] = useState("");
  const [addBatchFeeOpen, setAddBatchFeeOpen] = useState(false);
  const [editBatchFeeOpen, setEditBatchFeeOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedBatchFee, setSelectedBatchFee] = useState<BatchFee | null>(null);
  const [batchFeeForm, setBatchFeeForm] = useState({
    id: "",
    batchId: "",
    title: "",
    totalFees: "",
    description: "",
    dueDate: "",
  });

  // Student view dialog
  const [viewStudentsOpen, setViewStudentsOpen] = useState(false);
  const [viewBatchFee, setViewBatchFee] = useState<BatchFee | null>(null);
  const [viewStudents, setViewStudents] = useState<any[]>([]);
  const [loadingViewStudents, setLoadingViewStudents] = useState(false);
  const [applyingFee, setApplyingFee] = useState(false);

  // Hooks
  const { batches } = useBatches(instId);
  const { batchFees, loading: batchFeesLoading, fetchBatchFees } = useBatchFees(instId);
  const { creating, deleting, createBatchFee, updateBatchFee, deleteBatchFee } = useBatchFeeOperations(instId, fetchBatchFees);

  // Filtered data
  const filteredBatchFees = useMemo(() => {
    return batchFees.filter((fee) => {
      const matchSearch = fee.title.toLowerCase().includes(search.toLowerCase()) ||
        fee.batch_name.toLowerCase().includes(search.toLowerCase()) ||
        fee.id.toLowerCase().includes(search.toLowerCase());
      return matchSearch;
    });
  }, [search, batchFees]);

  // View students for a batch fee
  const openViewStudents = async (fee: BatchFee) => {
    setViewBatchFee(fee);
    setViewStudentsOpen(true);
    setLoadingViewStudents(true);
    try {
      // Get all students in this batch
      const { data: batchStudents, error: studentsError } = await supabase
        .from("students")
        .select("id, name, enrollment_no, batch_id, created_at")
        .eq("institute_id", instId)
        .eq("batch_id", fee.batch_id)
        .eq("status", "active")
        .order("name", { ascending: true });

      if (studentsError) throw studentsError;

      // Get student_fee records for this batch fee
      const studentIds = (batchStudents || []).map((s: any) => s.id);
      const { data: studentFeesData } = await supabase
        .from("student_fees")
        .select("student_id, paid_fees, status, original_fee, final_fee, discount_amount")
        .eq("batch_fee_id", fee.id)
        .in("student_id", studentIds);

      const feeMap: Record<string, any> = {};
      (studentFeesData || []).forEach((sf: any) => {
        feeMap[sf.student_id] = sf;
      });

      const enriched = (batchStudents || []).map((s: any) => ({
        ...s,
        hasFee: !!feeMap[s.id],
        paid_fees: feeMap[s.id]?.paid_fees || 0,
        status: feeMap[s.id]?.status || "no_record",
        original_fee: feeMap[s.id]?.original_fee || fee.total_fees,
        final_fee: feeMap[s.id]?.final_fee || fee.total_fees,
        discount_amount: feeMap[s.id]?.discount_amount || 0,
      }));

      setViewStudents(enriched);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setViewStudents([]);
    } finally {
      setLoadingViewStudents(false);
    }
  };

  // Apply/re-apply fee to all students in the batch
  const handleApplyFeeToStudents = async () => {
    if (!viewBatchFee || !instId) return;
    setApplyingFee(true);
    try {
      const studentIds = viewStudents.map((s: any) => s.id);

      // Delete existing fee records for these students + this batch fee
      await supabase
        .from("student_fees")
        .delete()
        .eq("batch_fee_id", viewBatchFee.id)
        .in("student_id", studentIds);

      // Create new fee records
      const records = viewStudents.map((s: any) => ({
        institute_id: instId,
        batch_fee_id: viewBatchFee.id,
        student_id: s.id,
        original_fee: viewBatchFee.total_fees,
        final_fee: viewBatchFee.total_fees,
        paid_fees: 0,
        discount_amount: 0,
        status: "pending" as const,
      }));

      const { error } = await supabase
        .from("student_fees")
        .insert(records);

      if (error) throw error;

      await fetchBatchFees();
      // Refresh the student view
      await openViewStudents(viewBatchFee);
      toast({ title: "Fee Applied", description: `Fee structure applied to ${viewStudents.length} students.` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setApplyingFee(false);
    }
  };

  // Batch columns
  const batchColumns = [
    {
      key: "title",
      title: "Fee Title",
      render: (fee: BatchFee) => (
        <p className="text-sm font-semibold text-foreground">{fee.title}</p>
      ),
    },
    {
      key: "batch_name",
      title: "Batch",
      render: (fee: BatchFee) => (
        <span className="text-sm text-muted-foreground">{fee.batch_name}</span>
      ),
    },
    {
      key: "total_fees",
      title: "Total Fee",
      render: (fee: BatchFee) => (
        <span className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(fee.total_fees)}</span>
      ),
    },
    {
      key: "student_count",
      title: "Students",
      render: (fee: BatchFee) => (
        <div>
          <span className="text-sm tabular-nums">{fee.student_count}</span>
          <p className="text-[10px] text-muted-foreground">enrolled</p>
        </div>
      ),
    },
    {
      key: "due_date",
      title: "Due Date",
      render: (fee: BatchFee) => (
        <span className="text-xs text-muted-foreground tabular-nums">{fee.due_date || "Not set"}</span>
      ),
    },
    {
      key: "created_at",
      title: "Created",
      render: (fee: BatchFee) => (
        <span className="text-xs text-muted-foreground">{new Date(fee.created_at).toLocaleDateString()}</span>
      ),
    },
    {
      key: "actions",
      title: "",
      render: (fee: BatchFee) => (
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => openViewStudents(fee)}
            className="h-7 text-xs"
          >
            <Eye className="w-3 h-3 mr-1" />
            Students
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSelectedBatchFee(fee);
              setBatchFeeForm({
                id: fee.id,
                batchId: fee.batch_id,
                title: fee.title,
                totalFees: fee.total_fees.toString(),
                description: fee.description || "",
                dueDate: fee.due_date || "",
              });
              setEditBatchFeeOpen(true);
            }}
            className="h-7 text-xs"
          >
            <Pencil className="w-3 h-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSelectedBatchFee(fee);
              setDeleteConfirmOpen(true);
            }}
            className="h-7 text-xs text-red-600"
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      ),
    },
  ];

  const handleCreateSubmit = async () => {
    await createBatchFee({
      batchId: batchFeeForm.batchId,
      title: batchFeeForm.title,
      totalFees: batchFeeForm.totalFees,
      description: batchFeeForm.description,
      dueDate: batchFeeForm.dueDate,
    });
    setAddBatchFeeOpen(false);
    setBatchFeeForm({ id: "", batchId: "", title: "", totalFees: "", description: "", dueDate: "" });
  };

  const handleUpdateSubmit = async () => {
    await updateBatchFee({
      id: batchFeeForm.id,
      title: batchFeeForm.title,
      totalFees: batchFeeForm.totalFees,
      description: batchFeeForm.description,
      dueDate: batchFeeForm.dueDate,
    }, 1);
    setEditBatchFeeOpen(false);
    setBatchFeeForm({ id: "", batchId: "", title: "", totalFees: "", description: "", dueDate: "" });
  };

  const handleDeleteSubmit = async () => {
    if (!selectedBatchFee) return;
    await deleteBatchFee(selectedBatchFee.id);
    setDeleteConfirmOpen(false);
    setSelectedBatchFee(null);
  };

  // ── Excel Export ───────────────────────────────────────────────────────────
  const exportBatchFeesReport = useCallback(async () => {
    try {
      if (!instId || !isUuid(instId)) return;

      // Fetch ALL batch fees with enriched data
      const { data: fees, error } = await supabase
        .from("batch_fees")
        .select("*")
        .eq("institute_id", instId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!fees || fees.length === 0) {
        toast({ title: "No Data", description: "No batch fees to export.", variant: "default" });
        return;
      }

      // Enrich with batch names and student counts
      const batchIds = [...new Set(fees.map((f: any) => f.batch_id).filter(Boolean))];
      const { data: batchData } = await supabase
        .from("batches")
        .select("id, name")
        .in("id", batchIds);
      const batchNameMap = new Map((batchData || []).map((b: any) => [b.id, b.name]));

      const wb = XLSX.utils.book_new();

      // Sheet 1: Batch Fees Summary
      const rows = fees.map((fee: any, i: number) => ({
        "#": i + 1,
        "Fee Title": fee.title,
        "Batch": batchNameMap.get(fee.batch_id) || "Unknown",
        "Total Fee": Number(fee.total_fees || 0),
        "Due Date": fee.due_date || "Not set",
        "Description": fee.description || "",
        "Status": fee.status || "active",
        "Created": new Date(fee.created_at).toLocaleDateString("en-IN"),
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "Batch Fees");
      const colWidths = Object.keys(rows[0] || {}).map((key) => ({
        wch: Math.max(key.length, ...rows.map((r: any) => String(r[key] || "").length)) + 2,
      }));
      ws["!cols"] = colWidths;

      // Sheet 2: Summary & Stats
      const totalFees = fees.reduce((s: number, f: any) => s + Number(f.total_fees || 0), 0);
      const summaryData = [
        { "Metric": "Total Batch Fees Created", "Value": fees.length },
        { "Metric": "Total Fee Amount (All Batches)", "Value": totalFees },
        { "Metric": "Average Fee Per Batch", "Value": fees.length > 0 ? Math.round(totalFees / fees.length) : 0 },
        { "Metric": "", "Value": "" },
        { "Metric": "Exported At", "Value": new Date().toLocaleString("en-IN") },
      ];
      const wsSummary = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");
      const summaryKeys = Object.keys(summaryData[0] || {});
      wsSummary["!cols"] = summaryKeys.map((key) => ({
        wch: Math.max(key.length, ...summaryData.map((r: any) => String(r[key] || "").length)) + 3,
      }));

      const filename = `Batch_Fees_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(wb, filename);
      toast({
        title: "Batch Fees Exported",
        description: `${fees.length} batch fee records exported to ${filename}`,
      });
    } catch (err: any) {
      console.error("Export error:", err);
      toast({ title: "Export Failed", description: err.message || "Could not export data", variant: "destructive" });
    }
  }, [instId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Batch Fees</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportBatchFeesReport}
            disabled={batchFees.length === 0}
            className="h-8 gap-1.5"
            title="Export All Batch Fees to Excel"
          >
            <Table2 className="w-4 h-4" />
            <span>Excel</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/fees/batch-applied")}
          >
            <List className="w-3 h-3 mr-1" />
            Batch Applied
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/fees/student")}
          >
            <Users className="w-3 h-3 mr-1" />
            Student Fees
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setBatchFeeForm({ id: "", batchId: "", title: "", totalFees: "", description: "", dueDate: "" });
              setAddBatchFeeOpen(true);
            }}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Batch Fee
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="rounded-lg border bg-card">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search batch fees..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Data Table */}
        <div className="flex-1 overflow-auto">
          {batchFeesLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
          ) : (
            <DataTable
              columns={batchColumns}
              data={filteredBatchFees}
              emptyMessage="No batch fees found. Create one to get started."
            />
          )}
        </div>
      </div>

      {/* View Students Dialog */}
      <Dialog open={viewStudentsOpen} onOpenChange={(open) => { if (!open) { setViewStudentsOpen(false); setViewBatchFee(null); } }}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {viewBatchFee ? (
                <div className="flex items-center justify-between">
                  <span>{viewBatchFee.title} — {viewBatchFee.batch_name}</span>
                  <span className="text-sm font-normal text-muted-foreground">{formatCurrency(viewBatchFee.total_fees)} per student</span>
                </div>
              ) : "Students"}
            </DialogTitle>
          </DialogHeader>

          {loadingViewStudents ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Loading students...</div>
          ) : (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-secondary/30 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{viewStudents.length}</p>
                  <p className="text-xs text-muted-foreground">Total Students</p>
                </div>
                <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">{viewStudents.filter(s => s.hasFee).length}</p>
                  <p className="text-xs text-muted-foreground">Fee Applied</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-amber-600">{viewStudents.filter(s => !s.hasFee).length}</p>
                  <p className="text-xs text-muted-foreground">Not Applied</p>
                </div>
              </div>

              {/* Apply Button */}
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={handleApplyFeeToStudents}
                  disabled={applyingFee || viewStudents.length === 0}
                >
                  {applyingFee ? (
                    <span className="animate-spin mr-1">⏳</span>
                  ) : (
                    <RefreshCw className="w-3 h-3 mr-1" />
                  )}
                  Apply / Re-apply Fee to All Students
                </Button>
              </div>

              {/* Student List */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-secondary/50">
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Student</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Enrollment</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Fee</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Paid</th>
                      <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewStudents.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-6 text-muted-foreground text-sm">
                          No students found in this batch.
                        </td>
                      </tr>
                    ) : (
                      viewStudents.map((student: any) => (
                        <tr key={student.id} className="border-b border-border/50 hover:bg-secondary/20">
                          <td className="px-3 py-2">
                            <p className="text-sm font-medium">{student.name}</p>
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {student.enrollment_no}
                          </td>
                          <td className="px-3 py-2 text-right text-sm tabular-nums">
                            {student.hasFee ? formatCurrency(Number(student.final_fee)) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right text-sm text-green-600 tabular-nums">
                            {student.hasFee ? formatCurrency(Number(student.paid_fees)) : "—"}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {student.hasFee ? (
                              <StatusBadge
                                variant={
                                  student.status === "paid" ? "success" :
                                  student.status === "partial" ? "info" :
                                  student.status === "overdue" ? "destructive" : "warning"
                                }
                              >
                                {student.status}
                              </StatusBadge>
                            ) : (
                              <span className="text-xs text-muted-foreground">Not applied</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setViewStudentsOpen(false); setViewBatchFee(null); }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Batch Fee Dialog */}
      <Dialog
        open={addBatchFeeOpen || editBatchFeeOpen}
        onOpenChange={(open) => {
          if (!open) {
            setAddBatchFeeOpen(false);
            setEditBatchFeeOpen(false);
            setBatchFeeForm({ id: "", batchId: "", title: "", totalFees: "", description: "", dueDate: "" });
          }
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editBatchFeeOpen ? "Edit Batch Fee" : "Add Batch Fee"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Batch</label>
              <Select
                value={batchFeeForm.batchId}
                onValueChange={(value) => setBatchFeeForm({ ...batchFeeForm, batchId: value })}
                disabled={editBatchFeeOpen}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select batch" />
                </SelectTrigger>
                <SelectContent>
                  {batches.map((batch) => (
                    <SelectItem key={batch.id} value={batch.id}>
                      {batch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editBatchFeeOpen && (
                <p className="text-xs text-muted-foreground mt-1">Batch cannot be changed when editing</p>
              )}
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Fee Title</label>
              <Input
                placeholder="Enter fee title (e.g., Tuition Fee 2026)"
                value={batchFeeForm.title}
                onChange={(e) => setBatchFeeForm({ ...batchFeeForm, title: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Total Fees (Original Fee for Students)</label>
              <Input
                type="number"
                placeholder="Enter total fee amount (e.g., 5000)"
                value={batchFeeForm.totalFees}
                onChange={(e) => setBatchFeeForm({ ...batchFeeForm, totalFees: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                This amount becomes the "Original Fee" for each student in the batch
              </p>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Description</label>
              <Input
                placeholder="Enter description (optional)"
                value={batchFeeForm.description}
                onChange={(e) => setBatchFeeForm({ ...batchFeeForm, description: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Due Date</label>
              <Input
                type="date"
                value={batchFeeForm.dueDate}
                onChange={(e) => setBatchFeeForm({ ...batchFeeForm, dueDate: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={editBatchFeeOpen ? handleUpdateSubmit : handleCreateSubmit}
              disabled={creating}
            >
              {creating ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin">⏳</span>
                  Processing...
                </span>
              ) : (
                editBatchFeeOpen ? "Update Batch Fee" : "Create Batch Fee"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete Batch Fee</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this batch fee? All associated student fees will also be deleted. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSubmit}
              disabled={deleting}
            >
              {deleting ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin">⏳</span>
                  Deleting...
                </span>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}