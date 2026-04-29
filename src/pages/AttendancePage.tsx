import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Check, X, Save, Loader2, MessageSquare } from "lucide-react";
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
import { sendWhatsAppAbsentNotification } from "@/lib/whatsapp-service";

interface Student {
  id: string;
  name: string;
  enrollment_no: string;
  batch_name: string;
  phone: string;
}

interface AttendanceRecord {
  student_id: string;
  status: "present" | "absent";
}

export default function AttendancePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const DEFAULT_UUID = "00000000-0000-0000-0000-000000000001";
  const instId = isAdmin ? (user as AdminUser).instituteId : DEFAULT_UUID;

  const [students, setStudents] = useState<Student[]>([]);
  const [records, setRecords] = useState<Record<string, "present" | "absent">>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState("all");
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState({ total: 0, present: 0, absent: 0 });

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (isUuid(instId)) {
      fetchData();
    }
  }, [instId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Students
      const { data: sData, error: sErr } = await supabase
        .from("students")
        .select("id, name, enrollment_no, batch_name, phone")
        .eq("institute_id", instId)
        .eq("status", "active");

      if (sErr) throw sErr;
      setStudents(sData || []);

      // 2. Fetch Today's Attendance
      const { data: aData, error: aErr } = await supabase
        .from("attendance")
        .select("student_id, status")
        .eq("institute_id", instId)
        .eq("date", today);

      if (aErr) throw aErr;

      const initialRecords: Record<string, "present" | "absent"> = {};
      // Default all to present if not marked, or use existing status
      sData?.forEach(s => {
        const existing = aData?.find(a => a.student_id === s.id);
        initialRecords[s.id] = existing ? (existing.status as "present" | "absent") : "present";
      });
      setRecords(initialRecords);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const batches = useMemo(() => {
    return [...new Set(students.map((s) => s.batch_name))].filter(Boolean);
  }, [students]);

  const filteredStudents = useMemo(() => {
    return selectedBatch === "all"
      ? students
      : students.filter((s) => s.batch_name === selectedBatch);
  }, [students, selectedBatch]);

  const updateStatus = (studentId: string, status: "present" | "absent") => {
    setRecords((prev) => ({ ...prev, [studentId]: status }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val || "");
      const validMarkedBy = user?.id && isUuid(user.id) ? user.id : null;

      const attendanceToSave = Object.entries(records).map(([studentId, status]) => ({
        institute_id: instId,
        student_id: studentId,
        date: today,
        status,
        marked_by: validMarkedBy,
      }));

      // Upsert records
      const { error } = await supabase
        .from("attendance")
        .upsert(attendanceToSave, { onConflict: "institute_id,student_id,date" });

      if (error) throw error;

      // Calculate stats for summary
      const present = Object.values(records).filter(s => s === "present").length;
      const absent = Object.values(records).filter(s => s === "absent").length;
      
      setSummaryData({ total: students.length, present, absent });
      setShowSummary(true);
      
      toast({ title: "Success", description: "Attendance saved successfully." });
    } catch (error: any) {
      toast({ title: "Save Failed", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleNotifyAbsent = async () => {
    const absentStudents = students.filter(s => records[s.id] === "absent");
    if (absentStudents.length === 0) {
      toast({ title: "No Absentees", description: "No students are marked absent today." });
      return;
    }

    toast({ title: "Processing Notifications", description: `Sending messages to ${absentStudents.length} parents...` });

    let successCount = 0;
    for (const student of absentStudents) {
      if (student.phone) {
        await sendWhatsAppAbsentNotification({
          phone: student.phone,
          studentName: student.name,
          instituteId: instId,
          date: today
        });
        successCount++;
      }
    }

    toast({ 
      title: "Notifications Sent", 
      description: `WhatsApp notification logic triggered for ${successCount} students.` 
    });
    setShowSummary(false);
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
            className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="all">All Batches</option>
            {batches.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            Save
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="surface-elevated rounded-lg p-4 text-center border border-success/20">
          <p className="text-3xl font-bold text-success tabular-nums">
            {Object.values(records).filter(s => s === "present").length}
          </p>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-1">Present</p>
        </div>
        <div className="surface-elevated rounded-lg p-4 text-center border border-destructive/20">
          <p className="text-3xl font-bold text-destructive tabular-nums">
            {Object.values(records).filter(s => s === "absent").length}
          </p>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-1">Absent</p>
        </div>
      </div>

      {/* Attendance List */}
      <div className="surface-elevated rounded-lg divide-y divide-border/50 overflow-hidden border border-border/50">
        {filteredStudents.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No active students found in this batch.</div>
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
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Summary Dialog */}
      <AlertDialog open={showSummary} onOpenChange={setShowSummary}>
        <AlertDialogContent className="max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl">Attendance Summary</AlertDialogTitle>
            <div className="space-y-4 pt-4 pb-2">
              <div className="grid grid-cols-3 gap-2 text-center">
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
              </div>
              <p className="text-sm text-foreground font-semibold pt-2 text-center leading-relaxed">
                Shall I notify parents of <span className="text-destructive font-bold underline decoration-destructive/30 underline-offset-4">{summaryData.absent} absent</span> students via WhatsApp?
              </p>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 mt-4">
            <AlertDialogCancel className="mt-0 sm:flex-1" onClick={() => setShowSummary(false)}>
              NO
            </AlertDialogCancel>
            <AlertDialogAction 
              className="sm:flex-1 bg-primary hover:bg-primary/90" 
              onClick={handleNotifyAbsent}
            >
              <MessageSquare className="w-4 h-4 mr-2" /> YES
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
