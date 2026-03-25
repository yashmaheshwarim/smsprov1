import { BarChart3, Users, IndianRupee, CalendarCheck, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { dashboardStats, revenueData, attendanceTrend } from "@/lib/mock-data";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from "recharts";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const batchDistribution = [
  { name: "JEE 2025", value: 450 },
  { name: "NEET 2025", value: 380 },
  { name: "Foundation", value: 620 },
  { name: "Board Prep", value: 340 },
  { name: "CET 2025", value: 280 },
];

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "hsl(215 16% 47%)",
];

export default function AnalyticsPage() {
  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
      <h2 className="text-lg font-semibold text-foreground">Analytics & Reports</h2>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Active Students" value={dashboardStats.activeStudents.toLocaleString()} icon={Users} change="+5.2% growth" changeType="positive" />
        <StatCard title="Attendance" value={`${dashboardStats.attendanceRate}%`} icon={CalendarCheck} change="Weekly avg" changeType="neutral" />
        <StatCard title="Revenue" value={formatCurrency(dashboardStats.totalRevenue)} icon={IndianRupee} change="+8% MoM" changeType="positive" />
        <StatCard title="Teachers" value={dashboardStats.totalTeachers} icon={TrendingUp} />
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
