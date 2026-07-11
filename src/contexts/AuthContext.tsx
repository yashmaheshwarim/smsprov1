import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { ALL_ADMIN_PAGES, buildDefaultPageAccess } from "@/lib/page-config";

export type UserRole = "super_admin" | "admin" | "teacher" | "student" | "parent";

export interface PagePermission {
  visible: boolean;
  read: boolean;
  write: boolean;
}

export interface TeacherUser {
  id: string;
  name: string;
  email: string;
  role: "teacher";
  instituteId: string;
  assignedClasses: string[];
  assignedSubjects: string[];
  permissions: Record<string, PagePermission>;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "admin";
  instituteName: string;
  instituteId: string;
  pageAccess: Record<string, boolean>; // controlled by super admin
  canAddTeachers?: boolean;
  canAddStudents?: boolean;
  canAddParents?: boolean;
}

export interface SuperAdminUser {
  id: string;
  name: string;
  email: string;
  role: "super_admin";
}

export interface StudentUser {
  id: string;
  name: string;
  email: string;
  role: "student";
  enrollmentNo: string;
  grn: string;
  batch: string;
  parentId: string;
}

export interface ParentUser {
  id: string;
  name: string;
  email: string;
  role: "parent";
  childrenIds: string[];
}

export type AppUser = TeacherUser | AdminUser | SuperAdminUser | StudentUser | ParentUser;

interface AuthContextType {
  user: AppUser | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
  registerUser: (user: AppUser & { password: string }) => void;
  updateUser: (id: string, data: Partial<AppUser & { password: string }>) => void;
  getUserByInstituteInfo: (instituteId: string) => (AppUser & { password: string }) | undefined;
  updateUserPassword: (id: string, newPassword: string) => Promise<boolean>;
}

const defaultAdminAccess = buildDefaultPageAccess();

