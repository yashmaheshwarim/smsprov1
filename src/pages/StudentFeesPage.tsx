import { useState, useEffect, useCallback } from "react";
import { useAuth, StudentUser } from "@/contexts/AuthContext";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { IndianRupee, Loader2, Table2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { getStoredInvoices } from "@/lib/mock-data";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
import * as XLSX from "xlsx";

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
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);

  useEffect(() => {
    fetchFees();
  }, []);

  const fetchFees = async () => {
    setLoading(true);
    try {
      // Try student_fees table first (separate queries to avoid FK join issues)
      const { data: sfData, error: sfError } = await supabase
        .from("student_fees")
        .select("*")
        .eq("student_id", student.id)
        .order("created_at", { ascending: false });

      if (!sfError && sfData && sfData.length > 0) {
        // Fetch batch fee details separately for each record
        const enrichedInvoices = await Promise.all(
          sfData.map(async (sf: any) => {
            let description = "Tuition Fee";
            let totalFee = Number(sf.discounted_fees || 0);
            let dueDate = "N/A";

            if (sf.batch_fee_id) {
              const { data: bf } = await supabase
                .from("batch_fees")
                .select("title, total_fees, due_date")
                .eq("id", sf.batch_fee_id)
                .single();
              if (bf) {
                description = bf.title || description;
                // Use discounted_fees if set, otherwise batch fee total
                totalFee = Number(sf.discounted_fees || bf.total_fees || 0);
                dueDate = bf.due_date?.split("T")[0] || "N/A";
              }
            }

            return {
              id: sf.id,
              description,
              amount: totalFee,
              paidAmount: Number(sf.paid_fees || 0),
              dueDate,
              status: sf.status || "unpaid",
            };
          })
        );
        setInvoices(enrichedInvoices);
        setLoading(false);
        return;
      }

      // Fallback: Try invoices table
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
          paidAmount: i.status === "paid" ? (i.amount || 0) : 0,
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

   // Pagination
   const totalItems = invoices.length;
   const totalPages = Math.ceil(totalItems / pageSize);
   const startIndex = (currentPage - 1) * pageSize;
   const endIndex = Math.min(startIndex + pageSize, totalItems);
   const paginatedInvoices = invoices.slice(startIndex, endIndex);

  // ── Excel Export ───────────────────────────────────────────────────────────

  const exportToExcel = useCallback(() => {
    try {
      const data = invoices.map((inv, i) => ({
        "#": i + 1,
        "Description": inv.description,
        "Total Amount": inv.amount,
        "Paid Amount": inv.paidAmount,
        "Pending": Math.max(0, inv.amount - inv.paidAmount),
        "Due Date": inv.dueDate,
        "Status": inv.status.toUpperCase(),
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "My Fees");

      // Summary sheet
      const summaryData = [
        { Metric: "Total Fees", Value: totalFees },
        { Metric: "Total Paid", Value: totalPaid },
        { Metric: "Total Pending", Value: pending },
        { Metric: "Completion %", Value: `${paidPercent}%` },
        { Metric: "Invoices", Value: invoices.length },
        { Metric: "Exported At", Value: new Date().toLocaleString("en-IN") },
      ];
      const wsSummary = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

      // Auto-size columns
      const colWidths = Object.keys(data[0] || {}).map((key) => ({
        wch: Math.max(key.length, ...data.map((row: any) => String(row[key] || "").length)) + 2,
      }));
      ws["!cols"] = colWidths;

      const filename = `My_Fees_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(wb, filename);
      toast({ title: "Exported", description: `Fee report exported to ${filename}` });
    } catch (err: any) {
      console.error("Export error:", err);
      toast({ title: "Export Failed", description: err.message || "Could not export data", variant: "destructive" });
    }
  }, [invoices, totalFees, totalPaid, pending, paidPercent]);

  if (loading) {
    return (
      <DataTableSkeleton
        rowCount={5}
        columnCount={5}
        showFilters={false}
        loadingText="Loading fee records..."
      />
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">My Fees</h2>
          <p className="text-sm text-muted-foreground">View invoices, payment status, and due dates</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={exportToExcel}
          disabled={invoices.length === 0}
          className="h-8 gap-1.5"
          title="Export to Excel"
        >
          <Table2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Excel</span>
        </Button>
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
         {paginatedInvoices.length === 0 ? (
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
                 {paginatedInvoices.map(inv => (
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

       {/* Pagination */}
       {totalPages > 1 && (
         <div className="flex items-center justify-between border-t px-4 py-3 bg-card">
           <p className="text-sm text-muted-foreground">
             Showing {startIndex + 1}-{endIndex} of {totalItems} invoices
           </p>
           <div className="flex items-center gap-2">
             <Button variant="outline" size="sm" onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="h-8 px-2">
               <ChevronsLeft className="h-4 w-4" />
             </Button>
             <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-8 px-2">
               <ChevronLeft className="h-4 w-4" />
             </Button>
             <div className="flex items-center gap-1">
               {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                 let pageNum: number;
                 if (totalPages <= 5) pageNum = i + 1;
                 else if (currentPage <= 3) pageNum = i + 1;
                 else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                 else pageNum = currentPage - 2 + i;
                 return (
                   <Button key={pageNum} variant={currentPage === pageNum ? "default" : "outline"} size="sm" onClick={() => setCurrentPage(pageNum)} className="h-8 w-8">
                     {pageNum}
                   </Button>
                 );
               })}
             </div>
             <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="h-8 px-2">
               <ChevronRight className="h-4 w-4" />
             </Button>
             <Button variant="outline" size="sm" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="h-8 px-2">
               <ChevronsRight className="h-4 w-4" />
             </Button>
           </div>
         </div>
       )}
     </div>
   );
 }
