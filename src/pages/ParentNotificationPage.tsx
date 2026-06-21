import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase, isUuid } from "@/lib/supabase";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import { sendWhatsAppExamMarksNotification, sendWhatsAppPendingFeesNotification, sendWhatsAppAttendanceNotification } from "@/lib/whatsapp-service";

interface Student {
  id: string;
  name: string;
  enrollment_no: string;
  batch_name: string;
  mother_phone: string | null;
  father_phone: string | null;
}

type NotificationType = "exam_marks" | "pending_fees" | "attendance";

export default function ParentNotificationPage() {
  const { user } = useAuth();
  const instId = user?.role === "admin" ? (user as AdminUser).instituteId : "INST-001";

  const [students, setStudents] = useState<Student[]>([]);
  const [batches, setBatches] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notificationType, setNotificationType] = useState<NotificationType>("exam_marks");
  const [selectedBatch, setSelectedBatch] = useState<string>("all");

  // Exam-related form
  const [examData, setExamData] = useState<{
    examName: string;
    subject: string;
    marks: number;
    totalMarks: number;
    examDate: string;
  }>({ examName: "", subject: "", marks: 0, totalMarks: 100, examDate: "" });

  // Fees-related form
  const [feesData, setFeesData] = useState<{
    feeTitle: string;
    pendingAmount: number;
    dueDate: string;
  }>({ feeTitle: "", pendingAmount: 0, dueDate: "" });

  // Attendance-related form
  const [attendanceData, setAttendanceData] = useState<{
    date: string;
    status: "present" | "absent" | "late";
  }>({ date: "", status: "absent" });

  useEffect(() => {
    if (!isUuid(instId)) {
      setLoading(false);
      return;
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [studentsRes, batchesRes] = await Promise.all([
        supabase
          .from("students")
          .select("id, name, enrollment_no, batch_name, mother_phone, father_phone")
          .eq("institute_id", instId)
          .eq("status", "active"),
        supabase
          .from("batches")
          .select("id, name")
          .eq("institute_id", instId)
          .eq("status", "active")
          .order("name"),
      ]);

      if (studentsRes.error) throw studentsRes.error;
      if (batchesRes.error) throw batchesRes.error;

      setStudents(studentsRes.data || []);
      setBatches(batchesRes.data || []);
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getFilteredStudents = () => {
    return students.filter(s => {
      if (selectedBatch !== "all" && s.batch_name !== selectedBatch) return false;
      return true;
    });
  };

  const handleSendNotification = async () => {
    const recipients = getFilteredStudents();
    if (recipients.length === 0) {
      toast({ title: "No recipients", description: "No students match the selected criteria", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      const instituteName = (user as AdminUser)?.instituteName || "Institute Name";

      for (const student of recipients) {
        const parentPhone = student.mother_phone || student.father_phone;
        if (!parentPhone) continue;

        let result;
        switch (notificationType) {
          case "exam_marks":
            result = await sendWhatsAppExamMarksNotification({
              phone: parentPhone,
              studentName: student.name,
              instituteId: instId,
              instituteName,
              examName: examData.examName,
              subject: examData.subject,
              marks: examData.marks,
              totalMarks: examData.totalMarks,
              examDate: examData.examDate,
            });
            break;
          case "pending_fees":
            result = await sendWhatsAppPendingFeesNotification({
              phone: parentPhone,
              studentName: student.name,
              instituteId: instId,
              instituteName,
              feeTitle: feesData.feeTitle,
              pendingAmount: feesData.pendingAmount,
              dueDate: feesData.dueDate,
            });
            break;
          case "attendance":
            result = await sendWhatsAppAttendanceNotification({
              phone: parentPhone,
              studentName: student.name,
              instituteId: instId,
              instituteName,
              date: attendanceData.date,
              status: attendanceData.status,
            });
            break;
        }
      }

      toast({
        title: "Notifications Sent",
        description: `WhatsApp notifications sent to ${recipients.length} parents.`,
      });
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send notifications",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const getNotificationTitle = () => {
    switch (notificationType) {
      case "exam_marks": return "Send Exam & Marks Notification";
      case "pending_fees": return "Send Pending Fees Notification";
      case "attendance": return "Send Attendance Notification";
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Parent WhatsApp Notifications</h2>
        <p className="text-sm text-muted-foreground">Send notifications to parents via WhatsApp</p>
      </div>

      <div className="surface-elevated rounded-lg p-4 border border-border space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">Notification Type</label>
            <Select value={notificationType} onValueChange={(v) => setNotificationType(v as NotificationType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="exam_marks">Exam & Marks</SelectItem>
                <SelectItem value="pending_fees">Pending Fees</SelectItem>
                <SelectItem value="attendance">Attendance</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">Batch Filter</label>
            <Select value={selectedBatch} onValueChange={setSelectedBatch}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Batches</SelectItem>
                {batches.map(b => (
                  <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">Recipient Preview</label>
            <div className="text-sm text-muted-foreground px-3 py-2 bg-secondary rounded-md">
              {loading ? "Loading..." : `${getFilteredStudents().length} parents will receive`}
            </div>
          </div>
        </div>

        {notificationType === "exam_marks" && (
          <div className="space-y-3 pt-3 border-t border-border">
            <h3 className="text-sm font-semibold text-foreground">Exam & Marks Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground">Exam Name</label>
                <Input
                  value={examData.examName}
                  onChange={e => setExamData(p => ({ ...p, examName: e.target.value }))}
                  placeholder="e.g., Unit Test 4"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Subject</label>
                <Input
                  value={examData.subject}
                  onChange={e => setExamData(p => ({ ...p, subject: e.target.value }))}
                  placeholder="e.g., Mathematics"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Marks Obtained</label>
                <Input
                  type="number"
                  value={examData.marks}
                  onChange={e => setExamData(p => ({ ...p, marks: parseFloat(e.target.value) || 0 }))}
                  placeholder="e.g., 85"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Total Marks</label>
                <Input
                  type="number"
                  value={examData.totalMarks}
                  onChange={e => setExamData(p => ({ ...p, totalMarks: parseFloat(e.target.value) || 100 }))}
                  placeholder="e.g., 100"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Exam Date</label>
                <Input
                  type="date"
                  value={examData.examDate}
                  onChange={e => setExamData(p => ({ ...p, examDate: e.target.value }))}
                />
              </div>
            </div>
          </div>
        )}

        {notificationType === "pending_fees" && (
          <div className="space-y-3 pt-3 border-t border-border">
            <h3 className="text-sm font-semibold text-foreground">Pending Fees Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground">Fee Title/Description</label>
                <Input
                  value={feesData.feeTitle}
                  onChange={e => setFeesData(p => ({ ...p, feeTitle: e.target.value }))}
                  placeholder="e.g., Monthly Fee - July"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Pending Amount (INR)</label>
                <Input
                  type="number"
                  value={feesData.pendingAmount}
                  onChange={e => setFeesData(p => ({ ...p, pendingAmount: parseFloat(e.target.value) || 0 }))}
                  placeholder="e.g., 5000"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Due Date</label>
                <Input
                  type="date"
                  value={feesData.dueDate}
                  onChange={e => setFeesData(p => ({ ...p, dueDate: e.target.value }))}
                />
              </div>
            </div>
          </div>
        )}

        {notificationType === "attendance" && (
          <div className="space-y-3 pt-3 border-t border-border">
            <h3 className="text-sm font-semibold text-foreground">Attendance Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground">Date</label>
                <Input
                  type="date"
                  value={attendanceData.date}
                  onChange={e => setAttendanceData(p => ({ ...p, date: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Status</label>
                <Select value={attendanceData.status} onValueChange={(v) => setAttendanceData(p => ({ ...p, status: v as "present" | "absent" | "late" }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="present">Present</SelectItem>
                    <SelectItem value="absent">Absent</SelectItem>
                    <SelectItem value="late">Late</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        <Button
          className="w-full md:w-auto"
          onClick={handleSendNotification}
          disabled={sending || loading}
        >
          {sending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" />
              {getNotificationTitle()}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}