import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import * as XLSX from "xlsx";

const REPORTS: { key: string; title: string; desc?: string }[] = [
  { key: "fees_receipt", title: "Fees Receipt Report" },
  { key: "fees_datewise", title: "Fees Report (Date wise)" },
  { key: "student_category", title: "Student Category Report" },
  { key: "application_login", title: "Application Login Report" },
  { key: "batch_monthly", title: "Batchwise Monthly Report" },
  { key: "monthly_collection", title: "Monthly Payment Collection Report" },
  { key: "student_strength", title: "Student Strength Report" },
  { key: "exam_general", title: "Exam General Report" },
  { key: "student_monthly", title: "Student Monthly Report" },
  { key: "student_all", title: "Student All Report" },
  { key: "fees_summary", title: "Fees Report" },
  { key: "student_dynamic", title: "Student Dynamic Field Report" },
  { key: "call_list", title: "Student Call List Report" },
  { key: "student_of_month", title: "Student of the Month Report" },
];

function toCSV(rows: Record<string, any>[]) {
  if (!rows || rows.length === 0) return "";
  const keys = Object.keys(rows[0]);
  const lines = [keys.join(",")];
  for (const r of rows) {
    const vals = keys.map((k) => {
      const v = r[k] == null ? "" : String(r[k]);
      return `"${v.replace(/"/g, '""')}"`;
    });
    lines.push(vals.join(","));
  }
  return lines.join("\n");
}

