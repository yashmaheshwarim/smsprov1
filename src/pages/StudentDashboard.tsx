import { useAuth, StudentUser } from "@/contexts/AuthContext";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { BookOpen, CalendarCheck, IndianRupee, ClipboardList, FileText, Download, Bell, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import logo from "@/assets/maheshwari-tech-logo.png";

const mockAttendance = [
  { date: "2025-03-10", status: "present" }, { date: "2025-03-11", status: "present" },
  { date: "2025-03-12", status: "late" }, { date: "2025-03-13", status: "absent" },
  { date: "2025-03-14", status: "present" }, { date: "2025-03-15", status: "present" },
];

const mockFees = { total: 25000, paid: 15000, due: "2025-04-15", status: "partial" as const };

const mockMaterials = [
  { id: 1, title: "Thermodynamics Notes", subject: "Physics", type: "pdf", date: "2025-03-10" },
  { id: 2, title: "Organic Chemistry Lecture", subject: "Chemistry", type: "video", date: "2025-03-09" },
  { id: 3, title: "Calculus Problem Set", subject: "Mathematics", type: "pdf", date: "2025-03-08" },
];

const mockAssignments = [
  { id: 1, title: "Physics Assignment 5", subject: "Physics", dueDate: "2025-03-20", status: "pending" },
  { id: 2, title: "Chemistry Lab Report", subject: "Chemistry", dueDate: "2025-03-18", status: "submitted" },
  { id: 3, title: "Math Worksheet 12", subject: "Mathematics", dueDate: "2025-03-15", status: "graded", score: "18/20" },
];

const mockAnnouncements = [
  { id: 1, title: "Mid-Term Exam Schedule Released", date: "2025-03-15", message: "Check timetable section for details." },
  { id: 2, title: "Holiday Notice - Holi", date: "2025-03-14", message: "Institute closed on March 14." },
];

export default function StudentDashboard() {
  const { user, logout } = useAuth();
  const student = user as StudentUser;

  const presentDays = mockAttendance.filter(a => a.status === "present" || a.status === "late").length;
  const attendanceRate = ((presentDays / mockAttendance.length) * 100).toFixed(0);

  const handleDownload = (title: string) => {
    toast({ title: "Download Started", description: `Downloading "${title}"...` });
  };

  return (
    <div className="min-h-screen bg-surface">
      <header className="h-14 bg-card border-b border-border flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <img src={logo} alt="Logo" className="h-8 object-contain" />
          <span className="text-sm font-bold text-foreground">Apex SMS</span>
          <StatusBadge variant="primary">Student</StatusBadge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground hidden sm:block">{student.name}</span>
          <Button size="sm" variant="outline" onClick={logout}>Logout</Button>
        </div>
      </header>

      <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-4 animate-fade-in">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Welcome, {student.name}</h2>
          <p className="text-sm text-muted-foreground">{student.enrollmentNo} · {student.batch}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Hash className="w-3 h-3" /> GRN: {student.grn}</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard title="Attendance" value={`${attendanceRate}%`} icon={CalendarCheck} change={`${presentDays}/${mockAttendance.length} days`} changeType="positive" />
          <StatCard title="Fees Due" value={`₹${(mockFees.total - mockFees.paid).toLocaleString()}`} icon={IndianRupee} change={`Due: ${mockFees.due}`} changeType="negative" />
          <StatCard title="Materials" value={mockMaterials.length} icon={BookOpen} />
          <StatCard title="Assignments" value={mockAssignments.filter(a => a.status === "pending").length} icon={ClipboardList} change="Pending" changeType="negative" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Attendance */}
          <div className="surface-elevated rounded-lg p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Recent Attendance</h3>
            <div className="space-y-2">
              {mockAttendance.map((a, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                  <span className="text-sm text-foreground">{a.date}</span>
                  <StatusBadge variant={a.status === "present" ? "success" : a.status === "late" ? "warning" : "destructive"}>{a.status}</StatusBadge>
                </div>
              ))}
            </div>
          </div>

          {/* Assignments */}
          <div className="surface-elevated rounded-lg p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Assignments</h3>
            <div className="space-y-2">
              {mockAssignments.map(a => (
                <div key={a.id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.subject} · Due: {a.dueDate}</p>
                  </div>
                  <div className="text-right">
                    <StatusBadge variant={a.status === "graded" ? "success" : a.status === "submitted" ? "primary" : "warning"}>{a.status}</StatusBadge>
                    {a.score && <p className="text-xs text-foreground mt-0.5">{a.score}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Study Materials with Download */}
          <div className="surface-elevated rounded-lg p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Study Materials</h3>
            <div className="space-y-2">
              {mockMaterials.map(m => (
                <div key={m.id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{m.title}</p>
                      <p className="text-xs text-muted-foreground">{m.subject} · {m.date}</p>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7" onClick={() => handleDownload(m.title)}>
                    <Download className="w-3.5 h-3.5 mr-1" /> Download
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Announcements */}
          <div className="surface-elevated rounded-lg p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Announcements</h3>
            <div className="space-y-2">
              {mockAnnouncements.map(a => (
                <div key={a.id} className="py-1.5 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-2">
                    <Bell className="w-3.5 h-3.5 text-primary" />
                    <p className="text-sm font-medium text-foreground">{a.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.message}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{a.date}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-[10px] text-muted-foreground pt-4">Powered by <span className="font-semibold text-foreground">Maheshwari Tech</span></p>
      </div>
    </div>
  );
}
