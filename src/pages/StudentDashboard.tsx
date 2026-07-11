import { useState, useEffect } from "react";
import { useAuth, StudentUser } from "@/contexts/AuthContext";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { GraduationCap, CalendarCheck, IndianRupee, ClipboardList, Bell, Hash, Copy, ExternalLink, Loader2, FileText, Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

interface AttendanceRecord {
  date: string;
  status: "present" | "absent" | "late";
}

interface Announcement {
  id: string;
  title: string;
  message: string;
  date: string;
  type: "info" | "urgent" | "general";
}

interface BatchClassroom {
  batchName: string;
  courseName: string;
  enrollmentCode: string;
  syncedAt: string;
}

interface StudyMaterial {
  id: string;
  title: string;
  subject: string;
  type: "pdf" | "video" | "image";
  uploadedBy: string;
  uploadDate: string;
  size: string;
  batch: string;
  fileUrl?: string;
  fileName?: string;
}

interface AttendanceRow {
  date: string;
  status: string | null;
}

interface InvoiceRow {
  id: string;
  amount: number | null;
  status: string | null;
  due_date: string | null;
}

interface AnnouncementRow {
  id: string;
  title: string;
  message?: string | null;
  content?: string | null;
  created_at: string | null;
  type: string | null;
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const student = user as StudentUser;

  const [loading, setLoading] = useState(true);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [feesData, setFeesData] = useState({ total: 0, paid: 0, due: "N/A" });
  const [classroomCourses, setClassroomCourses] = useState<BatchClassroom[]>([]);
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      // ── Attendance from Supabase ──────────────────────────────────────
      try {
        const { data: attData } = await supabase
          .from("attendance")
          .select("date, status")
          .eq("student_id", student.id)
          .order("date", { ascending: false })
          .limit(6);

        if (attData && attData.length > 0) {
          setAttendance(
            (attData as AttendanceRow[]).map((r) => ({
              date: r.date,
              status: (r.status as AttendanceRecord["status"]) || "present",
            }))
          );
        }
      } catch {
        // attendance stays empty
      }

      // ── Fees from Supabase ─────────────────────────────────────────────
      try {
        const { data: invData } = await supabase
          .from("invoices")
          .select("id, amount, status, due_date")
          .eq("student_id", student.id);

        if (invData && invData.length > 0) {
          const rows = invData as InvoiceRow[];
          const total = rows.reduce((acc, curr) => acc + (curr.amount || 0), 0);
          const paid = rows.reduce(
            (acc, curr) => acc + (curr.status === "paid" ? curr.amount || 0 : 0),
            0
          );
          const pendingInvoices = rows.filter((i) => i.status !== "paid");
          const due =
            pendingInvoices.length > 0
              ? pendingInvoices
                  .sort(
                    (a, b) =>
                      new Date(a.due_date || "").getTime() -
                      new Date(b.due_date || "").getTime()
                  )[0].due_date?.split("T")[0] || "N/A"
              : "N/A";

          setFeesData({ total, paid, due });
        }
      } catch {
        // fees stay at default
      }

      // ── Announcements from Supabase ────────────────────────────────────
      try {
        const { data: annData } = await supabase
          .from("announcements")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(5);

        if (annData && annData.length > 0) {
          setAnnouncements(
            (annData as AnnouncementRow[]).map((a) => ({
              id: a.id,
              title: a.title,
              message: a.message || a.content || "",
              date: a.created_at?.split("T")[0] || "N/A",
              type: (a.type as Announcement["type"]) || "general",
            }))
          );
        }
      } catch {
        // announcements stays empty
      }

      // ── Google Classroom courses linked to batch ───────────────────────
      if (student.batch) {
        try {
          const allBatchMaps: BatchClassroom[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith("classroom_batch_map_")) {
              const entries: BatchClassroom[] = JSON.parse(
                localStorage.getItem(key) || "[]"
              );
              const matched = entries.filter(
                (e: BatchClassroom) => e.batchName === student.batch
              );
              allBatchMaps.push(...matched);
            }
          }
          setClassroomCourses(allBatchMaps);
        } catch {
          // ignore
        }
      }

      // ── Study materials from real uploads only (no mock data) ──────────
      const saved = localStorage.getItem("study_materials");
      if (saved) {
        try {
          const parsed: StudyMaterial[] = JSON.parse(saved);
          setMaterials(parsed.slice(0, 5));
        } catch {
          // ignore corrupt data
        }
      }

      setLoading(false);
    };

    fetchData();
  }, [student.id, student.batch]);

  const presentDays = attendance.filter(
    (a) => a.status === "present" || a.status === "late"
  ).length;
  const attendanceRate =
    attendance.length > 0
      ? ((presentDays / attendance.length) * 100).toFixed(0)
      : "—";

  const handleDownload = (mat: StudyMaterial) => {
    toast({
      title: "Download Started",
      description: `Downloading "${mat.title}"...`,
    });
    if (mat.fileUrl) {
      const a = document.createElement("a");
      a.href = mat.fileUrl;
      a.download =
        mat.fileName ||
        `${mat.title}.${mat.type === "pdf" ? "pdf" : mat.type === "video" ? "mp4" : "png"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-4 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Welcome, {student.name}
        </h2>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mt-2">
          <p className="text-sm font-medium text-primary bg-primary/10 px-2 py-1 rounded w-fit">
            Enrollment No: {student.enrollmentNo}
          </p>
          <p className="text-sm text-foreground bg-secondary px-2 py-1 rounded w-fit flex items-center gap-1">
            <Hash className="w-3.5 h-3.5" /> GRN: {student.grn || "N/A"}
          </p>
          <p className="text-sm text-muted-foreground bg-secondary px-2 py-1 rounded w-fit">
            Batch: {student.batch}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Attendance"
          value={attendance.length > 0 ? `${attendanceRate}%` : "—"}
          icon={CalendarCheck}
          change={
            attendance.length > 0
              ? `${presentDays}/${attendance.length} days`
              : "No records"
          }
          changeType={attendance.length > 0 ? "positive" : "neutral"}
        />
        <StatCard
          title="Fees Due"
          value={`₹${(feesData.total - feesData.paid).toLocaleString()}`}
          icon={IndianRupee}
          change={feesData.total > 0 ? `Due: ${feesData.due}` : "No invoices"}
          changeType={feesData.total - feesData.paid > 0 ? "negative" : "neutral"}
        />
        <StatCard
          title="Classroom Courses"
          value={classroomCourses.length}
          icon={GraduationCap}
          change={
            classroomCourses.length > 0 ? "Click to join" : "Not linked"
          }
          changeType={classroomCourses.length > 0 ? "positive" : "neutral"}
        />
        <StatCard
          title="Study Materials"
          value={materials.length}
          icon={ClipboardList}
          change={materials.length > 0 ? "Available" : "None uploaded"}
          changeType={materials.length > 0 ? "positive" : "neutral"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Attendance */}
        <div className="surface-elevated rounded-lg p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Recent Attendance
          </h3>
          {attendance.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No attendance records found.
            </p>
          ) : (
            <div className="space-y-2">
              {attendance.map((a, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0"
                >
                  <span className="text-sm text-foreground">
                    {new Date(a.date).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  <StatusBadge
                    variant={
                      a.status === "present"
                        ? "success"
                        : a.status === "late"
                          ? "warning"
                          : "destructive"
                    }
                  >
                    {a.status}
                  </StatusBadge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Study Materials */}
        <div className="surface-elevated rounded-lg p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Study Materials{" "}
            <span className="text-xs font-normal text-muted-foreground ml-2">
              (Latest)
            </span>
          </h3>
          {materials.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No materials uploaded yet.
            </p>
          ) : (
            <div className="space-y-2">
              {materials.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <FileText className="w-4 h-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {m.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {m.subject} &middot; {m.uploadDate}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 shrink-0 ml-2"
                    onClick={() => handleDownload(m)}
                  >
                    <Download className="w-3.5 h-3.5 mr-1" /> Download
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Google Classroom Courses (from batch sync) */}
        {classroomCourses.length > 0 && (
          <div className="surface-elevated rounded-lg p-4 lg:col-span-2">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-primary" />
              Google Classroom Courses
              <span className="text-xs font-normal text-muted-foreground">
                (Linked to your batch: {student.batch})
              </span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {classroomCourses.map((cc, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30 border border-border hover:border-primary/30 transition-colors"
                >
                  <div className="p-2 rounded-md bg-primary/10 shrink-0">
                    <GraduationCap className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {cc.courseName}
                    </p>
                    {cc.enrollmentCode && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <code className="text-xs font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                          Code: {cc.enrollmentCode}
                        </code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(cc.enrollmentCode);
                            toast({
                              title: "Copied!",
                              description:
                                "Enrollment code copied. Use it to join the course.",
                            });
                          }}
                          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Synced:{" "}
                      {new Date(cc.syncedAt).toLocaleDateString("en-IN")}
                    </p>
                  </div>
                  {cc.enrollmentCode && (
                    <a
                      href={`https://classroom.google.com/c/${cc.enrollmentCode}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors shrink-0"
                      title="Open in Google Classroom"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Announcements */}
        <div className="surface-elevated rounded-lg p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Announcements
          </h3>
          {announcements.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No announcements yet.
            </p>
          ) : (
            <div className="space-y-2">
              {announcements.map((a) => (
                <div
                  key={a.id}
                  className="py-1.5 border-b border-border/50 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <Bell className="w-3.5 h-3.5 text-primary" />
                    <p className="text-sm font-medium text-foreground">
                      {a.title}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {a.message}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(a.date).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="text-center text-[10px] text-muted-foreground pt-4">
        Powered by{" "}
        <span className="font-semibold text-foreground">Maheshwari Tech</span>
      </p>
    </div>
  );
}
