/**
 * Google Classroom API Integration Service
 *
 * Enables teachers/admins to upload coursework materials (videos, documents,
 * links) directly to Google Classroom, which students can access via their
 * Google Workspace for Education credentials.
 *
 * Prerequisites:
 * 1. Create a Google Cloud Console project: https://console.cloud.google.com/
 * 2. Enable the Google Classroom API
 * 3. Create OAuth 2.0 credentials (Web application type)
 * 4. Add your production domain (e.g., https://yourdomain.com) as an Authorized JavaScript origin
 * 5. Add your production domain as an Authorized redirect URI
 * 6. Set VITE_GOOGLE_CLIENT_ID env var to your OAuth client ID
 */

import { supabase } from "./supabase";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GoogleClassroomConfig {
  connected: boolean;
  clientId?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: number;
  teacherEmail?: string;
  teacherName?: string;
}

export interface Course {
  id: string;
  name: string;
  section?: string;
  descriptionHeading?: string;
  enrollmentCode?: string;
  courseState?: string;
  teacherGroupEmail?: string;
}

export interface CourseWorkMaterial {
  courseId: string;
  id: string;
  title: string;
  description?: string;
  materials: Material[];
  creationTime: string;
  updateTime: string;
  state: string;
}

export interface Material {
  driveFile?: { driveFile: { id: string; title: string; alternateLink: string } };
  link?: { url: string; title: string; thumbnailUrl?: string };
  youTubeVideo?: { id: string; title: string; thumbnailUrl?: string };
  form?: { formUrl: string; title: string; responseUrl?: string };
}

export interface UploadMaterialRequest {
  courseId: string;
  title: string;
  description?: string;
  materials: {
    type: "driveFile" | "link" | "youTubeVideo";
    url?: string;
    fileId?: string;
    title?: string;
  }[];
}

// ─── OAuth / Token Management ───────────────────────────────────────────────

const SCOPES = [
  "https://www.googleapis.com/auth/classroom.courses",
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.courseworkmaterials",
  "https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly",
  "https://www.googleapis.com/auth/classroom.rosters",
  "https://www.googleapis.com/auth/classroom.rosters.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
];

const STORAGE_KEY_PREFIX = "google_classroom_";

function getStorageKey(instituteId: string): string {
  return `${STORAGE_KEY_PREFIX}${instituteId}`;
}

export function getClientId(): string {
  // Check env var first, then fallback to localStorage (for user-entered Client ID)
  return import.meta.env.VITE_GOOGLE_CLIENT_ID || localStorage.getItem("VITE_GOOGLE_CLIENT_ID") || "";
}

export function isGoogleClassroomConfigured(): boolean {
  return !!getClientId();
}

/**
 * Load persisted config for an institute.
 */
