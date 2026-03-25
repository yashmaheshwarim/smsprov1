import {
  Users, GraduationCap, IndianRupee, CalendarCheck, TrendingUp,
  UserPlus, BarChart3, BookOpen, Layers, FileCheck,
} from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { dashboardStats, revenueData, attendanceTrend, generateStudents } from "@/lib/mock-data";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from "recharts";
import { Link } from "react-router-dom";

const recentStudents = generateStudents(5);

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export default function DashboardPage() {
  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <StatCard title="Total Students" value={dashboardStats.totalStudents.toLocaleString()} change="+12% from last month" changeType="positive" icon={Users} />
        <StatCard title="Total Revenue" value={formatCurrency(dashboardStats.totalRevenue)} change="+8% from last month" changeType="positive" icon={IndianRupee} />
        <StatCard title="Attendance Rate" value={`${dashboardStats.attendanceRate}%`} change="-2.1% from last week" changeType="negative" icon={CalendarCheck} />
        <StatCard title="New Admissions" value={dashboardStats.newAdmissions} change="+24 this week" changeType="positive" icon={UserPlus} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="surface-elevated rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <div><h3 className="text-sm font-semibold text-foreground">Revenue Overview</h3><p className="text-xs text-muted-foreground">Monthly fee collection</p></div>
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={revenueData} barGap={4}>
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
            <LineChart data={attendanceTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis domain={[70, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${v}%`} />
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
            {recentStudents.map((s) => (
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
            ))}
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
          </div>
        </div>
      </div>
    </div>
  );
}
