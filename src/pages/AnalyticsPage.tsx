import { BarChart3, Users, IndianRupee, CalendarCheck, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from "recharts";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "hsl(215 16% 47%)",
];

export default function AnalyticsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const instId = isAdmin ? (user as AdminUser).instituteId : "INST-001";
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ activeStudents: 0, attendanceRate: 0, totalRevenue: 0, totalTeachers: 0 });
  const [revenueData, setRevenueData] = useState<{ month: string; collected: number }[]>([]);
  const [attendanceTrend, setAttendanceTrend] = useState<{ day: string; rate: number }[]>([]);
  const [batchDistribution, setBatchDistribution] = useState<{ name: string; value: number }[]>([]);

  useEffect(() => {
    fetchData();
  }, [instId]);

  const fetchData = async () => {
    setLoading(true);

    const { count: studentCount } = await supabase.from('students').select('*', { count: 'exact', head: true }).eq('institute_id', instId);
    const { count: teacherCount } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('institute_id', instId).eq('role', 'teacher');

    const { data: students } = await supabase.from('students').select('batch_name').eq('institute_id', instId);
    if (students) {
      const batchCounts = students.reduce((acc: Record<string, number>, s) => {
        const batch = s.batch_name || "Unassigned";
        acc[batch] = (acc[batch] || 0) + 1;
        return acc;
      }, {});
      setBatchDistribution(Object.entries(batchCounts).map(([name, value]) => ({ name, value })));
    }

    const { data: invoices } = await supabase.from('invoices').select('paid_amount, due_date').eq('institute_id', instId);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const revBuckets = Array(6).fill(0).map((_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      return { month: months[d.getMonth()], year: d.getFullYear(), collected: 0 };
    });
    
    let totalRev = 0;
    if (invoices) {
      invoices.forEach(inv => {
        totalRev += (inv.paid_amount || 0);
        const d = new Date(inv.due_date || new Date());
        const match = revBuckets.find(b => b.month === months[d.getMonth()] && b.year === d.getFullYear());
        if (match) match.collected += (inv.paid_amount || 0);
      });
    }
    setRevenueData(revBuckets.map(b => ({ month: b.month, collected: b.collected })));

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const { data: attendance } = await supabase.from('attendance').select('date, status').eq('institute_id', instId).gte('date', weekAgo.toISOString());

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
    setAttendanceTrend(attBuckets.map(b => ({ day: b.day, rate: b.total > 0 ? Math.round((b.present / b.total) * 100) : 0 })));

    setStats({
      activeStudents: studentCount || 0,
      totalTeachers: teacherCount || 0,
      totalRevenue: totalRev,
      attendanceRate: totalAttDays > 0 ? Math.round((totalPresent / totalAttDays) * 100) : 0
    });

    setLoading(false);
  };

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
      <h2 className="text-lg font-semibold text-foreground">Analytics & Reports</h2>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Active Students" value={stats.activeStudents.toLocaleString()} icon={Users} change={stats.activeStudents > 0 ? "+0% growth" : ""} changeType="neutral" />
        <StatCard title="Attendance" value={`${stats.attendanceRate}%`} icon={CalendarCheck} change="Weekly avg" changeType="neutral" />
        <StatCard title="Revenue" value={formatCurrency(stats.totalRevenue)} icon={IndianRupee} change={stats.totalRevenue > 0 ? "+0% MoM" : ""} changeType="neutral" />
        <StatCard title="Teachers" value={stats.totalTeachers} icon={TrendingUp} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue Trend */}
        <div className="surface-elevated rounded-lg p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">Revenue Trend</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${v / 1000}k`} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="collected" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Collected" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Batch Distribution */}
        <div className="surface-elevated rounded-lg p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">Student Distribution by Program</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={batchDistribution} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={4} dataKey="value">
                {batchDistribution.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 mt-2 justify-center">
            {batchDistribution.map((b, i) => (
              <div key={b.name} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i] }} />
                <span className="text-xs text-muted-foreground">{b.name} ({b.value})</span>
              </div>
            ))}
          </div>
        </div>

        {/* Attendance Weekly */}
        <div className="surface-elevated rounded-lg p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-foreground mb-4">Weekly Attendance Pattern</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={attendanceTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis domain={[70, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
              <Line type="monotone" dataKey="rate" stroke="hsl(var(--success))" strokeWidth={2} dot={{ r: 4, fill: "hsl(var(--success))" }} name="Attendance %" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