export async function getGoogleClassroomConfig(
  instituteId: string
): Promise<GoogleClassroomConfig | null> {
  // Try Supabase first
  try {
    const { data } = await supabase
      .from("institute_integrations")
      .select("config")
      .eq("institute_id", instituteId)
      .eq("provider", "google_classroom")
      .single();

    if (data?.config) {
      return data.config as GoogleClassroomConfig;
    }
  } catch {
    // Fall through to localStorage
  }

  // Fallback to localStorage
  const stored = localStorage.getItem(getStorageKey(instituteId));
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Save config to both Supabase and localStorage.
 */
export async function saveGoogleClassroomConfig(
  instituteId: string,
  config: GoogleClassroomConfig
): Promise<boolean> {
  try {
    const { error } = await supabase.from("institute_integrations").upsert(
      {
        institute_id: instituteId,
        provider: "google_classroom",
        config,
        status: config.connected ? "connected" : "disconnected",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "institute_id,provider" }
    );

    if (error) throw error;

    localStorage.setItem(getStorageKey(instituteId), JSON.stringify(config));
    return true;
  } catch (err) {
    console.error("Failed to save Google Classroom config:", err);
    localStorage.setItem(getStorageKey(instituteId), JSON.stringify(config));
    return true; // Succeed even if DB fails (localStorage works)
  }
}

/**
 * Disconnect Google Classroom integration.
 */
export async function disconnectGoogleClassroom(
  instituteId: string
): Promise<void> {
  // Revoke token if possible
  const config = await getGoogleClassroomConfig(instituteId);
  if (config?.accessToken) {
    try {
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${config.accessToken}`,
        { method: "POST" }
      );
    } catch {
      // Ignore revoke errors
    }
  }

  // Remove from Supabase
  try {
    await supabase
      .from("institute_integrations")
      .delete()
      .eq("institute_id", instituteId)
      .eq("provider", "google_classroom");
  } catch {
    // Ignore
  }

  localStorage.removeItem(getStorageKey(instituteId));
}

// ─── API Calls ───────────────────────────────────────────────────────────────

const CLASSROOM_BASE = "https://classroom.googleapis.com/v1";

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

/**
 * Handle API errors generically.
 */
function handleApiError(err: any): never {
  const message = err?.result?.error?.message || err?.message || "Unknown API error";
  throw new Error(message);
}

/**
 * List all courses the authenticated teacher has access to.
 */
export async function listCourses(
  accessToken: string
): Promise<Course[]> {
  try {
    const res = await fetch(`${CLASSROOM_BASE}/courses`, {
      headers: authHeaders(accessToken),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw { result: err, message: `HTTP ${res.status}` };
    }

    const data = await res.json();
    return (data.courses || []).filter(
      (c: any) => c.courseState === "ACTIVE"
    ).map((c: any) => ({
      id: c.id,
      name: c.name,
      section: c.section,
      descriptionHeading: c.descriptionHeading,
      enrollmentCode: c.enrollmentCode,
      courseState: c.courseState,
      teacherGroupEmail: c.teacherGroupEmail,
    }));
  } catch (err) {
    handleApiError(err);
  }
}

/**
 * Create coursework material (videos, documents, links) in a Google Classroom course.
 */
export async function createCourseWorkMaterial(
  accessToken: string,
  request: UploadMaterialRequest
): Promise<CourseWorkMaterial> {
  const { courseId, title, description, materials } = request;

  // Build the materials array for the API
  const apiMaterials = materials.map((m) => {
    if (m.type === "driveFile" && m.fileId) {
      return {
        driveFile: {
          driveFile: {
            id: m.fileId,
            title: m.title || "File",
            alternateLink: `https://drive.google.com/file/d/${m.fileId}/view`,
          },
        },
      };
    }
    if (m.type === "link" && m.url) {
      return {
        link: {
          url: m.url,
          title: m.title || m.url,
        },
      };
    }
    if (m.type === "youTubeVideo" && m.url) {
      // Extract YouTube video ID from URL
      const videoId = extractYouTubeId(m.url);
      if (videoId) {
        return {
          youTubeVideo: {
            id: videoId,
            title: m.title || "Video",
          },
        };
      }
    }
    return null;
  }).filter(Boolean);

  const body: Record<string, any> = {
    title,
    materials: apiMaterials,
    state: "PUBLISHED",
  };

  if (description) {
    body.description = description;
  }

  try {
    const res = await fetch(
      `${CLASSROOM_BASE}/courses/${courseId}/courseWorkMaterials`,
      {
        method: "POST",
        headers: authHeaders(accessToken),
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw { result: err, message: `HTTP ${res.status}` };
    }

    return res.json();
  } catch (err) {
    handleApiError(err);
  }
}

/**
 * List all coursework materials for a course.
 */
