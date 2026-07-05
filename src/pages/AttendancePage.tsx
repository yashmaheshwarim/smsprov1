import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Check, X, Save, Loader2, MessageCircle, BookOpen, FileCheck, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { supabase, isUuid } from "@/lib/supabase";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";


interface Student {
  id: string;
  name: string;
  enrollment_no: string;
  batch_name: string;
  phone: string;
  mother_phone?: string;
  father_phone?: string;
  guardian_phone?: string;
  guardian_name?: string;
}

interface AttendanceRecord {
  student_id: string;
  status: "present" | "absent" | "leave";
}

interface ExamInfo {
  examName: string;
  subject: string;
  batch: string;
}

/** Get the best available phone: mother -> father -> student -> guardian */
const getBestPhone = (s: Student): string => {
  return s.mother_phone || s.father_phone || s.phone || s.guardian_phone || '';
};

const sendWhatsAppToStudent = (student: Student, instituteName: string, reason: string = "ABSENT") => {
  const phone = getBestPhone(student);
  if (!phone) return;
  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });
  const message = `Hello,\n This is to inform you that ${student.name} is marked ${reason} today (${today}). \nPlease contact the institute for any queries.\n- ${instituteName}`;
  const cleanPhone = phone.replace(/\D/g, '');
  // Use wa.me which auto-detects WhatsApp Web on desktop or WhatsApp app on mobile
  const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
};

const sendWhatsAppToAll = (students: Student[], instituteName: string, reason: string = "ABSENT") => {
  students.forEach((s, i) => {
    if (getBestPhone(s)) {
      setTimeout(() => sendWhatsAppToStudent(s, instituteName, reason), i * 500);
    }
  });
};

