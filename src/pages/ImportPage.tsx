import { useState } from "react";
import { Upload, FileSpreadsheet, Database, Globe, ArrowRight, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const importSources = [
  { id: "csv", title: "CSV File", description: "Upload a .csv file with student data", icon: FileSpreadsheet },
  { id: "excel", title: "Excel File", description: "Upload .xlsx or .xls spreadsheet", icon: FileSpreadsheet },
  { id: "api", title: "API Import", description: "Import from external API endpoint", icon: Database },
  { id: "sheets", title: "Google Sheets", description: "Connect and import from Google Sheets", icon: Globe },
];

const sampleColumns = ["Full Name", "Email", "Phone", "Batch", "Enrollment No", "Parent Name", "Fee Amount"];
const dbFields = ["name", "email", "phone", "batch_id", "enrollment_no", "parent_name", "fee_amount"];

export default function ImportPage() {
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [mappings, setMappings] = useState<Record<string, string>>({});

  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
      <h2 className="text-lg font-semibold text-foreground">Import Data</h2>

      {/* Steps */}
      <div className="flex items-center gap-2 text-sm">
        {["Select Source", "Upload", "Map Columns", "Preview & Import"].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
              step > i + 1 ? "bg-success text-success-foreground" : step === i + 1 ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
            )}>
              {step > i + 1 ? <Check className="w-3 h-3" /> : i + 1}
            </div>
            <span className={cn("hidden sm:block", step === i + 1 ? "text-foreground font-medium" : "text-muted-foreground")}>{s}</span>
            {i < 3 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {importSources.map((src) => (
            <button
              key={src.id}
              onClick={() => { setSelectedSource(src.id); setStep(2); }}
              className={cn(
                "surface-interactive rounded-lg p-4 text-left",
                selectedSource === src.id && "ring-2 ring-primary"
              )}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-md bg-primary/10">
                  <src.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{src.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{src.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="surface-elevated rounded-lg p-8 text-center">
          <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-sm font-medium text-foreground">Drag and drop your file here</p>
          <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
          <Button className="mt-4" onClick={() => setStep(3)}>
            Select File (Demo)
          </Button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="surface-elevated rounded-lg p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Column Mapping</h3>
            <p className="text-xs text-muted-foreground mb-4">Map your CSV columns to database fields</p>
            <div className="space-y-2">
              {sampleColumns.map((col, i) => (
                <div key={col} className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 py-2 border-b border-border/50 last:border-0">
                  <span className="text-sm text-foreground w-40 shrink-0">{col}</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground hidden sm:block" />
                  <select
                    className="px-3 py-1.5 rounded-md bg-card border border-border text-sm text-foreground w-full sm:w-48"
                    value={mappings[col] || dbFields[i]}
                    onChange={(e) => setMappings({ ...mappings, [col]: e.target.value })}
                  >
                    {dbFields.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
            <Button onClick={() => setStep(4)}>Continue to Preview</Button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <div className="surface-elevated rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-4 h-4 text-success" />
              <h3 className="text-sm font-semibold text-foreground">Validation Passed</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-3 bg-secondary rounded-md">
                <p className="text-lg font-semibold text-foreground tabular-nums">247</p>
                <p className="text-xs text-muted-foreground">Total Records</p>
              </div>
              <div className="p-3 bg-success/10 rounded-md">
                <p className="text-lg font-semibold text-success tabular-nums">243</p>
                <p className="text-xs text-muted-foreground">Valid</p>
              </div>
              <div className="p-3 bg-warning/10 rounded-md">
                <p className="text-lg font-semibold text-warning tabular-nums">3</p>
                <p className="text-xs text-muted-foreground">Warnings</p>
              </div>
              <div className="p-3 bg-destructive/10 rounded-md">
                <p className="text-lg font-semibold text-destructive tabular-nums">1</p>
                <p className="text-xs text-muted-foreground">Errors</p>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(3)}>Back</Button>
            <Button onClick={() => setStep(1)}>Import 243 Records</Button>
          </div>
        </div>
      )}
    </div>
  );
}
