import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import { Loader2, MessageCircle } from "lucide-react";
import { WhatsAppNotification, formatWaMePhone } from "@/lib/whatsapp-service";
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


type ExamAttendanceStatus = "present" | "absent" | "leave";

type StudentRow = {
  id: string;
  name: string;
  enrollment_no: string;
  batch_name: string;
};

type ExamKeyRow = {
  exam_name: string;
  subject: string;
  exam_date: string; // YYYY-MM-DD
  batch_name: string;
};

type ExamAttendanceRow = {
  student_id: string;
  status: ExamAttendanceStatus;
};

const normalizeDate = (value: string | null | undefined) => {
  if (!value) return "";
  // If it's a date already (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  // Otherwise attempt to parse
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
};

export default function ExamAttendancePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const DEFAULT_UUID = "00000000-0000-0000-0000-000000000001";
  const instId = isAdmin ? (user as AdminUser).instituteId : DEFAULT_UUID;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [students, setStudents] = useState<StudentRow[]>([]);

  const [examOptions, setExamOptions] = useState<ExamKeyRow[]>([]);
  const [selectedExam, setSelectedExam] = useState<{ exam_name: string; subject: string; exam_date: string; batch_name: string } | null>(null);

  const [selectedBatch, setSelectedBatch] = useState<string>("all");

  const [records, setRecords] = useState<Record<string, ExamAttendanceStatus>>({});

  const [search, setSearch] = useState("");

  const fetchStudents = async () => {
    const { data, error } = await supabase
      .from("students")
      .select("id, name, enrollment_no, batch_name")
      .eq("institute_id", instId)
      .eq("status", "active");

    if (error) throw error;
    setStudents(data || []);
  };

  const fetchExamOptions = async () => {
    // Use marks as the source of exam_name/subject/exam_date(+batch)
    // MarksPage stores exam_date into created_at currently.
    const { data, error } = await supabase
      .from("marks")
      .select(
        "exam_name, subject, created_at, batch_id, batches(name)"
      )
      .eq("institute_id", instId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const map = new Map<string, ExamKeyRow>();
    (data || []).forEach((row: any) => {
      const exam_name = row.exam_name;
      const subject = row.subject;
      const exam_date = normalizeDate(row.created_at);
      const batch_name = row.batches?.[0]?.name || row.batches?.name || "Unknown";
      const key = `${exam_name}__${subject}__${exam_date}__${batch_name}`;
      if (!map.has(key)) {
        map.set(key, { exam_name, subject, exam_date, batch_name });
      }
    });

    setExamOptions(Array.from(map.values()));
  };

  const fetchExistingAttendance = async (exam: NonNullable<typeof selectedExam>) => {
    const { data, error } = await supabase
      .from("exam_attendance")
      .select("student_id, status")
      .eq("institute_id", instId)
      .eq("exam_name", exam.exam_name)
      .eq("subject", exam.subject)
      .eq("exam_date", exam.exam_date);

    if (error) throw error;

    const next: Record<string, ExamAttendanceStatus> = {};
    students.forEach((s) => {
      const existing = (data || []).find((r: any) => r.student_id === s.id);
      next[s.id] = existing?.status ?? "present";
    });
    setRecords(next);
  };

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await fetchStudents();
        await fetchExamOptions();
      } catch (e: any) {
        toast({ title: "Error", description: e?.message || "Failed to load", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instId]);

  const batches = useMemo(() => {
    return [...new Set(students.map((s) => s.batch_name))].filter(Boolean).sort();
  }, [students]);

  const filteredStudents = useMemo(() => {
    if (!selectedExam) return [];
    const batch = selectedBatch === "all" ? selectedExam.batch_name : selectedBatch;
    return students
      .filter((s) => (batch ? s.batch_name === batch : true))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [students, selectedBatch, selectedExam]);

  const filteredExamOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = examOptions
      .filter((e) => (selectedBatch === "all" ? true : e.batch_name === selectedBatch))
      .filter((e) => {
        if (!q) return true;
        return (
          e.exam_name.toLowerCase().includes(q) ||
          e.subject.toLowerCase().includes(q) ||
          e.exam_date.includes(q)
        );
      });

    return list;
  }, [examOptions, search, selectedBatch]);

  useEffect(() => {
    // Default batch filter to match selected exam batch (if possible)
    if (selectedExam && selectedBatch === "all") {
      // keep as-is; filteredStudents handles batch
    }
  }, [selectedExam, selectedBatch]);

  const handleSelectExam = async (exam: ExamKeyRow) => {
    setSelectedExam(exam);
    // reset records immediately
    setRecords({});
    try {
      // Important: fetchExistingAttendance depends on students already loaded.
      await fetchExistingAttendance(exam);
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to load attendance", variant: "destructive" });
    }
  };

  const updateStatus = (studentId: string, status: ExamAttendanceStatus) => {
    setRecords((prev) => ({ ...prev, [studentId]: status }));
  };

  const handleSave = async () => {
    if (!selectedExam) return;
    setSaving(true);
    try {
      const payload = filteredStudents.map((s) => ({
        institute_id: instId,
        student_id: s.id,
        batch_id: null,
        exam_name: selectedExam.exam_name,
        subject: selectedExam.subject,
        exam_date: selectedExam.exam_date,
        status: records[s.id] ?? "present",
      }));

      // Resolve batch_id for selected exam batch_name if possible
      // (keeps schema consistent; not required by uniqueness)
      const { data: batchData } = await supabase
        .from("batches")
        .select("id, name")
        .eq("institute_id", instId)
        .eq("name", selectedExam.batch_name)
        .maybeSingle();

      const batchId = (batchData as any)?.id ?? null;

      const payloadWithBatch = payload.map((p: any) => ({ ...p, batch_id: batchId }));

      const { error } = await supabase
        .from("exam_attendance")
        .upsert(payloadWithBatch, {
          onConflict: "institute_id,student_id,exam_name,subject,exam_date",
        });

      if (error) throw error;

      toast({ title: "Saved", description: "Exam attendance saved successfully." });

      // After saving, open a dialog showing absent students with web.whatsapp links
      // Get absent students
      const absentStudents = filteredStudents.filter((s) => (records[s.id] ?? "present") === "absent");
      if (absentStudents.length > 0) {
        // Fetch parent phones
        const studentIds = absentStudents.map((s) => s.id);
        const { data: phoneData } = await supabase
          .from("students")
          .select("id, mother_phone, father_phone, phone")
          .in("id", studentIds);

        const instituteName = isAdmin ? (user as AdminUser).instituteName : "Institute";

        const results = absentStudents.map((s) => {
          const row = (phoneData || []).find((p: any) => p.id === s.id) || {};
          const parentPhone = row.mother_phone || row.father_phone || row.phone || "";
          const phone = formatWaMePhone(parentPhone || "");
          const msg = `Hello Parent,\n\nThis is to inform you that your child ${s.name} was absent on today's *${selectedExam?.exam_name}*.\n\nThank you\n${instituteName}`;
          return {
            name: s.name,
            phone: phone || "",
            link: `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`,
            label: row.mother_phone ? "Mother" : row.father_phone ? "Father" : "Student",
          };
        });

        setNotificationResults(results as any);
        setShowAbsentDialog(true);
      }
    } catch (e: any) {
      toast({ title: "Save Failed", description: e?.message || "Unable to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const [showAbsentDialog, setShowAbsentDialog] = useState(false);
  const [notificationResults, setNotificationResults] = useState<Array<any>>([]);

  const summary = useMemo(() => {
    const all = filteredStudents.length;
    const present = filteredStudents.filter((s) => records[s.id] === "present").length;
    const absent = filteredStudents.filter((s) => records[s.id] === "absent").length;
    const leave = filteredStudents.filter((s) => records[s.id] === "leave").length;
    return { all, present, absent, leave };
  }, [filteredStudents, records]);

  const handleNotifyAbsent = async () => {
    if (!selectedExam) return;

    const absentStudents = filteredStudents.filter((s) => records[s.id] === "absent");
    if (absentStudents.length === 0) {
      toast({ title: "No Absentees", description: "No students are marked absent for this exam." });
      return;
    }

    // Load parent phones for recipients
    const studentIds = absentStudents.map((s) => s.id);
    const { data: phoneData, error } = await supabase
      .from("students")
      .select("id, mother_phone, father_phone")
      .in("id", studentIds);

    if (error) throw error;

    const recipients = absentStudents
      .map((s) => {
        const row = (phoneData || []).find((p: any) => p.id === s.id);
        const parentPhone = row?.mother_phone || row?.father_phone;
        if (!parentPhone) return null;
        return {
          phone: parentPhone,
          studentName: s.name,
          instituteId: instId,
          date: selectedExam.exam_date,
        } as WhatsAppNotification;
      })
      .filter(Boolean) as WhatsAppNotification[];

    if (recipients.length === 0) {
      toast({ title: "No Parent Contacts", description: "No absent students have parent phone numbers." });
      return;
    }

    toast({
      title: "Processing Notifications",
      description: `Queuing WhatsApp messages for ${recipients.length} parents...`,
    });

    // For Exam Attendance: generate direct web.whatsapp links (no Zavu auto-send)
    // so behavior matches the Normal Attendance UI.
    const instituteName = isAdmin ? (user as AdminUser).instituteName : "Institute";
    // Prepare notificationResults for the dialog. We'll offer a "Send via ApexSMS" action
    const results = recipients.map((n) => {
      const msg = `Hello Parent,\n\nThis is to inform you that your child ${n.studentName} was absent on today's *${selectedExam?.exam_name}*.\n\nThank you\n${instituteName}`;
      const phone = formatWaMePhone(n.phone);
      return {
        name: n.studentName,
        phone: phone,
        message: msg,
        sent: false,
      };
    });

    setNotificationResults(results as any);
    setShowAbsentDialog(true);

  };


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <AlertDialog open={showAbsentDialog} onOpenChange={setShowAbsentDialog}>
        <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>📱 WhatsApp Parent Notifications</AlertDialogTitle>
            <AlertDialogDescription>
              Click links below in web.whatsapp.com to send absent messages.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 py-4">
            {notificationResults.map((result: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-secondary rounded-lg gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">{result.name}</p>
                  <p className="text-xs text-muted-foreground truncate">+{result.phone}</p>
                  <p className="text-xs text-muted-foreground mt-1 truncate">{result.message}</p>
                </div>
                <div className="flex gap-1 shrink-0 items-center">
                  {result.sent ? (
                    <span className="text-sm text-success font-semibold mr-2">Queued</span>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigator.clipboard.writeText(result.message)}
                    className="h-8 px-3"
                  >
                    Copy
                  </Button>
                  <Button
                    size="sm"
                    asChild
                    className="h-8 px-3 bg-green-500 hover:bg-green-600"
                  >
                    <a href={`https://wa.me/${result.phone}?text=${encodeURIComponent(result.message)}`} target="_blank" rel="noopener noreferrer">
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
                navigator.clipboard.writeText(notificationResults.map((r: any) => `${r.name}: ${r.phone} \n${r.message}`).join('\n\n'));
                toast({ title: "Copied All Messages!" });
              }}
            >
              Copy All Messages
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                if (!notificationResults || notificationResults.length === 0) {
                  toast({ title: 'No messages', description: 'No notifications prepared.' });
                  return;
                }

                // Lookup institute-specific OpenWA webhook config, fallback to env var
                const { data: cfg } = await supabase
                  .from('institute_integrations')
                  .select('config')
                  .eq('institute_id', instId)
                  .eq('provider', 'openwa')
                  .maybeSingle();

                const envWebhook = (import.meta as any).env?.VITE_OPENWA_WEBHOOK || (import.meta as any).env?.VITE_APEXSMS_WEBHOOK || '';
                const webhookUrl = cfg?.config?.webhookUrl || cfg?.config?.webhook || envWebhook;

                if (!webhookUrl) {
                  toast({ title: 'Not Configured', description: 'OpenWA webhook not configured for this institute.', variant: 'destructive' });
                  return;
                }

                try {
                  toast({ title: 'Sending', description: `Sending ${notificationResults.length} messages via OpenWA webhook...` });

                  const payload = notificationResults.map((r: any) => ({ to: r.phone, message: r.message, name: r.name }));

                  const resp = await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ messages: payload }),
                  });

                  if (!resp.ok) {
                    const text = await resp.text();
                    toast({ title: 'Send Failed', description: `Status ${resp.status}: ${text}`, variant: 'destructive' });
                    return;
                  }

                  setNotificationResults((prev) => prev.map((p: any) => ({ ...p, sent: true })));
                  toast({ title: 'Sent', description: `Queued ${notificationResults.length} messages via OpenWA webhook.` });
                } catch (err: any) {
                  toast({ title: 'Error', description: err?.message || String(err), variant: 'destructive' });
                }
              }}
            >
              Send via ApexSMS
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Exam Attendance</h2>
          <p className="text-sm text-muted-foreground">
            Mark student attendance for a specific exam (linked by exam_name + subject + exam_date).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleNotifyAbsent} disabled={!selectedExam} variant="outline">
            <MessageCircle className="w-4 h-4 mr-1" />
            Notify Absent
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!selectedExam || saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            Save
          </Button>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-1 surface-elevated rounded-lg p-4 border border-border/50">
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-foreground">Search exams</label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="e.g., Unit Test"
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-foreground">Batch (filter)</label>
              <select
                value={selectedBatch}
                onChange={(e) => setSelectedBatch(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground"
              >
                <option value="all">All Batches</option>
                {batches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground">Select exam</label>
              <div className="mt-2 space-y-2 max-h-[420px] overflow-y-auto">
                {filteredExamOptions.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No exam found.</div>
                ) : (
                  filteredExamOptions.map((opt) => {
                    const active =
                      selectedExam &&
                      selectedExam.exam_name === opt.exam_name &&
                      selectedExam.subject === opt.subject &&
                      selectedExam.exam_date === opt.exam_date &&
                      selectedExam.batch_name === opt.batch_name;

                    return (
                      <button
                        key={`${opt.exam_name}-${opt.subject}-${opt.exam_date}-${opt.batch_name}`}
                        onClick={() => handleSelectExam(opt)}
                        className={cn(
                          "w-full text-left p-3 rounded-lg border transition-colors",
                          active
                            ? "bg-primary/10 border-primary/40"
                            : "bg-secondary/20 border-border/50 hover:bg-secondary/30"
                        )}
                      >
                        <div className="text-sm font-semibold text-foreground truncate">{opt.exam_name}</div>
                        <div className="text-xs text-muted-foreground truncate">{opt.subject}</div>
                        <div className="text-xs text-muted-foreground">{opt.batch_name} · {opt.exam_date}</div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 surface-elevated rounded-lg p-4 border border-border/50">
          {!selectedExam ? (
            <div className="text-sm text-muted-foreground">Select an exam on the left to start marking.</div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {selectedExam.exam_name} — {selectedExam.subject}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Batch: {selectedExam.batch_name} · Exam Date: {selectedExam.exam_date}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Total students: <span className="font-semibold text-foreground">{summary.all}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="p-3 bg-success/10 rounded-lg border border-success/20 text-center">
                  <div className="text-xl font-bold text-success">{summary.present}</div>
                  <div className="text-[10px] uppercase font-bold tracking-wider text-success">Present</div>
                </div>
                <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20 text-center">
                  <div className="text-xl font-bold text-destructive">{summary.absent}</div>
                  <div className="text-[10px] uppercase font-bold tracking-wider text-destructive">Absent</div>
                </div>
                <div className="p-3 bg-warning/10 rounded-lg border border-warning/20 text-center">
                  <div className="text-xl font-bold text-warning">{summary.leave}</div>
                  <div className="text-[10px] uppercase font-bold tracking-wider text-warning">Leave</div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 sticky top-0 border-b border-border/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-foreground">Student</th>
                      <th className="px-4 py-3 text-left font-semibold text-foreground">Enrollment</th>
                      <th className="px-4 py-3 text-center font-semibold text-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {filteredStudents.length === 0 ? (
                      <tr>
                        <td className="px-4 py-6 text-center text-muted-foreground" colSpan={3}>
                          No students found for this exam batch.
                        </td>
                      </tr>
                    ) : (
                      filteredStudents.map((s) => {
                        const status = records[s.id] ?? "present";
                        return (
                          <tr key={s.id} className="hover:bg-secondary/20 transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-medium text-foreground">{s.name}</div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{s.enrollment_no}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => updateStatus(s.id, "present")}
                                  className={cn(
                                    "px-3 py-1.5 text-xs font-bold rounded-md border transition-all",
                                    status === "present"
                                      ? "bg-success text-success-foreground border-success/30"
                                      : "bg-background hover:bg-secondary/30 border-border/50 text-muted-foreground"
                                  )}
                                >
                                  Present
                                </button>
                                <button
                                  onClick={() => updateStatus(s.id, "leave")}
                                  className={cn(
                                    "px-3 py-1.5 text-xs font-bold rounded-md border transition-all",
                                    status === "leave"
                                      ? "bg-warning text-warning-foreground border-warning/30"
                                      : "bg-background hover:bg-secondary/30 border-border/50 text-muted-foreground"
                                  )}
                                >
                                  Leave
                                </button>
                                <button
                                  onClick={() => updateStatus(s.id, "absent")}
                                  className={cn(
                                    "px-3 py-1.5 text-xs font-bold rounded-md border transition-all",
                                    status === "absent"
                                      ? "bg-destructive text-destructive-foreground border-destructive/30"
                                      : "bg-background hover:bg-secondary/30 border-border/50 text-muted-foreground"
                                  )}
                                >
                                  Absent
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

