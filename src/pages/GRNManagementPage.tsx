import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/ui/stat-card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Hash, Search, Users, Plus, Download, Eye } from "lucide-react";
import { generateStudents } from "@/lib/mock-data";
import { Link } from "react-router-dom";

const students = generateStudents(50);

const generateGRN = (index: number) => `GRN-${new Date().getFullYear()}-${String(index + 1).padStart(5, "0")}`;

interface GRNRecord {
  id: string;
  grn: string;
  studentName: string;
  enrollmentNo: string;
  batch: string;
  studentId: string;
  issuedDate: string;
  status: "active" | "transferred" | "cancelled";
}

const initialGRNs: GRNRecord[] = students.slice(0, 30).map((s, i) => ({
  id: `GRNR-${i + 1}`,
  grn: generateGRN(i),
  studentName: s.name,
  enrollmentNo: s.enrollmentNo,
  batch: s.batch,
  studentId: s.id,
  issuedDate: s.joinDate,
  status: s.status === "active" ? "active" : s.status === "inactive" ? "transferred" : "active",
}));

export default function GRNManagementPage() {
  const [records, setRecords] = useState(initialGRNs);
  const [search, setSearch] = useState("");

  const filtered = records.filter(r =>
    r.grn.toLowerCase().includes(search.toLowerCase()) ||
    r.studentName.toLowerCase().includes(search.toLowerCase()) ||
    r.enrollmentNo.toLowerCase().includes(search.toLowerCase())
  );

  const handleExport = () => {
    const csv = ["GRN,Student,Enrollment,Batch,Issued Date,Status"];
    records.forEach(r => csv.push(`${r.grn},${r.studentName},${r.enrollmentNo},${r.batch},${r.issuedDate},${r.status}`));
    const blob = new Blob([csv.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "grn_records.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: "GRN records exported." });
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Total GRNs" value={records.length} icon={Hash} />
        <StatCard title="Active" value={records.filter(r => r.status === "active").length} icon={Users} changeType="positive" />
        <StatCard title="Transferred" value={records.filter(r => r.status === "transferred").length} icon={Users} />
        <StatCard title="Cancelled" value={records.filter(r => r.status === "cancelled").length} icon={Users} changeType="negative" />
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-card border border-border flex-1 sm:max-w-sm">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="Search GRN, student, enrollment..." value={search} onChange={e => setSearch(e.target.value)}
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full" />
        </div>
        <Button variant="outline" size="sm" onClick={handleExport}><Download className="w-4 h-4 mr-1" /> Export</Button>
      </div>

      <div className="surface-elevated rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">GRN</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Student</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden md:table-cell">Batch</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden sm:table-cell">Issued</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">View</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/30">
                  <td className="px-4 py-3 font-mono text-foreground text-xs">{r.grn}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{r.studentName}</p>
                    <p className="text-xs text-muted-foreground">{r.enrollmentNo}</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{r.batch}</td>
                  <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground tabular-nums">{r.issuedDate}</td>
                  <td className="px-4 py-3">
                    <StatusBadge variant={r.status === "active" ? "success" : r.status === "transferred" ? "warning" : "destructive"}>{r.status}</StatusBadge>
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/students/${r.studentId}`}>
                      <Button size="icon" variant="ghost" className="h-7 w-7"><Eye className="w-3.5 h-3.5" /></Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
