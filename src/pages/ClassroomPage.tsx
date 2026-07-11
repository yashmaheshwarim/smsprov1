import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useAuth, AdminUser, TeacherUser } from "@/contexts/AuthContext";
import { supabase, isUuid } from "@/lib/supabase";
import {
  listCourses,
  listAllCourseWorkMaterials,
  createCourseWorkMaterial,
  createGoogleCourse,
  activateCourse,
  listCourseStudents,
  addMultipleStudentsToCourse,
  getGoogleClassroomConfig,
  saveGoogleClassroomConfig,
  disconnectGoogleClassroom,
  getGoogleOAuthUrl,
  isGoogleClassroomConfigured,
  getClientId,
  type Course,
  type CourseWorkMaterial,
  type UploadMaterialRequest,
} from "@/lib/google-classroom";
import {
  GraduationCap,
  Loader2,
  CheckCircle2,
  ExternalLink,
  BookOpen,
  Video,
  Link as LinkIcon,
  FileText,
  Plus,
  RefreshCw,
  LogOut,
  Search,
  Youtube,
  Globe,
  Upload,
  Users,
  Key,
  Layers,
  Mail,
  X,
  Copy,
  ChevronDown,
} from "lucide-react";

type MaterialTab = "all" | "videos" | "documents" | "links";

interface BatchForClassroom {
  id: string;
  name: string;
  studentCount: number;
}

interface CourseEnrollment {
  courseId: string;
  courseName: string;
  students: { userId: string; name: string; emailAddress: string }[];
  enrollmentCode?: string;
}

