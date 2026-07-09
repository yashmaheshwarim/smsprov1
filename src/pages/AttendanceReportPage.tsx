import { useState, useMemo, useEffect } from "react";
import { 
  Search, Download, Calendar, User, 
  CheckCircle2, XCircle, Loader2, Filter, 
  ChevronRight, ArrowLeft, ChevronLeft, ChevronRight as ChevronRightIcon, ChevronsLeft, ChevronsRight 
} from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { supabase, isUuid } from "@/lib/supabase";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface Student {
  id: string;
  name: string;
  enrollment_no: string;
}

interface AttendanceRecord {
  id: string;
  date: string;
  status: "present" | "absent" | "leave";
  student_name?: string;
  enrollment_no?: string;
}

export default function AttendanceReportPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const DEFAULT_UUID = "00000000-0000-0000-0000-000000000001";
  const instId = isAdmin ? (user as AdminUser).instituteId : DEFAULT_UUID;

   const [loading, setLoading] = useState(false);
   const [students, setStudents] = useState<Student[]>([]);
   const [selectedStudentId, setSelectedStudentId] = useState<string>("all");
   const [records, setRecords] = useState<AttendanceRecord[]>([]);
   const [search, setSearch] = useState("");
   const [dateFilter, setDateFilter] = useState({ from: "", to: "" });
   const [currentPage, setCurrentPage] = useState(1);
   const [pageSize] = useState(15);

  useEffect(() => {
    if (isUuid(instId)) {
      fetchStudents();
      fetchAttendance();
    }
  }, [instId]);

  const fetchStudents = async () => {
    const { data } = await supabase
      .from("students")
      .select("id, name, enrollment_no")
      .eq("institute_id", instId)
      .order("name");
    if (data) setStudents(data);
  };

  const fetchAttendance = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("attendance")
        .select(`
          id, date, status,
          students ( name, enrollment_no )
        `)
        .eq("institute_id", instId)
        .order("date", { ascending: false });

      if (selectedStudentId !== "all") {
        query = query.eq("student_id", selectedStudentId);
      }

      if (dateFilter.from) query = query.gte("date", dateFilter.from);
      if (dateFilter.to) query = query.lte("date", dateFilter.to);

      const { data, error } = await query;
      if (error) throw error;

      const formatted: AttendanceRecord[] = (data || []).map((r: any) => ({
        id: r.id,
        date: r.date,
        status: r.status,
        student_name: r.students?.name,
        enrollment_no: r.students?.enrollment_no,
      }));

      setRecords(formatted);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

   const filtered = useMemo(() => {
     return records.filter(r => 
       (r.student_name || "").toLowerCase().includes(search.toLowerCase()) ||
       (r.enrollment_no || "").toLowerCase().includes(search.toLowerCase())
     );
   }, [records, search]);

   // Pagination
   const totalItems = filtered.length;
   const totalPages = Math.ceil(totalItems / pageSize);
   const startIndex = (currentPage - 1) * pageSize;
   const endIndex = Math.min(startIndex + pageSize, totalItems);
   const paginatedRecords = filtered.slice(startIndex, endIndex);

   // Reset page when filters change
   useMemo(() => {
     setCurrentPage(1);
   }, [records.length, search]);

   const stats = useMemo(() => {
     const total = records.length;
     const present = records.filter(r => r.status === "present").length;
     const absent = records.filter(r => r.status === "absent").length;
     const leave = records.filter(r => r.status === "leave").length;
     // Leave counts as absent in percentage calculation (total includes all statuses, present only includes present)
     const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
     return { total, present, absent, leave, percentage } as const;
   }, [records]);

  const handleExport = () => {
    if (records.length === 0) {
      toast({ title: "No Data", description: "No records to export." });
      return;
    }
    const csv = ["Date,Student Name,Enrollment No,Status"];
    records.forEach(r => csv.push(`${r.date},${r.student_name},${r.enrollment_no},${r.status}`));
    const blob = new Blob([csv.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Attendance_Report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: "Attendance report downloaded." });
  };

  // Unused columns definition kept for reference
  // const columns = [...]

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" /> Attendance Center
          </h2>
          <p className="text-xs text-muted-foreground">Manage and analyze detailed attendance reports</p>
        </div>
        <Button size="sm" onClick={handleExport} className="h-9 shadow-md">
          <Download className="w-4 h-4 mr-1" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Total Records" value={stats.total} icon={Calendar} />
        <StatCard title="Present Total" value={stats.present} icon={CheckCircle2} changeType="positive" />
        <StatCard title="Leave Total" value={stats.leave} icon={Calendar} />
        <StatCard title="Absent Total" value={stats.absent} icon={XCircle} changeType="negative" />
        <StatCard title="Avg. Attendance" value={`${stats.percentage}%`} icon={Filter} />
        {/* Note: Leave counts as absent in attendance % calculation */}
      </div>

      <div className="surface-elevated rounded-lg p-4 border border-border/50 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-muted-foreground">Filter Student</label>
            <select 
              value={selectedStudentId} 
              onChange={e => setSelectedStudentId(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-card border border-border text-sm outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">All Students</option>
              {students.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.enrollment_no})</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-muted-foreground">Search Records</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Student name..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-muted-foreground">From Date</label>
            <Input type="date" value={dateFilter.from} onChange={e => setDateFilter(prev => ({ ...prev, from: e.target.value }))} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-muted-foreground">To Date</label>
            <Input type="date" value={dateFilter.to} onChange={e => setDateFilter(prev => ({ ...prev, to: e.target.value }))} className="h-9" />
          </div>
        </div>
        <div className="flex justify-end pt-2 border-t border-border/50">
          <Button size="sm" onClick={fetchAttendance} disabled={loading} className="px-8">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : "Apply Filters"}
          </Button>
        </div>
      </div>

       <div className="surface-elevated rounded-lg overflow-hidden">
         <div className="overflow-x-auto">
           <table className="w-full text-sm">
             <thead>
               <tr className="border-b border-border bg-secondary/50">
                 <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Date</th>
                 <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Student</th>
                 <th className="text-center px-3 py-3 text-xs font-medium text-muted-foreground uppercase">Status</th>
               </tr>
             </thead>
             <tbody>
               {paginatedRecords.map((r) => (
                 <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/30">
                   <td className="px-4 py-3">
                     <span className="text-sm font-medium tabular-nums text-foreground">
                       {new Date(r.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                     </span>
                   </td>
                   <td className="px-4 py-3">
                     <div>
                       <p className="text-sm font-bold text-foreground">{r.student_name}</p>
                       <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">{r.enrollment_no}</p>
                     </div>
                   </td>
                   <td className="px-4 py-3 text-center">
                     <StatusBadge variant={r.status === "present" ? "success" : r.status === "leave" ? "warning" : "destructive"}>
                       {r.status === "present" ? <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> : r.status === "leave" ? <Calendar className="w-3.5 h-3.5 mr-1" /> : <XCircle className="w-3.5 h-3.5 mr-1" />}
                       {r.status === "leave" ? "Leave" : r.status}
                     </StatusBadge>
                   </td>
                 </tr>
               ))}
             </tbody>
           </table>
         </div>
         
         {/* Pagination Controls */}
         {totalPages > 1 && (
           <div className="flex items-center justify-between border-t px-4 py-3 bg-card">
             <p className="text-sm text-muted-foreground">
               Showing {startIndex + 1}-{endIndex} of {totalItems} records
             </p>
             <div className="flex items-center gap-2">
               <Button
                 variant="outline"
                 size="sm"
                 onClick={() => setCurrentPage(1)}
                 disabled={currentPage === 1}
                 className="h-8 px-2"
               >
                 <ChevronsLeft className="h-4 w-4" />
               </Button>
               <Button
                 variant="outline"
                 size="sm"
                 onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                 disabled={currentPage === 1}
                 className="h-8 px-2"
               >
                 <ChevronLeft className="h-4 w-4" />
               </Button>

               <div className="flex items-center gap-1">
                 {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                   let pageNum: number;
                   if (totalPages <= 5) {
                     pageNum = i + 1;
                   } else if (currentPage <= 3) {
                     pageNum = i + 1;
                   } else if (currentPage >= totalPages - 2) {
                     pageNum = totalPages - 4 + i;
                   } else {
                     pageNum = currentPage - 2 + i;
                   }
                   return (
                     <Button
                       key={pageNum}
                       variant={currentPage === pageNum ? "default" : "outline"}
                       size="sm"
                       onClick={() => setCurrentPage(pageNum)}
                       className="h-8 w-8"
                     >
                       {pageNum}
                     </Button>
                   );
                 })}
               </div>

               <Button
                 variant="outline"
                 size="sm"
                 onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                 disabled={currentPage === totalPages}
                 className="h-8 px-2"
               >
                 <ChevronRight className="h-4 w-4" />
               </Button>
               <Button
                 variant="outline"
                 size="sm"
                 onClick={() => setCurrentPage(totalPages)}
                 disabled={currentPage === totalPages}
                 className="h-8 px-2"
               >
                 <ChevronsRight className="h-4 w-4" />
               </Button>
             </div>
           </div>
         )}
       </div>
    </div>
  );
}
