import { useState, useEffect } from "react";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Building2, Users, GraduationCap, TrendingUp, Wallet, BarChart3, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";

const COLORS = ["hsl(142, 76%, 36%)", "hsl(217, 91%, 60%)", "hsl(45, 93%, 47%)", "hsl(0, 84%, 60%)", "hsl(280, 65%, 60%)"];

export default function SuperAdminAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalInstitutes: 0,
    activeInstitutes: 0,
    suspendedInstitutes: 0,
    totalStudents: 0,
    totalCredits: 0,
  });
  const [instituteData, setInstituteData] = useState<{ name: string; students: number; credits: number; status: string }[]>([]);
  const [statusData, setStatusData] = useState<{ name: string; value: number }[]>([]);
  const [monthlyGrowth, setMonthlyGrowth] = useState<{ month: string; institutes: number }[]>([]);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const { data: institutes } = await supabase.from("institutes").select("*");

      if (institutes) {
        const active = institutes.filter((i: any) => i.status === "active").length;
        const suspended = institutes.filter((i: any) => i.status === "suspended").length;
        const trial = institutes.filter((i: any) => i.status === "trial").length;
        const totalCredits = institutes.reduce((a: number, i: any) => a + (i.sms_credits || 0), 0);

        setStats({
          totalInstitutes: institutes.length,
          activeInstitutes: active,
          suspendedInstitutes: suspended,
          totalStudents: 0,
          totalCredits,
        });

        setStatusData([
          { name: "Active", value: active },
          { name: "Suspended", value: suspended },
          { name: "Trial", value: trial },
          { name: "Expired", value: institutes.filter((i: any) => i.status === "expired").length },
        ].filter(d => d.value > 0));

        setInstituteData(
          institutes.map((i: any) => ({
            name: i.name?.substring(0, 15) || "N/A",
            students: i.student_limit || 0,
            credits: (i.sms_credits || 0) + (i.whatsapp_credits || 0),
            status: i.status,
          }))
        );

        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const growth = Array(6).fill(0).map((_, idx) => {
          const d = new Date();
          d.setMonth(d.getMonth() - (5 - idx));
          return { month: months[d.getMonth()], year: d.getFullYear(), count: 0 };
        });

        institutes.forEach((inst: any) => {
          const d = new Date(inst.created_at || new Date());
          const match = growth.find(g => g.month === months[d.getMonth()] && g.year === d.getFullYear());
          if (match) match.count += 1;
        });

        let runningTotal = institutes.length - growth.reduce((sum, g) => sum + g.count, 0);
        setMonthlyGrowth(growth.map(g => {
          runningTotal += g.count;
          return { month: g.month, institutes: runningTotal };
        }));

        // Get total students count
        const { count } = await supabase.from("students").select("*", { count: "exact", head: true });
        setStats(p => ({ ...p, totalStudents: count || 0 }));
      }
    } catch (err) {
      console.error("Analytics fetch error:", err);
    } finally {
      setLoading(false);
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
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Platform Analytics</h2>
        <p className="text-sm text-muted-foreground">Overview of all institutes and platform usage</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard title="Total Institutes" value={stats.totalInstitutes} icon={Building2} />
        <StatCard title="Active" value={stats.activeInstitutes} icon={Building2} changeType="positive" change="Running" />
        <StatCard title="Suspended" value={stats.suspendedInstitutes} icon={Building2} changeType="negative" change="Paused" />
        <StatCard title="Total Students" value={stats.totalStudents.toLocaleString()} icon={Users} />
        <StatCard title="Total Credits" value={stats.totalCredits.toLocaleString()} icon={Wallet} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Institute Status Distribution */}
        <div className="surface-elevated rounded-lg p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">Institute Status Distribution</h3>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {statusData.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-12">No data available</p>
          )}
        </div>

        {/* Growth Trend */}
        <div className="surface-elevated rounded-lg p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">Platform Growth</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={monthlyGrowth}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
              <Line type="monotone" dataKey="institutes" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4, fill: "hsl(var(--primary))" }} name="Institutes" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Institute Credits Chart */}
      <div className="surface-elevated rounded-lg p-4">
        <h3 className="text-sm font-semibold text-foreground mb-4">Credits by Institute</h3>
        {instituteData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={instituteData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
              <Bar dataKey="credits" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Total Credits" />
              <Bar dataKey="students" fill="hsl(var(--primary) / 0.3)" radius={[4, 4, 0, 0]} name="Student Limit" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-center text-sm text-muted-foreground py-12">No institutes yet</p>
        )}
      </div>

      {/* Institute Table */}
      <div className="surface-elevated rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">All Institutes</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase">Institute</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase">Status</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase">Student Cap</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase">Credits</th>
              </tr>
            </thead>
            <tbody>
              {instituteData.map((inst, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-secondary/30">
                  <td className="px-4 py-2.5 font-medium text-foreground">{inst.name}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge variant={inst.status === "active" ? "success" : inst.status === "trial" ? "info" : "destructive"}>
                      {inst.status}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{inst.students}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-primary">{inst.credits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
