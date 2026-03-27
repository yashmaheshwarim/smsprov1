import { useState, useMemo } from "react";
import { Search, Plus, Filter, Download } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { getStoredStudents, setStoredStudents, type Student } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

import { Link } from "react-router-dom";

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>(getStoredStudents());
  const allBatches = useMemo(() => Array.from(new Set(students.map(s => s.batch))), [students]);
  
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", batch: "" });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const perPage = 15;

  const filtered = useMemo(() => {
    return students.filter((s) => {
      const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.enrollmentNo.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || s.status === statusFilter;
      const matchBatch = batchFilter === "all" || s.batch === batchFilter;
      return matchSearch && matchStatus && matchBatch;
    });
  }, [search, statusFilter, batchFilter]);

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
              {s.name.split(" ").map((n) => n[0]).join("")}
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
  ];

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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9">
            <Download className="w-4 h-4 mr-1" /> Export
          </Button>
          <Button size="sm" className="h-9" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add Student
          </Button>
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
              <label className="text-sm font-medium">Phone Number</label>
              <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+91 9999999999" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email Address</label>
              <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="john@example.com" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Batch</label>
              <select 
                value={form.batch} 
                onChange={e => setForm(p => ({ ...p, batch: e.target.value }))}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="">Select a batch</option>
                {allBatches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              if(!form.name || !form.phone || !form.batch || !form.email) {
                toast({ title: "Validation Error", description: "All fields are required.", variant: "destructive" });
                return;
              }
              const num = students.length + 1;
              const newStudent: Student = {
                id: `STU-${String(num).padStart(4, '0')}`,
                name: form.name,
                enrollmentNo: `MT-${String(2025000 + num)}`,
                grn: `GRN-${String(2025000 + num)}`,
                batch: form.batch,
                email: form.email,
                phone: form.phone,
                status: 'active',
                feeStatus: 'paid', // Default to paid initially or unset
                parentName: `Parent of ${form.name}`,
                joinDate: new Date().toISOString().split('T')[0],
              };
              const updated = [newStudent, ...students];
              setStudents(updated);
              setStoredStudents(updated);
              setAddOpen(false);
              setForm({ name: "", phone: "", email: "", batch: "" });
              toast({ title: "Student Added", description: `${form.name} successfully registered!` });
            }}>Save Student</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
