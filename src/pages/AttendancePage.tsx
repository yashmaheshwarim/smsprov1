import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Check, X, Save, Loader2, MessageSquare, MessageCircle, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
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
import { sendWhatsAppAbsentNotification, sendBulkWhatsAppNotifications, sendBulkWhatsAppViaServer, getActiveWhatsAppSession, checkWhatsAppServerHealth, WhatsAppNotification, getAbsentWhatsAppMessage, formatWaMePhone } from "@/lib/whatsapp-service";

export default function AttendancePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const DEFAULT_UUID = "00000000-0000-0000-0000-000000000001";
  const instId = isAdmin ? (user as AdminUser).instituteId : DEFAULT_UUID;
  const [instituteName, setInstituteName] = useState("Institute Name");

  type Student = {
    id: string;
    name: string;
    enrollment_no: string;
    batch_name: string;
    batch_id?: string;
    phone: string;
    mother_phone?: string;
    father_phone?: string;
    status: string;
    suspended_until?: string | null;
  };

  const isStudentVisible = (s: Student) => {
    if (s.status !== "active") return false;
    if (!s.suspended_until) return true;
    return new Date(s.suspended_until) < new Date(new Date().toISOString().split("T")[0]);
  };

  const [students, setStudents] = useState<Student[]>([]);
  // records[student_id][subjectKey] => status
  // subjectKey = "__all__" when "All Subjects" is selected (no specific subject)
  // subjectKey = actual subject name when a specific subject is selected
  const [records, setRecords] = useState<Record<string, Record<string, "present" | "absent" | "leave">>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState("all");
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [showSummary, setShowSummary] = useState(false);

  const [filterByAttendance, setFilterByAttendance] = useState<"all" | "present" | "absent">("all");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const toggleSortOrder = () => setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));

  const [summaryData, setSummaryData] = useState({ total: 0, present: 0, absent: 0 });
  const [notificationResults, setNotificationResults] = useState([]);
  const [showLinksDialog, setShowLinksDialog] = useState(false);
  const [sendingToAll, setSendingToAll] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [hasActiveWASession, setHasActiveWASession] = useState(false);
  const [activeWASessionId, setActiveWASessionId] = useState<string | null>(null);
  const [sendingViaServer, setSendingViaServer] = useState(false);
  const [sendViaServerProgress, setSendViaServerProgress] = useState({ current: 0, total: 0 });

  const today = new Date().toISOString().split("T")[0];
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([]);
  const [batchSubjectsMap, setBatchSubjectsMap] = useState<Record<string, string[]>>({});

  const visibleStudentIds = useMemo(() => new Set(students.filter(isStudentVisible).map((s) => s.id)), [students]);

  // Compute absent message template with institute name
  const absentMessageTemplate = `Hello Parent,\n\nThis is to notify you that your child {{student_name}} was absent on today's class.\n\n${instituteName}`;

  useEffect(() => {
    if (isUuid(instId)) {
      fetchData();
      checkActiveSession();
    }
  }, [instId]);

  const checkActiveSession = async () => {
    if (!isUuid(instId)) return;
    const session = await getActiveWhatsAppSession(instId);
    if (session) {
      setHasActiveWASession(true);
      setActiveWASessionId(session.sessionId);
    }
  };

  // Helper to get the subject key for records lookup
  const getSubjectKey = (subject: string) => subject === "all" ? "__all__" : subject;

  // Get the current status for a student based on selected subject
  const getStudentStatus = (studentId: string): "present" | "absent" | "leave" => {
    const subjectKey = getSubjectKey(selectedSubject);
    const studentRecords = records[studentId];
    if (!studentRecords) return "present";
    return studentRecords[subjectKey] || "present";
  };

  // Update status for a student for the currently selected subject
  const updateStatus = (studentId: string, status: "present" | "absent" | "leave") => {
    const subjectKey = getSubjectKey(selectedSubject);
    setRecords((prev) => {
      const studentRecords = { ...(prev[studentId] || {}) };
      studentRecords[subjectKey] = status;
      return { ...prev, [studentId]: studentRecords };
    });
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch students with batch subjects
      const { data: sData, error: sErr } = await supabase
        .from("students")
        .select(`id, name, enrollment_no, batch_name, phone, mother_phone, father_phone, status, suspended_until, batch_id, batches ( subjects )`)
        .eq("institute_id", instId);

      if (sErr) throw sErr;
      setStudents(sData || []);

      // Build batch-to-subjects map and extract all unique subjects from batches
      const batchToSubjects: Record<string, string[]> = {};
      (sData || []).forEach((s: any) => {
        if (s.batch_id && s.batches?.subjects) {
          batchToSubjects[s.batch_id] = s.batches.subjects;
        }
      });
      setBatchSubjectsMap(batchToSubjects);

      const allSubjects = [...new Set((sData || []).flatMap((s: any) => s.batches?.subjects || []))].filter(Boolean) as string[];
      setAvailableSubjects(allSubjects);

      // Fetch institute name
      if (isUuid(instId)) {
        const { data: instData } = await supabase
          .from("institutes")
          .select("name")
          .eq("id", instId)
          .single();
        setInstituteName(instData?.name || "Institute Name");
      }

      // Fetch all attendance records for today (all subjects)
      const { data: aData, error: aErr } = await supabase
        .from("attendance")
        .select("student_id, status, subject")
        .eq("institute_id", instId)
        .eq("date", today);

      if (aErr) throw aErr;

      // Build nested records: records[student_id][subjectKey] = status
      const initialRecords: Record<string, Record<string, "present" | "absent" | "leave">> = {};
      const visibleStudents = (sData || []).filter(isStudentVisible);

      visibleStudents.forEach(s => {
        const studentRecords: Record<string, "present" | "absent" | "leave"> = {};
        // Find attendance records for this student
        const studentAttendance = aData?.filter(a => a.student_id === s.id) || [];

        if (studentAttendance.length > 0) {
          studentAttendance.forEach(att => {
            const key = att.subject ? att.subject : "__all__";
            studentRecords[key] = att.status as "present" | "absent" | "leave";
          });
        } else {
          // Default to present for the current subject key
          studentRecords["__all__"] = "present";
        }
        initialRecords[s.id] = studentRecords;
      });
      setRecords(initialRecords);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const batches = useMemo(() => {
    return [...new Set(students.filter(isStudentVisible).map((s) => s.batch_name))].filter(Boolean).sort();
  }, [students]);

  const batchNameToId = useMemo(() => {
    const map: Record<string, string> = {};
    students.forEach((s) => {
      if (s.batch_name && s.batch_id) map[s.batch_name] = s.batch_id;
    });
    return map;
  }, [students]);

  const getFilteredSubjects = useMemo(() => {
    if (selectedBatch === "all") return availableSubjects;
    const batchId = batchNameToId[selectedBatch];
    return batchId ? (batchSubjectsMap[batchId] || []) : [];
  }, [selectedBatch, availableSubjects, batchNameToId, batchSubjectsMap]);

  // Compute batch summary using ALL visible students in the selected batch (not filtered by attendance filter)
  const batchSummary = useMemo(() => {
    const relevantStudents = (selectedBatch === "all" ? students : students.filter((s) => s.batch_name === selectedBatch))
      .filter(isStudentVisible);
    const present = relevantStudents.filter((s) => getStudentStatus(s.id) === "present").length;
    const absent = relevantStudents.filter((s) => getStudentStatus(s.id) === "absent" || getStudentStatus(s.id) === "leave").length;
    return { total: relevantStudents.length, present, absent };
  }, [students, selectedBatch, records, selectedSubject]);

  const filteredStudents = useMemo(() => {
    const list = (selectedBatch === "all" ? students : students.filter((s) => s.batch_name === selectedBatch))
      .filter(isStudentVisible)
      .filter((s) => {
        if (filterByAttendance === "all") return true;
        const status = getStudentStatus(s.id);
        if (filterByAttendance === "present") return status === "present";
        if (filterByAttendance === "absent") return status === "absent" || status === "leave";
        return true;
      });
    return list.sort((a, b) =>
      a.name.localeCompare(b.name) * (sortOrder === "asc" ? 1 : -1)
    );
  }, [students, selectedBatch, sortOrder, filterByAttendance, records, selectedSubject]);

  const absentRecipients = useMemo(() => {
    return filteredStudents
      .filter((s) => getStudentStatus(s.id) === "absent")
      .map((s) => {
        const parentPhone = s.mother_phone || s.father_phone || s.phone;
        return parentPhone
          ? { studentName: s.name, phone: parentPhone.replace(/\D/g, ''), date: today }
          : null;
      })
      .filter(Boolean) as Array<{ studentName: string; phone: string; date: string }>;
  }, [filteredStudents, records, today, selectedSubject]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const isUuidFunc = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val || "");
      const validMarkedBy = user?.id && isUuidFunc(user.id) ? user.id : null;

      const attendanceToSave: Array<{
        institute_id: string;
        student_id: string;
        date: string;
        subject: string | null;
        status: "present" | "absent" | "leave";
        marked_by: string | null;
      }> = [];

      // Iterate over all students and all their subject-specific records
      Object.entries(records).forEach(([studentId, studentRecords]) => {
        if (!visibleStudentIds.has(studentId)) return;

        Object.entries(studentRecords).forEach(([subjectKey, status]) => {
          // subjectKey is "__all__" for "All Subjects" mode, or actual subject name
          attendanceToSave.push({
            institute_id: instId,
            student_id: studentId,
            date: today,
            subject: subjectKey === "__all__" ? null : subjectKey,
            status,
            marked_by: validMarkedBy,
          });
        });
      });

      const { error } = await supabase
        .from("attendance")
        .upsert(attendanceToSave, { onConflict: "institute_id,student_id,date,subject" });

      if (error) throw error;

      const present = Object.values(records).flatMap(sr => Object.values(sr)).filter((s) => s === "present").length;
      const absent = Object.values(records).flatMap(sr => Object.values(sr)).filter((s) => s === "absent" || s === "leave").length;
      setSummaryData({ total: batchSummary.total, present, absent });
      setShowSummary(true);

      toast({ title: "Success", description: "Attendance saved successfully." });
    } catch (error: any) {
      toast({ title: "Save Failed", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleNotifyAbsent = async () => {
    const absentStudents = filteredStudents.filter(s => getStudentStatus(s.id) === "absent");
    if (absentStudents.length === 0) {
      toast({ title: "No Absentees", description: "No students are marked absent today in this batch." });
      return;
    }

    const studentsWithParents = absentStudents
      .map(s => {
        const parentPhone = s.mother_phone || s.father_phone;
        return parentPhone ? { ...s, parentPhone: parentPhone.replace(/[^0-9]/g, '') } : null;
      })
      .filter(Boolean) as Array<Student & { parentPhone: string }>;

    if (studentsWithParents.length === 0) {
      toast({ title: "No Parent Contacts", description: "No absent students have parent phone numbers." });
      return;
    }

    toast({ title: "Processing Notifications", description: `Queuing WhatsApp messages for ${studentsWithParents.length} parents...` });

    const notifications = studentsWithParents.map(s => ({
      phone: s.parentPhone,
      studentName: s.name,
      instituteId: instId,
      date: today
    }));

    const results = await sendBulkWhatsAppNotifications(notifications);
    setNotificationResults(results);
    setShowLinksDialog(true);

    toast({
      title: "✅ WhatsApp Links Ready!",
      description: `${results.length} parent links generated. Open web.whatsapp.com to send.`
    });
    setShowSummary(false);
  };

  const handleSendToAllAbsent = async () => {
    const absentStudents = filteredStudents.filter((s) => getStudentStatus(s.id) === "absent");

    if (absentStudents.length === 0) {
      toast({ title: "No Absentees", description: "No students are marked absent today in this batch." });
      return;
    }

    const contactMap = absentStudents.map((s) => {
      const parentPhone = s.mother_phone || s.father_phone;
      return {
        studentName: s.name,
        phone: (parentPhone || s.phone || '').replace(/\D/g, ''),
      };
    }).filter((c) => c.phone);

    const recipients = absentStudents
      .map((s) => {
        const parentPhone = s.mother_phone || s.father_phone || s.phone;
        const phone = parentPhone ? parentPhone.replace(/\D/g, '') : '';
        return phone ? { studentName: s.name, phone, date: today } : null;
      })
      .filter(Boolean);

    if ((window as any).chrome?.storage?.local?.set) {
      try {
        await chrome.storage.local.set({
          pendingRecipients: recipients,
          pendingAbsentCount: recipients.length,
          pendingTemplate: absentMessageTemplate,
        });
      } catch (err) {
        console.warn('chrome.storage not available in page context', err);
      }
    }

    // If there's an active WhatsApp session, send directly via server with delays
    if (hasActiveWASession && activeWASessionId) {
      await sendAbsentViaServer(absentStudents);
      return;
    }

    // Fallback to wa.me links
    const notifications: WhatsAppNotification[] = contactMap.map((c) => ({
      phone: formatWaMePhone(c.phone),
      studentName: c.studentName,
      instituteId: instId,
      date: today,
    }));

    if (notifications.length === 0) {
      toast({ title: "No Contacts", description: "No valid phone numbers found for absent students." });
      return;
    }

    const openedTabs: Array<Window | null> = notifications.map((_, index) => {
      try {
        return window.open('about:blank', `_blank_${index}`, 'noopener,noreferrer');
      } catch (err) {
        console.warn('Could not open placeholder tab', err);
        return null;
      }
    });

    setSendingToAll(true);
    setSentCount(0);

    try {
      const results = await sendBulkWhatsAppNotifications(notifications);
      setNotificationResults(results);
      setShowLinksDialog(true);

      results.forEach((result, index) => {
        const openedTab = openedTabs[index];
        if (openedTab && !openedTab.closed) {
          if (!result.sent) {
            openedTab.location.href = result.link;
          } else {
            openedTab.close();
          }
        }
      });

      const sentCount = results.filter((r) => r.sent).length;
      setSentCount(results.length);

      toast({
        title: "✅ Bulk WhatsApp Sent",
        description: `${results.length} absent contacts processed. ${sentCount} sent via OpenWA, ${results.length - sentCount} opened using wa.me.`,
      });
    } catch (error: any) {
      toast({ title: "Send Failed", description: error.message || "Unable to send bulk WhatsApp messages.", variant: "destructive" });
    } finally {
      setSendingToAll(false);
    }
  };

  // Send absent notifications directly via WhatsApp server with 3-5s delay
  const sendAbsentViaServer = async (absentStudents: Student[]) => {
    if (!activeWASessionId) return;

    const messages = absentStudents
      .map((s) => {
        const parentPhone = s.mother_phone || s.father_phone || s.phone;
        const phone = parentPhone ? parentPhone.replace(/\D/g, '') : '';
        if (!phone) return null;
        const msg = getAbsentWhatsAppMessage(s.name, today, instituteName);
        return { phone, message: msg, name: s.name };
      })
      .filter(Boolean) as Array<{ phone: string; message: string; name: string }>;

    if (messages.length === 0) {
      toast({ title: "No Contacts", description: "No valid phone numbers found." });
      return;
    }

    setSendingViaServer(true);
    setSendViaServerProgress({ current: 0, total: messages.length });

    try {
      const results = await sendBulkWhatsAppViaServer(
        activeWASessionId,
        messages,
        4000, // 4 second delay
        (current, total) => {
          setSendViaServerProgress({ current, total });
        }
      );

      const successCount = results.filter((r) => r.success).length;

      // Log to message_logs
      for (const r of results) {
        if (r.success) {
          try {
            await supabase.from('message_logs').insert({
              institute_id: instId,
              channel: 'whatsapp',
              recipient: r.phone,
              message: getAbsentWhatsAppMessage(r.name, today, instituteName),
              status: 'sent',
              external_id: r.messageId,
            });
          } catch (e) {
            console.error('Failed to log message:', e);
          }
        }
      }

      toast({
        title: "✅ WhatsApp Messages Sent",
        description: `${successCount}/${messages.length} messages sent via WhatsApp Web with ~4s delay between each.`,
      });
    } catch (error: any) {
      toast({ title: "Send Failed", description: error.message || "Unable to send via WhatsApp server.", variant: "destructive" });
    } finally {
      setSendingViaServer(false);
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
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div
        id="attendance-absent-data"
        data-recipients={JSON.stringify(absentRecipients)}
        style={{ display: 'none' }}
      />
      {/* WhatsApp Links Dialog */}
      <AlertDialog open={showLinksDialog} onOpenChange={setShowLinksDialog}>
        <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>📱 WhatsApp Parent Notifications</AlertDialogTitle>
            <AlertDialogDescription>
              Click links below in web.whatsapp.com to send absent messages. Logs saved to message_logs table.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-4">
            {notificationResults.map((result: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-secondary rounded-lg gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">{result.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{result.link.startsWith('openwa') ? '✅ OpenWA Sent' : '🔗 wa.me Link'}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigator.clipboard.writeText(result.link)}
                    className="h-8 px-3"
                  >
                    Copy
                  </Button>
                  <Button
                    size="sm"
                    asChild
                    className="h-8 px-3 bg-green-500 hover:bg-green-600"
                  >
                    <a href={result.link} target="_blank" rel="noopener noreferrer">
                      Open
                    </a>
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
            <Button
              onClick={() => {
                navigator.clipboard.writeText(notificationResults.map((r: any) => `${r.name}: ${r.link}`).join('\n'));
                toast({ title: "Copied All Links!" });
              }}
            >
              Copy All Links
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Mark Attendance</h2>
          <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedBatch}
            onChange={(e) => { setSelectedBatch(e.target.value); setSelectedSubject("all"); }}
            className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="all">All Batches</option>
            {batches.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="all">All Subjects</option>
            {getFilteredSubjects.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            onClick={toggleSortOrder}
            title={sortOrder === "asc" ? "Sort: A to Z" : "Sort: Z to A"}
          >
            {sortOrder === "asc" ? <ArrowUp className="w-4 h-4 mr-1" /> : <ArrowDown className="w-4 h-4 mr-1" />}
            {sortOrder === "asc" ? "A-Z" : "Z-A"}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            Save
          </Button>
        </div>
      </div>

      {/* Stats - uses batchSummary which always counts ALL students in batch (ignores filterByAttendance) */}
      <div className="grid grid-cols-2 gap-3">
        <div
          onClick={() => setFilterByAttendance(prev => prev === "present" ? "all" : "present")}
          className={cn(
            "cursor-pointer select-none surface-elevated rounded-lg p-4 text-center border transition-all",
            filterByAttendance === "present"
              ? "border-success bg-success/10 ring-2 ring-success/30"
              : "border-success/20 hover:bg-success/5"
          )}
        >
          <p className="text-3xl font-bold text-success tabular-nums">
            {batchSummary.present}
          </p>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-1">Present</p>
          {filterByAttendance === "present" && (
            <p className="text-[10px] text-success mt-1 font-semibold">Showing only Present students</p>
          )}
        </div>
        <div
          onClick={() => setFilterByAttendance(prev => prev === "absent" ? "all" : "absent")}
          className={cn(
            "cursor-pointer select-none surface-elevated rounded-lg p-4 text-center border transition-all",
            filterByAttendance === "absent"
              ? "border-destructive bg-destructive/10 ring-2 ring-destructive/30"
              : "border-destructive/20 hover:bg-destructive/5"
          )}
        >
          <p className="text-3xl font-bold text-destructive tabular-nums">
            {batchSummary.absent}
          </p>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-1">Absent</p>
          {filterByAttendance === "absent" && (
            <p className="text-[10px] text-destructive mt-1 font-semibold">Showing only Absent students</p>
          )}
        </div>
      </div>

      {/* Attendance List */}
      <div className="surface-elevated rounded-lg divide-y divide-border/50 overflow-hidden border border-border/50">
        {filteredStudents.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No active students found in this batch.</div>
        ) : (
          filteredStudents.map((student) => {
            const status = getStudentStatus(student.id);
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
        <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl">📊 Attendance Summary</AlertDialogTitle>
            <div className="space-y-3 pt-3 pb-2">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-3 bg-secondary/50 rounded-xl border border-border/50 transition-colors hover:bg-secondary">
                  <p className="text-xl font-bold text-foreground leading-none mb-1">{batchSummary.total}</p>
                  <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Total</p>
                </div>
                <div className="p-3 bg-success/10 rounded-xl border border-success/20 transition-colors hover:bg-success/20">
                  <p className="text-xl font-bold text-success leading-none mb-1">{batchSummary.present}</p>
                  <p className="text-[10px] uppercase font-bold tracking-wider text-success">Present</p>
                </div>
                <div className="p-3 bg-destructive/10 rounded-xl border border-destructive/20 transition-colors hover:bg-destructive/20">
                  <p className="text-xl font-bold text-destructive leading-none mb-1">{batchSummary.absent}</p>
                  <p className="text-[10px] uppercase font-bold tracking-wider text-destructive">Absent</p>
                </div>
              </div>
            </div>
          </AlertDialogHeader>

          {/* Absent Students List in Table Format */}
          {batchSummary.absent > 0 && (
            <div className="space-y-3 py-4 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground">🚨 Absent Students ({batchSummary.absent})</h3>
              <div className="overflow-x-auto border border-border/50 rounded-lg max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 sticky top-0 border-b border-border/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-foreground">Student Name</th>
                      <th className="px-4 py-3 text-left font-semibold text-foreground">Phone Number</th>
                      <th className="px-4 py-3 text-center font-semibold text-foreground">Send WhatsApp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {(selectedBatch === "all" ? students : students.filter((s) => s.batch_name === selectedBatch))
                      .filter(isStudentVisible)
                      .filter(s => getStudentStatus(s.id) === "absent")
                      .map((student) => {
                        const availablePhone = student.mother_phone || student.father_phone || student.phone;
                        const phoneLabel = student.mother_phone ? "Mother" : student.father_phone ? "Father" : "Student";

                        return (
                          <tr key={student.id} className="hover:bg-secondary/20 transition-colors">
                            <td className="px-4 py-3">
                              <div>
                                <p className="font-medium text-foreground">{student.name}</p>
                                <p className="text-xs text-muted-foreground font-mono">{student.enrollment_no}</p>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {availablePhone ? (
                                <div className="flex items-center gap-2">
                                  <a
                                    href={`whatsapp://send?phone=${formatWaMePhone(availablePhone)}&text=${encodeURIComponent(getAbsentWhatsAppMessage(student.name, today, instituteName))}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs bg-secondary px-2 py-1 rounded font-semibold text-muted-foreground hover:underline"
                                    title="Open in WhatsApp"
                                  >
                                    {phoneLabel}
                                  </a>
                                  <span className="font-mono text-sm text-foreground">+{formatWaMePhone(availablePhone)}</span>
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">No phone available</p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {availablePhone ? (
                                <a
                                  href={`https://web.whatsapp.com/send?phone=${formatWaMePhone(availablePhone)}&text=${encodeURIComponent(getAbsentWhatsAppMessage(student.name, today, instituteName))}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-md text-xs font-medium transition-colors"
                                >
                                  <MessageCircle className="w-4 h-4" />
                                  Send
                                </a>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              {/* Send to All Button */}
              <div className="space-y-2 mt-3">
                <Button
                  onClick={handleSendToAllAbsent}
                  disabled={sendingToAll || sendingViaServer}
                  className="w-full bg-green-500 hover:bg-green-600 text-white"
                >
                  {sendingToAll ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending... ({sentCount})
                    </>
                  ) : sendingViaServer ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending {sendViaServerProgress.current}/{sendViaServerProgress.total} via WhatsApp Web (~4s delay)...
                    </>
                  ) : (
                    <>
                      <MessageCircle className="w-4 h-4 mr-2" />
                      {activeWASessionId
                        ? "Send WhatsApp to All Absent Students (via WhatsApp Web, ~4s delay)"
                        : "Send WhatsApp to All Absent Students"}
                    </>
                  )}
                </Button>
                {hasActiveWASession && (
                  <p className="text-xs text-green-600 text-center">
                    WhatsApp Web session active — messages will be sent directly with 3-5s delay
                  </p>
                )}
              </div>
            </div>
          )}

          <AlertDialogFooter className="flex-col sm:flex-row gap-2 mt-4">
            <AlertDialogCancel className="mt-0 sm:flex-1" onClick={() => setShowSummary(false)}>
              Close
            </AlertDialogCancel>
            <Button
              className="sm:flex-1 bg-primary hover:bg-primary/90"
              onClick={handleNotifyAbsent}
            >
              <MessageSquare className="w-4 h-4 mr-2" /> View Links
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}