const mockUsers: (AppUser & { password: string })[] = [
  {
    id: "00000000-0000-0000-0000-000000000000",
    name: "Maheshwari Tech",
    email: "superadmin@maheshwaritech.com",
    password: "super123",
    role: "super_admin",
  },
  {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Rajesh Admin",
    email: "admin@institute.com",
    password: "admin123",
    role: "admin",
    instituteName: "Excel Coaching Classes",
    instituteId: "00000000-0000-0000-0000-000000000001",
    pageAccess: { ...defaultAdminAccess },
    canAddTeachers: true,
    canAddStudents: true,
    canAddParents: true,
  } as AdminUser & { password: string },
  {
    id: "00000000-0000-0000-0000-000000000010",
    name: "Dr. Rajesh Sharma",
    email: "rajesh@institute.com",
    password: "teacher123",
    role: "teacher",
    instituteId: "00000000-0000-0000-0000-000000000001",
    assignedClasses: ["JEE 2025 - Batch A", "Foundation 11th"],
    assignedSubjects: ["Physics", "Mathematics"],
    permissions: {
      attendance: { visible: true, read: true, write: true },
      students: { visible: true, read: true, write: false },
      marks: { visible: true, read: true, write: true },
      timetable: { visible: true, read: true, write: false },
      leaves: { visible: true, read: true, write: true },
    },
  } as TeacherUser & { password: string },
  {
    id: "00000000-0000-0000-0000-000000000011",
    name: "Prof. Anita Verma",
    email: "anita@institute.com",
    password: "teacher123",
    role: "teacher",
    instituteId: "00000000-0000-0000-0000-000000000001",
    assignedClasses: ["NEET 2025 - Batch B"],
    assignedSubjects: ["Chemistry", "Biology"],
    permissions: {
      attendance: { visible: true, read: true, write: true },
      students: { visible: true, read: true, write: false },
      marks: { visible: true, read: true, write: true },
      timetable: { visible: true, read: true, write: false },
      leaves: { visible: true, read: true, write: true },
    },
  } as TeacherUser & { password: string },
  {
    id: "00000000-0000-0000-0000-000000000020",
    name: "Aarav Gupta",
    email: "aarav@student.com",
    password: "student123",
    role: "student",
    enrollmentNo: "MT-2025000",
    grn: "GRN-2025-00001",
    batch: "JEE 2025 - Batch A",
    parentId: "00000000-0000-0000-0000-000000000030",
  } as StudentUser & { password: string },
  {
    id: "00000000-0000-0000-0000-000000000030",
    name: "Ishaan Gupta",
    email: "parent@institute.com",
    password: "parent123",
    role: "parent",
    childrenIds: ["00000000-0000-0000-0000-000000000020"],
  } as ParentUser & { password: string },
];

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(() => {
    const saved = localStorage.getItem("apex_user");
    if (saved) {
      try { 
        const parsed = JSON.parse(saved);
        const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
        const generateUuidFromSeed = (seed: string) => {
          const hash = seed.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a }, 0);
          return `00000000-0000-4000-8000-${Math.abs(hash).toString(16).padStart(12, '0')}`;
        };

        let changed = false;
        
        if (parsed.id && !isUuid(parsed.id)) {
          parsed.id = generateUuidFromSeed(parsed.id);
          changed = true;
        }

        if (parsed.role === "admin" && parsed.instituteId && !isUuid(parsed.instituteId)) {
          parsed.instituteId = "00000000-0000-0000-0000-000000000001";
          changed = true;
        }

        if (changed) {
          localStorage.setItem("apex_user", JSON.stringify(parsed));
        }
        return parsed;
      } catch { return null; }
    }
    return null;
  });

  const [users, setUsers] = useState<(AppUser & { password: string })[]>(mockUsers);

  const login = async (emailOrEnrollment: string, password: string): Promise<boolean> => {
    console.log("Login attempt for:", emailOrEnrollment);

    // 1. Check hardcoded super_admin
    const superAdminMatch = mockUsers.find(
      u => u.role === "super_admin" && u.email === emailOrEnrollment && u.password === password
    );
    if (superAdminMatch) {
      console.log("Super admin login");
      const { password: _, ...userData } = superAdminMatch;
      setUser(userData as AppUser);
      localStorage.setItem("apex_user", JSON.stringify(userData));
      window.location.href = "/";
      return true;
    }

    // 2. Check students table for login_id + login_password
    console.log("Checking students table for enrollment/login_id login...");
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("*")
      .or(`login_id.eq.${emailOrEnrollment},enrollment_no.eq.${emailOrEnrollment}`)
      .eq("login_password", password)
      .eq("status", "active")
      .maybeSingle();

    if (student && !studentError) {
      console.log("Student login successful:", student.name);
      const userData: StudentUser = {
        id: student.id,
        name: student.name,
        email: student.email || `${student.enrollment_no}@student.local`,
        role: "student",
        enrollmentNo: student.enrollment_no || "",
        grn: student.grn_no || "",
        batch: student.batch_name || "",
        parentId: "",
      };
      setUser(userData);
      localStorage.setItem("apex_user", JSON.stringify(userData));
      window.location.href = "/";
      return true;
    }

    // 3. Check teachers table
    console.log("Checking teachers table...");
    const { data: teacher, error: teacherError } = await supabase
      .from("teachers")
      .select("*")
      .eq("email", emailOrEnrollment)
      .eq("password", password)
      .eq("status", "active")
      .single();

    if (teacher && !teacherError) {
      console.log("Teacher login successful:", teacher.name);
      const userData: TeacherUser = {
        id: teacher.id,
        name: teacher.name || teacher.email,
        email: teacher.email,
        role: "teacher",
        instituteId: teacher.institute_id,
        assignedClasses: teacher.assigned_classes || [],
        assignedSubjects: teacher.subjects || [],
        permissions: (teacher.permissions && typeof teacher.permissions === 'object' && !Array.isArray(teacher.permissions))
          ? teacher.permissions
          : {
              dashboard: { visible: true, read: true, write: false },
              attendance: { visible: true, read: true, write: true },
              students: { visible: true, read: true, write: false },
              marks: { visible: true, read: true, write: true },
              timetable: { visible: true, read: true, write: false },
              leaves: { visible: true, read: true, write: true },
              calendar: { visible: true, read: true, write: false },
            },
      };
      setUser(userData);
      localStorage.setItem("apex_user", JSON.stringify(userData));
      window.location.href = "/";
      return true;
    }

    // 4. Check institutes table
    console.log("Checking institutes table...");
    const { data: institute, error: instError } = await supabase
      .from("institutes")
      .select("*")
      .eq("email", emailOrEnrollment)
      .eq("password", password)
      .single();

    if (institute && !instError) {
      console.log("Institute login successful:", institute.name);
      const userData: AdminUser = {
        id: institute.id,
        name: institute.name,
        email: institute.email,
        role: "admin",
        instituteName: institute.name,
        instituteId: institute.id,
        pageAccess: institute.page_access || { ...defaultAdminAccess },
        canAddTeachers: true,
        canAddStudents: true,
        canAddParents: true,
      };
      setUser(userData);
      localStorage.setItem("apex_user", JSON.stringify(userData));
      window.location.href = "/";
      return true;
    }

    console.log("Invalid credentials");
    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("apex_user");
    window.location.href = "/";
  };

  const registerUser = (newUser: AppUser & { password: string }) => {
    setUsers(prev => [...prev, newUser]);
  };

  const updateUser = (id: string, data: Partial<AppUser & { password: string }>) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...data } as (AppUser & { password: string }) : u));
  };

  const getUserByInstituteInfo = (instituteId: string) => {
    return users.find(u => u.role === "admin" && u.instituteId === instituteId);
  };

  const updateUserPassword = async (id: string, newPassword: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("users")
        .update({ password_hash: newPassword })
        .eq("id", id);

      if (error) {
        console.error("Failed to update password in Supabase:", error);
      }

      setUsers(prev => prev.map(u => u.id === id ? { ...u, password: newPassword } as (AppUser & { password: string }) : u));

      return true;
    } catch (err) {
      console.error("Password update error:", err);
      return false;
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user, registerUser, updateUser, getUserByInstituteInfo, updateUserPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
