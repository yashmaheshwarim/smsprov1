import { createContext, useContext, useState, ReactNode } from "react";

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
  login: (email: string, password: string) => boolean;
  logout: () => void;
  isAuthenticated: boolean;
}

// All admin pages that super admin can toggle
export const ALL_ADMIN_PAGES: { key: string; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "students", label: "Students" },
  { key: "admissions", label: "Admissions" },
  { key: "teachers", label: "Teachers" },
  { key: "attendance", label: "Attendance" },
  { key: "timetable", label: "Timetable" },
  { key: "fees", label: "Fees" },
  { key: "materials", label: "Study Materials" },
  { key: "documents", label: "Documents" },
  { key: "assignments", label: "Assignments" },
  { key: "messages", label: "Messages & Wallet" },
  { key: "leaves", label: "Leave Management" },
  { key: "camera", label: "Camera Capture" },
  { key: "analytics", label: "Analytics" },
  { key: "grn", label: "GRN Management" },
  { key: "marks", label: "Marks & Report Cards" },
  { key: "batches", label: "Batch Management" },
  { key: "integrations", label: "Integrations" },
  { key: "import", label: "Import Data" },
  { key: "settings", label: "Settings" },
];

const defaultAdminAccess = Object.fromEntries(ALL_ADMIN_PAGES.map(p => [p.key, true]));

const mockUsers: (AppUser & { password: string })[] = [
  {
    id: "SA-001",
    name: "Maheshwari Tech",
    email: "superadmin@maheshwaritech.com",
    password: "super123",
    role: "super_admin",
  },
  {
    id: "ADM-001",
    name: "Rajesh Admin",
    email: "admin@institute.com",
    password: "admin123",
    role: "admin",
    instituteName: "Excel Coaching Classes",
    instituteId: "INST-001",
    pageAccess: { ...defaultAdminAccess },
  } as AdminUser & { password: string },
  {
    id: "T001",
    name: "Dr. Rajesh Sharma",
    email: "rajesh@institute.com",
    password: "teacher123",
    role: "teacher",
    assignedClasses: ["JEE 2025 - Batch A", "Foundation 11th"],
    assignedSubjects: ["Physics", "Mathematics"],
    permissions: {
      attendance: { visible: true, read: true, write: true },
      students: { visible: true, read: true, write: false },
      materials: { visible: true, read: true, write: true },
      assignments: { visible: true, read: true, write: true },
      messages: { visible: true, read: true, write: true },
      fees: { visible: false, read: false, write: false },
      analytics: { visible: true, read: true, write: false },
      timetable: { visible: true, read: true, write: false },
      leaves: { visible: true, read: true, write: true },
      marks: { visible: true, read: true, write: true },
    },
  } as TeacherUser & { password: string },
  {
    id: "T002",
    name: "Prof. Anita Verma",
    email: "anita@institute.com",
    password: "teacher123",
    role: "teacher",
    assignedClasses: ["NEET 2025 - Batch B"],
    assignedSubjects: ["Chemistry", "Biology"],
    permissions: {
      attendance: { visible: true, read: true, write: true },
      students: { visible: true, read: true, write: false },
      materials: { visible: true, read: true, write: true },
      assignments: { visible: true, read: true, write: true },
      messages: { visible: true, read: true, write: true },
      fees: { visible: false, read: false, write: false },
      analytics: { visible: false, read: false, write: false },
      timetable: { visible: true, read: true, write: false },
      leaves: { visible: true, read: true, write: true },
      marks: { visible: true, read: true, write: true },
    },
  } as TeacherUser & { password: string },
  {
    id: "STU-0001",
    name: "Aarav Gupta",
    email: "aarav@student.com",
    password: "student123",
    role: "student",
    enrollmentNo: "MT-2025000",
    grn: "GRN-2025-00001",
    batch: "JEE 2025 - Batch A",
    parentId: "PAR-001",
  } as StudentUser & { password: string },
  {
    id: "PAR-001",
    name: "Ishaan Gupta",
    email: "parent@institute.com",
    password: "parent123",
    role: "parent",
    childrenIds: ["STU-0001"],
  } as ParentUser & { password: string },
];

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(() => {
    const saved = localStorage.getItem("apex_user");
    if (saved) {
      try { return JSON.parse(saved); } catch { return null; }
    }
    return null;
  });

  const login = (email: string, password: string): boolean => {
    const found = mockUsers.find(u => u.email === email && u.password === password);
    if (found) {
      const { password: _, ...userData } = found;
      setUser(userData as AppUser);
      localStorage.setItem("apex_user", JSON.stringify(userData));
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("apex_user");
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
