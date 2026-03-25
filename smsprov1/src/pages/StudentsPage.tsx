import { useState, useMemo } from "react";
import { Search, Plus, Filter, Download } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { generateStudents, type Student } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const allStudents = generateStudents(50);

export default function StudentsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const perPage = 15;

  const filtered = useMemo(() => {
    return allStudents.filter((s) => {
      const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.enrollmentNo.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || s.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [search, statusFilter]);

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
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="alumni">Alumni</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-1" /> Export
          </Button>
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1" /> Add Student
          </Button>
        </div>
      </div>

      {/* Table */}
      <DataTable data={paginated} columns={columns} />

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Showing {((page - 1) * perPage) + 1}–{Math.min(page * perPage, filtered.length)} of {filtered.length}</span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Prev</Button>
          <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}
