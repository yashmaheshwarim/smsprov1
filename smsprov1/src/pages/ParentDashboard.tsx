import { useAuth, ParentUser } from "@/contexts/AuthContext";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { CalendarCheck, IndianRupee, Bell, TrendingUp, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/maheshwari-tech-logo.png";

const childData = {
  name: "Aarav Gupta",
  enrollmentNo: "MT-2025000",
  grn: "GRN-2025-00001",
  batch: "JEE 2025 - Batch A",
  attendance: [
    { date: "2025-03-10", status: "present" }, { date: "2025-03-11", status: "present" },
    { date: "2025-03-12", status: "late" }, { date: "2025-03-13", status: "absent" },
    { date: "2025-03-14", status: "present" }, { date: "2025-03-15", status: "present" },
  ],
  fees: { total: 25000, paid: 15000, dueDate: "2025-04-15" },
  results: [
    { exam: "Unit Test 3", subject: "Physics", marks: "42/50", percentage: "84%" },
    { exam: "Unit Test 3", subject: "Chemistry", marks: "38/50", percentage: "76%" },
    { exam: "Unit Test 3", subject: "Mathematics", marks: "45/50", percentage: "90%" },
  ],
  announcements: [
    { id: 1, title: "PTM on March 20", date: "2025-03-15", message: "All parents are requested to attend." },
    { id: 2, title: "Fee Reminder", date: "2025-03-14", message: "Pending fee of ₹10,000 due by April 15." },
  ],
};

export default function ParentDashboard() {
  const { user, logout } = useAuth();
  const parent = user as ParentUser;
  const c = childData;
  const presentDays = c.attendance.filter(a => a.status === "present" || a.status === "late").length;
  const attendanceRate = ((presentDays / c.attendance.length) * 100).toFixed(0);

  return (
    <div className="min-h-screen bg-surface">
      <header className="h-14 bg-card border-b border-border flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <img src={logo} alt="Logo" className="h-8 object-contain" />
          <span className="text-sm font-bold text-foreground">Apex SMS</span>
          <StatusBadge variant="info">Parent</StatusBadge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground hidden sm:block">{parent.name}</span>
          <Button size="sm" variant="outline" onClick={logout}>Logout</Button>
        </div>
      </header>

      <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-4 animate-fade-in">
        <div className="surface-elevated rounded-lg p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">{c.name}</h2>
            <p className="text-sm text-muted-foreground">{c.enrollmentNo} · {c.batch}</p>
            <p className="text-xs text-muted-foreground">GRN: {c.grn}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard title="Attendance" value={`${attendanceRate}%`} icon={CalendarCheck} change={`${presentDays}/${c.attendance.length}`} changeType="positive" />
          <StatCard title="Fees Pending" value={`₹${(c.fees.total - c.fees.paid).toLocaleString()}`} icon={IndianRupee} change={`Due: ${c.fees.dueDate}`} changeType="negative" />
          <StatCard title="Avg Score" value="83%" icon={TrendingUp} change="Last test" changeType="positive" />
          <StatCard title="Notices" value={c.announcements.length} icon={Bell} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="surface-elevated rounded-lg p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Recent Attendance</h3>
            <div className="space-y-2">
              {c.attendance.map((a, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                  <span className="text-sm text-foreground">{a.date}</span>
                  <StatusBadge variant={a.status === "present" ? "success" : a.status === "late" ? "warning" : "destructive"}>{a.status}</StatusBadge>
                </div>
              ))}
            </div>
          </div>

          <div className="surface-elevated rounded-lg p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Exam Results</h3>
            <div className="space-y-2">
              {c.results.map((r, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">{r.subject}</p>
                    <p className="text-xs text-muted-foreground">{r.exam}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">{r.marks}</p>
                    <p className="text-xs text-primary">{r.percentage}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="surface-elevated rounded-lg p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Fee Summary</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total Fee</span><span className="font-medium text-foreground">₹{c.fees.total.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Paid</span><span className="font-medium text-success">₹{c.fees.paid.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Pending</span><span className="font-medium text-destructive">₹{(c.fees.total - c.fees.paid).toLocaleString()}</span></div>
              <div className="w-full bg-secondary rounded-full h-2"><div className="bg-primary rounded-full h-2" style={{ width: `${(c.fees.paid / c.fees.total) * 100}%` }} /></div>
              <p className="text-xs text-muted-foreground">Due Date: {c.fees.dueDate}</p>
            </div>
          </div>

          <div className="surface-elevated rounded-lg p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Notices & Alerts</h3>
            <div className="space-y-2">
              {c.announcements.map(a => (
                <div key={a.id} className="py-1.5 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-2"><Bell className="w-3.5 h-3.5 text-primary" /><p className="text-sm font-medium text-foreground">{a.title}</p></div>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.message}</p>
                  <p className="text-[10px] text-muted-foreground">{a.date}</p>
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
