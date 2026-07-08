import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import {
  Wallet, CreditCard, Building2, Loader2, Search, CheckCircle2, XCircle, Send,
  TrendingUp, ArrowUpRight, ArrowDownLeft, Clock, Filter, RefreshCw, ChevronLeft,
  ChevronRight, ChevronsLeft, ChevronsRight, Users, IndianRupee, Plus
} from "lucide-react";

interface InstituteWallet {
  id: string;
  name: string;
  walletCredits: number;
  status: string;
  studentCount: number;
  lastRecharge?: string;
  lastRechargeAmount?: number;
}

interface TransactionLog {
  id: string;
  institute_id: string;
  institute_name?: string;
  type: "credit" | "debit";
  amount: number;
  description: string;
  reference_type: string;
  balance_before: number;
  balance_after: number;
  created_at: string;
}

export default function SuperAdminWalletPage() {
  const [institutes, setInstitutes] = useState<InstituteWallet[]>([]);
  const [transactions, setTransactions] = useState<TransactionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Bulk recharge
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAmount, setBulkAmount] = useState("");
  const [bulkRecharging, setBulkRecharging] = useState(false);

  // Individual recharge
  const [rechargeId, setRechargeId] = useState<string | null>(null);
  const [rechargeAmount, setRechargeAmount] = useState("");
  const [recharging, setRecharging] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);

  // Summary
  const [summary, setSummary] = useState({
    totalInstitutes: 0,
    totalCredits: 0,
    totalRecharges: 0,
    totalDebits: 0,
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch institutes with wallet data
      const { data: instData } = await supabase
        .from("institutes")
        .select("id, name, wallet_credits, status");

      // Fetch student counts
      const { data: studentData } = await supabase
        .from("students")
        .select("institute_id");

      const studentCounts: Record<string, number> = {};
      studentData?.forEach((s: any) => {
        if (s.institute_id) studentCounts[s.institute_id] = (studentCounts[s.institute_id] || 0) + 1;
      });

      // Get last recharge for each institute
      const { data: lastTxns } = await supabase
        .from("wallet_transactions")
        .select("institute_id, amount, created_at")
        .eq("type", "credit")
        .order("created_at", { ascending: false });

      const lastRechargeMap: Record<string, { amount: number; date: string }> = {};
      lastTxns?.forEach((t: any) => {
        if (!lastRechargeMap[t.institute_id]) {
          lastRechargeMap[t.institute_id] = { amount: t.amount, date: t.created_at };
        }
      });

      const mapped: InstituteWallet[] = (instData || []).map((i: any) => ({
        id: i.id,
        name: i.name,
        walletCredits: i.wallet_credits || 0,
        status: i.status || "active",
        studentCount: studentCounts[i.id] || 0,
        lastRecharge: lastRechargeMap[i.id]?.date,
        lastRechargeAmount: lastRechargeMap[i.id]?.amount,
      }));

      setInstitutes(mapped);

      // Fetch recent transactions across all institutes (last 50)
      const { data: txnData } = await supabase
        .from("wallet_transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      // Enrich with institute names
      const instNames: Record<string, string> = {};
      (instData || []).forEach((i: any) => { instNames[i.id] = i.name; });

      const mappedTxns: TransactionLog[] = (txnData || []).map((t: any) => ({
        ...t,
        institute_name: instNames[t.institute_id] || "Unknown",
      }));

      setTransactions(mappedTxns);

      // Calculate summary
      setSummary({
        totalInstitutes: mapped.length,
        totalCredits: mapped.reduce((a, i) => a + i.walletCredits, 0),
        totalRecharges: txnData?.filter((t: any) => t.type === "credit").reduce((a: number, t: any) => a + t.amount, 0) || 0,
        totalDebits: txnData?.filter((t: any) => t.type === "debit").reduce((a: number, t: any) => a + t.amount, 0) || 0,
      });
    } catch (err) {
      console.error("Failed to fetch wallet data:", err);
      toast({ title: "Error", description: "Failed to load wallet data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    fetchData().then(() => {
      if (ignore) return;
    });
    return () => { ignore = true; };
  }, []);

  // Filtered institutes
  const filteredInstitutes = useMemo(() => {
    if (!search.trim()) return institutes;
    const q = search.toLowerCase();
    return institutes.filter(i =>
      i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q)
    );
  }, [institutes, search]);

  // Pagination
  const totalItems = filteredInstitutes.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedInstitutes = filteredInstitutes.slice(startIndex, endIndex);

  // Toggle institute selection for bulk recharge
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredInstitutes.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredInstitutes.map(i => i.id)));
    }
  };

  // Bulk recharge handler
  const handleBulkRecharge = async () => {
    const amount = parseInt(bulkAmount);
    if (!amount || amount < 10) {
      toast({ title: "Invalid Amount", description: "Minimum recharge is 10 credits per institute.", variant: "destructive" });
      return;
    }
    if (selectedIds.size === 0) {
      toast({ title: "No Institutes Selected", description: "Select at least one institute to recharge.", variant: "destructive" });
      return;
    }

    setBulkRecharging(true);
    let successCount = 0;
    let failCount = 0;

    for (const instId of selectedIds) {
      try {
        const inst = institutes.find(i => i.id === instId);
        if (!inst) { failCount++; continue; }

        const currentBalance = inst.walletCredits;
        const { error } = await supabase
          .from("institutes")
          .update({ wallet_credits: currentBalance + amount })
          .eq("id", instId);

        if (error) { failCount++; continue; }

        // Log transaction
        await supabase.from("wallet_transactions").insert([{
          institute_id: instId,
          type: "credit",
          amount,
          description: `Bulk recharge (${selectedIds.size} institutes)`,
          reference_type: "recharge",
          balance_before: currentBalance,
          balance_after: currentBalance + amount,
        }]);

        successCount++;
      } catch {
        failCount++;
      }
    }

    toast({
      title: "Bulk Recharge Complete",
      description: `${successCount} institutes recharged successfully, ${failCount} failed.`,
      variant: failCount > 0 ? "destructive" : "default",
    });

    setBulkRecharging(false);
    setBulkAmount("");
    setSelectedIds(new Set());
    fetchData();
  };

  // Single institute recharge
  const handleSingleRecharge = async () => {
    if (!rechargeId) return;
    const amount = parseInt(rechargeAmount);
    if (!amount || amount < 10) {
      toast({ title: "Invalid Amount", description: "Minimum recharge is 10 credits.", variant: "destructive" });
      return;
    }

    setRecharging(true);
    const inst = institutes.find(i => i.id === rechargeId);
    if (!inst) { setRecharging(false); return; }

    const currentBalance = inst.walletCredits;
    const { error } = await supabase
      .from("institutes")
      .update({ wallet_credits: currentBalance + amount })
      .eq("id", rechargeId);

    if (error) {
      toast({ title: "Recharge Failed", description: error.message, variant: "destructive" });
      setRecharging(false);
      return;
    }

    await supabase.from("wallet_transactions").insert([{
      institute_id: rechargeId,
      type: "credit",
      amount,
      description: "Quick single recharge",
      reference_type: "recharge",
      balance_before: currentBalance,
      balance_after: currentBalance + amount,
    }]);

    toast({ title: "Recharged", description: `${amount} credits added to ${inst.name}` });
    setRechargeId(null);
    setRechargeAmount("");
    setRecharging(false);
    fetchData();
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  // Calculate totals for selected institutes
  const selectedTotalCredits = useMemo(() => {
    return institutes.filter(i => selectedIds.has(i.id)).reduce((a, i) => a + i.walletCredits, 0);
  }, [institutes, selectedIds]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Wallet className="w-5 h-5 text-primary" /> Wallet Recharge Center
        </h2>
        <p className="text-sm text-muted-foreground">
          Manage unified wallet credits across all institutes · 1 message = 1 credit
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Total Institutes" value={summary.totalInstitutes} icon={Building2} />
        <StatCard title="Wallet Credits" value={summary.totalCredits.toLocaleString()} icon={Wallet} change="Unified balance" changeType="neutral" />
        <StatCard title="Total Recharged" value={summary.totalRecharges.toLocaleString()} icon={TrendingUp} change="All time" changeType="positive" />
        <StatCard title="Total Debits" value={summary.totalDebits.toLocaleString()} icon={Send} change="Messages sent" changeType="negative" />
      </div>

      {/* Bulk Recharge Panel */}
      <div className="surface-elevated rounded-lg p-5 border border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Bulk Recharge</h3>
              {selectedIds.size > 0 && (
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                  {selectedIds.size} selected ({selectedTotalCredits.toLocaleString()} credits)
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Select institutes below, then enter an amount to add credits to all selected at once.
            </p>
          </div>
          <div className="flex items-center gap-2 w-full lg:w-auto">
            <Input
              type="number"
              value={bulkAmount}
              onChange={e => setBulkAmount(e.target.value)}
              placeholder="Credits per institute"
              className="w-40 h-9 text-sm font-bold"
              min="10"
            />
            <Button
              onClick={handleBulkRecharge}
              disabled={selectedIds.size === 0 || !bulkAmount || bulkRecharging}
              className="h-9 whitespace-nowrap"
            >
              {bulkRecharging ? (
                <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Recharging...</>
              ) : (
                <><Plus className="w-4 h-4 mr-1" /> Recharge All Selected</>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Institute Wallet Table */}
      <div className="surface-elevated rounded-lg overflow-hidden border border-border/50">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-foreground">Institute Wallets</h3>
            {selectedIds.size > 0 && (
              <button
                onClick={toggleSelectAll}
                className="text-xs text-primary hover:underline"
              >
                Clear selection
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSelectAll}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md border border-border/50 hover:bg-secondary/50 transition-colors"
            >
              {selectedIds.size === filteredInstitutes.length ? "Deselect All" : "Select All"}
            </button>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search institutes..."
                value={search}
                onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                className="pl-8 h-8 text-xs w-48"
              />
            </div>
            <Button variant="ghost" size="sm" className="h-8 w-8" onClick={fetchData} title="Refresh">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filteredInstitutes.length && filteredInstitutes.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-border accent-primary"
                  />
                </th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase">Institute</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase">Students</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase">Wallet Credits</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase hidden md:table-cell">Last Recharge</th>
                <th className="text-center px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase">Status</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedInstitutes.map((inst) => {
                const isSelected = selectedIds.has(inst.id);
                const isRecharging = rechargeId === inst.id;
                return (
                  <tr
                    key={inst.id}
                    className={`border-b border-border/50 transition-colors ${
                      isSelected ? "bg-primary/5" : "hover:bg-secondary/30"
                    }`}
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(inst.id)}
                        className="rounded border-border accent-primary"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-foreground">{inst.name}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{inst.id.substring(0, 8)}...</p>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="text-sm text-muted-foreground">{inst.studentCount}</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className={`text-lg font-bold tabular-nums ${
                        inst.walletCredits > 100 ? "text-success" : inst.walletCredits > 0 ? "text-warning" : "text-destructive"
                      }`}>
                        {inst.walletCredits.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right hidden md:table-cell">
                      {inst.lastRecharge ? (
                        <div>
                          <p className="text-xs text-muted-foreground">{formatDate(inst.lastRecharge)}</p>
                          <p className="text-[10px] text-muted-foreground/60">+{inst.lastRechargeAmount} credits</p>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">No recharges</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <StatusBadge variant={inst.status === "active" ? "success" : "danger"} className="text-[10px]">
                        {inst.status}
                      </StatusBadge>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {isRecharging ? (
                        <div className="flex items-center gap-1 justify-end">
                          <Input
                            type="number"
                            value={rechargeAmount}
                            onChange={e => setRechargeAmount(e.target.value)}
                            placeholder="Amount"
                            className="w-20 h-7 text-xs"
                            min="10"
                            autoFocus
                          />
                          <Button size="sm" className="h-7 text-xs" onClick={handleSingleRecharge}>
                            <Plus className="w-3 h-3 mr-0.5" /> Add
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7" onClick={() => { setRechargeId(null); setRechargeAmount(""); }}>
                            <XCircle className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : (                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setRechargeId(inst.id); setRechargeAmount(""); }} disabled={recharging}>
                            <CreditCard className="w-3 h-3 mr-1" /> Recharge
                          </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {paginatedInstitutes.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    <Wallet className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No institutes found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3 bg-card">
            <p className="text-xs text-muted-foreground">
              Showing {startIndex + 1}–{endIndex} of {totalItems} institutes
            </p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="h-7 w-7 p-0">
                <ChevronsLeft className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-7 w-7 p-0">
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground px-2 tabular-nums">
                {currentPage} / {totalPages}
              </span>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="h-7 w-7 p-0">
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="h-7 w-7 p-0">
                <ChevronsRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Transaction History */}
      <div className="surface-elevated rounded-lg overflow-hidden border border-border/50">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" /> Recent Transactions
          </h3>
        </div>

        {transactions.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Send className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No transactions yet</p>
            <p className="text-xs mt-1">Recharge an institute to see transaction history</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50 max-h-[500px] overflow-y-auto">
            {transactions.map((txn) => (
              <div key={txn.id} className="px-4 py-3 hover:bg-secondary/30 transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      txn.type === "credit"
                        ? "bg-success/10"
                        : "bg-primary/10"
                    }`}>
                      {txn.type === "credit" ? (
                        <ArrowUpRight className="w-4 h-4 text-success" />
                      ) : (
                        <ArrowDownLeft className="w-4 h-4 text-primary" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold uppercase ${
                          txn.type === "credit" ? "text-success" : "text-primary"
                        }`}>
                          {txn.type === "credit" ? "CREDIT" : "DEBIT"}
                        </span>
                        <span className="text-xs font-medium text-foreground truncate">
                          {txn.institute_name}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {txn.description || txn.reference_type}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60">
                        Balance: {txn.balance_before} → {txn.balance_after}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold tabular-nums ${
                      txn.type === "credit" ? "text-success" : "text-destructive"
                    }`}>
                      {txn.type === "credit" ? "+" : "-"}{txn.amount}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatDate(txn.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
