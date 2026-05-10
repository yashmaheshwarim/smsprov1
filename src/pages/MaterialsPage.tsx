import { useState, useEffect } from "react";
import { FileText, Video, Image, Upload, Search, Download } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

import { AdminUser } from "@/contexts/AuthContext";

interface StudyMaterial {
  id: string;
  title: string;
  subject: string;
  batch: string;
  type: "pdf" | "video" | "image" | "document";
  file_url: string;
  file_name?: string;
  size?: string;
  uploaded_by: string;
  created_at: string;
}

const typeIcons: Record<string, React.ElementType> = {
  pdf: FileText,
  video: Video,
  image: Image,
};

const typeColors: Record<string, string> = {
  pdf: "bg-destructive/10 text-destructive",
  video: "bg-primary/10 text-primary",
  image: "bg-success/10 text-success",
};

export default function MaterialsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const instId = isAdmin ? (user as AdminUser).instituteId : "INST-001";
  const isTeacher = user?.role === "teacher";
  const canUpload = isAdmin || isTeacher;

  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [form, setForm] = useState({ title: "", subject: "Physics", type: "pdf" as "pdf" | "video" | "image" | "document", batch: "JEE 2025 - Batch A" });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMaterials();
  }, [instId]);

  const fetchMaterials = async () => {
    try {
      const { data, error } = await supabase
        .from('study_materials')
        .select('*')
        .eq('institute_id', instId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMaterials(data || []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const subjects = [...new Set(materials.map((m) => m.subject))];

  const filtered = materials.filter((m) => {
    const matchSearch = m.title.toLowerCase().includes(search.toLowerCase());
    const matchSubject = subjectFilter === "all" || m.subject === subjectFilter;
    return matchSearch && matchSubject;
  });

  const handleUpload = async () => {
    if (!form.title) {
      toast({ title: "Error", description: "Title is required.", variant: "destructive" });
      return;
    }

    try {
      let fileUrl = '';
      let fileName = '';
      let fileSize = form.type === "video" ? "120MB" : "2.5MB";

      if (selectedFile) {
        // Upload to Supabase Storage
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('study-materials')
          .upload(`${instId}/${fileName}`, selectedFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('study-materials')
          .getPublicUrl(`${instId}/${fileName}`);

        fileUrl = publicUrl;
        fileName = selectedFile.name;
        fileSize = `${(selectedFile.size / (1024 * 1024)).toFixed(1)}MB`;
      }

      const { error } = await supabase
        .from('study_materials')
        .insert({
          institute_id: instId,
          title: form.title,
          subject: form.subject,
          type: form.type,
          batch: form.batch,
          file_url: fileUrl,
          file_name: fileName,
          size: fileSize,
          uploaded_by: user?.name || "Admin",
        });

      if (error) throw error;

      await fetchMaterials();
      setUploadOpen(false);
      setForm({ title: "", subject: "Physics", type: "pdf", batch: "JEE 2025 - Batch A" });
      setSelectedFile(null);
      toast({ title: "Material Uploaded", description: `"${form.title}" uploaded. Students can now download it.` });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const handleDownload = (mat: StudyMaterial) => {
    toast({ title: "Download Started", description: `Downloading "${mat.title}"...` });
    if (mat.file_url) {
      const a = document.createElement('a');
      a.href = mat.file_url;
      a.download = mat.file_name || `${mat.title}.${mat.type}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-card border border-border flex-1 sm:flex-initial sm:w-64">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input type="text" placeholder="Search materials..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full" />
          </div>
          <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}
            className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground">
            <option value="all">All Subjects</option>
            {subjects.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
        </div>
        {canUpload && (
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <Upload className="w-4 h-4 mr-1" /> Upload Material
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((mat) => {
          const Icon = typeIcons[mat.type];
          return (
            <div key={mat.id} className="surface-interactive rounded-lg p-4 cursor-pointer group">
              <div className="flex items-start gap-3">
                <div className={cn("p-2 rounded-md shrink-0", typeColors[mat.type])}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">{mat.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{mat.subject} · {mat.batch}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <StatusBadge variant="default">{mat.type.toUpperCase()}</StatusBadge>
                    <span className="text-xs text-muted-foreground tabular-nums">{mat.size}</span>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-muted-foreground">{mat.uploaded_by}</span>
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => handleDownload(mat)}>
                      <Download className="w-3 h-3 mr-1" /> Download
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload Study Material</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs font-medium text-foreground">Title</label><Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g., Thermodynamics Notes" /></div>
            <div>
              <label className="text-xs font-medium text-foreground">Subject</label>
              <select value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground">
                {["Physics", "Chemistry", "Mathematics", "Biology", "English"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Type</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as any }))} className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground">
                <option value="pdf">PDF</option>
                <option value="video">Video</option>
                <option value="image">Image</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Batch</label>
              <select value={form.batch} onChange={e => setForm(p => ({ ...p, batch: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground">
                <option>JEE 2025 - Batch A</option>
                <option>NEET 2025 - Batch B</option>
                <option>Foundation 10th</option>
                <option>Foundation 11th</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Upload File (Optional)</label>
              <Input type="file" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} className="mt-1" accept={form.type === 'pdf' ? '.pdf' : form.type === 'video' ? 'video/*' : 'image/*'} />
            </div>
            <Button className="w-full" onClick={handleUpload}><Upload className="w-4 h-4 mr-1" /> Upload</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
