import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from 'react-native';
import { useAuth, TeacherUser } from '../../contexts/AuthContext';
import {
  fetchNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  NOTIFICATION_TYPE_CONFIG,
  NotificationWithReadStatus,
} from '../../lib/notification-service';
import { useNotification } from '../../contexts/NotificationContext';
import { formatRelativeTime } from '../../lib/utils';

export default function TeacherNotificationsScreen() {
  const { user } = useAuth();
  const teacher = user as TeacherUser;
  const instId = teacher?.instituteId || '';
  const userId = teacher?.id || '';

  const { latestNotification } = useNotification();
  const lastNotifIdRef = useRef<string | null>(null);

  const [notifications, setNotifications] = useState<NotificationWithReadStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState<NotificationWithReadStatus | null>(null);

  const loadNotifications = useCallback(async () => {
    if (!instId || !userId) return;
    try {
      const data = await fetchNotifications(instId, 'teacher', userId);
      setNotifications(data);
    } catch (err) {
      console.error('Error loading notifications:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [instId, userId]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Prepend new notifications from context to the list
  useEffect(() => {
    if (!latestNotification || latestNotification.id === lastNotifIdRef.current) return;
    lastNotifIdRef.current = latestNotification.id;
    setNotifications((prev) => {
      if (prev.some((n) => n.id === latestNotification.id)) return prev;
      return [latestNotification, ...prev];
    });
  }, [latestNotification]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadNotifications();
  }, [loadNotifications]);

  const handleMarkRead = async (notifId: string) => {
    const success = await markNotificationAsRead(notifId, userId, 'teacher');
    if (success) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
      );
    }
  };

  const openNotification = async (notif: NotificationWithReadStatus) => {
    setSelectedNotif(notif);
    if (!notif.is_read) {
      await handleMarkRead(notif.id);
    }
  };

  const closeNotification = () => {
    setSelectedNotif(null);
  };

  const handleMarkAllRead = async () => {
    const success = await markAllNotificationsAsRead(instId, userId, 'teacher');
    if (success) {
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, is_read: true, read_at: n.read_at || new Date().toISOString() }))
      );
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const TYPE_CONFIG = NOTIFICATION_TYPE_CONFIG;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f59e0b" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f59e0b" />}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>🔔 Notifications</Text>
          <Text style={styles.headerSubtitle}>
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
          </Text>
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity style={styles.markAllBtn} onPress={handleMarkAllRead} activeOpacity={0.7}>
            <Text style={styles.markAllText}>Mark All Read</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Notifications List */}
      {notifications.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🔔</Text>
          <Text style={styles.emptyText}>No notifications yet</Text>
          <Text style={styles.emptySubtext}>
            Admin will send you important updates here
          </Text>
        </View>
      ) : (
        notifications.map((notif) => {
          const typeCfg = TYPE_CONFIG[notif.type] || TYPE_CONFIG.info;
          return (
            <TouchableOpacity
              key={notif.id}
              style={[styles.notifCard, !notif.is_read && styles.notifUnread]}
              onPress={() => openNotification(notif)}
              activeOpacity={0.7}
            >
              <View style={styles.notifRow}>
                {/* Type Indicator */}
                <View style={[styles.typeIcon, { backgroundColor: typeCfg.color + '20' }]}>
                  <Text style={styles.typeIconText}>{typeCfg.icon}</Text>
                </View>
                {/* Content */}
                <View style={styles.notifContent}>
                  <View style={styles.notifHeader}>
                    <Text style={[styles.notifTitle, !notif.is_read && styles.notifTitleUnread]}>
                      {notif.title}
                    </Text>
                    {!notif.is_read && <View style={styles.unreadDot} />}
                  </View>
                  <Text style={styles.notifMessage} numberOfLines={2}>
                    {notif.message}
                  </Text>
                  <View style={styles.notifFooter}>
                    <Text style={styles.notifMeta}>
                      {typeCfg.label} · {formatRelativeTime(notif.created_at)}
                    </Text>

                  </View>
                </View>
              </View>
            </TouchableOpacity>
          );
        })
      )}

      <View style={{ height: 40 }} />

      {/* ── Full Notification Modal ────────────────────────── */}
      <Modal
        visible={!!selectedNotif}
        transparent
        animationType="slide"
        onRequestClose={closeNotification}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={closeNotification}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={styles.modalContent}>
              {selectedNotif && (
                <React.Fragment>
                  {/* Modal Header */}
                  <View style={styles.modalHeader}>
                    <View style={styles.modalTitleRow}>
                      <View style={[styles.modalTypeIcon, { backgroundColor: (TYPE_CONFIG[selectedNotif.type] || TYPE_CONFIG.info).color + '20' }]}>
                        <Text style={styles.modalTypeIconText}>{(TYPE_CONFIG[selectedNotif.type] || TYPE_CONFIG.info).icon}</Text>
                      </View>
                      <Text style={styles.modalTypeLabel}>{(TYPE_CONFIG[selectedNotif.type] || TYPE_CONFIG.info).label}</Text>
                    </View>
                    <TouchableOpacity onPress={closeNotification} style={styles.modalCloseBtn}>
                      <Text style={styles.modalCloseBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Title */}
                  <Text style={styles.modalTitle}>{selectedNotif.title}</Text>

                  {/* Full Message */}
                  <ScrollView style={styles.modalMessageScroll} showsVerticalScrollIndicator={false}>
                    <Text style={styles.modalMessage}>{selectedNotif.message}</Text>
                  </ScrollView>

                  {/* Meta Footer */}
                  <View style={styles.modalFooter}>
                    <View style={styles.modalFooterRow}>
                      <Text style={styles.modalMeta}>
                        {formatRelativeTime(selectedNotif.created_at)}
                      </Text>

                    </View>
                    {selectedNotif.read_at && (
                      <Text style={styles.modalReadAt}>Read {formatRelativeTime(selectedNotif.read_at)}</Text>
                    )}
                  </View>
                </React.Fragment>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#111827' },
  headerSubtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  markAllBtn: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  markAllText: { fontSize: 12, fontWeight: '600', color: '#92400e' },

  // Empty State
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#374151' },
  emptySubtext: { fontSize: 14, color: '#9ca3af', marginTop: 4, textAlign: 'center' },

  // Notification Card
  notifCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  notifUnread: {
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
    backgroundColor: '#fffbeb',
  },
  notifRow: {
    flexDirection: 'row',
    gap: 12,
  },
  typeIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeIconText: { fontSize: 18 },
  notifContent: { flex: 1 },
  notifHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  notifTitle: { fontSize: 14, fontWeight: '600', color: '#374151', flex: 1 },
  notifTitleUnread: { color: '#111827', fontWeight: '700' },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f59e0b',
  },
  notifMessage: { fontSize: 13, color: '#6b7280', marginTop: 6, lineHeight: 18 },
  notifFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  notifMeta: { fontSize: 11, color: '#9ca3af' },
  notifAuthor: { fontSize: 10, color: '#d1d5db' },

  // ── Notification Detail Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTypeIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTypeIconText: { fontSize: 16 },
  modalTypeLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseBtnText: { fontSize: 16, color: '#6b7280', fontWeight: '600' },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
    lineHeight: 26,
  },
  modalMessageScroll: { maxHeight: 300, marginBottom: 16 },
  modalMessage: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 24,
  },
  modalFooter: {
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 12,
  },
  modalFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  modalMeta: { fontSize: 12, color: '#9ca3af' },
  modalReadAt: { fontSize: 11, color: '#d1d5db', marginTop: 4 },
});
