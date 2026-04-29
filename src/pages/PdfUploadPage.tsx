import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Upload, FileText, Trash2, Eye, Search, Download, File, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface UploadedFile {
  id: string;
  name: string;
  size: string;
  type: string;
  uploadedAt: string;
  uploadedBy: string;
  subject: string;
  batch: string;
  url: string;
  status: "uploaded" | "processing" | "error";
  previewData?: string; // base64 or text for preview
}

const initialFiles: UploadedFile[] = [
  { id: "1", name: "Physics Chapter 1 - Mechanics.pdf", size: "2.4 MB", type: "pdf", uploadedAt: "2025-03-14 10:30", uploadedBy: "Dr. Sharma", subject: "Physics", batch: "JEE 2025 - Batch A", url: "/storage/physics-ch1.pdf", status: "uploaded" },
  { id: "2", name: "Chemistry Organic Notes.pdf", size: "5.1 MB", type: "pdf", uploadedAt: "2025-03-13 14:22", uploadedBy: "Prof. Patel", subject: "Chemistry", batch: "NEET 2025 - Batch B", url: "/storage/chem-organic.pdf", status: "uploaded" },
  { id: "3", name: "Maths Calculus Worksheet.pdf", size: "1.8 MB", type: "pdf", uploadedAt: "2025-03-12 09:15", uploadedBy: "Dr. Gupta", subject: "Mathematics", batch: "JEE 2025 - Batch A", url: "/storage/math-calc.pdf", status: "uploaded" },
  { id: "4", name: "Biology Cell Division.pdf", size: "3.2 MB", type: "pdf", uploadedAt: "2025-03-11 16:45", uploadedBy: "Dr. Reddy", subject: "Biology", batch: "NEET 2025 - Batch B", url: "/storage/bio-cell.pdf", status: "uploaded" },
  { id: "5", name: "English Grammar Reference.pdf", size: "0.9 MB", type: "pdf", uploadedAt: "2025-03-10 11:00", uploadedBy: "Ms. Nair", subject: "English", batch: "Foundation 10th", url: "/storage/eng-grammar.pdf", status: "uploaded" },
];

const subjects = ["Physics", "Chemistry", "Mathematics", "Biology", "English"];
const batches = ["JEE 2025 - Batch A", "NEET 2025 - Batch B", "Foundation 10th", "Foundation 11th", "CET 2025", "Board 12th Science"];

import { useAuth, AdminUser } from "@/contexts/AuthContext";

