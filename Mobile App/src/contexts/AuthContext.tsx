import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import {
  AppUser,
  UserRole,
  AdminUser,
  TeacherUser,
  StudentUser,
  ParentUser,
  SuperAdminUser,
} from '../lib/types';

interface AuthContextType {
  user: AppUser | null;
  login: (emailOrEnrollment: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const mockSuperAdmin: SuperAdminUser = {
  id: '00000000-0000-0000-0000-000000000000',
  name: 'Maheshwari Tech',
  email: 'superadmin@maheshwaritech.com',
  role: 'super_admin',
};

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_KEY = 'apex_user';
const SESSION_TIMESTAMP_KEY = 'apex_login_timestamp';

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      // Check session expiry
      const loginTime = await AsyncStorage.getItem(SESSION_TIMESTAMP_KEY);
      if (loginTime) {
        const elapsed = Date.now() - parseInt(loginTime, 10);
        if (elapsed > SESSION_DURATION_MS) {
          // Session expired — auto logout
          console.log('[Auth] Session expired — auto logging out');
          await AsyncStorage.multiRemove([SESSION_KEY, SESSION_TIMESTAMP_KEY]);
          setIsLoading(false);
          return;
        }
      }

      const saved = await AsyncStorage.getItem(SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setUser(parsed);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  // Must be defined before login() since login() calls it
  const persistUser = async (userData: AppUser) => {
    setUser(userData);
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(userData));
    await AsyncStorage.setItem(SESSION_TIMESTAMP_KEY, String(Date.now()));
  };

  const login = async (emailOrEnrollment: string, password: string): Promise<boolean> => {
    try {
      // 1. Check hardcoded super_admin
      if (
        emailOrEnrollment === 'superadmin@maheshwaritech.com' &&
        password === 'super123'
      ) {
        await persistUser(mockSuperAdmin);
        return true;
      }

      // 2. Check students table for login_id/enrollment_no + login_password
      const { data: student } = await supabase
        .from('students')
        .select('*')
        .or(`login_id.eq.${emailOrEnrollment},enrollment_no.eq.${emailOrEnrollment}`)
        .eq('login_password', password)
        .eq('status', 'active')
        .maybeSingle();

      if (student) {
        const userData: StudentUser = {
          id: student.id,
          name: student.name,
          email: student.email || `${student.enrollment_no}@student.local`,
          role: 'student',
          enrollmentNo: student.enrollment_no || '',
          grn: student.grn_no || '',
          batch: student.batch_name || '',
          parentId: '',
        };
        await persistUser(userData);
        return true;
      }

      // 3. Check teachers table
      const { data: teacher } = await supabase
        .from('teachers')
        .select('*')
        .eq('email', emailOrEnrollment)
        .eq('password', password)
        .eq('status', 'active')
        .single();

      if (teacher) {
        const userData: TeacherUser = {
          id: teacher.id,
          name: teacher.name || teacher.email,
          email: teacher.email,
          role: 'teacher',
          instituteId: teacher.institute_id,
          assignedClasses: teacher.assigned_classes || [],
          assignedSubjects: teacher.subjects || [],
          permissions: {
            attendance: { visible: true, read: true, write: true },
            students: { visible: true, read: true, write: false },
            marks: { visible: true, read: true, write: true },
            timetable: { visible: true, read: true, write: false },
            leaves: { visible: true, read: true, write: true },
            dashboard: { visible: true, read: true, write: false },
            calendar: { visible: true, read: true, write: false },
          },
        };
        await persistUser(userData);
        return true;
      }

      // 4. Check institutes table
      const { data: institute } = await supabase
        .from('institutes')
        .select('*')
        .eq('email', emailOrEnrollment)
        .eq('password', password)
        .single();

      if (institute) {
        const userData: AdminUser = {
          id: institute.id,
          name: institute.name,
          email: institute.email,
          role: 'admin',
          instituteName: institute.name,
          instituteId: institute.id,
          pageAccess: institute.page_access || {},
          canAddTeachers: true,
          canAddStudents: true,
          canAddParents: true,
        };
        await persistUser(userData);
        return true;
      }

      // 5. For demo/testing with mock credentials
      if (emailOrEnrollment === 'admin@institute.com' && password === 'admin123') {
        const mockAdmin: AdminUser = {
          id: '00000000-0000-0000-0000-000000000001',
          name: 'Rajesh Admin',
          email: 'admin@institute.com',
          role: 'admin',
          instituteName: 'Excel Coaching Classes',
          instituteId: '00000000-0000-0000-0000-000000000001',
          pageAccess: {},
          canAddTeachers: true,
          canAddStudents: true,
          canAddParents: true,
        };
        await persistUser(mockAdmin);
        return true;
      }

      if (emailOrEnrollment === 'rajesh@institute.com' && password === 'teacher123') {
        const mockTeacher: TeacherUser = {
          id: '00000000-0000-0000-0000-000000000010',
          name: 'Dr. Rajesh Sharma',
          email: 'rajesh@institute.com',
          role: 'teacher',
          instituteId: '00000000-0000-0000-0000-000000000001',
          assignedClasses: ['JEE 2025 - Batch A', 'Foundation 11th'],
          assignedSubjects: ['Physics', 'Mathematics'],
          permissions: {
            attendance: { visible: true, read: true, write: true },
            students: { visible: true, read: true, write: false },
            marks: { visible: true, read: true, write: true },
            timetable: { visible: true, read: true, write: false },
            leaves: { visible: true, read: true, write: true },
            dashboard: { visible: true, read: true, write: false },
            calendar: { visible: true, read: true, write: false },
          },
        };
        await persistUser(mockTeacher);
        return true;
      }

      if (emailOrEnrollment === 'aarav@student.com' && password === 'student123') {
        const mockStudent: StudentUser = {
          id: '00000000-0000-0000-0000-000000000020',
          name: 'Aarav Gupta',
          email: 'aarav@student.com',
          role: 'student',
          enrollmentNo: 'MT-2025000',
          grn: 'GRN-2025-00001',
          batch: 'JEE 2025 - Batch A',
          parentId: '00000000-0000-0000-0000-000000000030',
        };
        await persistUser(mockStudent);
        return true;
      }

      if (emailOrEnrollment === 'parent@institute.com' && password === 'parent123') {
        const mockParent: ParentUser = {
          id: '00000000-0000-0000-0000-000000000030',
          name: 'Ishaan Gupta',
          email: 'parent@institute.com',
          role: 'parent',
          childrenIds: ['00000000-0000-0000-0000-000000000020'],
        };
        await persistUser(mockParent);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const logout = async () => {
    setUser(null);
    await AsyncStorage.multiRemove([SESSION_KEY, SESSION_TIMESTAMP_KEY]);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isAuthenticated: !!user,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Re-export types for convenience
import type {
  AppUser as _AppUser,
  AdminUser as _AdminUser,
  TeacherUser as _TeacherUser,
  StudentUser as _StudentUser,
  ParentUser as _ParentUser,
  SuperAdminUser as _SuperAdminUser,
  PagePermission as _PagePermission,
  UserRole as _UserRole,
} from '../lib/types';

export type { _AppUser as AppUser, _AdminUser as AdminUser, _TeacherUser as TeacherUser, _StudentUser as StudentUser, _ParentUser as ParentUser, _SuperAdminUser as SuperAdminUser, _PagePermission as PagePermission, _UserRole as UserRole };

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
