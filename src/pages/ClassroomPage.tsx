import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useAuth, AdminUser, TeacherUser } from "@/contexts/AuthContext";
import { isUuid } from "@/lib/supabase";
import {
  listCourses,
  listAllCourseWorkMaterials,
  createCourseWorkMaterial,
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
} from "lucide-react";

type MaterialTab = "all" | "videos" | "documents" | "links";

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

              {/* Courses Grid */}
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-3">
                  Connected Courses ({courses.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {courses.map((course) => (
                    <div key={course.id} className="px-3 py-2.5 rounded-lg bg-secondary/50 border border-border text-sm flex items-center gap-2">
                      <GraduationCap className="w-4 h-4 text-blue-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-foreground font-medium truncate">{course.name}</p>
                        {course.section && (
                          <p className="text-xs text-muted-foreground truncate">{course.section}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {courses.length === 0 && !coursesLoading && (
                    <p className="text-sm text-muted-foreground col-span-full text-center py-4">No courses found</p>
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