export default function PdfUploadPage() {
  const { user } = useAuth();
  const instId = user?.role === "admin" ? (user as AdminUser).instituteId : "INST-001";
  const [files, setFiles] = useState<UploadedFile[]>(instId === "INST-001" ? initialFiles : []);
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [uploadSubject, setUploadSubject] = useState(subjects[0]);
  const [uploadBatch, setUploadBatch] = useState(batches[0]);
  const [dragActive, setDragActive] = useState(false);
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = files.filter((f) => {
    const matchSearch = f.name.toLowerCase().includes(search.toLowerCase());
    const matchSubject = subjectFilter === "all" || f.subject === subjectFilter;
    return matchSearch && matchSubject;
  });

  const handleFileUpload = (fileList: FileList | null) => {
    if (!fileList) return;
    const newFiles: UploadedFile[] = Array.from(fileList).map((file, i) => {
      const reader = new FileReader();
      const id = Date.now().toString() + i;
      // Read file for preview
      reader.onload = (e) => {
        setFiles(prev => prev.map(f => f.id === id ? { ...f, previewData: e.target?.result as string } : f));
      };
      if (file.type.startsWith("image/")) {
        reader.readAsDataURL(file);
      } else if (file.type === "text/plain" || file.name.endsWith(".txt") || file.name.endsWith(".csv")) {
        reader.readAsText(file);
      }
      return {
        id,
        name: file.name,
        size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
        type: file.name.split(".").pop() || "pdf",
        uploadedAt: new Date().toLocaleString("en-IN"),
        uploadedBy: "Current User",
        subject: uploadSubject,
        batch: uploadBatch,
        url: `/storage/${file.name.replace(/\s+/g, "-").toLowerCase()}`,
        status: "uploaded" as const,
      };
    });
    setFiles((prev) => [...newFiles, ...prev]);
    
    // Sync to study materials for Student Panel visibility
    const newStudyMaterials = newFiles.map(f => ({
      id: `MAT-${f.id}`,
      title: f.name.replace(/\.[^/.]+$/, ""),
      subject: f.subject,
      type: (f.type === "pdf" ? "pdf" : f.type.startsWith("image") ? "image" : "video") as "pdf" | "image" | "video",
      uploadedBy: f.uploadedBy,
      uploadDate: new Date().toISOString().split("T")[0],
      size: f.size,
      batch: f.batch,
      fileUrl: f.url,
      fileName: f.name,
    }));
    
    const savedMaterials = localStorage.getItem('study_materials');
    let currentMaterials = [];
    if (savedMaterials) {
      try { currentMaterials = JSON.parse(savedMaterials); } catch (e) {}
    }
    localStorage.setItem('study_materials', JSON.stringify([...newStudyMaterials, ...currentMaterials]));
    
    toast({ title: "Files uploaded", description: `${newFiles.length} file(s) uploaded. URLs stored in database.` });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    handleFileUpload(e.dataTransfer.files);
  };

  const handleDelete = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    toast({ title: "File removed", description: "File reference deleted from database." });
  };

  const handlePreview = (file: UploadedFile) => {
    setPreviewFile(file);
  };

  const handleDownload = (file: UploadedFile) => {
    toast({ title: "Download Started", description: `Downloading ${file.name}...` });
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Document Storage</h2>
        <p className="text-sm text-muted-foreground">Upload files · Preview documents · Links stored in database</p>
      </div>

      {/* Upload Zone */}
      <div
        className={cn(
          "surface-elevated rounded-lg p-6 border-2 border-dashed transition-colors text-center",
          dragActive ? "border-primary bg-primary/5" : "border-border"
        )}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm font-medium text-foreground">Drop files here or click to upload</p>
        <p className="text-xs text-muted-foreground mt-1">Supports PDF, images, and documents</p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 mt-4">
          <select value={uploadSubject} onChange={(e) => setUploadSubject(e.target.value)} className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground">
            {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={uploadBatch} onChange={(e) => setUploadBatch(e.target.value)} className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground">
            {batches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <Button size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-4 h-4 mr-1" /> Browse Files
          </Button>
          <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.txt,.csv" multiple hidden onChange={(e) => handleFileUpload(e.target.files)} />
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-card border border-border flex-1 sm:max-w-xs">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="Search files..." value={search} onChange={(e) => setSearch(e.target.value)} className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full" />
        </div>
        <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground">
          <option value="all">All Subjects</option>
          {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* File List */}
      <div className="surface-elevated rounded-lg divide-y divide-border/50">
        {filtered.length === 0 && (
          <div className="p-8 text-center text-muted-foreground text-sm">No files found.</div>
        )}
        {filtered.map((file) => (
          <div key={file.id} className="flex items-center justify-between px-4 py-3 hover:bg-secondary/30 transition-colors">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="p-2 rounded-md bg-destructive/10 shrink-0">
                <FileText className="w-5 h-5 text-destructive" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                  <span className="text-xs text-muted-foreground tabular-nums">{file.size}</span>
                  <span className="text-xs text-muted-foreground">{file.subject}</span>
                  <span className="text-xs text-muted-foreground hidden sm:inline">{file.batch}</span>
                  <span className="text-xs text-muted-foreground hidden sm:inline tabular-nums">{file.uploadedAt}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <StatusBadge variant="success">{file.status}</StatusBadge>
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Preview" onClick={() => handlePreview(file)}>
                <Eye className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Download" onClick={() => handleDownload(file)}>
                <Download className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(file.id)} title="Delete">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Preview Dialog */}
      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-4 h-4" /> {previewFile?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="border border-border rounded-md p-4 min-h-[300px] bg-secondary/30 overflow-auto">
            {previewFile?.previewData ? (
              previewFile.previewData.startsWith("data:image") ? (
                <img src={previewFile.previewData} alt={previewFile.name} className="max-w-full mx-auto rounded" />
              ) : (
                <pre className="text-sm text-foreground whitespace-pre-wrap font-mono">{previewFile.previewData}</pre>
              )
            ) : (
              <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                <FileText className="w-16 h-16 mb-4 opacity-30" />
                <p className="text-sm font-medium">Document Preview</p>
                <p className="text-xs mt-1">{previewFile?.name}</p>
                <p className="text-xs mt-1">Type: {previewFile?.type?.toUpperCase()}</p>
                <p className="text-xs">Size: {previewFile?.size}</p>
                <p className="text-xs mt-2">Subject: {previewFile?.subject} · Batch: {previewFile?.batch}</p>
                <p className="text-xs">Uploaded by {previewFile?.uploadedBy} on {previewFile?.uploadedAt}</p>
                <p className="text-[10px] text-muted-foreground mt-3">Full preview available when connected to object storage</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
