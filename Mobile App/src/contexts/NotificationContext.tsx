import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  subscribeToNotifications,
  NotificationWithReadStatus,
} from '../lib/notification-service';
import { useAuth } from './AuthContext';

interface NotificationContextValue {
  /** The latest in-app realtime notification received */
  latestNotification: NotificationWithReadStatus | null;
}

const NotificationContext = createContext<NotificationContextValue>({
  latestNotification: null,
});

/**
 * Provider that:
 * 1. Subscribes to realtime in-app notifications for the current user
 * 2. Registers/unregisters the device for push notifications on login/logout
 * 3. Handles incoming push notifications while app is in foreground
 * 4. Exposes push token state for debugging
 */
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [latestNotification, setLatestNotification] =
    useState<NotificationWithReadStatus | null>(null);
  const [studentInstId, setStudentInstId] = useState<string>('');

  const userId = user?.id || '';
  const role = user?.role || '';
  const lastNotifIdRef = useRef<string | null>(null);

  // ── Resolve institute_id for students ──────────────────────────────
  useEffect(() => {
    if (!user || user.role !== 'student') {
      setStudentInstId('');
      return;
    }
    const student = user as any;
    if (student.instituteId) {
      setStudentInstId(student.instituteId);
      return;
    }
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

  const instituteId = (user as any)?.instituteId || studentInstId || '';

  // Maps App user roles → notification target_role values
  const mapRole = (r: string): string => {
    if (r === 'super_admin' || r === 'admin') return 'admin';
    if (r === 'teacher') return 'teacher';
    return 'student';
  };

  // ── Subscribe to realtime in-app notifications ────────────────────
  useEffect(() => {
    if (!instituteId || !userId || !role) return;

    const roleStr = mapRole(role);

    const unsubscribe = subscribeToNotifications(
      instituteId,
      roleStr,
      userId,
      (notif) => {
        // Avoid duplicate notifications (same ID as previous)
        if (notif.id === lastNotifIdRef.current) return;
        lastNotifIdRef.current = notif.id;
        setLatestNotification(notif);
      },
    );

    return unsubscribe;
  }, [instituteId, userId, role]);

  return (
    <NotificationContext.Provider
      value={{
        latestNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

/**
 * Hook to access notification context.
 * Returns:
 * - latestNotification: the most recent in-app notification
 */
export function useNotification(): NotificationContextValue {
  return useContext(NotificationContext);
}
