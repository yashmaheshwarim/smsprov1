import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  subscribeToNotifications,
  NotificationWithReadStatus,
} from '../lib/notification-service';
import { useAuth } from './AuthContext';

interface NotificationContextValue {
  latestNotification: NotificationWithReadStatus | null;
}

const NotificationContext = createContext<NotificationContextValue>({
  latestNotification: null,
});

/**
 * Provider that subscribes to realtime notifications for the current
 * authenticated user and exposes the most recent notification via context.
 * Any screen can listen by calling useNotification().
 *
 * Handles:
 * - Resolving instituteId for students (not available on StudentUser directly)
 * - Mapping user roles to target_role values used in notifications
 * - Cleanup on unmount / user change
 */
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [latestNotification, setLatestNotification] =
    useState<NotificationWithReadStatus | null>(null);
  const [studentInstId, setStudentInstId] = useState<string>('');

  const userId = user?.id || '';
  const role = user?.role || '';

  // ── Resolve institute_id for students ──────────────────────────────
  useEffect(() => {
    if (!user || user.role !== 'student') {
      setStudentInstId('');
      return;
    }
    const student = user as any;
    // Some students may have instituteId from login data
    if (student.instituteId) {
      setStudentInstId(student.instituteId);
      return;
    }
    // Fallback: query the students table
    supabase
      .from('students')
      .select('institute_id')
      .eq('id', userId)
      .single()
      .then(({ data }: any) => {
        if (data?.institute_id) setStudentInstId(data.institute_id);
      })
      .catch(() => {});
  }, [user, userId]);

  // Determine the effective institute ID
  const instituteId = (user as any)?.instituteId || studentInstId || '';

  // Maps App user roles → notification target_role values
  const mapRole = (r: string): string => {
    if (r === 'super_admin' || r === 'admin') return 'admin';
    if (r === 'teacher') return 'teacher';
    return 'student'; // student, parent, or fallback
  };

  // ── Subscribe to realtime notifications ────────────────────────────
  useEffect(() => {
    if (!instituteId || !userId || !role) return;

    const roleStr = mapRole(role);

    const unsubscribe = subscribeToNotifications(
      instituteId,
      roleStr,
      userId,
      (notif) => {
        setLatestNotification(notif);
      },
    );

    return unsubscribe;
  }, [instituteId, userId, role]);

  return (
    <NotificationContext.Provider value={{ latestNotification }}>
      {children}
    </NotificationContext.Provider>
  );
}

/**
 * Hook to access the latest realtime notification.
 * Returns `latestNotification` which updates whenever a new notification
 * arrives that matches the current user's role.
 */
export function useNotification(): NotificationContextValue {
  return useContext(NotificationContext);
}