async function downloadCsv(filename: string, rows: Record<string, any>[]) {
  const csv = toCSV(rows);
  if (!csv) {
    toast({ title: "No data", description: "Report returned no rows." });
    return;
  }
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const { user } = useAuth();
  // derive institute id from possible user fields
  const instId = (user as any)?.instituteId ?? (user as any)?.institute_id ?? (user as any)?.institute?.id ?? null;
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [batches, setBatches] = useState<string[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string | "all">("all");
  const [previewRows, setPreviewRows] = useState<Record<string, any>[]>([]);

  useEffect(() => {
    // load batches for filter dropdown
    (async () => {
      try {
        const { data } = await supabase.from("students").select("batch_name").eq("institute_id", instId).not("batch_name", "is", null);
        const unique = Array.from(new Set((data || []).map((r: any) => r.batch_name))).filter(Boolean).sort();
        setBatches(unique);
      } catch (err) {
        // silent
      }
    })();
  }, [instId]);

  const filterRowsForKey = (key: string, rows: Record<string, any>[]) => {
    if (!rows || rows.length === 0) return [];
    // remove sensitive/undesired columns for student_all
    const removeTokens = ["institute", "batchid", "batch_id", "user_id", "userid", "user", "guardian", "updated", "phone", "mobile", "contact"];

    if (key === "student_all") {
      return rows.map((r) => {
        const out: Record<string, any> = {};
        Object.keys(r).forEach((k) => {
          const keyNormalized = k.replace(/\s+/g, "").toLowerCase();
          const shouldRemove = removeTokens.some((tok) => keyNormalized.includes(tok));
          if (!shouldRemove) out[k] = r[k];
        });
        return out;
      });
    }
    return rows;
  };

  const fetchReport = async (key: string, opts?: { preview?: boolean }) => {
    try {
      setLoadingKey(key);
      let rows: Record<string, any>[] = [];

      switch (key) {
        case "student_all":
          // fetch students; only filter by institute_id when available
          if (instId) {
            ({ data: rows } = await supabase.from("students").select("*").eq("institute_id", instId));
          } else {
            ({ data: rows } = await supabase.from("students").select("*"));
          }
          break;
        case "fees_receipt":
          ({ data: rows } = await supabase.from("fee_receipts").select("*").eq("institute_id", instId));
          break;
        case "fees_datewise":
          ({ data: rows } = await supabase.from("fee_payments").select("*").eq("institute_id", instId));
          break;
        case "monthly_collection":
          ({ data: rows } = await supabase.rpc("report_monthly_collection", { institute_id_p: instId }));
          break;
        case "application_login":
          ({ data: rows } = await supabase.from("auth_logins").select("*").eq("institute_id", instId));
          break;
        default:
          // Attempt parameterized queries for common report types
          try {
            let builder = supabase.from(key).select("*").limit(5000);
            if (instId) builder = builder.eq("institute_id", instId);
            if (selectedBatch && selectedBatch !== "all" && (key.includes("student") || key.includes("students") || key.includes("batch") || key.includes("call_list"))) {
              builder = builder.eq("batch_name", selectedBatch as string);
            }
            // Only add date filters for report keys that likely have a 'date' column
            const dateAwareKeys = ["fees_datewise", "monthly_collection", "application_login", "attendance", "fee_payments", "fee_receipts"];
            if (startDate && dateAwareKeys.some(k => k === key || key.includes(k))) builder = (builder as any).gte("date", startDate);
            if (endDate && dateAwareKeys.some(k => k === key || key.includes(k))) builder = (builder as any).lte("date", endDate);
            const r = await builder;
            rows = (r as any).data || [];
          } catch (err) {
            rows = [];
          }
      }

      if (!rows || rows.length === 0) {
        toast({ title: "No rows", description: "Report returned no data." });
        setPreviewRows([]);
      } else {
        const filtered = filterRowsForKey(key, rows as Record<string, any>[]);
        if (opts?.preview) {
          setPreviewRows(filtered.slice(0, 200));
          toast({ title: "Preview Ready", description: `Showing ${Math.min(filtered.length, 200)} rows preview.` });
        } else {
          await downloadCsv(`${key}.csv`, filtered as Record<string, any>[]);
          toast({ title: "Exported", description: `${filtered.length} rows exported for ${key}.` });
        }
      }
    } catch (error: any) {
      toast({ title: "Report Error", description: error?.message || String(error), variant: "destructive" });
    } finally {
      setLoadingKey(null);
    }
  };

  const exportXlsx = (filename: string, rows: Record<string, any>[]) => {
    if (!rows || rows.length === 0) return toast({ title: "No data", description: "Nothing to export." });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, filename);
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Reports</h2>
          <p className="text-sm text-muted-foreground">Generate and export institute reports as CSV.</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2 items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">From</label>
            <input type="date" value={startDate ?? ""} onChange={(e) => setStartDate(e.target.value || null)} className="px-2 py-1 rounded-md border" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">To</label>
            <input type="date" value={endDate ?? ""} onChange={(e) => setEndDate(e.target.value || null)} className="px-2 py-1 rounded-md border" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Batch</label>
            <select value={selectedBatch} onChange={(e) => setSelectedBatch(e.target.value as any)} className="px-2 py-1 rounded-md border">
              <option value="all">All</option>
              {batches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {REPORTS.map((r) => (
            <div key={r.key} className="surface-elevated rounded-lg p-4 border">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium">{r.title}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => fetchReport(r.key, { preview: true })} disabled={!!loadingKey}>
                    {loadingKey === r.key ? <Loader2 className="w-4 h-4 animate-spin" /> : "Preview"}
                  </Button>
                  <Button size="sm" onClick={() => fetchReport(r.key)} disabled={!!loadingKey}>
                    {loadingKey === r.key ? <Loader2 className="w-4 h-4 animate-spin" /> : "Export CSV"}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {previewRows && previewRows.length > 0 && (
          <div className="surface-elevated rounded-lg p-4 border">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">Preview ({previewRows.length} rows)</h3>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => downloadCsv(`preview.csv`, previewRows)}>Export CSV</Button>
                <Button size="sm" onClick={() => exportXlsx(`preview.xlsx`, previewRows)}>Export XLSX</Button>
                <Button size="sm" variant="outline" onClick={() => setPreviewRows([])}>Clear</Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-auto">
                <thead>
                  <tr>
                    {Object.keys(previewRows[0]).slice(0, 20).map((k) => (
                      <th key={k} className="text-left p-2 border-b">{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, idx) => (
                    <tr key={idx} className="odd:bg-muted/10">
                      {Object.keys(previewRows[0]).slice(0, 20).map((k) => (
                        <td key={k} className="p-2 align-top">{String(r[k] ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
