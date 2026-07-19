import { supabase } from './supabase';

export type NotificationType = 'info' | 'warning' | 'event' | 'exam' | 'holiday';
export type TargetRole = 'all' | 'teacher' | 'student';

export interface NotificationWithReadStatus {
  id: string;
  institute_id: string;
  title: string;
  message: string;
  type: NotificationType;
  target_role: TargetRole;
  created_by: string;
  created_at: string;
  is_read: boolean;
  read_at?: string;
}

export const NOTIFICATION_TYPE_CONFIG: Record<NotificationType, { icon: string; label: string; color: string }> = {
  info: { icon: 'ℹ️', label: 'Info', color: '#6366f1' },
  warning: { icon: '⚠️', label: 'Warning', color: '#f59e0b' },
  event: { icon: '📅', label: 'Event', color: '#22c55e' },
  exam: { icon: '📝', label: 'Exam', color: '#ef4444' },
  holiday: { icon: '🎉', label: 'Holiday', color: '#06b6d4' },
};

export const TARGET_ROLE_LABELS: Record<TargetRole, string> = {
  all: 'All Users',
  teacher: 'Teachers Only',
  student: 'Students Only',
};

export function isValidUUID(val: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
}

interface CreateNotificationParams {
  institute_id: string;
  title: string;
  message: string;
  type: NotificationType;
  target_role: TargetRole;
  created_by: string;
}

/**
 * Create a notification in the database and trigger push notifications
 * via the Edge Function.
 */
export async function createNotification(params: CreateNotificationParams): Promise<boolean> {
  try {
    const { error } = await (supabase as any).from('notifications').insert({
      institute_id: params.institute_id,
      title: params.title,
      message: params.message,
      type: params.type,
      target_role: params.target_role,
      created_by: params.created_by,
    });

    if (error) {
      console.error('[Notification] Error creating notification:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[Notification] Unexpected error:', err);
    return false;
  }
}

/**
 * Fetch notifications for a given institute, role, and user.
 */
export async function fetchNotifications(
  instituteId: string,
  role: string,
  userId: string
): Promise<NotificationWithReadStatus[]> {
  try {
    const { data: notifications } = await supabase
      .from('notifications')
      .select('*')
      .eq('institute_id', instituteId)
      .or(`target_role.eq.all,target_role.eq.${role}`)
      .order('created_at', { ascending: false });

    if (!notifications) return [];

    // Fetch read statuses for this user
    const { data: readStatuses } = await supabase
      .from('notification_reads')
      .select('notification_id, read_at')
      .eq('user_id', userId);

    const readMap = new Map<string, string>();
    if (readStatuses) {
      readStatuses.forEach((r: any) => readMap.set(r.notification_id, r.read_at));
    }

    return notifications.map((n: any) => ({
      id: n.id,
      institute_id: n.institute_id,
      title: n.title,
      message: n.message,
      type: n.type as NotificationType,
      target_role: n.target_role as TargetRole,
      created_by: n.created_by,
      created_at: n.created_at,
      is_read: readMap.has(n.id),
      read_at: readMap.get(n.id),
    }));
  } catch (err) {
    console.error('[Notification] fetchNotifications error:', err);
    return [];
  }
}

/**
 * Mark a single notification as read for a user.
 */
export async function markNotificationAsRead(
  notifId: string,
  userId: string,
  role: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('notification_reads')
      .upsert({
        notification_id: notifId,
        user_id: userId,
        user_role: role,
        read_at: new Date().toISOString(),
      }, {
        // Must match the DB UNIQUE(notification_id, user_id, user_role) constraint
        onConflict: 'notification_id,user_id,user_role',
      });

    if (error) {
      console.error('[Notification] markNotificationAsRead error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[Notification] markNotificationAsRead error:', err);
    return false;
  }
}

/**
 * Mark all notifications as read for a user in an institute.
 */
export async function markAllNotificationsAsRead(
  instituteId: string,
  userId: string,
  role: string
): Promise<boolean> {
  try {
    const { data: notifications } = await supabase
      .from('notifications')
      .select('id')
      .eq('institute_id', instituteId);

    if (!notifications || notifications.length === 0) return true;

    const reads = notifications.map((n: any) => ({
      notification_id: n.id,
      user_id: userId,
      user_role: role,
      read_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('notification_reads')
      // Must match the DB UNIQUE(notification_id, user_id, user_role) constraint
      .upsert(reads, { onConflict: 'notification_id,user_id,user_role' });

    if (error) {
      console.error('[Notification] markAllNotificationsAsRead error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[Notification] markAllNotificationsAsRead error:', err);
    return false;
  }
}

// ─── Shared notification listener manager ────────────────────────────
// Only ONE Realtime channel is created per institute. Multiple callers
// (Dashboard, NotificationsScreen) register listeners instead of each
// opening their own subscription. This avoids the 'cannot add
// postgres_changes callbacks after subscribe()' error.

interface NotificationListener {
  role: string;
  userId: string;
  onNotification: (notification: NotificationWithReadStatus) => void;
}

const _listeners = new Map<string, NotificationListener[]>();
const _channels = new Map<string, ReturnType<typeof supabase.channel>>();

function _getOrCreateChannel(instituteId: string): void {
  if (_channels.has(instituteId)) return;

  const channel = supabase
    .channel(`notifications:${instituteId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `institute_id=eq.${instituteId}`,
      },
      (payload: any) => {
        const newNotif = payload.new as any;
        const listeners = _listeners.get(instituteId) || [];

        for (const listener of listeners) {
          if (
            newNotif.target_role === 'all' ||
            newNotif.target_role === listener.role
          ) {
            listener.onNotification({
              id: newNotif.id,
              institute_id: newNotif.institute_id,
              title: newNotif.title,
              message: newNotif.message,
              type: newNotif.type as NotificationType,
              target_role: newNotif.target_role as TargetRole,
              created_by: newNotif.created_by,
              created_at: newNotif.created_at,
              is_read: false,
            });
          }
        }
      }
    )
    .subscribe();

  _channels.set(instituteId, channel);
}

function _destroyChannelIfEmpty(instituteId: string): void {
  const listeners = _listeners.get(instituteId);
  if (!listeners || listeners.length === 0) {
    const channel = _channels.get(instituteId);
    if (channel) {
      supabase.removeChannel(channel);
      _channels.delete(instituteId);
    }
    _listeners.delete(instituteId);
  }
}

/**
 * Subscribe to realtime notifications for a given institute and role.
 * Shares a single Realtime channel per institute across all callers.
 * Returns an unsubscribe function.
 */
export function subscribeToNotifications(
  instituteId: string,
  role: string,
  userId: string,
  onNewNotification: (notification: NotificationWithReadStatus) => void
): () => void {
  // Register listener
  const listener: NotificationListener = { role, userId, onNotification: onNewNotification };
  const existing = _listeners.get(instituteId) || [];
  existing.push(listener);
  _listeners.set(instituteId, existing);

  // Create the shared channel if not already active
  _getOrCreateChannel(instituteId);

  // Return unsubscribe function
  return () => {
    const arr = _listeners.get(instituteId);
    if (arr) {
      const idx = arr.indexOf(listener);
      if (idx !== -1) arr.splice(idx, 1);
      if (arr.length === 0) {
        _listeners.delete(instituteId);
      } else {
        _listeners.set(instituteId, arr);
      }
    }
    _destroyChannelIfEmpty(instituteId);
  };
}
