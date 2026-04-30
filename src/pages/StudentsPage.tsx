import { useState, useMemo } from "react";
import { Search, Plus, Filter, Download, MessageCircle } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { getStoredStudents, setStoredStudents, type Student } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

import { Link } from "react-router-dom";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import { supabase, isUuid } from "@/lib/supabase";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { DataImportDialog } from "@/components/shared/DataImportDialog";
import * as XLSX from 'xlsx';



export default function StudentsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const DEFAULT_UUID = "00000000-0000-0000-0000-000000000001";
  const instId = isAdmin ? (user as AdminUser).instituteId : DEFAULT_UUID;
  
  const [students, setStudents] = useState<Student[]>([]);
  const [dbBatches, setDbBatches] = useState<{id: string, name: string}[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [addOpen, setAddOpen] = useState(false);
  const [editBatchOpen, setEditBatchOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [form, setForm] = useState({ name: "", motherPhone: "", fatherPhone: "", studentPhone: "", email: "", batchId: "" });
  const [batchForm, setBatchForm] = useState({ batchId: "" });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const perPage = 15;

  useEffect(() => {
    if (isUuid(instId)) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [instId]);

  const fetchData = async () => {
    setLoading(true);
    
    // 1. Fetch Batches
    const { data: bData, error: bErr } = await supabase
      .from('batches')
      .select('id, name')
      .eq('institute_id', instId);
    
    if (bErr) {
      toast({ title: "Error fetching batches", description: bErr.message, variant: "destructive" });
    } else {
      setDbBatches(bData || []);
    }

    // 2. Fetch Students
    const { data: sData, error: sErr } = await supabase
      .from('students')
      .select('*')
      .eq('institute_id', instId)
      .order('created_at', { ascending: false });

    if (sErr) {
      toast({ title: "Error fetching students", description: sErr.message, variant: "destructive" });
    } else {
      setStudents((sData || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        enrollmentNo: s.enrollment_no,
        grn: s.grn_no || "",
        batch: s.batch_name,
        email: s.email,
        phone: s.student_phone || s.phone || "",
        motherPhone: s.mother_phone || "",
        fatherPhone: s.father_phone || "",
        studentPhone: s.student_phone || "",
        status: s.status,
        feeStatus: 'paid', // Derived from invoices in a full version
        parentName: s.guardian_name,
        joinDate: s.join_date,
      })));
    }
    
    setLoading(false);
  };

  const allBatches = useMemo(() => {
    const list = dbBatches.map(b => b.name);
    // Include batches from students even if they aren't in the batches table (fallback)
    const studentBatches = students.map(s => s.batch);
    return Array.from(new Set([...list, ...studentBatches])).filter(Boolean);
  }, [dbBatches, students]);

  const handleExportToExcel = () => {
    if (filtered.length === 0) {
      toast({ title: "No data", description: "No students to export.", variant: "destructive" });
      return;
    }

    // Prepare data for Excel
    const exportData = filtered.map(student => ({
      'Name': student.name,
      'Enrollment No': student.enrollmentNo,
      'GRN': student.grn,
      'Batch': student.batch,
      'Email': student.email,
      'Student Phone': student.studentPhone || student.phone || "",
      'Mother Phone': student.motherPhone || "",
      'Father Phone': student.fatherPhone || "",
      'Status': student.status,
      'Fee Status': student.feeStatus,
      'Join Date': student.joinDate,
    }));

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Set column widths
    const columnWidths = [
      { wch: 20 }, // Name
      { wch: 15 }, // Enrollment No
      { wch: 12 }, // GRN
      { wch: 20 }, // Batch
      { wch: 25 }, // Email
      { wch: 15 }, // Student Phone
      { wch: 15 }, // Mother Phone
      { wch: 15 }, // Father Phone
      { wch: 10 }, // Status
      { wch: 12 }, // Fee Status
      { wch: 12 }, // Join Date
    ];
    ws['!cols'] = columnWidths;

    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    
    // Export file
    const fileName = `students_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    toast({ title: "Success", description: `Exported ${filtered.length} students to Excel.` });
  };

  const filtered = useMemo(() => {
    return students.filter((s) => {
      const name = s.name || "";
      const enrollment = s.enrollmentNo || "";
      const matchSearch = name.toLowerCase().includes(search.toLowerCase()) ||
        enrollment.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || s.status === statusFilter;
      const matchBatch = batchFilter === "all" || s.batch === batchFilter;
      return matchSearch && matchStatus && matchBatch;
    });
  }, [students, search, statusFilter, batchFilter]);

  const paginated = filtered.slice((page - 1) * perPage, page * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);

  const columns = [
    {
      key: "name",
      title: "Student",
      render: (s: Student) => (
        <Link to={`/students/${s.id}`} className="flex items-center gap-3 group">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-semibold text-primary">
              {(s.name || "S").split(" ").filter(Boolean).map((n) => n[0]).join("")}
            </span>
          </div>

          <div>
            <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{s.name}</p>
            <p className="text-xs text-muted-foreground">{s.enrollmentNo}</p>
          </div>
        </Link>
      ),
    },
    { key: "batch", title: "Batch", hideOnMobile: true, render: (s: Student) => <span className="text-sm text-foreground">{s.batch}</span> },
    { key: "phone", title: "Phone", hideOnMobile: true, render: (s: Student) => <span className="text-sm text-muted-foreground tabular-nums">{s.phone}</span> },
    {
      key: "whatsapp",
      title: "WhatsApp",
      hideOnMobile: true,
      render: (s: Student) => (
        <div className="flex items-center gap-2">
          {s.studentPhone && (
            <a
              href={`https://wa.me/${s.studentPhone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-md bg-green-100 hover:bg-green-200 text-green-700 transition-colors"
              title={`Student: ${s.studentPhone}`}
            >
              <MessageCircle className="w-4 h-4" />
            </a>
          )}
          {s.motherPhone && (
            <a
              href={`https://wa.me/${s.motherPhone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-md bg-blue-100 hover:bg-blue-200 text-blue-700 transition-colors"
              title={`Mother: ${s.motherPhone}`}
            >
              <MessageCircle className="w-4 h-4" />
            </a>
          )}
          {s.fatherPhone && (
            <a
              href={`https://wa.me/${s.fatherPhone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-md bg-purple-100 hover:bg-purple-200 text-purple-700 transition-colors"
              title={`Father: ${s.fatherPhone}`}
            >
              <MessageCircle className="w-4 h-4" />
            </a>
          )}
        </div>
      ),
    },
    {
      key: "status",
      title: "Status",
      render: (s: Student) => (
        <StatusBadge variant={s.status === "active" ? "success" : s.status === "inactive" ? "default" : "primary"}>
          {s.status}
        </StatusBadge>
      ),
    },
    {
      key: "feeStatus",
      title: "Fees",
      render: (s: Student) => (
        <StatusBadge variant={s.feeStatus === "paid" ? "success" : s.feeStatus === "partial" ? "warning" : "destructive"}>
          {s.feeStatus}
        </StatusBadge>
      ),
    },
    {
      key: "actions",
      title: "",
      render: (s: Student) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleEditBatch(s)}
            className="text-primary hover:text-primary hover:bg-primary/10"
          >
            Edit Batch
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleRevoke(s.id, s.name)}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            Revoke
          </Button>
        </div>
      ),
    },
  ];

  const handleRevoke = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to revoke admission for ${name}?`)) return;

    const { error } = await supabase
      .from('students')
      .delete()
      .eq('id', id);

    if (error) {
      toast({ title: "Error", description: "Failed to revoke student: " + error.message, variant: "destructive" });
    } else {
      setStudents(prev => prev.filter(s => s.id !== id));
      toast({ title: "Success", description: `Admission for ${name} has been revoked.` });
    }
  };

  const handleEditBatch = (student: Student) => {
    setEditingStudent(student);
    const currentBatch = dbBatches.find(b => b.name === student.batch);
    setBatchForm({ batchId: currentBatch?.id || "" });
    setEditBatchOpen(true);
  };

  const handleSaveBatch = async () => {
    if (!editingStudent || !batchForm.batchId) {
      toast({ title: "Error", description: "Please select a batch.", variant: "destructive" });
      return;
    }

    const selectedBatch = dbBatches.find(b => b.id === batchForm.batchId);

    const { error } = await supabase
      .from('students')
      .update({
        batch_id: batchForm.batchId,
        batch_name: selectedBatch?.name
      })
      .eq('id', editingStudent.id);

    if (error) {
      toast({ title: "Error", description: "Failed to update batch: " + error.message, variant: "destructive" });
    } else {
      setStudents(prev => prev.map(s =>
        s.id === editingStudent.id
          ? { ...s, batch: selectedBatch?.name || "" }
          : s
      ));
      setEditBatchOpen(false);
      setEditingStudent(null);
      setBatchForm({ batchId: "" });
      toast({ title: "Success", description: `${editingStudent.name}'s batch has been updated.` });
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-card border border-border flex-1 sm:flex-initial sm:w-64">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search students..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
                <Filter className="w-4 h-4 mr-2" /> Filters
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72">
              <div className="space-y-4">
                <h4 className="font-medium text-sm">Filter Students</h4>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Status</label>
                    <select
                      value={statusFilter}
                      onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                      className="w-full px-3 py-2 rounded-md bg-secondary border-none text-sm text-foreground outline-none"
                    >
                      <option value="all">All Status</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="alumni">Alumni</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Batch</label>
                    <select
                      value={batchFilter}
                      onChange={(e) => { setBatchFilter(e.target.value); setPage(1); }}
                      className="w-full px-3 py-2 rounded-md bg-secondary border-none text-sm text-foreground outline-none"
                    >
                      <option value="all">All Batches</option>
                      {allBatches.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                </div>
                {(statusFilter !== "all" || batchFilter !== "all") && (
                  <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => { setStatusFilter("all"); setBatchFilter("all"); }}>
                    Clear Filters
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Students</p>
            <p className="text-lg font-bold text-primary tabular-nums leading-none mt-1">{students.length}</p>
          </div>
          <div className="h-8 w-px bg-border hidden sm:block" />
          <div className="flex items-center gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
            <DataImportDialog type="students" instituteId={instId} onSuccess={fetchData} />
            <Button size="sm" className="h-9" onClick={handleExportToExcel} variant="outline">
              <Download className="w-4 h-4 mr-1" /> Export Excel
            </Button>
            <Button size="sm" className="h-9" onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Add Student
            </Button>
          </div>

        </div>


      </div>

      {/* Table */}
      <DataTable data={paginated} columns={columns} />

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Showing {filtered.length === 0 ? 0 : ((page - 1) * perPage) + 1}–{Math.min(page * perPage, filtered.length)} of {filtered.length} students</span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Prev</Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages || totalPages === 0} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      </div>

      {/* Add Student Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Student</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Full Name</label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="John Doe" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Phone Numbers</label>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Mother</label>
                  <Input value={form.motherPhone} onChange={e => setForm(p => ({ ...p, motherPhone: e.target.value }))} placeholder="+91 XXXXXXXX" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Father</label>
                  <Input value={form.fatherPhone} onChange={e => setForm(p => ({ ...p, fatherPhone: e.target.value }))} placeholder="+91 XXXXXXXX" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Student</label>
                  <Input value={form.studentPhone} onChange={e => setForm(p => ({ ...p, studentPhone: e.target.value }))} placeholder="+91 XXXXXXXX" />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email Address</label>
              <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="john@example.com" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Batch</label>
              <select 
                value={form.batchId} 
                onChange={e => setForm(p => ({ ...p, batchId: e.target.value }))}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="">Select a batch</option>
                {dbBatches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>

          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={async () => {
              if(!form.name || !form.batchId || !form.email) {
                toast({ title: "Validation Error", description: "Name, email and batch are required.", variant: "destructive" });
                return;
              }

              // Check if email already exists locally to avoid duplicates before sending to DB
              const exists = students.find(s => s.email.toLowerCase() === form.email.toLowerCase());
              if (exists) {
                toast({ title: "Duplicate Student", description: "A student with this email already exists.", variant: "destructive" });
                return;
              }

              const selectedBatch = dbBatches.find(b => b.id === form.batchId);
              
              // Generate GRN locally — institutes table has no grn_prefix column
              const prefix = instId.replace(/-/g, '').toUpperCase().substring(0, 3);
              const randomSuffix = Math.floor(10000 + Math.random() * 90000); // 5 digits
              const generatedGrn = `${prefix}${randomSuffix}`;

               // 2. Insert Student
               const { data, error } = await supabase
                 .from('students')
                 .insert([{
                   institute_id: instId,
                   name: form.name,
                   email: form.email,
                   mother_phone: form.motherPhone || null,
                   father_phone: form.fatherPhone || null,
                   student_phone: form.studentPhone || null,
                   batch_id: form.batchId,
                   batch_name: selectedBatch?.name,
                   status: 'active',
                   join_date: new Date().toISOString().split('T')[0],
                   enrollment_no: `MT-${new Date().getFullYear()}${Math.floor(1000 + Math.random() * 9000)}`
                 }])
                 .select()
                 .single();

              if (error) {
                toast({ title: "Failed to save", description: error.message, variant: "destructive" });
                return;
              }

              // 3. Create GRN Record
              await supabase.from('grn_records').insert([{
                institute_id: instId,
                student_id: data.id,
                grn_number: generatedGrn,
                status: 'active',
                issued_date: data.join_date
              }]);

              const newStudent: Student = {
                id: data.id,
                name: data.name,
                enrollmentNo: data.enrollment_no,
                grn: data.grn_no || "",
                batch: data.batch_name,
                email: data.email,
                phone: data.student_phone || data.phone || "",
                status: data.status as any,
                feeStatus: 'paid',
                parentName: `Parent of ${data.name}`,
                joinDate: data.join_date,
              };

              setStudents(prev => [newStudent, ...prev]);
              setAddOpen(false);
              setForm({ name: "", motherPhone: "", fatherPhone: "", studentPhone: "", email: "", batchId: "" });
              toast({ title: "Student Added", description: `${form.name} successfully registered!` });
            }}>Save Student</Button>


          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Batch Dialog */}
      <Dialog open={editBatchOpen} onOpenChange={setEditBatchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Batch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {editingStudent && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Changing batch for: <span className="font-medium text-foreground">{editingStudent.name}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Current batch: <span className="font-medium text-foreground">{editingStudent.batch || "None"}</span>
                </p>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">New Batch</label>
              <select
                value={batchForm.batchId}
                onChange={e => setBatchForm({ batchId: e.target.value })}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="">Select a batch</option>
                {dbBatches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditBatchOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveBatch}>Update Batch</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
