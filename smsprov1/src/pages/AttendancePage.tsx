import { useState, useMemo } from "react";
import { generateStudents, generateAttendance } from "@/lib/mock-data";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Check, X, Clock, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

const students = generateStudents(20);
const today = new Date().toISOString().split("T")[0];

type AttendanceStatus = "present" | "absent" | "late";

interface AttendanceWithTime {
  studentId: string;
  studentName: string;
  status: AttendanceStatus;
  date: string;
  lateTime?: string; // time when marked late
}

export default function AttendancePage() {
  const initialAttendance = useMemo(() => {
    return generateAttendance(students, today).map((r) => ({
      ...r,
      lateTime: r.status === "late" ? "09:15" : undefined,
    }));
  }, []);

  const [records, setRecords] = useState<AttendanceWithTime[]>(initialAttendance);
  const [selectedBatch, setSelectedBatch] = useState("all");

  const batches = [...new Set(students.map((s) => s.batch))];

  const filteredStudents = selectedBatch === "all"
    ? students.filter((s) => s.status === "active")
    : students.filter((s) => s.status === "active" && s.batch === selectedBatch);

  const updateStatus = (studentId: string, status: AttendanceStatus) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
    setRecords((prev) =>
      prev.map((r) =>
        r.studentId === studentId
          ? { ...r, status, lateTime: status === "late" ? timeStr : undefined }
          : r
      )
    );
  };

  const handleSave = () => {
    toast({ title: "Attendance Saved", description: `Attendance for ${filteredStudents.length} students saved successfully.` });
  };

  const stats = {
    present: records.filter((r) => r.status === "present").length,
    absent: records.filter((r) => r.status === "absent").length,
    late: records.filter((r) => r.status === "late").length,
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Mark Attendance</h2>
          <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedBatch}
            onChange={(e) => setSelectedBatch(e.target.value)}
            className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground"
          >
            <option value="all">All Batches</option>
            {batches.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <Button size="sm" onClick={handleSave}>
            <Save className="w-4 h-4 mr-1" /> Save
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="surface-elevated rounded-lg p-3 text-center">
          <p className="text-2xl font-semibold text-success tabular-nums">{stats.present}</p>
          <p className="text-xs text-muted-foreground">Present</p>
        </div>
        <div className="surface-elevated rounded-lg p-3 text-center">
          <p className="text-2xl font-semibold text-destructive tabular-nums">{stats.absent}</p>
          <p className="text-xs text-muted-foreground">Absent</p>
        </div>
        <div className="surface-elevated rounded-lg p-3 text-center">
          <p className="text-2xl font-semibold text-warning tabular-nums">{stats.late}</p>
          <p className="text-xs text-muted-foreground">Late</p>
        </div>
      </div>

      {/* Attendance List */}
      <div className="surface-elevated rounded-lg divide-y divide-border/50">
        {filteredStudents.map((student) => {
          const record = records.find((r) => r.studentId === student.id);
          const status = record?.status || "present";
          const lateTime = record?.lateTime;
          return (
            <div
              key={student.id}
              className="flex items-center justify-between px-4 py-3 hover:bg-secondary/30 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-semibold text-primary">
                    {student.name.split(" ").map((n) => n[0]).join("")}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{student.name}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground">{student.enrollmentNo}</p>
                    {status === "late" && lateTime && (
                      <span className="text-[10px] text-warning font-medium bg-warning/10 px-1.5 py-0.5 rounded tabular-nums">
                        Late at {lateTime}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-1 p-1 bg-secondary rounded-lg shrink-0">
                {([
                  { key: "present" as const, icon: Check, label: "P" },
                  { key: "absent" as const, icon: X, label: "A" },
                  { key: "late" as const, icon: Clock, label: "L" },
                ]).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => updateStatus(student.id, key)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-md transition-all active:scale-95",
                      status === key
                        ? key === "present"
                          ? "bg-success text-success-foreground"
                          : key === "absent"
                          ? "bg-destructive text-destructive-foreground"
                          : "bg-warning text-warning-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
