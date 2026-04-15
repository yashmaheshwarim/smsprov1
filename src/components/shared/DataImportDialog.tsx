import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, Check, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import * as Papa from "papaparse";
import * as XLSX from "xlsx";

interface DataImportDialogProps {
  type: "students" | "batches" | "inquiries" | "teachers";
  instituteId: string;
  onSuccess: () => void;
}

const CONFIG = {
  students: {
    table: "students",
    label: "Students",
    mapping: {
      "name": ["name", "full name", "student name", "name of student"],
      "email": ["email", "email address"],
      "phone": ["phone", "mobile", "contact", "phone number"],
      "batch_name": ["batch", "class"],
      "guardian_name": ["parent", "guardian", "father name", "parent name"],
      "join_date": ["date", "join date", "admission date"]
    }
  },
  batches: {
    table: "batches",
    label: "Batches",
    mapping: {
      "name": ["name", "batch name", "title"],
      "class_name": ["class", "grade", "standard"],
      "status": ["status", "active"]
    }
  },
  inquiries: {
    table: "inquiries",
    label: "Inquiries",
    mapping: {
      "student_name": ["name", "student name", "full name"],
      "phone": ["phone", "mobile", "contact"],
      "class_name": ["class", "grade"],
      "source": ["source", "leads"]
    }
  },
  teachers: {
    table: "teachers",
    label: "Teachers",
    mapping: {
      "name": ["name", "full name", "teacher name"],
      "email": ["email", "email address"],
      "phone": ["phone", "mobile", "contact"]
    }
  }
};

export function DataImportDialog({ type, instituteId, onSuccess }: DataImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async () => {
    if (!file) return;
    setLoading(true);

    try {
      let rawData: any[] = [];

      if (file.name.endsWith(".csv")) {
        rawData = await parseCSV(file);
      } else {
        rawData = await parseExcel(file);
      }

      if (rawData.length === 0) throw new Error("File is empty");

      const config = CONFIG[type];
      const headers = Object.keys(rawData[0]);
      
      const mappedData = rawData.map(row => {
        const item: any = { institute_id: instituteId };
        
        // Auto-map headers
        Object.entries(config.mapping).forEach(([dbField, variations]) => {
          const header = headers.find(h => 
            variations.includes(h.toLowerCase().trim()) || 
            h.toLowerCase().trim() === dbField
          );
          if (header) item[dbField] = row[header];
        });

        // Specific fallbacks
        if (type === 'students' && !item.enrollment_no) {
          item.enrollment_no = `MT-IMP-${Math.floor(1000 + Math.random() * 9000)}`;
        }
        
        return item;
      });

      // Filter out rows without mandatory fields (e.g., name)
      const validData = mappedData.filter(d => d.name || d.student_name);

      if (validData.length === 0) {
        throw new Error("No valid data found. Check your column headers.");
      }

      const { error } = await supabase
        .from(config.table)
        .insert(validData);

      if (error) throw error;

      toast({ 
        title: "Import Success", 
        description: `Successfully imported ${validData.length} ${config.label}.` 
      });
      
      setOpen(false);
      setFile(null);
      onSuccess();
    } catch (err: any) {
      toast({ 
        title: "Import Failed", 
        description: err.message, 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  const parseCSV = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data),
        error: (err) => reject(err)
      });
    });
  };

  const parseExcel = async (file: File): Promise<any[]> => {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(firstSheet);
  };

  return (
    <>
      <Button variant="outline" size="sm" className="h-9" onClick={() => setOpen(true)}>
        <Upload className="w-4 h-4 mr-1" /> Import
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import {CONFIG[type].label}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-border rounded-lg bg-secondary/20 space-y-4">
            {file ? (
              <div className="flex items-center gap-3 bg-card p-3 rounded-md border border-border shadow-sm w-full">
                <FileSpreadsheet className="w-8 h-8 text-primary" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setFile(null)}>Remove</Button>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Upload className="w-6 h-6 text-primary" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">Click to upload or drag & drop</p>
                  <p className="text-xs text-muted-foreground mt-1">Excel (.xlsx) or CSV format</p>
                </div>
                <input 
                  type="file" 
                  className="hidden" 
                  accept=".csv, .xlsx, .xls" 
                  ref={fileInputRef}
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
                  Select File
                </Button>
              </>
            )}
          </div>
          
          <div className="bg-secondary/50 p-4 rounded-md space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <AlertCircle className="w-3 h-3" /> Tips for success
            </h4>
            <ul className="text-xs text-muted-foreground list-disc list-inside space-y-1">
              <li>Ensure headers like "Name", "Email", "Phone" are present.</li>
              <li>Batch name should match your existing batches.</li>
              <li>Date format should be YYYY-MM-DD.</li>
            </ul>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!file || loading} onClick={processFile}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
              {loading ? "Processing..." : "Start Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
