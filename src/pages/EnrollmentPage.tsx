import { useState, useMemo } from "react";
import { Search, Save, UserCheck, CheckCircle } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { getStoredStudents, setStoredStudents, Student } from "@/lib/mock-data";
import { StatusBadge } from "@/components/ui/status-badge";

export default function EnrollmentPage() {
  const [students, setStudents] = useState<Student[]>(getStoredStudents());
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 15;

  const filtered = useMemo(() => {
    return students.filter((s) => 
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.enrollmentNo.toLowerCase().includes(search.toLowerCase()) ||
      (s.grn && s.grn.toLowerCase().includes(search.toLowerCase()))
    );
  }, [search, students]);

  const paginated = useMemo(() => {
    return filtered.slice((page - 1) * perPage, page * perPage);
  }, [filtered, page]);
  
  const totalPages = Math.ceil(filtered.length / perPage);

  const handleUpdate = (id: string, field: "enrollmentNo" | "grn", value: string) => {
    setStudents(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const handleSave = () => {
    setStoredStudents(students);
    toast({ title: "Enrollment Data Saved", description: "All student enrollment numbers and GRNs have been updated." });
  };

  const columns = [
    {
      key: "name",
      title: "Student Details",
      render: (s: Student) => (
        <div>
          <p className="text-sm font-medium text-foreground">{s.name}</p>
          <p className="text-xs text-muted-foreground">{s.email}</p>
        </div>
      ),
    },
    {
      key: "batch",
      title: "Batch",
      render: (s: Student) => <span className="text-sm text-foreground">{s.batch}</span>,
    },
    {
      key: "enrollmentNo",
      title: "Enrollment Number",
      render: (s: Student) => (
        <Input 
          value={s.enrollmentNo} 
          onChange={(e) => handleUpdate(s.id, "enrollmentNo", e.target.value)}
          className="w-40 h-8 font-mono text-sm"
          placeholder="e.g. MT-2025..."
        />
      ),
    },
    {
      key: "grn",
      title: "GRN (Gen. Register No.)",
      render: (s: Student) => (
        <Input 
          value={s.grn || ""} 
          onChange={(e) => handleUpdate(s.id, "grn", e.target.value)}
          className="w-40 h-8 font-mono text-sm border-primary/50 focus-visible:ring-primary/50"
          placeholder="e.g. GRN-0001"
        />
      ),
    },
    {
      key: "status",
      title: "Status",
      render: (s: Student) => (
         <StatusBadge variant={s.status === 'active' ? 'success' : s.status === 'inactive' ? 'warning' : 'default'}>
            {s.status}
         </StatusBadge>
      ),
    },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <UserCheck className="w-6 h-6 text-primary" /> Enrollment Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Assign and manage Enrollment Numbers and GRNs for all students.</p>
        </div>
        <Button onClick={handleSave} className="flex items-center gap-2">
          <Save className="w-4 h-4" /> Save All Changes
        </Button>
      </div>

      <div className="surface-elevated rounded-lg p-4 flex flex-col sm:flex-row gap-4 items-center justify-between border border-border">
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-card border border-border w-full sm:w-96 focus-within:ring-1 focus-within:ring-primary">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Search by name, enrollment no, or GRN..." 
            value={search} 
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full" 
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle className="w-4 h-4 text-success" /> Auto-synced with Fees & Dashboards
        </div>
      </div>

      <div className="surface-elevated rounded-lg border border-border overflow-hidden">
        <DataTable data={paginated} columns={columns} />
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center justify-between text-sm text-muted-foreground pt-2">
        <span>Showing {filtered.length === 0 ? 0 : ((page - 1) * perPage) + 1}–{Math.min(page * perPage, filtered.length)} of {filtered.length} students</span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Prev</Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages || totalPages === 0} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next</Button>
        </div>
      </div>
    </div>
  );
}
