import { supabase } from './supabase';

export interface Course {
  id: string;
  name: string;
  section?: string;
  descriptionHeading?: string;
  description?: string;
  enrollmentCode?: string;
  courseState?: string;
  teacherGroupEmail?: string;
  courseGroupEmail?: string;
}

export interface CourseWorkMaterial {
  id: string;
  courseId: string;
  title: string;
  description?: string;
  materials?: any[];
  creationTime: string;
  updateTime: string;
  state?: string;
}

export interface UploadMaterialRequest {
  courseId: string;
  title: string;
  description?: string;
  materials: { type: 'driveFile' | 'link' | 'youTubeVideo'; url?: string; fileId?: string; title?: string }[];
}

const GOOGLE_OAUTH2_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_CLASSROOM_API = 'https://classroom.googleapis.com/v1';
const REDIRECT_URI_DEFAULT = 'apexsms://oauth-callback';
const REDIRECT_URI_WEB = 'http://localhost';
const SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses',
  'https://www.googleapis.com/auth/classroom.coursework.me',
  'https://www.googleapis.com/auth/classroom.coursework.students',
  'https://www.googleapis.com/auth/classroom.rosters',
  'https://www.googleapis.com/auth/classroom.profile.emails',
].join(' ');

export type RedirectType = 'mobile' | 'web';

export function getRedirectUri(type: RedirectType): string {
  return type === 'web' ? REDIRECT_URI_WEB : REDIRECT_URI_DEFAULT;
}

export function getGoogleOAuthUrl(clientId: string, redirectType: RedirectType = 'mobile'): string {
  const redirectUri = getRedirectUri(redirectType);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: SCOPES,
    include_granted_scopes: 'true',
    state: 'classroom_connect',
  });
  return `${GOOGLE_OAUTH2_AUTH_URL}?${params.toString()}`;
}

export function isOAuthRedirectUrl(url: string): boolean {
  return (
    url?.startsWith(REDIRECT_URI_DEFAULT) ||
    url?.startsWith(REDIRECT_URI_WEB) ||
    url?.includes('access_token=') ||
    url?.includes('error=')
  );
}

export function parseTokenFromUrl(url: string): { accessToken: string; expiresIn: number } | null {
  try {
    // Handle both hash-based (#) and query-based (?) token delivery
    let fragment = '';
    if (url.includes('#')) {
      fragment = url.split('#')[1];
    } else if (url.includes('?')) {
      fragment = url.split('?')[1];
    }
    if (!fragment) return null;
    const params = new URLSearchParams(fragment);
    const accessToken = params.get('access_token');
    const expiresIn = parseInt(params.get('expires_in') || '3600', 10);
    if (!accessToken) return null;
    return { accessToken, expiresIn };
  } catch {
    return null;
  }
}

export async function getGoogleClassroomConfig(instituteId: string): Promise<{
  connected: boolean;
  clientId?: string;
  accessToken?: string;
  tokenExpiry?: number;
  redirectType?: RedirectType;
} | null> {
  try {
    const { data } = await (supabase as any)
      .from('institute_config')
      .select('config_value')
      .eq('institute_id', instituteId)
      .eq('config_key', 'google_classroom')
      .single();
    return (data as any)?.config_value || null;
  } catch {
    return null;
  }
}

export async function saveGoogleClassroomConfig(
  instituteId: string,
  config: { connected: boolean; clientId: string; accessToken: string; tokenExpiry: number; redirectType?: RedirectType }
): Promise<void> {
  await (supabase as any).from('institute_config').upsert(
    {
      institute_id: instituteId,
      config_key: 'google_classroom',
      config_value: config,
    },
    { onConflict: 'institute_id,config_key' }
  );
}

export async function disconnectGoogleClassroom(instituteId: string): Promise<void> {
  await (supabase as any)
    .from('institute_config')
    .delete()
    .eq('institute_id', instituteId)
    .eq('config_key', 'google_classroom');
}

async function apiRequest(token: string, path: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${GOOGLE_CLASSROOM_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google API error: ${res.status} — ${err}`);
  }
  return res.json();
}

export async function listCourses(token: string): Promise<Course[]> {
  const data = await apiRequest(token, '/courses', {
    method: 'GET',
  } as any);
  return data.courses || [];
}

export async function createGoogleCourse(
  token: string,
  course: { name: string; section?: string; description?: string }
): Promise<Course> {
  return apiRequest(token, '/courses', {
    method: 'POST',
    body: JSON.stringify({
      name: course.name,
      section: course.section,
      descriptionHeading: course.name,
      description: course.description,
      courseState: 'ACTIVE', // Create directly as ACTIVE so it appears immediately
      ownerId: 'me',
    }),
  } as any);
}

export async function activateCourse(token: string, courseId: string): Promise<void> {
  await apiRequest(token, `/courses/${courseId}`, {
    method: 'PATCH',
    body: JSON.stringify({ courseState: 'ACTIVE' }),
  } as any);
}

export async function listCourseStudents(token: string, courseId: string): Promise<any[]> {
  const data = await apiRequest(token, `/courses/${courseId}/students`);
  return data.students || [];
}

export async function addMultipleStudentsToCourse(
  token: string,
  courseId: string,
  emails: string[]
): Promise<{ success: number; failed: { email: string; reason: string }[] }> {
  let success = 0;
  const failed: { email: string; reason: string }[] = [];

  for (const email of emails) {
    try {
      await apiRequest(token, `/courses/${courseId}/students`, {
        method: 'POST',
        body: JSON.stringify({
          userId: email,
        }),
      } as any);
      success++;
    } catch (err: any) {
      failed.push({ email, reason: err.message });
    }
  }

  return { success, failed };
}

export async function listAllCourseWorkMaterials(
  token: string
): Promise<{ course: Course; materials: CourseWorkMaterial[] }[]> {
  const courses = await listCourses(token);
  const result: { course: Course; materials: CourseWorkMaterial[] }[] = [];

  for (const course of courses) {
    try {
      const data = await apiRequest(token, `/courses/${course.id}/courseWorkMaterials`);
      result.push({ course, materials: data.courseWorkMaterial || [] });
    } catch {
      // Skip courses we can't access
    }
  }

  return result;
}

export async function createCourseWorkMaterial(
  token: string,
  request: UploadMaterialRequest
): Promise<any> {
  const body: any = {
    title: request.title,
  };
  if (request.description) body.description = request.description;

  if (request.materials && request.materials.length > 0) {
    body.materials = request.materials.map((m) => {
      if (m.type === 'link' && m.url) {
        return { link: { url: m.url, title: m.title || request.title } };
      }
      if (m.type === 'youTubeVideo' && m.url) {
        return { youTubeVideo: { id: m.url, title: m.title || request.title } };
      }
      if (m.type === 'driveFile' && m.fileId) {
        return {
          driveFile: {
            driveFile: { id: m.fileId, title: m.title || request.title },
            shareMode: 'VIEW',
          },
        };
      }
      return null;
    }).filter(Boolean);
  }

  return apiRequest(token, `/courses/${request.courseId}/courseWorkMaterials`, {
    method: 'POST',
    body: JSON.stringify(body),
  } as any);
}
