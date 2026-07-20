import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Check, X, Save, Loader2, MessageCircle, BookOpen, FileCheck, Smartphone } from "lucide-react";
import { cn, formatWhatsAppPhone } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { supabase, isUuid } from "@/lib/supabase";
import { restSendMessage, fetchSessionStatus } from "@/lib/whatsapp-socket";
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
  examDate: string;
}

/** Get the best available phone: mother -> father -> student -> guardian */
const getBestPhone = (s: Student): string => {
  return s.mother_phone || s.father_phone || s.phone || s.guardian_phone || '';
};

/** Build the absent message text */
const buildAbsentMessage = (studentName: string, instituteName: string, reason: string = "ABSENT"): string => {
  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });
  return `Hello, this is to inform you that ${studentName} is marked ${reason} today (${today}). Please contact the institute for any queries. - ${instituteName}`;
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
  const [studentPage, setStudentPage] = useState(0);
  const PAGE_SIZE = 20;
  const [showAbsentDialog, setShowAbsentDialog] = useState(false);
  const [absentStudentList, setAbsentStudentList] = useState<Student[]>([]);

  // Batch attendance status (realtime — computed from both DB saves and local state)
  const [savedBatches, setSavedBatches] = useState<Set<string>>(new Set());

  // Baileys WhatsApp connection state
  const [baileysConnected, setBaileysConnected] = useState(false);

  // Check Baileys session status
  useEffect(() => {
    if (!isUuid(instId)) return;
    const checkBaileys = async () => {
      try {
        const status = await fetchSessionStatus(instId);
        setBaileysConnected(status?.status === "connected");
      } catch {
        setBaileysConnected(false);
      }
    };
    checkBaileys();
    const interval = setInterval(checkBaileys, 10000);
    return () => clearInterval(interval);
  }, [instId]);

  // WhatsApp sent status tracking (green tick)
  const [whatsAppSentStatus, setWhatsAppSentStatus] = useState<Record<string, boolean>>({});

  // Check wallet credits before sending
  const checkWalletCredits = async (): Promise<boolean> => {
    if (!isUuid(instId)) return true;
    try {
      const { data: inst } = await supabase
        .from("institutes")
        .select("wallet_credits")
        .eq("id", instId)
        .single();
      if (!inst || (inst.wallet_credits || 0) < 1) {
        toast({ title: "Insufficient Credits", description: "No wallet credits left. Contact super admin to recharge.", variant: "destructive" });
        return false;
      }
      return true;
    } catch {
      return true;
    }
  };

  // Debit 1 credit per message
  const debitWalletCredit = async (studentId: string): Promise<boolean> => {
    if (!isUuid(instId)) return true;
    try {
      const { data: inst } = await supabase
        .from("institutes")
        .select("wallet_credits")
        .eq("id", instId)
        .single();
      const currentBalance = inst?.wallet_credits || 0;
      if (currentBalance < 1) return false;
      const { error } = await supabase
        .from("institutes")
        .update({ wallet_credits: currentBalance - 1 })
        .eq("id", instId);
      if (error) throw error;
      await supabase.from("wallet_transactions").insert([{
        institute_id: instId,
        type: "debit",
        amount: 1,
        description: `WhatsApp message to student ${studentId}`,
        reference_type: "whatsapp",
        balance_before: currentBalance,
        balance_after: currentBalance - 1,
      }]);
      return true;
    } catch (err) {
      console.error("Failed to debit wallet:", err);
      return false;
    }
  };

  // Combined send: try Baileys first, fall back to wa.me
  const sendWhatsAppToStudent = (student: Student, reason: string = "ABSENT") => {
    const phone = getBestPhone(student);
    if (!phone) return;
    if (baileysConnected) {
      // Send via Baileys with credit check + debit
      checkWalletCredits().then(hasCredits => {
        if (!hasCredits) return;
        const msg = buildAbsentMessage(student.name, instituteName, reason);
        restSendMessage(instId, formatWhatsAppPhone(phone), msg).then(result => {
          if (result.success) {
            debitWalletCredit(student.id);
            setWhatsAppSentStatus(prev => ({ ...prev, [student.id]: true }));
            toast({ title: "WhatsApp Sent ✓", description: `Message sent to ${student.name}` });
          } else {
            toast({ title: "Send Failed", description: result.error || "Could not send", variant: "destructive" });
          }
        });
      });
      return;
    }
    // Fallback: wa.me link (no credit debit for manual wa.me)
    const message = buildAbsentMessage(student.name, instituteName, reason);
    const formattedPhone = formatWhatsAppPhone(phone);
    window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  // Send WhatsApp to all absent students with 3-5s delay + credit debit per message
  const sendWhatsAppToAll = async (students: Student[], reason: string = "ABSENT") => {
    const hasCredits = await checkWalletCredits();
    if (!hasCredits) return;

    let sent = 0;
    let failed = 0;

    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      const phone = getBestPhone(student);
      if (!phone) { failed++; continue; }

      const hasCredit = await checkWalletCredits();
      if (!hasCredit) break;

      const debited = await debitWalletCredit(student.id);
      if (!debited) { failed++; continue; }

      const message = buildAbsentMessage(student.name, instituteName, reason);
      const formattedPhone = formatWhatsAppPhone(phone);
      const result = await restSendMessage(instId, formattedPhone, message);

      if (result.success) {
        sent++;
        setWhatsAppSentStatus(prev => ({ ...prev, [student.id]: true }));
      } else {
        failed++;
        // Refund credit on failure
        try {
          const { data: inst } = await supabase
            .from("institutes").select("wallet_credits").eq("id", instId).single();
          if (inst) {
            await supabase.from("institutes").update({ wallet_credits: (inst.wallet_credits || 0) + 1 }).eq("id", instId);
          }
        } catch {}
      }

      // 3-5 second delay for anti-ban
      if (i < students.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 2000));
      }
    }

    toast({
      title: "Batch Sent",
      description: `${sent} sent ✓, ${failed} failed${failed > 0 ? " — check WhatsApp page for details" : ""}`,
      variant: failed > 0 ? "destructive" : "default",
    });
  };

  // Exam Attendance state
  const [activeTab, setActiveTab] = useState<"lecture" | "exam">("lecture");
  const [exams, setExams] = useState<ExamInfo[]>([]);
  const [selectedExam, setSelectedExam] = useState<ExamInfo | null>(null);
  const [fetchingExams, setFetchingExams] = useState(false);
  const [showExamSelector, setShowExamSelector] = useState(false);
  const [examDateFilter, setExamDateFilter] = useState("");
  const [selectorDateFilter, setSelectorDateFilter] = useState("");

  // ── Realtime subscriptions ──────────────────────────────────────────────
  const attendanceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const examAttendanceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Store latest fetchData/fetchExams in refs so realtime callbacks are never stale
  const fetchDataRef = useRef<typeof fetchData>(fetchData);
  const fetchExamsRef = useRef<typeof fetchExams>(fetchExams);
  fetchDataRef.current = fetchData;
  fetchExamsRef.current = fetchExams;

  useEffect(() => {
    if (isUuid(instId)) {
      fetchData();
      fetchExams();
      subscribeToAttendanceRealtime();
      subscribeToExamAttendanceRealtime();
    }
    return () => {
      if (attendanceChannelRef.current) {
        supabase.removeChannel(attendanceChannelRef.current);
        attendanceChannelRef.current = null;
      }
      if (examAttendanceChannelRef.current) {
        supabase.removeChannel(examAttendanceChannelRef.current);
        examAttendanceChannelRef.current = null;
      }
    };
  }, [instId]);

  const subscribeToAttendanceRealtime = () => {
    if (!instId || !isUuid(instId)) return;
    const channel = supabase
      .channel(`attendance-realtime-${instId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "attendance",
          filter: `institute_id=eq.${instId}`,
        },
        () => {
          // Re-fetch data when attendance changes (lecture attendance)
          fetchDataRef.current(false);
        }
      )
      .subscribe();
    attendanceChannelRef.current = channel;
  };

  const subscribeToExamAttendanceRealtime = () => {
    if (!instId || !isUuid(instId)) return;
    const channel = supabase
      .channel(`exam-attendance-realtime-${instId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "exam_attendance",
          filter: `institute_id=eq.${instId}`,
        },
        () => {
          // Re-fetch data when exam attendance changes
          fetchDataRef.current(false);
          // Also re-fetch exams list to update available exam names/dates
          fetchExamsRef.current();
        }
      )
      .subscribe();
    examAttendanceChannelRef.current = channel;
  };

  const today = new Date().toISOString().split("T")[0];

  const fetchExams = async () => {
    setFetchingExams(true);
    try {
      const examMap = new Map<string, ExamInfo>();

      // 1. Fetch from marks table (distinct exam_name + subject + batch + exam_date)
      const { data, error } = await supabase
        .from("marks")
        .select("exam_name, subject, exam_date, batch:batch_id (name)")
        .eq("institute_id", instId);

      if (error) throw error;

      data?.forEach((d: any) => {
        if (d.exam_name && d.subject) {
          const dateStr = d.exam_date || new Date().toISOString().split("T")[0];
          const key = `${d.exam_name}|${d.subject}|${d.batch?.name || ''}|${dateStr}`;
          if (!examMap.has(key)) {
            examMap.set(key, {
              examName: d.exam_name,
              subject: d.subject,
              batch: d.batch?.name || '',
              examDate: dateStr,
            });
          }
        }
      });

      // 2. Fetch from exam_attendance table (already has exam_date)
      const { data: eaData, error: eaError } = await supabase
        .from("exam_attendance")
        .select("exam_name, subject, exam_date")
        .eq("institute_id", instId);

      if (!eaError && eaData) {
        // Also get batch info from the marks table or students via batch lookup
        eaData.forEach((d: any) => {
          if (d.exam_name) {
            const dateStr = d.exam_date || new Date().toISOString().split("T")[0];
            const key = `${d.exam_name}|${d.subject || ''}||${dateStr}`;
            if (!examMap.has(key)) {
              examMap.set(key, {
                examName: d.exam_name,
                subject: d.subject || '',
                batch: '',
                examDate: dateStr,
              });
            }
          }
        });
      }

      // 3. Also try to get exams from localStorage (which now includes examDate)
      try {
        const saved = localStorage.getItem(`sms_exams_${instId}`);
        if (saved) {
          const parsed: any[] = JSON.parse(saved);
          parsed.forEach((e: any) => {
            if (e.examName) {
              const dateStr = e.examDate || new Date().toISOString().split("T")[0];
              const key = `${e.examName}|${e.subject || ''}|${e.batch || ''}|${dateStr}`;
              if (!examMap.has(key)) {
                examMap.set(key, {
                  examName: e.examName,
                  subject: e.subject || '',
                  batch: e.batch || '',
                  examDate: dateStr,
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
        const effectiveDate = examDateFilter || today;
        const { data: eaData, error: eaErr } = await supabase
          .from("exam_attendance")
          .select("student_id, status")
          .eq("institute_id", instId)
          .eq("exam_name", selectedExam.examName)
          .eq("exam_date", effectiveDate);

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

        // Determine which batches have attendance saved for today
        if (aData && aData.length > 0) {
          const studentIdsWithAttendance = new Set(aData.map((a: any) => a.student_id));
          const batchesWithAttendance = new Set(
            (sData || [])
              .filter((s: any) => studentIdsWithAttendance.has(s.id))
              .map((s: any) => s.batch_name)
              .filter(Boolean)
          );
          setSavedBatches(new Set(batchesWithAttendance));
        } else {
          setSavedBatches(new Set());
        }
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

  // All batches with their realtime status (saved vs pending)
  const batchStatusList = useMemo(() => {
    if (activeTab !== "lecture") return [];
    const allBatches = [...new Set(students.map((s) => s.batch_name).filter(Boolean))];
    return allBatches.map((batch) => ({
      name: batch,
      saved: savedBatches.has(batch),
      studentCount: students.filter((s) => s.batch_name === batch).length,
    }));
  }, [savedBatches, students, activeTab]);

  // Batches still pending (not saved yet)
  const pendingBatches = useMemo(() => {
    return batchStatusList.filter((b) => !b.saved).map((b) => b.name);
  }, [batchStatusList]);

  const savedBatchCount = batchStatusList.filter((b) => b.saved).length;
  const totalBatchCount = batchStatusList.length;

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

  const paginatedStudents = useMemo(() => {
    const start = studentPage * PAGE_SIZE;
    return filteredStudents.slice(start, start + PAGE_SIZE);
  }, [filteredStudents, studentPage]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));

  const updateStatus = (studentId: string, status: "present" | "absent" | "leave") => {
    setRecords((prev) => ({ ...prev, [studentId]: status }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const validMarkedBy = user?.id && isUuid(user.id) ? user.id : null;

      // Filter records: only save attendance for the currently selected batch
      const recordsToSave = Object.entries(records).filter(([studentId, status]) => {
        // Must have a valid status
        if (status !== "absent" && status !== "present" && status !== "leave") return false;
        // If a specific batch is selected, only include students from that batch
        if (selectedBatch !== "all") {
          const student = students.find(s => s.id === studentId);
          return student?.batch_name === selectedBatch;
        }
        return true;
      });
      const savedCount = recordsToSave.length;

      if (savedCount === 0) {
        toast({ title: "No students", description: "No students to save attendance for.", variant: "destructive" });
        setSaving(false);
        return;
      }

      if (activeTab === "exam" && selectedExam) {
        const effectiveDate = examDateFilter || today;
        // Save to exam_attendance table
        const examAttendanceToSave = recordsToSave.map(([studentId, status]) => ({
          institute_id: instId,
          student_id: studentId,
          exam_name: selectedExam.examName,
          subject: selectedExam.subject,
          exam_date: effectiveDate,
          status,
          marked_by: validMarkedBy,
        }));

        // Delete existing exam attendance records for this exam + date
        const { error: deleteError } = await supabase
          .from("exam_attendance")
          .delete()
          .eq("institute_id", instId)
          .eq("exam_name", selectedExam.examName)
          .eq("exam_date", effectiveDate);

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

      // Update saved batches in realtime from local records
      const justSavedBatches = new Set(savedBatches);
      const studentBatchMap: Record<string, string> = {};
      students.forEach((s) => { studentBatchMap[s.id] = s.batch_name; });
      recordsToSave.forEach(([studentId]) => {
        const batch = studentBatchMap[studentId];
        if (batch) justSavedBatches.add(batch);
      });
      setSavedBatches(justSavedBatches);

      // Also re-fetch in background to ensure sync with DB
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
    setStudentPage(0);
    setExamDateFilter(exam.examDate || "");
    
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
    setStudentPage(0);
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
          <div className="flex items-center gap-3 mt-0.5">
            <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
            <span className="text-muted-foreground/30">|</span>
            {/* Baileys connection indicator */}
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${baileysConnected ? "bg-success" : "bg-muted-foreground/40"}`} />
              <span className={`text-[11px] font-medium ${baileysConnected ? "text-success" : "text-muted-foreground"}`}>
                {baileysConnected ? "WhatsApp Connected" : "WA Disconnected"}
              </span>
            </div>
          </div>
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
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowExamSelector(true)}
                className="text-xs"
              >
                {selectedExam ? `${selectedExam.examName} - ${selectedExam.subject}` : "Select Exam"}
              </Button>
              {selectedExam && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground whitespace-nowrap">Date (optional):</label>
                  <input
                    type="date"
                    value={examDateFilter}
                    onChange={(e) => {
                      setExamDateFilter(e.target.value);
                      setLoading(true);
                      setTimeout(() => fetchData(), 0);
                    }}
                    className="px-3 py-1.5 rounded-md bg-card border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              )}
            </>
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

      {/* Batch Attendance Status Card — only for lecture tab (realtime) */}
      {activeTab === "lecture" && totalBatchCount > 0 && (
        <div className="surface-elevated rounded-lg p-4 border border-border/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center",
                pendingBatches.length === 0
                  ? "bg-success/10"
                  : "bg-warning/10"
              )}>
                <span className={cn(
                  "text-xs font-bold",
                  pendingBatches.length === 0 ? "text-success" : "text-warning"
                )}>
                  {pendingBatches.length}
                </span>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  {pendingBatches.length === 0 ? "All Batches Completed ✓" : "Attendance Status"}
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  {savedBatchCount} of {totalBatchCount} batches saved for today
                </p>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden mb-3">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                pendingBatches.length === 0 ? "bg-success" : "bg-primary"
              )}
              style={{ width: `${(savedBatchCount / totalBatchCount) * 100}%` }}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {batchStatusList.map((batch) => (
              <button
                key={batch.name}
                onClick={() => {
                  setSelectedBatch(batch.name);
                  setStatusFilter(null);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                  batch.saved
                    ? selectedBatch === batch.name
                      ? "bg-success/10 text-success border-success/30 ring-1 ring-success/20"
                      : "bg-success/[0.04] text-muted-foreground border-success/20 hover:bg-success/10 hover:text-success"
                    : selectedBatch === batch.name
                      ? "bg-warning/10 text-warning border-warning/30 ring-1 ring-warning/20"
                      : "bg-secondary/50 text-muted-foreground border-border/50 hover:bg-warning/5 hover:text-warning hover:border-warning/20"
                )}
              >
                {batch.saved ? (
                  <Check className="w-3 h-3" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
                )}
                <span>{batch.name}</span>
                <span className={cn(
                  "text-[10px] ml-0.5",
                  batch.saved ? "text-success/60" : "text-muted-foreground/60"
                )}>
                  ({batch.studentCount})
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

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
          <div className="space-y-3">
            {/* Date filter for exam list */}
            <div className="flex items-center gap-2 px-1">
              <label className="text-xs text-muted-foreground whitespace-nowrap">Filter by date:</label>
              <input
                type="date"
                value={selectorDateFilter}
                onChange={(e) => setSelectorDateFilter(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-md bg-card border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {selectorDateFilter && (
                <button
                  onClick={() => setSelectorDateFilter("")}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="max-h-[360px] overflow-y-auto space-y-2">
            {fetchingExams ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : exams.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No exams found. Create exams in the Marks section first.
              </div>
            ) : (
              exams
                .filter(exam => !selectorDateFilter || exam.examDate === selectorDateFilter)
                .map((exam, index) => (
                <button
                  key={`${exam.examName}|${exam.subject}|${exam.batch}|${exam.examDate}`}
                  onClick={() => handleSelectExam(exam)}
                  className="w-full text-left flex items-center gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/60 border border-border/50 transition-all"
                >
                  <span className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{exam.examName}</p>
                    <p className="text-xs text-muted-foreground">{exam.subject} · {exam.batch} · {exam.examDate}</p>
                  </div>
                  <span className="text-[10px] font-medium text-primary bg-primary/10 px-2 py-1 rounded-md shrink-0">
                    {exam.examDate}
                  </span>
                </button>
              ))
            )}
            </div>
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
          paginatedStudents.map((student) => {
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

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-muted-foreground">
            Showing {studentPage * PAGE_SIZE + 1}–{Math.min((studentPage + 1) * PAGE_SIZE, filteredStudents.length)} of {filteredStudents.length} students
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setStudentPage(p => Math.max(0, p - 1))}
              disabled={studentPage === 0}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card text-foreground hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => setStudentPage(i)}
                className={`w-7 h-7 text-xs font-medium rounded-md transition-colors ${
                  i === studentPage
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                {i + 1}
              </button>
            ))}
            <button
              onClick={() => setStudentPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={studentPage >= totalPages - 1}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card text-foreground hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

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
                    onClick={(e) => { e.stopPropagation(); sendWhatsAppToStudent(student); }}
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
            <AlertDialogCancel onClick={() => setShowAbsentDialog(false)} className="mt-0">Close</AlertDialogCancel>                      {absentStudentList.some(s => getBestPhone(s)) && (
              <AlertDialogAction
                onClick={() => {
                  setWhatsAppSentStatus({});
                  sendWhatsAppToAll(absentStudentList);
                }}
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
                              </div>                                {bestPhone ? (
                                  <button
                                    onClick={() => {
                                      setWhatsAppSentStatus(prev => ({ ...prev, [student.id]: false }));
                                      sendWhatsAppToStudent(student);
                                    }}
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-green-500/10 text-green-600 hover:bg-green-500/20 border border-green-500/20 transition-all text-xs font-medium shrink-0 ml-2"
                                  >
                                    {whatsAppSentStatus[student.id] ? (
                                      <><Check className="w-3.5 h-3.5 text-success" /> Sent ✓</>
                                    ) : (
                                      <><MessageCircle className="w-3.5 h-3.5" /> Send</>
                                    )}
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
                      setWhatsAppSentStatus({});
                      const absStudents = filteredStudents.filter(s => records[s.id] === "absent");
                      sendWhatsAppToAll(absStudents);
                    }}
                    className="w-full bg-green-600 hover:bg-green-700 mt-2"
                    size="sm"
                  >
                    <MessageCircle className="w-4 h-4 mr-2" />
                    {whatsAppSentStatus[filteredStudents.find(s => records[s.id] === "absent")?.id || ''] ? 'Sent ✓' : `Send WhatsApp to All (${summaryData.absent} students)`}
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