export default function AttendancePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const DEFAULT_UUID = "00000000-0000-0000-0000-000000000001";
  const instId = isAdmin ? (user as AdminUser).instituteId : DEFAULT_UUID;
  const instituteName = isAdmin ? (user as AdminUser).instituteName : "";

  const [students, setStudents] = useState<Student[]>([]);
  const [records, setRecords] = useState<Record<string, "present" | "absent" | "leave">>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"present" | "absent" | "leave" | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState({ total: 0, present: 0, absent: 0, leave: 0 });
  const [showAbsentDialog, setShowAbsentDialog] = useState(false);
  const [absentStudentList, setAbsentStudentList] = useState<Student[]>([]);

  // Exam Attendance state
  const [activeTab, setActiveTab] = useState<"lecture" | "exam">("lecture");
  const [exams, setExams] = useState<ExamInfo[]>([]);
  const [selectedExam, setSelectedExam] = useState<ExamInfo | null>(null);
  const [fetchingExams, setFetchingExams] = useState(false);
  const [showExamSelector, setShowExamSelector] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (isUuid(instId)) {
      fetchData();
      fetchExams();
    }
  }, [instId]);

  const fetchExams = async () => {
    setFetchingExams(true);
    try {
      // Fetch distinct exam_name + subject combinations from marks table
      const { data, error } = await supabase
        .from("marks")
        .select("exam_name, subject, batch:batch_id (name)")
        .eq("institute_id", instId);

      if (error) throw error;

      const examMap = new Map<string, ExamInfo>();
      data?.forEach((d: any) => {
        if (d.exam_name && d.subject) {
          const key = `${d.exam_name}|${d.subject}|${d.batch?.name || ''}`;
          if (!examMap.has(key)) {
            examMap.set(key, {
              examName: d.exam_name,
              subject: d.subject,
              batch: d.batch?.name || '',
            });
          }
        }
      });

      // Also try to get exams from localStorage
      try {
        const saved = localStorage.getItem(`sms_exams_${instId}`);
        if (saved) {
          const parsed: any[] = JSON.parse(saved);
          parsed.forEach((e: any) => {
            if (e.examName && e.subject) {
              const key = `${e.examName}|${e.subject}|${e.batch || ''}`;
              if (!examMap.has(key)) {
                examMap.set(key, {
                  examName: e.examName,
                  subject: e.subject,
                  batch: e.batch || '',
                });
              }
            }
          });
        }
      } catch {}

      setExams(Array.from(examMap.values()));
    } catch (error: any) {
      console.error("Failed to fetch exams:", error);
    } finally {
      setFetchingExams(false);
    }
  };

  const fetchData = async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const { data: sData, error: sErr } = await supabase
        .from("students")
        .select("id, name, enrollment_no, batch_name, phone, mother_phone, father_phone, guardian_phone, guardian_name")
        .eq("institute_id", instId)
        .eq("status", "active")
        .order("name", { ascending: true });

      if (sErr) throw sErr;
      setStudents((sData || []).map((s: any) => ({
        ...s,
        mother_phone: s.mother_phone,
        father_phone: s.father_phone,
        guardian_phone: s.guardian_phone,
        guardian_name: s.guardian_name,
      })));

      let initialRecords: Record<string, "present" | "absent" | "leave"> = {};

      if (activeTab === "exam" && selectedExam) {
        // Fetch from exam_attendance table
        const { data: eaData, error: eaErr } = await supabase
          .from("exam_attendance")
          .select("student_id, status")
          .eq("institute_id", instId)
          .eq("exam_name", selectedExam.examName)
          .eq("exam_date", today);

        if (eaErr) throw eaErr;

        sData?.forEach(s => {
          // Filter students by selected exam's batch
          if (s.batch_name !== selectedExam.batch) return;
          const existing = eaData?.find((a: any) => a.student_id === s.id);
          initialRecords[s.id] = existing ? (existing.status as "present" | "absent" | "leave") : "present";
        });
      } else if (activeTab === "lecture") {
        // Fetch from attendance table (lecture type or legacy null)
        const { data: aData, error: aErr } = await supabase
          .from("attendance")
          .select("student_id, status")
          .eq("institute_id", instId)
          .eq("date", today)
          .or(`type.eq.lecture,type.is.null`);

        if (aErr) throw aErr;

        sData?.forEach(s => {
          const existing = aData?.find((a: any) => a.student_id === s.id);
          initialRecords[s.id] = existing ? (existing.status as "present" | "absent" | "leave") : "present";
        });
      } else {
        // Exam tab but no exam selected — default all to present
        sData?.forEach(s => {
          initialRecords[s.id] = "present";
        });
      }
      setRecords(initialRecords);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  const batches = useMemo(() => {
    if (activeTab === "exam" && selectedExam) {
      return [selectedExam.batch].filter(Boolean);
    }
    return [...new Set(students.map((s) => s.batch_name))].filter(Boolean);
  }, [students, activeTab, selectedExam]);

  const filteredStudents = useMemo(() => {
    let result = students;

    // For exam attendance, filter by selected exam's batch
    if (activeTab === "exam" && selectedExam) {
      result = result.filter((s) => s.batch_name === selectedExam.batch);
    } else if (selectedBatch !== "all") {
      result = result.filter((s) => s.batch_name === selectedBatch);
    }
    
    if (statusFilter) {
      result = result.filter((s) => records[s.id] === statusFilter);
    }
    
    return result;
  }, [students, selectedBatch, statusFilter, records, activeTab, selectedExam]);

  const updateStatus = (studentId: string, status: "present" | "absent" | "leave") => {
    setRecords((prev) => ({ ...prev, [studentId]: status }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const validMarkedBy = user?.id && isUuid(user.id) ? user.id : null;

      const recordsToSave = Object.entries(records).filter(([_, status]) => status === "absent" || status === "present" || status === "leave");
      const savedCount = recordsToSave.length;

      if (savedCount === 0) {
        toast({ title: "No students", description: "No students to save attendance for.", variant: "destructive" });
        setSaving(false);
        return;
      }

      if (activeTab === "exam" && selectedExam) {
        // Save to exam_attendance table
        const examAttendanceToSave = recordsToSave.map(([studentId, status]) => ({
          institute_id: instId,
          student_id: studentId,
          exam_name: selectedExam.examName,
          subject: selectedExam.subject,
          exam_date: today,
          status,
          marked_by: validMarkedBy,
        }));

        // Delete existing exam attendance records for this exam + date
        const { error: deleteError } = await supabase
          .from("exam_attendance")
          .delete()
          .eq("institute_id", instId)
          .eq("exam_name", selectedExam.examName)
          .eq("exam_date", today);

        if (deleteError) throw deleteError;

        const { error: insertError } = await supabase
          .from("exam_attendance")
          .insert(examAttendanceToSave);

        if (insertError) throw insertError;
      } else {
        // Save to attendance table (lecture)
        const attendanceToSave = recordsToSave.map(([studentId, status]) => ({
          institute_id: instId,
          student_id: studentId,
          date: today,
          status,
          type: 'lecture',
          marked_by: validMarkedBy,
        }));

        // Delete existing lecture attendance for today
        const { error: deleteError } = await supabase
          .from("attendance")
          .delete()
          .eq("institute_id", instId)
          .eq("date", today)
          .or(`type.eq.lecture,type.is.null`);

        if (deleteError) throw deleteError;

        const { error: insertError } = await supabase
          .from("attendance")
          .insert(attendanceToSave);

        if (insertError) throw insertError;
      }

      toast({ title: "Success", description: savedCount > 0 
        ? `Attendance saved for ${savedCount} students.` 
        : "Attendance saved successfully." 
      });

      // Calculate stats for summary
      const present = filteredStudents.filter(s => records[s.id] === "present").length;
      const absent = filteredStudents.filter(s => records[s.id] === "absent").length;
      const leave = filteredStudents.filter(s => records[s.id] === "leave").length;

      setSummaryData({ total: filteredStudents.length, present, absent, leave });
      setShowSummary(true);

      // Re-fetch in background AFTER dialog is already shown (don't await)
      fetchData(false).catch(() => {});
    } catch (error: any) {
      toast({ title: "Save Failed", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSelectExam = (exam: ExamInfo) => {
    setSelectedExam(exam);
    setShowExamSelector(false);
    setSelectedBatch("all");
    setStatusFilter(null);
    
    // Fetch data for this exam
    setLoading(true);
    setTimeout(() => {
      fetchData();
    }, 0);
  };

  const handleTabChange = (tab: "lecture" | "exam") => {
    setActiveTab(tab);
    setSelectedExam(null);
    setStatusFilter(null);
    setSelectedBatch("all");
    setLoading(true);
    setTimeout(() => {
      fetchData();
    }, 0);
  };

  // Get counts for stats
  const presentCount = useMemo(() => filteredStudents.filter(s => records[s.id] === "present").length, [filteredStudents, records]);
  const absentCount = useMemo(() => filteredStudents.filter(s => records[s.id] === "absent").length, [filteredStudents, records]);
  const leaveCount = useMemo(() => filteredStudents.filter(s => records[s.id] === "leave").length, [filteredStudents, records]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {activeTab === "exam" ? "Exam Attendance" : "Mark Attendance"}
          </h2>
          <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Tab Switcher */}
          <div className="flex bg-secondary/50 rounded-lg p-0.5 border border-border/50">
            <button
              onClick={() => handleTabChange("lecture")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                activeTab === "lecture"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Lecture
            </button>
            <button
              onClick={() => handleTabChange("exam")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1",
                activeTab === "exam"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <BookOpen className="w-3 h-3" />
              Exam
            </button>
          </div>

          {activeTab === "exam" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowExamSelector(true)}
              className="text-xs"
            >
              {selectedExam ? `${selectedExam.examName} - ${selectedExam.subject}` : "Select Exam"}
            </Button>
          )}

          {activeTab === "lecture" && (
            <select
              value={selectedBatch}
              onChange={(e) => setSelectedBatch(e.target.value)}
              className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">All Batches</option>
              {batches.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          )}
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            Save
          </Button>
        </div>
      </div>

      {/* Exam Selector Dialog */}
      <AlertDialog open={showExamSelector} onOpenChange={setShowExamSelector}>
        <AlertDialogContent className="max-w-[500px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-primary" /> Select Exam
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              Choose an exam to mark attendance for
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-[400px] overflow-y-auto space-y-2">
            {fetchingExams ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : exams.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No exams found. Create exams in the Marks section first.
              </div>
            ) : (
              exams.map((exam, index) => (
                <button
                  key={`${exam.examName}|${exam.subject}|${exam.batch}`}
                  onClick={() => handleSelectExam(exam)}
                  className="w-full text-left flex items-center gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/60 border border-border/50 transition-all"
                >
                  <span className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{exam.examName}</p>
                    <p className="text-xs text-muted-foreground">{exam.subject} · {exam.batch}</p>
                  </div>
                  <span className="text-[10px] font-medium text-primary bg-primary/10 px-2 py-1 rounded-md shrink-0">
                    {exam.batch}
                  </span>
                </button>
              ))
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowExamSelector(false)}>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Stats - Clickable to filter students by status */}
      <div className="grid grid-cols-4 gap-3">
        <button
          onClick={() => setStatusFilter(statusFilter === "present" ? null : "present")}
          className={cn(
            "surface-elevated rounded-lg p-4 text-center border transition-all",
            statusFilter === "present"
              ? "border-success ring-2 ring-success/30 bg-success/5"
              : "border-success/20 hover:border-success/40 hover:bg-success/5"
          )}
        >
          <p className="text-3xl font-bold text-success tabular-nums">{presentCount}</p>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-1">
            Present {statusFilter === "present" && "▼"}
          </p>
        </button>
        <button
          onClick={() => {
            const absStudents = filteredStudents.filter(s => records[s.id] === "absent");
            setAbsentStudentList(absStudents);
            if (absStudents.length > 0) {
              setShowAbsentDialog(true);
            }
          }}
          className={cn(
            "surface-elevated rounded-lg p-4 text-center border transition-all",
            statusFilter === "absent"
              ? "border-destructive ring-2 ring-destructive/30 bg-destructive/5"
              : "border-destructive/20 hover:border-destructive/40 hover:bg-destructive/5"
          )}
        >
          <p className="text-3xl font-bold text-destructive tabular-nums">{absentCount}</p>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-1">
            Absent {statusFilter === "absent" && "▼"}
          </p>
        </button>
        <button
          onClick={() => setStatusFilter(statusFilter === "leave" ? null : "leave")}
          className={cn(
            "surface-elevated rounded-lg p-4 text-center border transition-all",
            statusFilter === "leave"
              ? "border-warning ring-2 ring-warning/30 bg-warning/5"
              : "border-warning/20 hover:border-warning/40 hover:bg-warning/5"
          )}
        >
          <p className="text-3xl font-bold text-warning tabular-nums">{leaveCount}</p>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-1">
            Leave {statusFilter === "leave" && "▼"}
          </p>
        </button>
        {/* Total Students Card */}
        <div
          className={cn(
            "surface-elevated rounded-lg p-4 text-center border transition-all",
            "border-border/50 bg-card/50"
          )}
        >
          <p className="text-3xl font-bold text-foreground tabular-nums">{filteredStudents.length}</p>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-1">
            Total Students
          </p>
        </div>
      </div>
      {statusFilter && (
        <div className="flex items-center justify-center">
          <button
            onClick={() => setStatusFilter(null)}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            Clear filter — showing only <strong>{statusFilter}</strong> students
          </button>
        </div>
      )}

      {/* Attendance List */}
      <div className="surface-elevated rounded-lg divide-y divide-border/50 overflow-hidden border border-border/50">
        {filteredStudents.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            {activeTab === "exam" && !selectedExam 
              ? "Select an exam from above to mark attendance."
              : "No active students found."}
          </div>
        ) : (
          filteredStudents.map((student) => {
            const status = records[student.id] || "present";
            return (
              <div
                key={student.id}
                className="flex items-center justify-between px-4 py-3 hover:bg-secondary/30 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                    <span className="text-xs font-bold text-primary">
                      {student.name.split(" ").filter(Boolean).map((n) => n[0]).join("")}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{student.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{student.enrollment_no}</p>
                  </div>
                </div>
                <div className="flex gap-1 p-1 bg-secondary/50 rounded-lg shrink-0 border border-border/50">
                  <button
                    onClick={() => updateStatus(student.id, "present")}
                    className={cn(
                      "px-4 py-1.5 text-xs font-bold rounded-md transition-all active:scale-95",
                      status === "present"
                        ? "bg-success text-success-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                    )}
                  >
                    P
                  </button>
                  <button
                    onClick={() => updateStatus(student.id, "absent")}
                    className={cn(
                      "px-4 py-1.5 text-xs font-bold rounded-md transition-all active:scale-95",
                      status === "absent"
                        ? "bg-destructive text-destructive-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                    )}
                  >
                    A
                  </button>
                  <button
                    onClick={() => updateStatus(student.id, "leave")}
                    className={cn(
                      "px-4 py-1.5 text-xs font-bold rounded-md transition-all active:scale-95",
                      status === "leave"
                        ? "bg-warning text-warning-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                    )}
                  >
                    L
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Absent Students Dialog - Only shows absent students, not leave */}
      <AlertDialog open={showAbsentDialog} onOpenChange={setShowAbsentDialog}>
        <AlertDialogContent className="max-w-[500px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl flex items-center gap-2">
              <X className="w-5 h-5 text-destructive" /> Absent Students
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              {absentStudentList.length} student{absentStudentList.length !== 1 ? "s" : ""} marked absent today
              {leaveCount > 0 && ` · ${leaveCount} student${leaveCount !== 1 ? "s" : ""} on leave are excluded`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-[400px] overflow-y-auto space-y-2">
            {absentStudentList.map((student, index) => (
              <div
                key={student.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-destructive/5 border border-destructive/10"
              >
                <span className="w-6 h-6 rounded-full bg-destructive/10 flex items-center justify-center shrink-0 text-xs font-bold text-destructive">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{student.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{student.enrollment_no}</p>
                  {getBestPhone(student) && (
                    <p className="text-[10px] text-muted-foreground/70 font-mono">{getBestPhone(student)}</p>
                  )}
                </div>
                {student.batch_name && (
                  <span className="text-[10px] font-medium text-muted-foreground bg-secondary/50 px-2 py-1 rounded-md border border-border/50 shrink-0">
                    {student.batch_name}
                  </span>
                )}
                {getBestPhone(student) ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); sendWhatsAppToStudent(student, instituteName); }}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-green-500/10 text-green-600 hover:bg-green-500/20 hover:text-green-700 border border-green-500/20 transition-all shrink-0 text-[10px] font-medium"
                    title="Send WhatsApp (opens app on mobile)"
                  >
                    <Smartphone className="w-3 h-3" />
                    <MessageCircle className="w-3 h-3" />
                    WhatsApp
                  </button>
                ) : (
                  <span className="text-[10px] text-muted-foreground italic shrink-0">No phone</span>
                )}
              </div>
            ))}
          </div>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => setShowAbsentDialog(false)} className="mt-0">Close</AlertDialogCancel>
            {absentStudentList.some(s => getBestPhone(s)) && (
              <AlertDialogAction
                onClick={() => sendWhatsAppToAll(absentStudentList, instituteName)}
                className="bg-green-600 hover:bg-green-700"
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                Notify All via WhatsApp
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Attendance Summary Dialog — with WhatsApp redirect for absent students */}
      <AlertDialog open={showSummary} onOpenChange={setShowSummary}>
        <AlertDialogContent className="max-w-[480px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl">
              {activeTab === "exam" ? "Exam Attendance Saved ✅" : "Attendance Saved ✅"}
            </AlertDialogTitle>
            <div className="space-y-3 pt-4">
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="p-3 bg-secondary/50 rounded-xl border border-border/50 transition-colors hover:bg-secondary">
                  <p className="text-xl font-bold text-foreground leading-none mb-1">{summaryData.total}</p>
                  <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Total</p>
                </div>
                <div className="p-3 bg-success/10 rounded-xl border border-success/20 transition-colors hover:bg-success/20">
                  <p className="text-xl font-bold text-success leading-none mb-1">{summaryData.present}</p>
                  <p className="text-[10px] uppercase font-bold tracking-wider text-success">Present</p>
                </div>
                <div className="p-3 bg-destructive/10 rounded-xl border border-destructive/20 transition-colors hover:bg-destructive/20">
                  <p className="text-xl font-bold text-destructive leading-none mb-1">{summaryData.absent}</p>
                  <p className="text-[10px] uppercase font-bold tracking-wider text-destructive">Absent</p>
                </div>
                <div className="p-3 bg-warning/10 rounded-xl border border-warning/20 transition-colors hover:bg-warning/20">
                  <p className="text-xl font-bold text-warning leading-none mb-1">{summaryData.leave}</p>
                  <p className="text-[10px] uppercase font-bold tracking-wider text-warning">Leave</p>
                </div>
              </div>

              {summaryData.absent > 0 && (
                <>
                  <div className="border-t border-border/50 pt-3">
                    <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                      <MessageCircle className="w-4 h-4 text-green-600" />
                      Notify parents of absent students via WhatsApp
                    </p>
                    <div className="max-h-[200px] overflow-y-auto space-y-1.5">
                      {filteredStudents
                        .filter(s => records[s.id] === "absent")
                        .map(student => {
                          const bestPhone = getBestPhone(student);
                          return (
                            <div key={student.id} className="flex items-center justify-between p-2 rounded-lg bg-destructive/5 border border-destructive/10">
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-foreground truncate">{student.name}</p>
                                {bestPhone && (
                                  <p className="text-[10px] text-muted-foreground font-mono">{bestPhone}</p>
                                )}
                              </div>
                              {bestPhone ? (
                                <button
                                  onClick={() => sendWhatsAppToStudent(student, instituteName)}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-green-500/10 text-green-600 hover:bg-green-500/20 border border-green-500/20 transition-all text-xs font-medium shrink-0 ml-2"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                  Send
                                </button>
                              ) : (
                                <span className="text-[10px] text-muted-foreground italic shrink-0 ml-2">No phone</span>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  <Button
                    onClick={() => {
                      const absStudents = filteredStudents.filter(s => records[s.id] === "absent");
                      sendWhatsAppToAll(absStudents, instituteName);
                    }}
                    className="w-full bg-green-600 hover:bg-green-700 mt-2"
                    size="sm"
                  >
                    <MessageCircle className="w-4 h-4 mr-2" />
                    Send WhatsApp to All ({summaryData.absent} students)
                  </Button>
                </>
              )}
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowSummary(false)} className="w-full">
              Close
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
