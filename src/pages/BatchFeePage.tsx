import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus, Pencil, Trash2, IndianRupee, Users } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import { useBatches, useBatchFees, useBatchFeeOperations, type BatchFee, formatCurrency } from "@/hooks/useFees";

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
          <p className="text-[10px] text-muted-foreground">students enrolled</p>
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
    }, 1); // currentPage not needed here, but pass 1 as placeholder
    setEditBatchFeeOpen(false);
    setBatchFeeForm({ id: "", batchId: "", title: "", totalFees: "", description: "", dueDate: "" });
  };

  const handleDeleteSubmit = async () => {
    if (!selectedBatchFee) return;
    await deleteBatchFee(selectedBatchFee.id);
    setDeleteConfirmOpen(false);
    setSelectedBatchFee(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Batch Fees</h1>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/fees/student")}
          >
            <Users className="w-3 h-3 mr-1" />
            View Student Fees
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
              placeholder="Search batches..."
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
              emptyMessage="No batch fees found."
            />
          )}
        </div>
      </div>

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
                <p className="text-xs text-muted-foreground mt-1">Note: Batch cannot be changed when editing</p>
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
