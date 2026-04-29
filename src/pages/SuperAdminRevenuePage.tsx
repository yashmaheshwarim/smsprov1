import { useState, useEffect } from "react";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { IndianRupee, TrendingUp, CreditCard, Wallet, Loader2, Building2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

interface RevenueEntry {
  id: string;
  instituteName: string;
  smsCredits: number;
  waCredits: number;
  totalCredits: number;
  estimatedValue: number;
}

export default function SuperAdminRevenuePage() {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<RevenueEntry[]>([]);
  const [totals, setTotals] = useState({ totalSms: 0, totalWa: 0, totalValue: 0 });
  const [monthlyRevenue, setMonthlyRevenue] = useState<{ month: string; revenue: number }[]>([]);

  useEffect(() => {
    fetchRevenue();
  }, []);

  const fetchRevenue = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from("institutes").select("id, name, sms_credits, whatsapp_credits, created_at");

      if (data) {
        const mapped: RevenueEntry[] = data.map((i: any) => {
          const sms = i.sms_credits || 0;
          const wa = i.whatsapp_credits || 0;
          return {
            id: i.id,
            instituteName: i.name || "N/A",
            smsCredits: sms,
            waCredits: wa,
            totalCredits: sms + wa,
            estimatedValue: sms * 0.25 + wa * 0.20,  // ₹0.25/SMS, ₹0.20/WA
          };
        });

        setEntries(mapped);
        setTotals({
          totalSms: mapped.reduce((a, e) => a + e.smsCredits, 0),
          totalWa: mapped.reduce((a, e) => a + e.waCredits, 0),
          totalValue: mapped.reduce((a, e) => a + e.estimatedValue, 0),
        });

        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const growth = Array(6).fill(0).map((_, idx) => {
          const d = new Date();
          d.setMonth(d.getMonth() - (5 - idx));
          return { month: months[d.getMonth()], year: d.getFullYear(), sum: 0 };
        });

        data.forEach((inst: any) => {
          const d = new Date(inst.created_at || new Date());
          const match = growth.find(g => g.month === months[d.getMonth()] && g.year === d.getFullYear());
          if (match) {
             match.sum += ((inst.sms_credits || 0) * 0.25) + ((inst.whatsapp_credits || 0) * 0.20);
          }
        });

        const totalOverall = mapped.reduce((a, e) => a + e.estimatedValue, 0);
        let runningTotal = totalOverall - growth.reduce((sum, g) => sum + g.sum, 0);
        setMonthlyRevenue(growth.map(g => {
          runningTotal += g.sum;
          return { month: g.month, revenue: runningTotal };
        }));
      }
    } catch (err) {
      console.error("Revenue fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const chartData = entries.map(e => ({
    name: e.instituteName.substring(0, 12),
    sms: e.smsCredits,
    whatsapp: e.waCredits,
  }));


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
        <h2 className="text-lg font-semibold text-foreground">Revenue & Credits</h2>
        <p className="text-sm text-muted-foreground">Track credit allocations and estimated revenue across all institutes</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Total SMS Credits" value={totals.totalSms.toLocaleString()} icon={CreditCard} change="@ ₹0.25/credit" changeType="neutral" />
        <StatCard title="Total WA Credits" value={totals.totalWa.toLocaleString()} icon={Wallet} change="@ ₹0.20/credit" changeType="neutral" />
        <StatCard title="Est. Revenue" value={formatCurrency(totals.totalValue)} icon={IndianRupee} changeType="positive" change="From credits" />
        <StatCard title="Institutes" value={entries.length} icon={Building2} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly Revenue */}
        <div className="surface-elevated rounded-lg p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">Monthly Revenue Trend</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyRevenue}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `₹${v}`} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Revenue" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Credits per Institute */}
        <div className="surface-elevated rounded-lg p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">Credits per Institute</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
                <Bar dataKey="sms" fill="hsl(142, 76%, 36%)" radius={[4, 4, 0, 0]} name="SMS" />
                <Bar dataKey="whatsapp" fill="hsl(217, 91%, 60%)" radius={[4, 4, 0, 0]} name="WhatsApp" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-12">No data</p>
          )}
        </div>
      </div>

      {/* Revenue Table */}
      <div className="surface-elevated rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Credit Breakdown by Institute</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase">Institute</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase">SMS Credits</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase">WA Credits</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase">Total</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase">Est. Value</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-border/50 hover:bg-secondary/30">
                  <td className="px-4 py-2.5 font-medium text-foreground">{e.instituteName}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-success font-semibold">{e.smsCredits}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-primary font-semibold">{e.waCredits}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-bold text-foreground">{e.totalCredits}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{formatCurrency(e.estimatedValue)}</td>
                </tr>
              ))}
              {entries.length > 0 && (
                <tr className="bg-primary/5 font-bold">
                  <td className="px-4 py-2.5 text-foreground">TOTAL</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-success">{totals.totalSms}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-primary">{totals.totalWa}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{totals.totalSms + totals.totalWa}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{formatCurrency(totals.totalValue)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
