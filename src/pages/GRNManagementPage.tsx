import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/ui/stat-card";
import { toast } from "@/hooks/use-toast";
import { Hash, Search, Users, Download, Eye, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { supabase, isUuid } from "@/lib/supabase";
import { useAuth, AdminUser } from "@/contexts/AuthContext";

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

export default function GRNManagementPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const DEFAULT_UUID = "00000000-0000-0000-0000-000000000001";
  const instId = isAdmin ? (user as AdminUser).instituteId : DEFAULT_UUID;

  const [records, setRecords] = useState<GRNRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (isUuid(instId)) {
      fetchData();
    }
  }, [instId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch students and their GRN records
      const { data, error } = await supabase
        .from("students")
        .select(`
          id,
          name,
          enrollment_no,
          batch_name,
          join_date,
          status,
          grn_records (
            grn_number,
            status,
            issued_date
          )
        `)
        .eq("institute_id", instId);

      if (error) throw error;

      const merged: GRNRecord[] = (data || []).map((s: any) => {
        const grnRecord = s.grn_records?.[0]; // Assuming 1-to-1 or just taking the first
        return {
          id: s.id,
          studentId: s.id,
          studentName: s.name,
          enrollmentNo: s.enrollment_no,
          batch: s.batch_name || "N/A",
          grn: grnRecord?.grn_number || "PENDING",
          issuedDate: grnRecord?.issued_date || s.join_date,
          status: (grnRecord?.status || s.status === "active" ? "active" : "transferred") as any,
        };
      });

      setRecords(merged);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Total Students" value={records.length} icon={Hash} />
        <StatCard title="With GRN" value={records.filter(r => r.grn !== "PENDING").length} icon={Users} changeType="positive" />
        <StatCard title="Pending" value={records.filter(r => r.grn === "PENDING").length} icon={Users} />
        <StatCard title="Transferred" value={records.filter(r => r.status === "transferred").length} icon={Users} changeType="negative" />
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-card border border-border flex-1 sm:max-w-sm shadow-sm">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="Search GRN, student, enrollment..." value={search} onChange={e => setSearch(e.target.value)}
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full" />
        </div>
        <div className="flex items-center gap-2">
           <Button variant="outline" size="sm" onClick={fetchData} className="h-9">Refresh</Button>
           <Button variant="outline" size="sm" onClick={handleExport} className="h-9"><Download className="w-4 h-4 mr-1" /> Export</Button>
        </div>
      </div>

      <div className="surface-elevated rounded-lg overflow-hidden border border-border/50">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">GRN</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Student</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Batch</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filtered.length === 0 ? (
                <tr>
                   <td colSpan={6} className="text-center py-8 text-muted-foreground">No records found.</td>
                </tr>
              ) : (
                filtered.map(r => (
                  <tr key={r.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className={cn(
                        "font-mono text-xs px-2 py-0.5 rounded",
                        r.grn === "PENDING" || !r.grn ? "bg-secondary text-transparent" : "bg-primary/10 text-primary font-bold"
                      )}>
                        {r.grn === "PENDING" ? "" : r.grn}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-foreground">{r.studentName}</p>
                      <p className="text-[10px] text-muted-foreground uppercase font-medium">{r.enrollmentNo}</p>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs font-medium">{r.batch}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground tabular-nums text-xs">{r.issuedDate}</td>
                    <td className="px-4 py-3">
                      <StatusBadge variant={r.status === "active" ? "success" : r.status === "transferred" ? "warning" : "destructive"}>
                        {r.status}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/students/${r.studentId}`}>
                        <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-primary/10 hover:text-primary"><Eye className="w-4 h-4" /></Button>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
