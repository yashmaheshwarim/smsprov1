import { useState, useEffect } from "react";
import { useAuth, StudentUser } from "@/contexts/AuthContext";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { IndianRupee, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { getStoredInvoices } from "@/lib/mock-data";

interface Invoice {
  id: string;
  description: string;
  amount: number;
  paidAmount: number;
  dueDate: string;
  status: "paid" | "partial" | "unpaid" | "overdue";
}

export default function StudentFeesPage() {
  const { user } = useAuth();
  const student = user as StudentUser;
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    fetchFees();
  }, []);

  const fetchFees = async () => {
    setLoading(true);
    try {
      // Try Supabase first
      const { data } = await supabase
        .from("invoices")
        .select("*")
        .eq("student_id", student.id)
        .order("due_date", { ascending: false });

      if (data && data.length > 0) {
        setInvoices(data.map((i: any) => ({
          id: i.id,
          description: i.description || "Tuition Fee",
          amount: i.amount || 0,
          paidAmount: i.paid_amount || 0,
          dueDate: i.due_date?.split("T")[0] || "N/A",
          status: i.status || "unpaid",
        })));
      } else {
        // Fallback to localStorage invoices
        const stored = getStoredInvoices();
        const studentInvoices = stored.filter(i => i.enrollmentNo === student.enrollmentNo);
        setInvoices(studentInvoices.map(i => ({
          id: i.id,
          description: (i as any).description || "Tuition Fee",
          amount: i.amount,
          paidAmount: i.paidAmount,
          dueDate: i.dueDate,
          status: i.status as any,
        })));
      }
    } catch {
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };

  const totalFees = invoices.reduce((a, i) => a + i.amount, 0);
  const totalPaid = invoices.reduce((a, i) => a + i.paidAmount, 0);
  const pending = totalFees - totalPaid;
  const paidPercent = totalFees > 0 ? ((totalPaid / totalFees) * 100).toFixed(0) : "0";

  if (loading) {
    return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-foreground">My Fees</h2>
        <p className="text-sm text-muted-foreground">View invoices, payment status, and due dates</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard title="Total Fees" value={`₹${totalFees.toLocaleString()}`} icon={IndianRupee} />
        <StatCard title="Paid" value={`₹${totalPaid.toLocaleString()}`} icon={IndianRupee} changeType="positive" change={`${paidPercent}% completed`} />
        <StatCard title="Pending" value={`₹${pending.toLocaleString()}`} icon={IndianRupee} changeType={pending > 0 ? "negative" : "positive"} change={pending > 0 ? "Payment due" : "All clear!"} />
      </div>

      {/* Payment Progress */}
      <div className="surface-elevated rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground">Payment Progress</span>
          <span className="text-sm font-bold text-primary">{paidPercent}%</span>
        </div>
        <div className="w-full bg-secondary rounded-full h-3">
          <div className="bg-primary h-3 rounded-full transition-all duration-500" style={{ width: `${Math.min(Number(paidPercent), 100)}%` }} />
        </div>
        <div className="flex justify-between mt-2 text-xs text-muted-foreground">
          <span>₹{totalPaid.toLocaleString()} paid</span>
          <span>₹{pending.toLocaleString()} remaining</span>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="surface-elevated rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Invoices</h3>
        </div>
        {invoices.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No invoices found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase">Description</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase">Amount</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase">Paid</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase">Due Date</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id} className="border-b border-border/50 hover:bg-secondary/30">
                    <td className="px-4 py-2.5 font-medium text-foreground">{inv.description}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-foreground">₹{inv.amount.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-success font-semibold">₹{inv.paidAmount.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{inv.dueDate}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge variant={inv.status === "paid" ? "success" : inv.status === "partial" ? "warning" : "destructive"}>
                        {inv.status}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