export default function ClassroomPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isTeacher = user?.role === "teacher";
  const instId = isAdmin ? (user as AdminUser).instituteId : isTeacher ? (user as TeacherUser).instituteId : "";
  const canUpload = isAdmin || isTeacher;

  // OAuth state
  const [clientId, setClientId] = useState(getClientId());
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authenticating, setAuthenticating] = useState(false);
  const [connected, setConnected] = useState(false);

  // Courses
  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);

  // Materials
  const [allMaterials, setAllMaterials] = useState<{ course: Course; materials: CourseWorkMaterial[] }[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialFilter, setMaterialFilter] = useState<MaterialTab>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Upload dialog
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    courseId: "",
    title: "",
    description: "",
    materialType: "link" as "driveFile" | "link" | "youTubeVideo",
    url: "",
    fileId: "",
  });
  const [uploading, setUploading] = useState(false);

  // Course creation dialog
  const [createCourseOpen, setCreateCourseOpen] = useState(false);
  const [createCourseForm, setCreateCourseForm] = useState({ name: "", section: "", description: "" });
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [courseBatches, setCourseBatches] = useState<BatchForClassroom[]>([]);
  const [selectedCourseBatchId, setSelectedCourseBatchId] = useState("");

  // Roster / Enrollment management
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);
  const [courseEnrollments, setCourseEnrollments] = useState<Record<string, CourseEnrollment>>({});
  const [loadingEnrollments, setLoadingEnrollments] = useState(false);

  // Batch sync dialog
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncCourseId, setSyncCourseId] = useState("");
  const [batches, setBatches] = useState<BatchForClassroom[]>([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);

  // ── Load saved config on mount ─────────────────────────────────────────────

  useEffect(() => {
    if (!isUuid(instId)) return;

    getGoogleClassroomConfig(instId).then((config) => {
      if (config?.connected && config.accessToken) {
        setAccessToken(config.accessToken);
        setClientId(config.clientId || getClientId());
        setConnected(true);
        // Refresh courses and materials
        refreshCourses(config.accessToken);
      }
    });
  }, [instId]);

  // Check for OAuth token in URL hash on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.substring(1);
    if (!hash.includes("access_token")) return;

    const params = new URLSearchParams(hash);
    const token = params.get("access_token");
    const expiresIn = parseInt(params.get("expires_in") || "3600", 10);

    if (token && isUuid(instId)) {
      setAccessToken(token);
      setConnected(true);
      window.history.replaceState({}, document.title, window.location.pathname);

      saveGoogleClassroomConfig(instId, {
        connected: true,
        clientId,
        accessToken: token,
        tokenExpiry: Date.now() + expiresIn * 1000,
      });

      refreshCourses(token);
      toast({ title: "Google Classroom Connected", description: "Successfully authenticated with Google." });
    }
  }, [instId]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const refreshCourses = async (token: string) => {
    setCoursesLoading(true);
    try {
      const courseList = await listCourses(token);
      setCourses(courseList);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to load courses", variant: "destructive" });
    } finally {
      setCoursesLoading(false);
    }
  };

  const refreshMaterials = async () => {
    if (!accessToken) return;
    setMaterialsLoading(true);
    try {
      const data = await listAllCourseWorkMaterials(accessToken);
      setAllMaterials(data);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to load materials", variant: "destructive" });
    } finally {
      setMaterialsLoading(false);
    }
  };

  const handleAuthenticate = async () => {
    if (!clientId.trim()) {
      toast({ title: "Missing Client ID", description: "Please enter your Google OAuth Client ID.", variant: "destructive" });
      return;
    }

    setAuthenticating(true);
    localStorage.setItem("VITE_GOOGLE_CLIENT_ID", clientId.trim());

    const oauthUrl = getGoogleOAuthUrl();
    if (!oauthUrl) {
      toast({ title: "Error", description: "Client ID not configured correctly.", variant: "destructive" });
      setAuthenticating(false);
      return;
    }

    // Open popup for OAuth
    const width = 600;
    const height = 700;
    const left = Math.max(0, (window.screen.width - width) / 2);
    const top = Math.max(0, (window.screen.height - height) / 2);
    const popup = window.open(
      oauthUrl,
      "google_auth",
      `width=${width},height=${height},left=${left},top=${top},toolbar=0,menubar=0,scrollbars=1,resizable=1`
    );

    // Poll for result
    const pollTimer = setInterval(() => {
      try {
        if (!popup || popup.closed) {
          clearInterval(pollTimer);
          setAuthenticating(false);
          return;
        }

        const popupUrl = popup.location.href;
        if (popupUrl && popupUrl.startsWith(window.location.origin)) {
          const hash = popupUrl.split("#")[1];
          if (hash) {
            const params = new URLSearchParams(hash);
            const token = params.get("access_token");
            if (token) {
              setAccessToken(token);
              setConnected(true);
              popup.close();
              clearInterval(pollTimer);
              setAuthenticating(false);

              if (isUuid(instId)) {
                saveGoogleClassroomConfig(instId, {
                  connected: true,
                  clientId: clientId.trim(),
                  accessToken: token,
                  tokenExpiry: Date.now() + parseInt(params.get("expires_in") || "3600") * 1000,
                });
              }

              refreshCourses(token);
              toast({ title: "Connected!", description: "Google Classroom authenticated successfully." });
            }
          }
        }
      } catch {
        // Cross-origin errors expected
      }
    }, 500);

    setTimeout(() => {
      clearInterval(pollTimer);
      setAuthenticating(false);
    }, 120000);
  };

  const handleDisconnect = async () => {
    setAccessToken(null);
    setConnected(false);
    setCourses([]);
    setAllMaterials([]);
    if (isUuid(instId)) {
      await disconnectGoogleClassroom(instId);
    }
    toast({ title: "Disconnected", description: "Google Classroom integration removed." });
  };

  const handleUpload = async () => {
    if (!uploadForm.courseId || !uploadForm.title) {
      toast({ title: "Missing Fields", description: "Course and title are required.", variant: "destructive" });
      return;
    }
    if (!accessToken) {
      toast({ title: "Not Connected", description: "Please connect to Google Classroom first.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const materials = [];
      if (uploadForm.materialType === "link" && uploadForm.url) {
        materials.push({ type: "link" as const, url: uploadForm.url, title: uploadForm.title });
      } else if (uploadForm.materialType === "youTubeVideo" && uploadForm.url) {
        materials.push({ type: "youTubeVideo" as const, url: uploadForm.url, title: uploadForm.title });
      } else if (uploadForm.materialType === "driveFile" && uploadForm.fileId) {
        materials.push({ type: "driveFile" as const, fileId: uploadForm.fileId, title: uploadForm.title });
      }

      if (materials.length === 0) {
        toast({ title: "Missing Fields", description: "Please provide the material URL or Drive file ID.", variant: "destructive" });
        setUploading(false);
        return;
      }

      const request: UploadMaterialRequest = {
        courseId: uploadForm.courseId,
        title: uploadForm.title,
        description: uploadForm.description || undefined,
        materials,
      };

      await createCourseWorkMaterial(accessToken, request);
      toast({ title: "Material Uploaded", description: `\"${uploadForm.title}\" has been posted to Google Classroom.` });
      setUploadOpen(false);
      setUploadForm({ courseId: "", title: "", description: "", materialType: "link", url: "", fileId: "" });
      refreshMaterials();
    } catch (err: any) {
      toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  // ── Course Creation & Roster Management ───────────────────────────────────

  const loadCourseEnrollment = async (course: Course) => {
    if (!accessToken) return;
    setLoadingEnrollments(true);
    try {
      const students = await listCourseStudents(accessToken, course.id);
      setCourseEnrollments((prev) => ({
        ...prev,
        [course.id]: {
          courseId: course.id,
          courseName: course.name,
          students,
          enrollmentCode: course.enrollmentCode,
        },
      }));
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to load students", variant: "destructive" });
    } finally {
      setLoadingEnrollments(false);
    }
  };

  const loadCourseBatches = async () => {
    if (!isUuid(instId)) return;
    const { data } = await supabase
      .from("batches")
      .select("id, name")
      .eq("institute_id", instId)
      .eq("status", "active");

    if (data) {
      const batchesWithCounts = await Promise.all(
        data.map(async (b: any) => {
          const { count } = await supabase
            .from("students")
            .select("*", { count: "exact", head: true })
            .eq("institute_id", instId)
            .eq("batch_id", b.id)
            .eq("status", "active");
          return { id: b.id, name: b.name, studentCount: count || 0 };
        })
      );
      setCourseBatches(batchesWithCounts);
    }
  };

  const handleCreateCourse = async () => {
    if (!accessToken || !createCourseForm.name) {
      toast({ title: "Missing Fields", description: "Course name is required.", variant: "destructive" });
      return;
    }

    setCreatingCourse(true);
    try {
      const newCourse = await createGoogleCourse(accessToken, {
        name: createCourseForm.name,
        section: createCourseForm.section || undefined,
        description: createCourseForm.description || undefined,
      });

      // Activate the course (provisioned → active)
      try {
        await activateCourse(accessToken, newCourse.id);
      } catch {
        // Some Google Workspace editions may not need activation
      }

      // If a batch was selected, save the mapping to both Supabase and localStorage
      if (selectedCourseBatchId) {
        const selectedBatch = courseBatches.find(b => b.id === selectedCourseBatchId);
        if (selectedBatch) {
          // Save to Supabase
          try {
            await supabase
              .from("classroom_mappings")
              .delete()
              .eq("institute_id", instId)
              .eq("batch_name", selectedBatch.name)
              .eq("course_name", createCourseForm.name);

            await supabase
              .from("classroom_mappings")
              .insert([{
                institute_id: instId,
                batch_name: selectedBatch.name,
                course_name: createCourseForm.name,
                enrollment_code: newCourse.enrollmentCode || "",
                synced_at: new Date().toISOString(),
              }]);
          } catch (err) {
            console.warn("Could not save course-batch mapping to DB:", err);
          }

          // Save to localStorage
          const storageKey = `classroom_batch_map_${instId}`;
          const existing = JSON.parse(localStorage.getItem(storageKey) || "[]");
          const newEntry = {
            batchName: selectedBatch.name,
            courseName: createCourseForm.name,
            enrollmentCode: newCourse.enrollmentCode || "",
            syncedAt: new Date().toISOString(),
          };
          const idx = existing.findIndex(
            (e: any) => e.batchName === selectedBatch.name && e.courseName === createCourseForm.name
          );
          if (idx >= 0) {
            existing[idx] = newEntry;
          } else {
            existing.push(newEntry);
          }
          localStorage.setItem(storageKey, JSON.stringify(existing));
        }
      }

      // Refresh course list
      await refreshCourses(accessToken);

      setCreateCourseOpen(false);
      setSelectedCourseBatchId("");
      setCreateCourseForm({ name: "", section: "", description: "" });
      toast({
        title: "Course Created",
        description: `"${createCourseForm.name}" has been created in Google Classroom.`,
      });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message || "Could not create course.", variant: "destructive" });
    } finally {
      setCreatingCourse(false);
    }
  };

  const openSyncDialog = async (course: Course) => {
    setSyncCourseId(course.id);
    setSelectedBatchIds([]);

    // Load batches for this institute
    if (isUuid(instId)) {
      const { data } = await supabase
        .from("batches")
        .select("id, name")
        .eq("institute_id", instId)
        .eq("status", "active");

      if (data) {
        // Get student count per batch
        const batchesWithCounts = await Promise.all(
          data.map(async (b: any) => {
            const { count } = await supabase
              .from("students")
              .select("*", { count: "exact", head: true })
              .eq("institute_id", instId)
              .eq("batch_id", b.id)
              .eq("status", "active");
            return { id: b.id, name: b.name, studentCount: count || 0 };
          })
        );
        setBatches(batchesWithCounts);
      }
    }

    setSyncOpen(true);
  };

  /** Save batch-to-classroom mapping so students can see their courses */
  const saveBatchClassroomMapping = async (courseName: string, enrollmentCode: string | undefined) => {
    if (!isUuid(instId) || selectedBatchIds.length === 0) return;

    // Get batch names for selected IDs
    const { data: batchData } = await supabase
      .from("batches")
      .select("id, name")
      .in("id", selectedBatchIds);

    if (!batchData) return;

    // Save to Supabase for cross-device access
    const supabaseEntries = batchData.map((b: any) => ({
      institute_id: instId,
      batch_name: b.name,
      course_name: courseName,
      enrollment_code: enrollmentCode || "",
      synced_at: new Date().toISOString(),
    }));

    try {
      // Upsert: delete existing mappings for the same batch+course combo, then insert new ones
      for (const entry of supabaseEntries) {
        await supabase
          .from("classroom_mappings")
          .delete()
          .eq("institute_id", entry.institute_id)
          .eq("batch_name", entry.batch_name)
          .eq("course_name", entry.course_name);
      }
      const { error: insertError } = await supabase
        .from("classroom_mappings")
        .insert(supabaseEntries);
      
      if (insertError) {
        console.warn("Failed to save classroom mappings to Supabase:", insertError);
        // Fall through - still save to localStorage
      }
    } catch (err) {
      console.warn("Could not save classroom mappings to DB:", err);
    }

    // Also save to localStorage for backward compatibility
    const storageKey = `classroom_batch_map_${instId}`;
    const existing = JSON.parse(localStorage.getItem(storageKey) || "[]");

    const newEntries = batchData.map((b: any) => ({
      batchName: b.name,
      courseName,
      enrollmentCode: enrollmentCode || "",
      syncedAt: new Date().toISOString(),
    }));

    // Merge: replace existing entries for same batch+course combo, add new ones
    const merged = [...existing];
    for (const entry of newEntries) {
      const idx = merged.findIndex(
        (e: any) => e.batchName === entry.batchName && e.courseName === entry.courseName
      );
      if (idx >= 0) {
        merged[idx] = entry;
      } else {
        merged.push(entry);
      }
    }

    localStorage.setItem(storageKey, JSON.stringify(merged));
  };

  const handleSyncBatch = async () => {
    if (!accessToken || !syncCourseId || selectedBatchIds.length === 0) {
      toast({ title: "Error", description: "Please select at least one batch.", variant: "destructive" });
      return;
    }

    setSyncing(true);
    try {
      // Get the course to know its name
      const course = courses.find((c) => c.id === syncCourseId);

      // Get student emails from selected batches
      const { data: students } = await supabase
        .from("students")
        .select("email, name")
        .eq("institute_id", instId)
        .in("batch_id", selectedBatchIds)
        .eq("status", "active")
        .not("email", "is", null);

      if (!students || students.length === 0) {
        toast({ title: "No Emails Found", description: "Selected batches have no students with email addresses.", variant: "destructive" });
        setSyncing(false);
        return;
      }

      const emails = students.map((s: any) => s.email).filter(Boolean);
      const result = await addMultipleStudentsToCourse(accessToken, syncCourseId, emails);

      // Save batch-course mapping so students can see this on their dashboard
      if (course) {
        await saveBatchClassroomMapping(course.name, course.enrollmentCode);
      }

      // Refresh enrollment
      if (course) await loadCourseEnrollment(course);

      setSyncOpen(false);
      toast({
        title: "Sync Complete",
        description: `${result.success} student(s) invited. ${result.failed.length} failed.`,
        variant: result.failed.length > 0 ? "default" : "default",
      });

      if (result.failed.length > 0) {
        console.warn("Failed invitations:", result.failed);
      }
    } catch (err: any) {
      toast({ title: "Sync Failed", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  // ── Derived Data ────────────────────────────────────────────────────────────

  // Filter materials based on tab and search
  const filteredMaterials = allMaterials.flatMap(({ course, materials }) => {
    return materials
      .filter((m) => {
        // Tab filter
        if (materialFilter === "videos") {
          return m.materials?.some((mat) => mat.youTubeVideo);
        }
        if (materialFilter === "documents") {
          return m.materials?.some((mat) => mat.driveFile);
        }
        if (materialFilter === "links") {
          return m.materials?.some((mat) => mat.link);
        }
        return true;
      })
      .filter((m) => {
        // Search filter
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          m.title.toLowerCase().includes(q) ||
          m.description?.toLowerCase().includes(q) ||
          course.name.toLowerCase().includes(q)
        );
      })
      .map((m) => ({ ...m, course }));
  });

  // Get material icon based on type
  const getMaterialIcon = (material: CourseWorkMaterial) => {
    if (material.materials?.some((m) => m.youTubeVideo)) return <Video className="w-4 h-4" />;
    if (material.materials?.some((m) => m.driveFile)) return <FileText className="w-4 h-4" />;
    if (material.materials?.some((m) => m.link)) return <Globe className="w-4 h-4" />;
    return <BookOpen className="w-4 h-4" />;
  };

  const getMaterialType = (material: CourseWorkMaterial): string => {
    if (material.materials?.some((m) => m.youTubeVideo)) return "Video";
    if (material.materials?.some((m) => m.driveFile)) return "Document";
    if (material.materials?.some((m) => m.link)) return "Link";
    return "Material";
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Google Classroom</h2>
          <p className="text-sm text-muted-foreground">
            Connect your Google Account to manage coursework materials — no API keys needed
          </p>
        </div>
        <div className="flex items-center gap-2">
          {connected && (
            <>
              <Button variant="outline" size="sm" onClick={handleDisconnect} className="h-8 text-xs">
                <LogOut className="w-3.5 h-3.5 mr-1" />Disconnect
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Connection Card ────────────────────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <div className={`h-1.5 ${connected ? "bg-success" : "bg-muted"}`} />
        <div className="p-5">
          {!connected ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-3 rounded-xl bg-blue-500/10">
                  <GraduationCap className="w-6 h-6 text-blue-500" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-foreground">Connect with Google</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Sign in with your Google Workspace for Education account to access Google Classroom.
                    Students will be able to view materials using their Google credentials.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-muted/30 border border-border">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-3">How to set up</h4>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-blue-500/15 text-blue-500 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                    <div>
                      <p className="text-sm font-medium text-foreground">Get a Google OAuth Client ID</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Go to{' '}
                        <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                          Google Cloud Console
                        </a>
                        {' '}→ Create new OAuth 2.0 Client ID (Web app). Add <code className="text-primary bg-primary/10 px-1 rounded">{window.location.origin}</code> as an Authorized JavaScript origin.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-blue-500/15 text-blue-500 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                    <div>
                      <p className="text-sm font-medium text-foreground">Enable Google Classroom API</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        In your Google Cloud project, go to APIs & Services → Library and enable "Google Classroom API".
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-blue-500/15 text-blue-500 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground mb-1">Enter your Client ID and sign in</p>
                      <div className="flex gap-2">
                        <Input
                          placeholder="123456789-xxxxx.apps.googleusercontent.com"
                          value={clientId}
                          onChange={(e) => setClientId(e.target.value)}
                          className="font-mono text-xs flex-1"
                        />
                        <Button
                          onClick={handleAuthenticate}
                          disabled={!clientId.trim() || authenticating}
                          className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shrink-0"
                        >
                          {authenticating ? (
                            <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Connecting...</>
                          ) : (
                            <><GraduationCap className="w-4 h-4 mr-1" />Sign in with Google</>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Connected State */
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="p-3 rounded-xl bg-success/10">
                    <CheckCircle2 className="w-6 h-6 text-success" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-foreground">Connected</h3>
                      <StatusBadge variant="success">Active</StatusBadge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Google Classroom is connected. You can view courses and manage materials below.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => { refreshCourses(accessToken!); refreshMaterials(); }} disabled={coursesLoading || materialsLoading} className="h-8 text-xs">
                    <RefreshCw className={`w-3.5 h-3.5 mr-1 ${coursesLoading || materialsLoading ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                  <Button size="sm" onClick={() => setUploadOpen(true)} className="h-8 text-xs">
                    <Plus className="w-3.5 h-3.5 mr-1" />Upload Material
                  </Button>
                </div>
              </div>

              {/* Courses Grid - Enhanced with management */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-foreground">
                    Connected Courses ({courses.length})
                  </h4>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCreateCourseOpen(true)}
                      className="h-7 text-xs"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" />Create Course
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {courses.map((course) => (
                    <div key={course.id} className="rounded-lg border border-border overflow-hidden">
                      <div
                        className="px-3 py-2.5 bg-secondary/50 text-sm flex items-center gap-2 cursor-pointer hover:bg-secondary/80 transition-colors"
                        onClick={() => {
                          if (expandedCourseId === course.id) {
                            setExpandedCourseId(null);
                          } else {
                            setExpandedCourseId(course.id);
                            loadCourseEnrollment(course);
                          }
                        }}
                      >
                        <GraduationCap className="w-4 h-4 text-blue-500 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-foreground font-medium truncate">{course.name}</p>
                          <div className="flex items-center gap-2">
                            {course.section && (
                              <p className="text-xs text-muted-foreground truncate">{course.section}</p>
                            )}
                            {course.enrollmentCode && (
                              <span className="text-[10px] font-mono text-primary">
                                Code: {course.enrollmentCode}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {course.enrollmentCode && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(course.enrollmentCode!);
                                toast({ title: "Copied!", description: "Enrollment code copied to clipboard." });
                              }}
                              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary"
                              title="Copy enrollment code"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openSyncDialog(course);
                            }}
                            className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-secondary"
                            title="Sync students from batch"
                          >
                            <Users className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (expandedCourseId === course.id) {
                                setExpandedCourseId(null);
                              } else {
                                setExpandedCourseId(course.id);
                                loadCourseEnrollment(course);
                              }
                            }}
                            className={`p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-transform ${expandedCourseId === course.id ? 'rotate-180' : ''}`}
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Expanded enrollment details */}
                      {expandedCourseId === course.id && (
                        <div className="px-3 py-3 border-t border-border bg-card">
                          {loadingEnrollments ? (
                            <div className="flex items-center justify-center py-4">
                              <Loader2 className="w-4 h-4 animate-spin text-primary" />
                              <span className="ml-2 text-xs text-muted-foreground">Loading students...</span>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                                  <span className="text-xs font-medium text-foreground">
                                    Enrolled Students
                                  </span>
                                </div>
                                {course.enrollmentCode && (
                                  <div className="flex items-center gap-1.5">
                                    <Key className="w-3 h-3 text-muted-foreground" />
                                    <code className="text-[10px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                      {course.enrollmentCode}
                                    </code>
                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(course.enrollmentCode!);
                                        toast({ title: "Copied!", description: "Enrollment code copied." });
                                      }}
                                      className="p-0.5 rounded text-muted-foreground hover:text-foreground"
                                    >
                                      <Copy className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                              </div>

                              {courseEnrollments[course.id]?.students.length === 0 ? (
                                <p className="text-xs text-muted-foreground py-2">
                                  No students enrolled yet. Share the enrollment code with students or sync from a batch.
                                </p>
                              ) : (
                                <div className="max-h-40 overflow-y-auto space-y-1">
                                  {(courseEnrollments[course.id]?.students || []).map((s, i) => (
                                    <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-secondary/30 text-xs">
                                      <Mail className="w-3 h-3 text-muted-foreground shrink-0" />
                                      <span className="text-foreground">{s.name}</span>
                                      <span className="text-muted-foreground ml-auto">{s.emailAddress}</span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="pt-1 flex gap-1.5">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-[10px]"
                                  onClick={() => loadCourseEnrollment(course)}
                                >
                                  <RefreshCw className="w-3 h-3 mr-1" />Refresh
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-[10px]"
                                  onClick={() => openSyncDialog(course)}
                                >
                                  <Users className="w-3 h-3 mr-1" />Sync Batch
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {courses.length === 0 && !coursesLoading && (
                    <p className="text-sm text-muted-foreground col-span-full text-center py-4">No courses found. Create your first course to get started.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* ── Materials Section ──────────────────────────────────────────────────── */}
      {connected && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">Coursework Materials</h3>

            {/* Material type filter tabs */}
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-secondary/50 border border-border">
              {(["all", "videos", "documents", "links"] as MaterialTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setMaterialFilter(tab)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    materialFilter === tab
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab === "all" ? "All" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-card border border-border w-full sm:w-56">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search materials..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none w-full"
              />
            </div>
          </div>

          {allMaterials.length === 0 && !materialsLoading ? (
            <div className="surface-elevated rounded-lg p-10 text-center">
              <BookOpen className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No materials found</p>
              <p className="text-xs text-muted-foreground mt-1">
                Click "Refresh" to load materials from Google Classroom, or "Upload Material" to add new content.
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={refreshMaterials} disabled={materialsLoading}>
                {materialsLoading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                Load Materials
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredMaterials.length === 0 && !materialsLoading && (
                <div className="col-span-full text-center py-8 text-sm text-muted-foreground">
                  No materials match your filters
                </div>
              )}
              {filteredMaterials.map((material) => (
                <div key={material.id} className="surface-interactive rounded-lg p-4 group hover:ring-1 hover:ring-primary/20 transition-all">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-md shrink-0 ${
                      getMaterialType(material) === "Video" ? "bg-red-500/10 text-red-500" :
                      getMaterialType(material) === "Document" ? "bg-blue-500/10 text-blue-500" :
                      "bg-green-500/10 text-green-500"
                    }`}>
                      {getMaterialIcon(material)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                        {material.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {(material as any).course?.name || material.courseId}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <StatusBadge variant="default" className="text-[9px] px-1.5">
                          {getMaterialType(material)}
                        </StatusBadge>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(material.creationTime).toLocaleDateString("en-IN")}
                        </span>
                      </div>
                      {material.materials?.map((m, idx) => {
                        if (m.link) {
                          return (
                            <a key={idx} href={m.link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 mt-2 text-xs text-primary hover:underline truncate" onClick={(e) => e.stopPropagation()}>
                              <LinkIcon className="w-3 h-3 shrink-0" />
                              {m.link.title || m.link.url}
                            </a>
                          );
                        }
                        if (m.driveFile) {
                          return (
                            <a key={idx} href={m.driveFile.driveFile.alternateLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 mt-2 text-xs text-primary hover:underline truncate" onClick={(e) => e.stopPropagation()}>
                              <FileText className="w-3 h-3 shrink-0" />
                              {m.driveFile.driveFile.title}
                            </a>
                          );
                        }
                        if (m.youTubeVideo) {
                          return (
                            <a key={idx} href={`https://www.youtube.com/watch?v=${m.youTubeVideo.id}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 mt-2 text-xs text-primary hover:underline truncate" onClick={(e) => e.stopPropagation()}>
                              <Video className="w-3 h-3 shrink-0" />
                              {m.youTubeVideo.title || "Watch Video"}
                            </a>
                          );
                        }
                        return null;
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Loading state */}
          {materialsLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="ml-2 text-sm text-muted-foreground">Loading materials from Google Classroom...</span>
            </div>
          )}
        </div>
      )}

      {/* ── Create Course Dialog ────────────────────────────────────────────────── */}
      <Dialog open={createCourseOpen} onOpenChange={setCreateCourseOpen}>          <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-primary" />
              Create Google Classroom Course
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <p className="text-xs text-muted-foreground">
                This will create a new course in your connected Google Classroom account.
                The course will be available for students to join using the enrollment code.
              </p>
            </div>

            {/* Map from Batch Management */}
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-xs font-medium text-foreground mb-2">📦 Map from Batch Management</p>
              <div className="space-y-2">
                <select
                  value={selectedCourseBatchId}
                  onChange={(e) => {
                    const batchId = e.target.value;
                    setSelectedCourseBatchId(batchId);
                    if (batchId) {
                      const batch = courseBatches.find(b => b.id === batchId);
                      if (batch) {
                        setCreateCourseForm((p) => ({
                          ...p,
                          name: batch.name,
                          section: batch.name,
                        }));
                      }
                    }
                  }}
                  onFocus={() => loadCourseBatches()}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                >
                  <option value="">Select a batch to auto-fill...</option>
                  {courseBatches.map((batch) => (
                    <option key={batch.id} value={batch.id}>
                      {batch.name} ({batch.studentCount} students)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">Course Name *</Label>
              <Input
                value={createCourseForm.name}
                onChange={(e) => setCreateCourseForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g., JEE Advanced Physics 2026"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Section (optional)</Label>
              <Input
                value={createCourseForm.section}
                onChange={(e) => setCreateCourseForm((p) => ({ ...p, section: e.target.value }))}
                placeholder="e.g., Batch A"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Description (optional)</Label>
              <textarea
                value={createCourseForm.description}
                onChange={(e) => setCreateCourseForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Course description..."
                rows={2}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none"
              />
            </div>
            <Button className="w-full" onClick={handleCreateCourse} disabled={creatingCourse || !createCourseForm.name}>
              {creatingCourse ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating Course...</>
              ) : (
                <><Plus className="w-4 h-4 mr-2" />Create Course</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Sync Batch Students Dialog ──────────────────────────────────────────── */}
      <Dialog open={syncOpen} onOpenChange={setSyncOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              Sync Students from Batches
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-xs text-foreground">
                Select batches to invite their students to this Google Classroom course.
                Students must have email addresses in their profiles to be invited.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">Select Batches</Label>
              <div className="max-h-52 overflow-y-auto space-y-1.5 border border-border rounded-lg p-2">
                {batches.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2 text-center">No batches found</p>
                ) : (
                  batches.map((batch) => (
                    <label
                      key={batch.id}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors ${
                        selectedBatchIds.includes(batch.id)
                          ? "bg-primary/10 border border-primary/30"
                          : "hover:bg-secondary/50 border border-transparent"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedBatchIds.includes(batch.id)}
                        onChange={() => {
                          setSelectedBatchIds((prev) =>
                            prev.includes(batch.id)
                              ? prev.filter((id) => id !== batch.id)
                              : [...prev, batch.id]
                          );
                        }}
                        className="rounded border-border text-primary focus:ring-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{batch.name}</p>
                        <p className="text-xs text-muted-foreground">{batch.studentCount} students</p>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>

            <Button
              className="w-full"
              onClick={handleSyncBatch}
              disabled={syncing || selectedBatchIds.length === 0}
            >
              {syncing ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Syncing Students...</>
              ) : (
                <><Users className="w-4 h-4 mr-2" />Invite {selectedBatchIds.reduce((sum, id) => {
                  const batch = batches.find((b) => b.id === id);
                  return sum + (batch?.studentCount || 0);
                }, 0)} Students</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Upload Material Dialog ──────────────────────────────────────────────── */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-primary" />
              Upload to Google Classroom
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Select Course */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Course *</Label>
              <select
                value={uploadForm.courseId}
                onChange={(e) => setUploadForm(p => ({ ...p, courseId: e.target.value }))}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              >
                <option value="">Select a course</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>{course.name}{course.section ? ` — ${course.section}` : ""}</option>
                ))}
              </select>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Title *</Label>
              <Input
                value={uploadForm.title}
                onChange={(e) => setUploadForm(p => ({ ...p, title: e.target.value }))}
                placeholder="e.g., Thermodynamics Lecture Notes"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Description (optional)</Label>
              <textarea
                value={uploadForm.description}
                onChange={(e) => setUploadForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Add a description for students..."
                rows={2}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none"
              />
            </div>

            {/* Material Type */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Material Type</Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: "link", label: "Link", icon: Globe },
                  { value: "youTubeVideo", label: "YouTube Video", icon: Youtube },
                  { value: "driveFile", label: "Drive File", icon: FileText },
                ].map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    onClick={() => setUploadForm(p => ({ ...p, materialType: value as any, url: "", fileId: "" }))}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium border transition-colors ${
                      uploadForm.materialType === value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-secondary/50"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* URL or File ID based on type */}
            {uploadForm.materialType === "link" && (
              <div className="space-y-2">
                <Label className="text-xs font-medium">URL</Label>
                <Input
                  value={uploadForm.url}
                  onChange={(e) => setUploadForm(p => ({ ...p, url: e.target.value }))}
                  placeholder="https://example.com/document"
                />
              </div>
            )}

            {uploadForm.materialType === "youTubeVideo" && (
              <div className="space-y-2">
                <Label className="text-xs font-medium">YouTube URL</Label>
                <Input
                  value={uploadForm.url}
                  onChange={(e) => setUploadForm(p => ({ ...p, url: e.target.value }))}
                  placeholder="https://youtube.com/watch?v=... or https://youtu.be/..."
                />
              </div>
            )}

            {uploadForm.materialType === "driveFile" && (
              <div className="space-y-2">
                <Label className="text-xs font-medium">Google Drive File ID</Label>
                <Input
                  value={uploadForm.fileId}
                  onChange={(e) => setUploadForm(p => ({ ...p, fileId: e.target.value }))}
                  placeholder="1ABCDEfghIJKLMNOPqrstUVwxyz"
                />
                <p className="text-[10px] text-muted-foreground">
                  The file ID is the part after <code className="text-primary bg-primary/10 px-0.5 rounded">/d/</code> in your Drive share link
                </p>
              </div>
            )}

            <Button className="w-full" onClick={handleUpload} disabled={uploading || !uploadForm.courseId || !uploadForm.title}>
              {uploading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uploading to Classroom...</>
              ) : (
                <><Upload className="w-4 h-4 mr-2" />Post to Google Classroom</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
