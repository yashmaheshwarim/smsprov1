import { useState, useEffect, useMemo } from "react";
import { useAuth, TeacherUser } from "@/contexts/AuthContext";
import { supabase, isUuid } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Users, CalendarCheck, BookOpen, ClipboardList, FileCheck,
  GraduationCap, Bell, ChevronRight, Check, X, Clock, Loader2,
  CalendarDays, MessageCircle, AlertCircle
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface BatchStudents {
  batchName: string;
  students: Array<{
    id: string;
    name: string;
    enrollment_no: string;
    phone: string;
  }>;
  attendanceMarked: boolean;
}

interface LeaveSummary {
  pending: number;
  approved: number;
  total: number;
}

export default function TeacherDashboardPage() {
  const { user } = useAuth();
  const teacher = user as TeacherUser;
  const todayStr = new Date().toISOString().split("T")[0];

  const [batches, setBatches] = useState<BatchStudents[]>([]);
  const [loading, setLoading] = useState(true);
  const [leaveSummary, setLeaveSummary] = useState<LeaveSummary>({ pending: 0, approved: 0, total: 0 });
  const [todayStats, setTodayStats] = useState({ present: 0, absent: 0, late: 0, total: 0 });
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, "present" | "absent" | "late">>({});
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);
  const [absentStudents, setAbsentStudents] = useState<any[]>([]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const assignedClasses = teacher.assignedClasses || [];
      if (assignedClasses.length === 0) {
        setBatches([]);
        setLoading(false);
        return;
      }

      // Fetch students for each assigned batch
      const batchPromises = assignedClasses.map(async (batchName) => {
        const { data: students, error } = await supabase
          .from("students")
          .select("id, name, enrollment_no, phone, student_phone, mother_phone, father_phone, guardian_phone")
          .eq("batch_name", batchName)
          .eq("status", "active");

        if (error) {
          console.error(`Error fetching students for batch ${batchName}:`, error);
          return { batchName, students: [], attendanceMarked: false };
        }

        // Check if attendance already marked for today
        const studentIds = (students || []).map(s => s.id);
        let attendanceMarked = false;
        if (studentIds.length > 0) {
          const { count } = await supabase
            .from("attendance")
            .select("*", { count: "exact", head: true })
            .eq("date", todayStr)
            .in("student_id", studentIds)
            .limit(1);

          attendanceMarked = (count || 0) > 0;
        }

        return {
          batchName,
          students: (students || []).map(s => ({
            id: s.id,
            name: s.name,
            enrollment_no: s.enrollment_no,
            phone: s.student_phone || s.phone || s.mother_phone || s.father_phone || s.guardian_phone || "",
          })),
          attendanceMarked,
        };
      });

      const batchResults = await Promise.all(batchPromises);
      setBatches(batchResults);

      // Calculate today's attendance stats
      let totalPresent = 0, totalAbsent = 0, totalLate = 0, totalCount = 0;
      const allStudentIds = batchResults.flatMap(b => b.students.map(s => s.id));
      
      if (allStudentIds.length > 0) {
        const { data: todayAtt } = await supabase
          .from("attendance")
          .select("student_id, status")
          .eq("date", todayStr)
          .in("student_id", allStudentIds);

        if (todayAtt) {
          totalPresent = todayAtt.filter(a => a.status === "present").length;
          totalAbsent = todayAtt.filter(a => a.status === "absent").length;
          totalLate = todayAtt.filter(a => a.status === "late").length;
        }
      }
      totalCount = allStudentIds.length;
      setTodayStats({ present: totalPresent, absent: totalAbsent, late: totalLate, total: totalCount });

      // Fetch leave requests summary
      const { data: teacherRecord } = await supabase
        .from("teachers")
        .select("id")
        .eq("email", teacher.email)
        .maybeSingle();

      if (teacherRecord) {
        const { data: leaves } = await supabase
          .from("leave_requests")
          .select("status")
          .eq("teacher_id", teacherRecord.id);

        if (leaves) {
          setLeaveSummary({
            pending: leaves.filter(l => l.status === "pending").length,
            approved: leaves.filter(l => l.status === "approved").length,
            total: leaves.length,
          });
        }
      }
    } catch (error: any) {
      console.error("Error loading dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Quick attendance marking for a single batch
  const markAllPresent = async (batchName: string) => {
    const batch = batches.find(b => b.batchName === batchName);
    if (!batch || batch.students.length === 0) return;

    try {
      // Get teacher's record for marked_by
      const { data: teacherRecord } = await supabase
        .from("teachers")
        .select("id")
        .eq("email", teacher.email)
        .maybeSingle();

      const records = batch.students.map(s => ({
        institute_id: teacher.instituteId,
        student_id: s.id,
        date: todayStr,
        status: "present" as const,
        marked_by: teacherRecord?.id || null,
      }));

      const { error } = await supabase.from("attendance").insert(records);
      if (error) throw error;

      setBatches(prev => prev.map(b =>
        b.batchName === batchName ? { ...b, attendanceMarked: true } : b
      ));
      setTodayStats(prev => ({
        ...prev,
        present: prev.present + batch.students.length,
        total: prev.total,
      }));
      toast({ title: "Attendance Marked", description: `${batch.students.length} students in ${batchName} marked present.` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  // Save attendance with per-student status (from quick actions or full page)
  const handleSaveBatchAttendance = async (batchName: string) => {
    const batch = batches.find(b => b.batchName === batchName);
    if (!batch || batch.students.length === 0) return;      try {
        const { data: teacherRecord } = await supabase
          .from("teachers")
          .select("id")
          .eq("email", teacher.email)
          .maybeSingle();

        const records = batch.students.map(s => ({
          institute_id: teacher.instituteId,
        student_id: s.id,
        date: todayStr,
        status: attendanceRecords[s.id] || "present",
        marked_by: teacherRecord?.id || null,
      }));

      const { error } = await supabase.from("attendance").insert(records);
      if (error) throw error;

      setBatches(prev => prev.map(b =>
        b.batchName === batchName ? { ...b, attendanceMarked: true } : b
      ));

      const absent = records.filter(r => r.status === "absent");
      if (absent.length > 0) {
        setAbsentStudents(absent.map(a => {
          const student = batch.students.find(s => s.id === a.student_id);
          return { ...a, studentName: student?.name, phone: student?.phone };
        }));
        setShowWhatsAppDialog(true);
      }

      toast({ title: "Attendance Saved", description: `Attendance for ${batchName} saved.` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const sendWhatsAppMessage = (student: any) => {
    if (!student.phone) return;
    const message = `Your child ${student.studentName} was marked ABSENT today. - ${teacher.name}`;
    window.open(`https://wa.me/${student.phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`, "_blank");
  };

  const totalStudents = batches.reduce((s, b) => s + b.students.length, 0);
  const markedBatches = batches.filter(b => b.attendanceMarked).length;

  if (loading) {
    return (
      <div className="p-4 lg:p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
      {/* Welcome Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Welcome back, {teacher.name.split(" ")[0]} 👋
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/teacher/leaves">
            <Button size="sm" variant="outline" className="relative">
              <CalendarDays className="w-4 h-4 mr-1" />
              Leaves
              {leaveSummary.pending > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-warning text-warning-foreground text-[9px] font-bold rounded-full flex items-center justify-center">
                  {leaveSummary.pending}
                </span>
              )}
            </Button>
          </Link>
          <Link to="/teacher/attendance">
            <Button size="sm">
              <CalendarCheck className="w-4 h-4 mr-1" />
              Full Attendance
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="My Batches"
          value={teacher.assignedClasses?.length || 0}
          icon={GraduationCap}
          change={`${markedBatches}/${batches.length} marked today`}
          changeType={markedBatches === batches.length && batches.length > 0 ? "positive" : "neutral"}
        />
        <StatCard
          title="Total Students"
          value={totalStudents}
          icon={Users}
          change={todayStats.total > 0 ? `${todayStats.present + todayStats.late}/${todayStats.total} present today` : "No data today"}
          changeType={todayStats.total > 0 && (todayStats.present + todayStats.late) / todayStats.total >= 0.8 ? "positive" : "neutral"}
        />
        <StatCard
          title="Present Today"
          value={todayStats.present}
          icon={Check}
          change={`${todayStats.late} late`}
          changeType={todayStats.present > 0 ? "positive" : "neutral"}
        />
        <StatCard
          title="Leave Requests"
          value={leaveSummary.total}
          icon={CalendarDays}
          change={`${leaveSummary.pending} pending`}
          changeType={leaveSummary.pending > 0 ? "negative" : "positive"}
        />
      </div>

      {/* Batch Cards */}
      {batches.length === 0 ? (
        <div className="surface-elevated rounded-lg p-8 text-center">
          <GraduationCap className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
          <h3 className="text-base font-semibold text-foreground mb-1">No Batches Assigned</h3>
          <p className="text-sm text-muted-foreground">Contact your admin to get assigned to batches.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {batches.map((batch) => (
            <div
              key={batch.batchName}
              className={cn(
                "surface-elevated rounded-lg overflow-hidden border transition-all",
                batch.attendanceMarked
                  ? "border-success/30 bg-success/[0.02]"
                  : "border-border"
              )}
            >
              {/* Batch Header */}
              <div className={cn(
                "flex items-center justify-between px-4 py-3 border-b",
                batch.attendanceMarked ? "border-success/20 bg-success/5" : "border-border bg-secondary/30"
              )}>
                <div className="flex items-center gap-2">
                  <GraduationCap className={cn(
                    "w-4 h-4",
                    batch.attendanceMarked ? "text-success" : "text-primary"
                  )} />
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{batch.batchName}</h3>
                    <p className="text-[10px] text-muted-foreground">{batch.students.length} students</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {batch.attendanceMarked ? (
                    <StatusBadge variant="success">Attendance Done ✓</StatusBadge>
                  ) : (
                    <StatusBadge variant="warning">Pending</StatusBadge>
                  )}
                  <Link to="/teacher/attendance">
                    <Button size="sm" variant="ghost" className="h-7 text-xs">
                      View <ChevronRight className="w-3 h-3 ml-0.5" />
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Student List (first 5) */}
              <div className="divide-y divide-border/30">
                {batch.students.slice(0, 5).map((student) => (
                  <div key={student.id} className="flex items-center justify-between px-4 py-2 hover:bg-secondary/20 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-[9px] font-semibold text-primary">
                          {student.name.split(" ").map(n => n[0]).join("")}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{student.name}</p>
                        <p className="text-[10px] text-muted-foreground">{student.enrollment_no}</p>
                      </div>
                    </div>
                    {!batch.attendanceMarked && (
                      <div className="flex gap-1 shrink-0">
                        {(["present", "absent", "late"] as const).map((status) => (
                          <button
                            key={status}
                            onClick={() => setAttendanceRecords(prev => ({ ...prev, [student.id]: status }))}
                            className={cn(
                              "px-2 py-1 text-[10px] font-medium rounded transition-all",
                              attendanceRecords[student.id] === status
                                ? status === "present"
                                  ? "bg-success text-success-foreground"
                                  : status === "absent"
                                  ? "bg-destructive text-destructive-foreground"
                                  : "bg-warning text-warning-foreground"
                                : "bg-secondary text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {status === "present" ? "P" : status === "absent" ? "A" : "L"}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {batch.students.length > 5 && (
                  <Link
                    to="/teacher/attendance"
                    className="flex items-center justify-center px-4 py-2 text-[10px] font-medium text-primary hover:bg-primary/5 transition-colors"
                  >
                    View all {batch.students.length} students →
                  </Link>
                )}
              </div>

              {/* Quick Actions */}
              {!batch.attendanceMarked && (
                <div className="px-4 py-2.5 border-t border-border bg-secondary/20 flex gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 text-xs flex-1"
                    onClick={() => handleSaveBatchAttendance(batch.batchName)}
                  >
                    <Check className="w-3 h-3 mr-1" />
                    Save Attendance
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => markAllPresent(batch.batchName)}
                  >
                    <Users className="w-3 h-3 mr-1" />
                    All Present
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Quick Links */}
      <div className="surface-elevated rounded-lg p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {[
            { icon: CalendarCheck, label: "Attendance", href: "/teacher/attendance" },
            { icon: Users, label: "Students", href: "/teacher/students" },
            { icon: FileCheck, label: "Enter Marks", href: "/teacher/marks" },
            { icon: BookOpen, label: "Materials", href: "/teacher/materials" },
            { icon: ClipboardList, label: "Assignments", href: "/teacher/assignments" },
            { icon: CalendarDays, label: "Apply Leave", href: "/teacher/leaves" },
          ].map((action) => (
            <Link
              key={action.label}
              to={action.href}
              className="flex items-center gap-2 px-3 py-2.5 rounded-md hover:bg-secondary transition-colors group"
            >
              <action.icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              <span className="text-xs font-medium text-foreground">{action.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* WhatsApp Dialog for Absent Students */}
      <Dialog open={showWhatsAppDialog} onOpenChange={setShowWhatsAppDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send Absence Notifications</DialogTitle>
            <DialogDescription>Send WhatsApp messages to parents of absent students.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {absentStudents.map((student) => (
              <div key={student.student_id} className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                <div>
                  <p className="text-sm font-medium">{student.studentName}</p>
                  {student.phone && <p className="text-xs text-muted-foreground font-mono">{student.phone}</p>}
                </div>
                <Button size="sm" variant="outline" onClick={() => sendWhatsAppMessage(student)} className="flex items-center gap-2">
                  <MessageCircle className="w-4 h-4" />
                  Send
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowWhatsAppDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