export async function listCourseWorkMaterials(
  accessToken: string,
  courseId: string
): Promise<CourseWorkMaterial[]> {
  try {
    const res = await fetch(
      `${CLASSROOM_BASE}/courses/${courseId}/courseWorkMaterials`,
      {
        headers: authHeaders(accessToken),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw { result: err, message: `HTTP ${res.status}` };
    }

    const data = await res.json();
    return (data.courseWorkMaterial || []).map((m: any) => ({
      courseId: m.courseId,
      id: m.id,
      title: m.title,
      description: m.description,
      materials: m.materials || [],
      creationTime: m.creationTime,
      updateTime: m.updateTime,
      state: m.state,
    }));
  } catch (err) {
    handleApiError(err);
  }
}

/**
 * List all coursework materials across all courses the user has access to.
 */
export async function listAllCourseWorkMaterials(
  accessToken: string
): Promise<{ course: Course; materials: CourseWorkMaterial[] }[]> {
  const courses = await listCourses(accessToken);
  const results: { course: Course; materials: CourseWorkMaterial[] }[] = [];

  for (const course of courses) {
    try {
      const materials = await listCourseWorkMaterials(accessToken, course.id);
      results.push({ course, materials });
    } catch {
      // Skip courses we can't access
    }
  }

  return results;
}

// ─── Course Creation & Roster Management ─────────────────────────────────

/**
 * Create a new Google Classroom course.
 */
export async function createGoogleCourse(
  accessToken: string,
  courseData: { name: string; section?: string; descriptionHeading?: string; description?: string }
): Promise<Course> {
  try {
    const body: Record<string, any> = {
      name: courseData.name,
      ownerId: "me",
      courseState: "PROVISIONED",
    };

    if (courseData.section) body.section = courseData.section;
    if (courseData.descriptionHeading) body.descriptionHeading = courseData.descriptionHeading;
    if (courseData.description) body.description = courseData.description;

    const res = await fetch(`${CLASSROOM_BASE}/courses`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw { result: err, message: `HTTP ${res.status}: ${err?.error?.message || "Failed to create course"}` };
    }

    const data = await res.json();
    return {
      id: data.id,
      name: data.name,
      section: data.section,
      descriptionHeading: data.descriptionHeading,
      enrollmentCode: data.enrollmentCode,
      courseState: data.courseState,
      teacherGroupEmail: data.teacherGroupEmail,
    };
  } catch (err) {
    handleApiError(err);
  }
}

/**
 * Activate a provisioned course (changes courseState from PROVISIONED to ACTIVE).
 */
export async function activateCourse(
  accessToken: string,
  courseId: string
): Promise<void> {
  try {
    const res = await fetch(`${CLASSROOM_BASE}/courses/${courseId}`, {
      method: "PATCH",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ courseState: "ACTIVE" }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw { result: err, message: `HTTP ${res.status}: ${err?.error?.message || "Failed to activate course"}` };
    }
  } catch (err) {
    handleApiError(err);
  }
}

/**
 * Archive a course.
 */
export async function archiveCourse(
  accessToken: string,
  courseId: string
): Promise<void> {
  try {
    const res = await fetch(`${CLASSROOM_BASE}/courses/${courseId}`, {
      method: "PATCH",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ courseState: "ARCHIVED" }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw { result: err, message: `HTTP ${res.status}: ${err?.error?.message || "Failed to archive course"}` };
    }
  } catch (err) {
    handleApiError(err);
  }
}

/**
 * List all students enrolled in a Google Classroom course.
 */
export async function listCourseStudents(
  accessToken: string,
  courseId: string
): Promise<{ userId: string; name: string; emailAddress: string }[]> {
  try {
    const res = await fetch(`${CLASSROOM_BASE}/courses/${courseId}/students`, {
      headers: authHeaders(accessToken),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw { result: err, message: `HTTP ${res.status}` };
    }

    const data = await res.json();
    return (data.students || []).map((s: any) => ({
      userId: s.userId,
      name: s.profile?.name?.fullName || "Unknown",
      emailAddress: s.profile?.emailAddress || "",
    }));
  } catch (err) {
    handleApiError(err);
  }
}

/**
 * Invite a student (by email) to a Google Classroom course.
 * The student must have a Google Workspace for Education account.
 */
export async function addStudentToCourse(
  accessToken: string,
  courseId: string,
  studentEmail: string
): Promise<boolean> {
  try {
    const res = await fetch(`${CLASSROOM_BASE}/courses/${courseId}/students`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ userId: studentEmail }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw { result: err, message: `HTTP ${res.status}: ${err?.error?.message || "Failed to add student"}` };
    }

    return true;
  } catch (err) {
    handleApiError(err);
  }
}

/**
 * Invite multiple students to a course in batch.
 */
export async function addMultipleStudentsToCourse(
  accessToken: string,
  courseId: string,
  studentEmails: string[]
): Promise<{ success: number; failed: string[] }> {
  let success = 0;
  const failed: string[] = [];

  for (const email of studentEmails) {
    try {
      const res = await fetch(`${CLASSROOM_BASE}/courses/${courseId}/students`, {
        method: "POST",
        headers: authHeaders(accessToken),
        body: JSON.stringify({ userId: email }),
      });

      if (res.ok) {
        success++;
      } else {
        const err = await res.json().catch(() => ({}));
        failed.push(`${email}: ${err?.error?.message || "Failed"}`);
      }
    } catch {
      failed.push(`${email}: Network error`);
    }
  }

  return { success, failed };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract YouTube video ID from various URL formats.
 */
function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * Get the Google OAuth URL for the implicit grant flow.
 * The frontend handles the redirect via Google Identity Services.
 */
export function getGoogleOAuthUrl(): string {
  const clientId = getClientId();
  if (!clientId) return "";

  const redirectUri = window.location.origin;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "token",
    scope: SCOPES.join(" "),
    include_granted_scopes: "true",
    state: "google_classroom",
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Parse the access token from the URL hash fragment after OAuth redirect.
 */
export function parseTokenFromHash(): { accessToken: string; expiresIn: number } | null {
  if (typeof window === "undefined") return null;

  const hash = window.location.hash.substring(1);
  if (!hash.includes("access_token")) return null;

  const params = new URLSearchParams(hash);
  const accessToken = params.get("access_token");
  const expiresIn = parseInt(params.get("expires_in") || "3600", 10);

  if (!accessToken) return null;

  return { accessToken, expiresIn };
}
