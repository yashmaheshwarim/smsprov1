import {
  Users, GraduationCap, IndianRupee, CalendarCheck, TrendingUp,
  UserPlus, BarChart3, BookOpen, Layers, FileCheck, X, MessageCircle,
} from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from "recharts";
import { Link } from "react-router-dom";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import { supabase, isUuid, isSupabaseConfigured } from "@/lib/supabase";
import { useEffect, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
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

interface AbsentStudent {
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

/** Get the best available phone: mother -> father -> student -> guardian */
const getBestPhone = (s: AbsentStudent): string => {
  return s.mother_phone || s.father_phone || s.phone || s.guardian_phone || '';
};

const sendWhatsAppToStudent = (student: AbsentStudent, instituteName: string) => {
  const phone = getBestPhone(student);
  if (!phone) return;
  const todayStr = new Date().toLocaleDateString("en-IN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });
  const message = `Hello, this is to inform you that ${student.name} is marked ABSENT today (${todayStr}). Please contact the institute for any queries. - ${instituteName}`;
  const cleanPhone = phone.replace(/\D/g, '');
  const url = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
};

const sendWhatsAppToAll = (students: AbsentStudent[], instituteName: string) => {
  students.forEach((s, i) => {
    if (getBestPhone(s)) {
      setTimeout(() => sendWhatsAppToStudent(s, instituteName), i * 500);
    }
  });
};


const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export default function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const DEFAULT_UUID = "00000000-0000-0000-0000-000000000001";
  const instId = isAdmin ? (user as AdminUser).instituteId : DEFAULT_UUID;
  const instituteName = isAdmin ? (user as AdminUser).instituteName : "";
  const isFresh = instId === DEFAULT_UUID;

  const [stats, setStats] = useState({
    totalStudents: 0,
    totalRevenue: 0,
    attendanceRate: 0,
    newAdmissions: 0, // This will be the inquiries count
  });

  const [recentStudents, setRecentStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentRevenueData, setCurrentRevenueData] = useState<{ month: string; revenue: number; collected: number }[]>([]);
  const [currentAttendance, setCurrentAttendance] = useState<{ day: string; rate: number }[]>([]);
  const [absentStudents, setAbsentStudents] = useState<AbsentStudent[]>([]);
  const [showAbsentDialog, setShowAbsentDialog] = useState(false);

  useEffect(() => {
    if (isUuid(instId) && isSupabaseConfigured()) {
      fetchDashboardData();
    } else if (!isSupabaseConfigured()) {
      setLoading(false);
      setError('Database not configured. Please check environment settings.');
    }
  }, [instId]);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    
    // Fetch Student Count
    const { count: studentCount } = await supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('institute_id', instId);

    // Fetch Inquiries (New Admissions)
    const { count: inquiryCount } = await supabase
      .from('inquiries')
      .select('*', { count: 'exact', head: true })
      .eq('institute_id', instId);

    // Fetch Recent Students
    const { data: recentS } = await supabase
      .from('students')
      .select('id, name, enrollment_no, batch_name, status')
      .eq('institute_id', instId)
      .order('created_at', { ascending: false })
      .limit(5);

    // Fetch Invoices
    const { data: invoices } = await supabase
      .from('invoices')
      .select('amount, paid_amount, due_date')
      .eq('institute_id', instId);

    // Fetch Attendance (past 7 days for chart)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const { data: attendance } = await supabase
      .from('attendance')
      .select('date, status')
      .eq('institute_id', instId)
      .gte('date', weekAgo.toISOString());

    // Fetch Today's Absent Students for quick-view
    const todayStr = new Date().toISOString().split('T')[0];
    const { data: todayAtt } = await supabase
      .from('attendance')
      .select('student_id, status')
      .eq('institute_id', instId)
      .eq('date', todayStr)
      .eq('status', 'absent');

    if (todayAtt && todayAtt.length > 0) {
      const absentIds = todayAtt.map(a => a.student_id);
      const { data: absentStuds } = await supabase
        .from('students')
        .select('id, name, enrollment_no, batch_name, phone, student_phone, mother_phone, father_phone, guardian_phone, guardian_name')
        .eq('institute_id', instId)
        .in('id', absentIds);
      setAbsentStudents((absentStuds || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        enrollment_no: s.enrollment_no,
        batch_name: s.batch_name || '',
        phone: s.phone || s.student_phone || '',
        mother_phone: s.mother_phone,
        father_phone: s.father_phone,
        guardian_phone: s.guardian_phone,
        guardian_name: s.guardian_name,
      })));
    } else {
      setAbsentStudents([]);
    }

    let totalRev = 0;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const revBuckets = Array(6).fill(0).map((_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      return { month: months[d.getMonth()], year: d.getFullYear(), revenue: 0, collected: 0 };
    });

    if (invoices) {
      invoices.forEach(inv => {
        totalRev += (inv.paid_amount || 0);
        const d = new Date(inv.due_date || new Date());
        const match = revBuckets.find(b => b.month === months[d.getMonth()] && b.year === d.getFullYear());
        if (match) {
          match.revenue += (inv.amount || 0);
          match.collected += (inv.paid_amount || 0);
        }
      });
    }
    setCurrentRevenueData(revBuckets.map(b => ({ month: b.month, revenue: b.revenue, collected: b.collected })));

    let totalAttDays = 0;
    let totalPresent = 0;
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const attBuckets = Array(7).fill(0).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return { day: days[d.getDay()], date: d.toISOString().split('T')[0], present: 0, total: 0 };
    });

    if (attendance) {
      attendance.forEach((att: any) => {
        totalAttDays++;
        if (att.status === 'present' || att.status === 'late') totalPresent++;

        const match = attBuckets.find(b => b.date === att.date);
        if (match) {
          match.total++;
          if (att.status === 'present' || att.status === 'late') match.present++;
        }
      });
    }

    const overallAttRate = totalAttDays > 0 ? Math.round((totalPresent / totalAttDays) * 100) : 0;
    setCurrentAttendance(attBuckets.map(b => ({ day: b.day, rate: b.total > 0 ? Math.round((b.present / b.total) * 100) : 0 })));

    setStats(prev => ({
      ...prev,
      totalStudents: studentCount || 0,
      newAdmissions: inquiryCount || 0,
      totalRevenue: totalRev,
      attendanceRate: overallAttRate,
    }));

    if (recentS) {
      // Map the status for UI
      const mappedRecent = (recentS || []).map(s => ({
        ...s,
        batch: s.batch_name,
        feeStatus: 'paid' // Placeholder until invoices are connected
      }));
      setRecentStudents(mappedRecent);
    }
    
    setLoading(false);
  };

  if (error) {
    return (
      <div className="p-4 lg:p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-4">
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto" />
            <h2 className="text-xl font-semibold">Unable to load dashboard</h2>
            <p className="text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Refresh Page
            </Button>
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
      <div className="flex items-center gap-2 mb-2">
        {loading && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Institute Overview</h2>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <StatCard title="Total Students" value={stats.totalStudents.toLocaleString()} change={isFresh ? "0% from last month" : "+12% from last month"} changeType={isFresh ? "neutral" : "positive"} icon={Users} />
        <StatCard title="Total Revenue" value={formatCurrency(stats.totalRevenue)} change={isFresh ? "0% from last month" : "+8% from last month"} changeType={isFresh ? "neutral" : "positive"} icon={IndianRupee} />
        <StatCard title="Attendance Rate" value={`${stats.attendanceRate}%`} change={isFresh ? "0% from last week" : "-2.1% from last week"} changeType={isFresh ? "neutral" : "negative"} icon={CalendarCheck} />
        <StatCard title="New Admissions" value={stats.newAdmissions} change={isFresh ? "0 this week" : "+24 this week"} changeType={isFresh ? "neutral" : "positive"} icon={UserPlus} />
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="surface-elevated rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <div><h3 className="text-sm font-semibold text-foreground">Revenue Overview</h3><p className="text-xs text-muted-foreground">Monthly fee collection</p></div>
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={currentRevenueData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${v / 1000}k`} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="revenue" fill="hsl(var(--primary) / 0.3)" radius={[4, 4, 0, 0]} name="Expected" />
              <Bar dataKey="collected" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Collected" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="surface-elevated rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <div><h3 className="text-sm font-semibold text-foreground">Attendance Trend</h3><p className="text-xs text-muted-foreground">Weekly attendance rate</p></div>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={currentAttendance}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} formatter={(v: number) => `${v}%`} />
              <Line type="monotone" dataKey="rate" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4, fill: "hsl(var(--primary))" }} name="Rate" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 surface-elevated rounded-lg">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Recent Students</h3>
            <Link to="/students" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-border/50">
            {recentStudents.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">No recent students</div>
            ) : (
              recentStudents.map((s) => (
                <Link key={s.id} to={`/students/${s.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-secondary/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-semibold text-primary">{s.name.split(" ").map((n) => n[0]).join("")}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.enrollmentNo}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="hidden sm:block text-xs text-muted-foreground">{s.batch}</span>
                    <StatusBadge variant={s.feeStatus === "paid" ? "success" : s.feeStatus === "partial" ? "warning" : "destructive"}>{s.feeStatus}</StatusBadge>
                  </div>
                </Link>
              ))
            )}

          </div>
        </div>

        <div className="surface-elevated rounded-lg p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">Quick Actions</h3>
          <div className="space-y-2">
            {[
              { icon: UserPlus, label: "Add Student", href: "/students" },
              { icon: CalendarCheck, label: "Mark Attendance", href: "/attendance" },
              { icon: IndianRupee, label: "Generate Invoice", href: "/fees" },
              { icon: BookOpen, label: "Upload Material", href: "/materials" },
              { icon: GraduationCap, label: "Add Teacher", href: "/teachers" },
              { icon: Layers, label: "Manage Batches", href: "/batches" },
              { icon: FileCheck, label: "View Marks", href: "/marks" },
            ].map((action) => (
              <Link key={action.label} to={action.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-secondary transition-colors group">
                <action.icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                <span className="text-sm text-foreground">{action.label}</span>
              </Link>
            ))}

            {absentStudents.length > 0 && (
              <>
                <hr className="border-border/50" />
                <button
                  onClick={() => setShowAbsentDialog(true)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-destructive/5 transition-colors group w-full text-left"
                >
                  <X className="w-4 h-4 text-destructive group-hover:text-destructive transition-colors" />
                  <span className="text-sm text-foreground flex-1">View Absent Students</span>
                  <span className="text-xs font-bold text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">
                    {absentStudents.length}
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      {/* Absent Students Dialog — with WhatsApp redirect */}
      <AlertDialog open={showAbsentDialog} onOpenChange={setShowAbsentDialog}>
        <AlertDialogContent className="max-w-[500px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl flex items-center gap-2">
              <X className="w-5 h-5 text-destructive" /> Absent Students Today
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              {absentStudents.length} student{absentStudents.length !== 1 ? "s" : ""} marked absent today
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-[400px] overflow-y-auto space-y-2">
            {absentStudents.map((student, index) => (
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
                    title="Send WhatsApp"
                  >
                    <MessageCircle className="w-3 h-3" />
                    WhatsApp
                  </button>
                ) : (
                  <span className="text-[10px] text-muted-foreground italic shrink-0">No phone</span>
                )}
              </div>
            ))}
            {absentStudents.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No absent students today. Great attendance! 🎉
              </div>
            )}
          </div>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => setShowAbsentDialog(false)} className="mt-0">Close</AlertDialogCancel>
            {absentStudents.some(s => getBestPhone(s)) && (
              <AlertDialogAction
                onClick={() => sendWhatsAppToAll(absentStudents, instituteName)}
                className="bg-green-600 hover:bg-green-700"
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                Notify All via WhatsApp
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
