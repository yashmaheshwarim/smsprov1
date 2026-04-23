import { useState, useMemo, useEffect } from "react";
import { Search, Download, Send, IndianRupee, AlertCircle, CheckCircle, Plus, Loader2 } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { supabase, isUuid } from "@/lib/supabase";
import { useAuth, AdminUser } from "@/contexts/AuthContext";

interface FeeRecord {
  id: string;
  student_id: string;
  total_fees: number;
  paid_fees: number;
  pending_fees: number;
  status: "paid" | "pending" | "partial" | "overdue";
  due_date: string;
  last_payment_date?: string;
  student_name?: string;
  enrollment_no?: string;
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
  const [feeRecords, setFeeRecords] = useState<FeeRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [selectedFeeRecord, setSelectedFeeRecord] = useState<FeeRecord | null>(null);
  const [form, setForm] = useState({ studentId: "", studentName: "", enrollmentNo: "", totalFees: "", paidFees: "", dueDate: "" });
  const [updateForm, setUpdateForm] = useState({ additionalPayment: "" });
  const [lookupLoading, setLookupLoading] = useState(false);

  useEffect(() => {
    if (isUuid(instId)) {
      fetchData();
    }
  }, [instId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("fees")
        .select(`
          *,
          students (
            name,
            enrollment_no
          )
        `)
        .eq("institute_id", instId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const formatted: FeeRecord[] = (data || []).map((fee: any) => ({
        id: fee.id,
        student_id: fee.student_id,
        total_fees: Number(fee.total_fees),
        paid_fees: Number(fee.paid_fees),
        pending_fees: Number(fee.pending_fees),
        status: fee.status,
        due_date: fee.due_date,
        last_payment_date: fee.last_payment_date,
        student_name: fee.students?.name,
        enrollment_no: fee.students?.enrollment_no,
      }));

      setFeeRecords(formatted);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    return feeRecords.filter((fee) => {
      const matchSearch = (fee.student_name || "").toLowerCase().includes(search.toLowerCase()) ||
        fee.id.toLowerCase().includes(search.toLowerCase()) ||
        (fee.enrollment_no || "").toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || fee.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [search, statusFilter, feeRecords]);

  const stats = useMemo(() => {
    const total = feeRecords.reduce((s, f) => s + f.total_fees, 0);
    const collected = feeRecords.reduce((s, f) => s + f.paid_fees, 0);
    const pending = feeRecords.reduce((s, f) => s + f.pending_fees, 0);
    const overdue = feeRecords.filter(f => f.status === "overdue").length;
    return { total, collected, pending, overdue };
  }, [feeRecords]);

  const handleAddEntry = async () => {
    if (!form.studentId || !form.totalFees || !form.dueDate) {
      toast({ title: "Error", description: "Please select a student and fill all required fields.", variant: "destructive" });
      return;
    }

    const totalFees = parseFloat(form.totalFees);
    const paidFees = form.paidFees ? parseFloat(form.paidFees) : 0;
    const pendingFees = totalFees - paidFees;

    // Determine status based on payment
    let status: FeeRecord['status'] = 'pending';
    if (paidFees === 0) {
      status = 'pending';
    } else if (paidFees >= totalFees) {
      status = 'paid';
    } else {
      status = 'partial';
    }

    try {
      const { data, error } = await supabase
        .from("fees")
        .insert([{
          institute_id: instId,
          student_id: form.studentId,
          total_fees: totalFees,
          paid_fees: paidFees,
          pending_fees: pendingFees,
          due_date: form.dueDate,
          status: status,
          last_payment_date: paidFees > 0 ? new Date().toISOString() : null,
        }])
        .select(`
          *,
          students (
            name,
            enrollment_no
          )
        `)
        .single();

      if (error) throw error;

      const newFeeRecord: FeeRecord = {
        id: data.id,
        student_id: data.student_id,
        total_fees: Number(data.total_fees),
        paid_fees: Number(data.paid_fees),
        pending_fees: Number(data.pending_fees),
        status: data.status,
        due_date: data.due_date,
        last_payment_date: data.last_payment_date,
        student_name: data.students?.name,
        enrollment_no: data.students?.enrollment_no,
      };

      setFeeRecords(prev => [newFeeRecord, ...prev]);
      setAddOpen(false);
      setForm({ studentId: "", studentName: "", enrollmentNo: "", totalFees: "", paidFees: "", dueDate: "" });
      toast({ title: "Fee Record Created", description: `Fee record for ${newFeeRecord.student_name} saved successfully.` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleLookup = async (val: string) => {
    setForm(p => ({ ...p, enrollmentNo: val }));
    if (val.length < 3) return;

    setLookupLoading(true);
    const { data } = await supabase
      .from("students")
      .select("id, name, enrollment_no")
      .eq("institute_id", instId)
      .ilike("name", `%${val}%`)
      .limit(1)
      .single();

    if (data) {
      setForm(p => ({ ...p, studentId: data.id, studentName: data.name, enrollmentNo: data.enrollment_no }));
    }
    setLookupLoading(false);
  };

  const handleUpdateFeeRecord = (feeRecord: FeeRecord) => {
    setSelectedFeeRecord(feeRecord);
    setUpdateForm({ additionalPayment: "" });
    setUpdateOpen(true);
  };

  const handleSavePaymentUpdate = async () => {
    if (!selectedFeeRecord || !updateForm.additionalPayment) {
      toast({ title: "Error", description: "Please enter a payment amount.", variant: "destructive" });
      return;
    }

    const additionalPayment = parseFloat(updateForm.additionalPayment);
    if (additionalPayment <= 0) {
      toast({ title: "Error", description: "Payment amount must be greater than 0.", variant: "destructive" });
      return;
    }

    const newPaidFees = selectedFeeRecord.paid_fees + additionalPayment;
    const newPendingFees = Math.max(0, selectedFeeRecord.total_fees - newPaidFees);

    let newStatus: FeeRecord['status'] = 'partial';
    if (newPaidFees >= selectedFeeRecord.total_fees) {
      newStatus = 'paid';
    } else if (newPaidFees > 0) {
      newStatus = 'partial';
    } else {
      newStatus = 'pending';
    }

    try {
      const { data, error } = await supabase
        .from("fees")
        .update({
          paid_fees: newPaidFees,
          pending_fees: newPendingFees,
          status: newStatus,
          last_payment_date: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedFeeRecord.id)
        .select(`
          *,
          students (
            name,
            enrollment_no
          )
        `)
        .single();

      if (error) throw error;

      const updatedRecord: FeeRecord = {
        id: data.id,
        student_id: data.student_id,
        total_fees: Number(data.total_fees),
        paid_fees: Number(data.paid_fees),
        pending_fees: Number(data.pending_fees),
        status: data.status,
        due_date: data.due_date,
        last_payment_date: data.last_payment_date,
        student_name: data.students?.name,
        enrollment_no: data.students?.enrollment_no,
      };

      setFeeRecords(prev => prev.map(f => f.id === updatedRecord.id ? updatedRecord : f));
      setUpdateOpen(false);
      setSelectedFeeRecord(null);
      setUpdateForm({ additionalPayment: "" });
      toast({ title: "Payment Updated", description: `Payment of ₹${additionalPayment} added successfully.` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };



  const columns = [
    {
      key: "id",
      title: "Record ID",
      render: (fee: FeeRecord) => <span className="text-xs font-mono text-muted-foreground">{fee.id.substring(0, 8)}...</span>,
    },
    {
      key: "student_name",
      title: "Student",
      render: (fee: FeeRecord) => (
        <div>
          <p className="text-sm font-semibold text-foreground">{fee.student_name}</p>
          <p className="text-[10px] text-muted-foreground uppercase font-medium">{fee.enrollment_no}</p>
        </div>
      ),
    },
    {
      key: "total_fees",
      title: "Total Fees",
      render: (fee: FeeRecord) => <span className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(fee.total_fees)}</span>,
    },
    {
      key: "paid_fees",
      title: "Paid Fees",
      render: (fee: FeeRecord) => <span className="text-sm text-green-600 tabular-nums">{formatCurrency(fee.paid_fees)}</span>,
    },
    {
      key: "pending_fees",
      title: "Pending Fees",
      render: (fee: FeeRecord) => <span className="text-sm text-orange-600 tabular-nums">{formatCurrency(fee.pending_fees)}</span>,
    },
    {
      key: "due_date",
      title: "Due Date",
      hideOnMobile: true,
      render: (fee: FeeRecord) => <span className="text-xs text-muted-foreground tabular-nums">{fee.due_date}</span>,
    },
    {
      key: "status",
      title: "Status",
      render: (fee: FeeRecord) => {
        const v = fee.status === "paid" ? "success" : fee.status === "pending" ? "warning" : fee.status === "partial" ? "info" : fee.status === "overdue" ? "destructive" : "default";
        return <StatusBadge variant={v}>{fee.status}</StatusBadge>;
      },
    },
    {
      key: "actions",
      title: "",
      render: (fee: FeeRecord) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => handleUpdateFeeRecord(fee)}
          className="h-7 text-xs"
          disabled={fee.status === "paid"}
        >
          Add Payment
        </Button>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Total Fees" value={formatCurrency(stats.total)} icon={IndianRupee} />
        <StatCard title="Paid Fees" value={formatCurrency(stats.collected)} icon={CheckCircle} changeType="positive" />
        <StatCard title="Pending Fees" value={formatCurrency(stats.pending)} icon={AlertCircle} changeType="neutral" />
        <StatCard title="Overdue Records" value={stats.overdue.toString()} icon={AlertCircle} changeType="negative" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-card border border-border flex-1 sm:w-64 shadow-sm">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input type="text" placeholder="Search fee records..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent text-sm text-foreground outline-none w-full" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-md bg-card border border-border text-xs font-medium text-foreground outline-none">
              <option value="all">All Status</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="partial">Partial</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchData} className="h-9">Refresh</Button>
            <Button size="sm" onClick={() => setAddOpen(true)} className="h-9 shadow-md">
              <Plus className="w-4 h-4 mr-1" /> Add Fee Record
            </Button>
          </div>
      </div>

      <DataTable data={filtered} columns={columns} />

      {/* Add Fee Record Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Fee Record</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Search Student (Name)</label>
              <div className="relative">
                <Input
                  value={form.enrollmentNo}
                  onChange={e => handleLookup(e.target.value)}
                  placeholder="Type student name to search..."
                />
                {lookupLoading && <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-3 text-muted-foreground" />}
              </div>
              {form.studentName && (
                <p className="text-xs text-success font-medium flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Found: {form.studentName}
                </p>
              )}
            </div>

            {/* Existing Fee Records */}
            {form.studentId && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Existing Fee Records</h4>
                {feeRecords.filter(f => f.student_id === form.studentId).length > 0 ? (
                  <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-2">
                    {feeRecords.filter(f => f.student_id === form.studentId).map(fee => (
                      <div key={fee.id} className="flex items-center justify-between p-2 bg-secondary/50 rounded text-sm">
                        <div>
                          <p className="font-medium">₹{formatCurrency(fee.total_fees)} Total</p>
                          <p className="text-xs text-muted-foreground">
                            Paid: ₹{formatCurrency(fee.paid_fees)} | Pending: ₹{formatCurrency(fee.pending_fees)}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUpdateFeeRecord(fee)}
                            className="h-7 text-xs"
                          >
                            Add Payment
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No existing fee records for this student.</p>
                )}
              </div>
            )}

            {/* New Fee Record Form */}
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3">Create New Fee Record</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Total Fees (₹)</label>
                  <Input type="number" value={form.totalFees} onChange={e => setForm(p => ({ ...p, totalFees: e.target.value }))} placeholder="0.00" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Paid Fees (₹)</label>
                  <Input type="number" value={form.paidFees} onChange={e => setForm(p => ({ ...p, paidFees: e.target.value }))} placeholder="0.00" />
                </div>
              </div>
              <div className="space-y-2 mt-4">
                <label className="text-sm font-medium">Due Date</label>
                <Input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddEntry} disabled={!form.totalFees || !form.dueDate}>Save Fee Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Payment Dialog */}
      <Dialog open={updateOpen} onOpenChange={setUpdateOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Add Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedFeeRecord && (
              <div className="space-y-2">
                <div className="p-3 bg-secondary/50 rounded-md">
                  <p className="text-sm font-medium">{selectedFeeRecord.student_name}</p>
                  <p className="text-xs text-muted-foreground">Total: ₹{formatCurrency(selectedFeeRecord.total_fees)}</p>
                  <p className="text-xs text-muted-foreground">Paid: ₹{formatCurrency(selectedFeeRecord.paid_fees)} | Pending: ₹{formatCurrency(selectedFeeRecord.pending_fees)}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Additional Payment Amount (₹)</label>
                  <Input
                    type="number"
                    value={updateForm.additionalPayment}
                    onChange={e => setUpdateForm({ additionalPayment: e.target.value })}
                    placeholder="Enter payment amount"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateOpen(false)}>Cancel</Button>
            <Button onClick={handleSavePaymentUpdate}>Add Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
