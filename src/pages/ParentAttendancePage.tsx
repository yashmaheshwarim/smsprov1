import { useState, useEffect } from "react";
import { useAuth, ParentUser } from "@/contexts/AuthContext";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { CalendarCheck, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface AttendanceRecord {
  date: string;
  status: "present" | "absent" | "late";
}

export default function ParentAttendancePage() {
  const { user } = useAuth();
  const parent = user as ParentUser;
  const childId = parent.childrenIds[0] || "STU001"; // Fallback to a mock child ID
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);

  useEffect(() => {
    fetchAttendance();
  }, []);

  const fetchAttendance = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("attendance")
        .select("date, status")
        .eq("student_id", childId)
        .order("date", { ascending: false })
        .limit(50);

      if (data && data.length > 0) {
        setRecords(data.map((r: any) => ({ date: r.date, status: r.status || "present" })));
      } else {
        // Fallback mock data
        setRecords([
          { date: "2025-03-15", status: "present" }, { date: "2025-03-14", status: "present" },
          { date: "2025-03-13", status: "absent" }, { date: "2025-03-12", status: "late" },
          { date: "2025-03-11", status: "present" }, { date: "2025-03-10", status: "present" },
        ]);
      }
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const present = records.filter(r => r.status === "present" || r.status === "late").length;
  const absent = records.filter(r => r.status === "absent").length;
  const rate = records.length > 0 ? ((present / records.length) * 100).toFixed(1) : "0";

  if (loading) {
    return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Child's Attendance</h2>
        <p className="text-sm text-muted-foreground">Monitor attendance records for your child</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard title="Attendance Rate" value={`${rate}%`} icon={CalendarCheck} changeType={Number(rate) >= 75 ? "positive" : "negative"} change={Number(rate) >= 75 ? "Good standing" : "Below 75%"} />
        <StatCard title="Present Days" value={present} icon={CalendarCheck} changeType="positive" />
        <StatCard title="Absent Days" value={absent} icon={CalendarCheck} changeType="negative" />
      </div>

      {/* Attendance Table */}
      <div className="surface-elevated rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Recent Attendance History</h3>
        </div>
        <div className="divide-y divide-border/50">
          {records.map((r, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3 hover:bg-secondary/30 transition-colors">
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${r.status === "present" ? "bg-success" : r.status === "late" ? "bg-warning" : "bg-destructive"}`} />
                <span className="text-sm text-foreground font-medium">{new Date(r.date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
              </div>
              <StatusBadge variant={r.status === "present" ? "success" : r.status === "late" ? "warning" : "destructive"}>
                {r.status}
              </StatusBadge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
