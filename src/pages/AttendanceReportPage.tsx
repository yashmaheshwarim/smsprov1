import { useState, useMemo, useEffect, useRef } from "react";
import { 
  Search, Download, Calendar,
  CheckCircle2, XCircle, Loader2,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight 
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
  student_id: string;
  date: string;
  status: "present" | "absent" | "leave" | "late" | "half-day";
  student_name?: string;
  enrollment_no?: string;
}

/** Rank a raw DB status for dedup: present/late/half-day > leave > absent */
function statusRank(s: string): number {
  if (s === "present" || s === "late" || s === "half-day") return 3;
  if (s === "leave") return 2;
  return 1; // absent or unknown
}

/** Normalize a raw status to the three display buckets (matches the UI) */
function displayStatusOf(s: string): "present" | "leave" | "absent" {
  return s === "present" || s === "late" || s === "half-day" ? "present" : s === "leave" ? "leave" : "absent";
}

/** Count present/absent/leave buckets across a set of records (module-level so useMemo hooks can use it) */
function countStatuses(items: AttendanceRecord[]) {
  const present = items.filter(r => r.status === "present" || r.status === "late" || r.status === "half-day").length;
  const absent = items.filter(r => r.status === "absent").length;
  const leave = items.filter(r => r.status === "leave").length;
  return { total: items.length, present, absent, leave };
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
   // Specific-date view: pick any date to see that day's present/absent/leave students
   const [viewDate, setViewDate] = useState("");
   const [statusFilter, setStatusFilter] = useState<"all" | "present" | "absent" | "leave">("all");
   const [currentPage, setCurrentPage] = useState(1);
   const [pageSize] = useState(15);
   const attendanceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (isUuid(instId)) {
      fetchStudents();
      fetchAttendance();
      subscribeToRealtime();
    }
    return () => {
      if (attendanceChannelRef.current) {
        supabase.removeChannel(attendanceChannelRef.current);
        attendanceChannelRef.current = null;
      }
    };
  }, [instId]);

  // Realtime: re-fetch attendance when it changes on the web app or the mobile
  // app, so the report always reflects the latest marks without a manual refresh.
  const subscribeToRealtime = () => {
    if (!isUuid(instId)) return;
    const channel = supabase
      .channel(`attendance-report-realtime-${instId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance", filter: `institute_id=eq.${instId}` },
        () => fetchAttendance()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "exam_attendance", filter: `institute_id=eq.${instId}` },
        () => fetchAttendance()
      )
      .subscribe();
    attendanceChannelRef.current = channel;
  };

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
          id, student_id, date, status,
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
        student_id: r.student_id,
        date: r.date,
        status: r.status,
        student_name: r.students?.name,
        enrollment_no: r.students?.enrollment_no,
      }));

      // ── Deduplicate by (student_id + date) ──────────────────────────────
      // A student can have multiple rows on the same day (one per subject, due
      // to the unique index on institute_id+student_id+date+subject). To report
      // unique daily attendance, keep a single record per student per day:
      //   - present  if any record that day is present/late/half-day
      //   - otherwise leave if any record that day is leave
      //   - otherwise absent
      const dailyMap = new Map<string, AttendanceRecord>();
      for (const rec of formatted) {
        const key = `${rec.student_id}|${rec.date}`;
        const existing = dailyMap.get(key);
        const recRank = statusRank(rec.status);
        if (!existing || recRank > statusRank(existing.status)) {
          dailyMap.set(key, rec);
        }
      }

      setRecords(Array.from(dailyMap.values()));
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

   const filtered = useMemo(() => {
     return records.filter(r =>
       ((r.student_name || "").toLowerCase().includes(search.toLowerCase()) ||
       (r.enrollment_no || "").toLowerCase().includes(search.toLowerCase())) &&
       (statusFilter === "all" ||
         (statusFilter === "present"
           ? r.status === "present" || r.status === "late" || r.status === "half-day"            : displayStatusOf(r.status) === statusFilter))
     );
   }, [records, search, statusFilter]);

   // Pagination
   const totalItems = filtered.length;
   const totalPages = Math.ceil(totalItems / pageSize);
   const startIndex = (currentPage - 1) * pageSize;
   const endIndex = Math.min(startIndex + pageSize, totalItems);
   const paginatedRecords = filtered.slice(startIndex, endIndex);

   // Reset page when filters change
   useEffect(() => {
     setCurrentPage(1);
   }, [records.length, search, statusFilter]);

   // Changing the specific date narrows From/To to that single day and re-fetches
   const handleViewDateChange = (value: string) => {
     setViewDate(value);
     setDateFilter({ from: value, to: value });
     setCurrentPage(1);
   };

   // Auto-fetch when the date range changes (mount is covered by the init effect above)
   const mountedRef = useRef(false);
   useEffect(() => {
     if (!mountedRef.current) {
       mountedRef.current = true;
       return;
     }
     if (isUuid(instId)) fetchAttendance();
   }, [dateFilter.from, dateFilter.to]);

   /** Per-day bucket counts for the selected date's students */
   const dayStats = useMemo(() => {
     if (!viewDate) return null;
     const dayRecords = records.filter(r => String(r.date || "").split("T")[0] === viewDate);
     return countStatuses(dayRecords);
   }, [viewDate, records]);

   const stats = useMemo(() => {
     const total = records.length;
     // present/late/half-day all count as attended (present)
     const present = records.filter(r => r.status === "present" || r.status === "late" || r.status === "half-day").length;
     const absent = records.filter(r => r.status === "absent").length;
     const leave = records.filter(r => r.status === "leave").length;
     // Leave counts as not-present in percentage calculation
     const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
     return { total, present, absent, leave, percentage } as const;
   }, [records]);

  /** Escape a value for CSV (quotes/commas/newlines) */
  const csvEscape = (value: string): string => {
    if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
  };

  /** Percentage string, e.g. "80%" */
  const pct = (part: number, total: number): string =>
    total > 0 ? `${Math.round((part / total) * 100)}%` : "0%";

  const handleExport = () => {
    if (records.length === 0) {
      toast({ title: "No Data", description: "No records to export." });
      return;
    }

    const lines: string[] = [];
    const generated = new Date().toLocaleString("en-IN");
    const isIndividual = selectedStudentId !== "all";
    const selectedStudent = students.find(s => s.id === selectedStudentId);

    // ── Report header ─────────────────────────────────────────────────────
    lines.push(
      `Attendance Report${isIndividual && selectedStudent
        ? ` - ${selectedStudent.name} (${selectedStudent.enrollment_no})`
        : " - All Students"}`
    );
    lines.push(`Generated: ${generated}`);
    lines.push("");

    // ── Overall summary: count + % of present/absent/leave vs total ───────
    const overall = countStatuses(records);
    lines.push("Summary");
    lines.push("Metric,Count,Percentage");
    lines.push(`Total Attendance,${overall.total},100%`);
    lines.push(`Present,${overall.present},${pct(overall.present, overall.total)}`);
    lines.push(`Absent,${overall.absent},${pct(overall.absent, overall.total)}`);
    lines.push(`Leave,${overall.leave},${pct(overall.leave, overall.total)}`);
    lines.push("");

    // ── Per-student summary (only for the "All Students" report) ─────────
    if (!isIndividual) {
      const byStudent = new Map<string, AttendanceRecord[]>();
      for (const r of records) {
        const arr = byStudent.get(r.student_id) || [];
        arr.push(r);
        byStudent.set(r.student_id, arr);
      }
      // Sort students alphabetically by name for a readable report
      const sortedIds = Array.from(byStudent.keys()).sort((a, b) => {
        const nameA = (byStudent.get(a)?.[0]?.student_name || "").toLowerCase();
        const nameB = (byStudent.get(b)?.[0]?.student_name || "").toLowerCase();
        return nameA.localeCompare(nameB);
      });
      lines.push("Student Summary");
      lines.push("Student Name,Enrollment No,Total,Present,Present %,Absent,Absent %,Leave,Leave %");
      for (const sid of sortedIds) {
        const items = byStudent.get(sid)!;
        const s = countStatuses(items);
        const name = items[0]?.student_name || "";
        const enr = items[0]?.enrollment_no || "";
        lines.push(
          `${csvEscape(name)},${csvEscape(enr)},${s.total},${s.present},${pct(s.present, s.total)},` +
          `${s.absent},${pct(s.absent, s.total)},${s.leave},${pct(s.leave, s.total)}`
        );
      }
      lines.push("");
    }

    // ── Detailed daily records ────────────────────────────────────────────
    lines.push("Daily Records");
    lines.push("Date,Student Name,Enrollment No,Status");
    for (const r of records) {
      lines.push(
        `${r.date},${csvEscape(r.student_name || "")},${csvEscape(r.enrollment_no || "")},${displayStatusOf(r.status)}`
      );
    }

    const csv = lines.join("\n");
    // UTF-8 BOM so Excel renders non-ASCII student names correctly
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const fileTag = isIndividual && selectedStudent
      ? `_${selectedStudent.name.replace(/[^a-zA-Z0-9]+/g, "_")}`
      : "_AllStudents";
    a.download = `Attendance_Report${fileTag}_${new Date().toISOString().split('T')[0]}.csv`;
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
        <StatCard title="Total Attendance" value={stats.total} icon={Calendar} change="Unique student-days" />
        <StatCard title="Present" value={stats.present} icon={CheckCircle2} changeType="positive" />
        <StatCard title="Leave" value={stats.leave} icon={Calendar} />
        <StatCard title="Absent" value={stats.absent} icon={XCircle} changeType="negative" />
        <StatCard title="Attendance Rate" value={`${stats.percentage}%`} icon={CheckCircle2} changeType={stats.percentage >= 75 ? "positive" : stats.percentage >= 50 ? "neutral" : "negative"} />
        {/* Note: present/late/half-day count as attended; leave counts as not-present in the % */}
      </div>

      <div className="surface-elevated rounded-lg p-4 border border-border/50 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
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
            <label className="text-[10px] uppercase font-bold text-muted-foreground">Specific Date</label>
            <Input
              type="date"
              value={viewDate}
              onChange={e => handleViewDateChange(e.target.value)}
              className="h-9"
              title="Pick any date to see that day's present / absent / leave students"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-muted-foreground">From Date</label>
            <Input type="date" value={dateFilter.from} onChange={e => setDateFilter(prev => ({ ...prev, from: e.target.value }))} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-muted-foreground">To Date</label>
            <Input type="date" value={dateFilter.to} onChange={e => setDateFilter(prev => ({ ...prev, to: e.target.value }))} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-muted-foreground">Attendance Status</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
              className="w-full px-3 py-2 rounded-md bg-card border border-border text-sm outline-none focus:ring-2 focus:ring-primary/20 h-9"
            >
              <option value="all">All Status</option>
              <option value="present">Present</option>
              <option value="absent">Absent</option>
              <option value="leave">Leave</option>
            </select>
          </div>
        </div>

        {/* Specific-date summary: present / absent / leave students on the picked date */}
        {viewDate && dayStats && (
          <div className="pt-2 border-t border-border/50">
            <p className="text-xs font-bold text-foreground mb-2">
              {new Date(`${viewDate}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
            <div className="flex flex-wrap gap-2">
              {(["all", "present", "leave", "absent"] as const).map((key) => {
                const count = key === "all" ? dayStats.total : (dayStats as any)[key];
                const active = statusFilter === key;
                const styles = key === "present"
                  ? "bg-success/10 text-success border-success/30"
                  : key === "leave"
                    ? "bg-warning/10 text-warning border-warning/30"
                    : key === "absent"
                      ? "bg-destructive/10 text-destructive border-destructive/30"
                      : "bg-secondary text-foreground border-border";
                return (
                  <button
                    key={key}
                    onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}
                    className={cn("px-3 py-1 rounded-full border text-xs font-bold uppercase capitalize transition-colors", styles, active && "ring-2 ring-primary/40")}
                  >
                    {key === "all" ? "All" : key}: {count}
                  </button>
                );
              })}
            </div>
          </div>
        )}

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
                 <tr key={`${r.student_id}|${r.date}`} className="border-b border-border/50 hover:bg-secondary/30">
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
                     <StatusBadge variant={r.status === "present" || r.status === "late" || r.status === "half-day" ? "success" : r.status === "leave" ? "warning" : "destructive"}>
                       {r.status === "present" || r.status === "late" || r.status === "half-day" ? <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> : r.status === "leave" ? <Calendar className="w-3.5 h-3.5 mr-1" /> : <XCircle className="w-3.5 h-3.5 mr-1" />}
                       {r.status === "present" || r.status === "late" || r.status === "half-day" ? "Present" : r.status === "leave" ? "Leave" : "Absent"}
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
