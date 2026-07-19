import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth, AdminUser } from '../../contexts/AuthContext';
import {
  createNotification,
  NOTIFICATION_TYPE_CONFIG,
  TARGET_ROLE_LABELS,
  isValidUUID,
  NotificationType,
  TargetRole,
} from '../../lib/notification-service';
import { formatRelativeTime } from '../../lib/utils';

export default function AdminAnnouncementsScreen() {
  const { user } = useAuth();
  const admin = user as AdminUser;
  const instId = admin?.instituteId || '';

  // ── Send Notification Form ────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [notifType, setNotifType] = useState<NotificationType>('info');
  const [targetRole, setTargetRole] = useState<TargetRole>('all');
  const [sending, setSending] = useState(false);

  // ── Sent Notifications History ────────────────────────────────────────
  const [sentNotifications, setSentNotifications] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('institute_id', instId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (data) setSentNotifications(data);
    } catch (err) {
      console.error('Error loading notification history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSend = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a notification title.');
      return;
    }
    if (!message.trim()) {
      Alert.alert('Error', 'Please enter a notification message.');
      return;
    }

    setSending(true);
    try {
      // Defensive: log the actual instituteId value for debugging
      if (!instId || !isValidUUID(instId)) {
        console.error('[Announcements] Invalid institute_id — session data may be corrupt:', {
          instId,
          adminId: admin?.id,
          adminName: admin?.name,
          adminRole: admin?.role,
          rawAdmin: JSON.stringify(admin, null, 2),
        });
        Alert.alert(
          'Configuration Error',
          'Your account is missing a valid institute ID. Please log out and log back in.'
        );
        setSending(false);
        return;
      }

      const result = await createNotification({
        institute_id: instId,
        title: title.trim(),
        message: message.trim(),
        type: notifType,
        target_role: targetRole,
        created_by: admin.id,
      });

      if (result) {
        const roleLabel = TARGET_ROLE_LABELS[targetRole] || 'Recipients';
        Alert.alert('✅ Sent Successfully', `Notification sent to ${roleLabel}.`);
        setTitle('');
        setMessage('');
        setNotifType('info');
        setTargetRole('all');
        loadHistory();
      } else {
        Alert.alert('Error', 'Failed to send notification. Please try again.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send notification.');
    } finally {
      setSending(false);
    }
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* ── Send Form ── */}
      <View style={styles.formCard}>
        <Text style={styles.formTitle}>📣 Send Notification</Text>

        {/* Target Audience */}
        <Text style={styles.label}>Send To</Text>
        <View style={styles.roleSelector}>
          {(['all', 'teacher', 'student'] as TargetRole[]).map((role) => (
            <TouchableOpacity
              key={role}
              style={[styles.roleOption, targetRole === role && { backgroundColor: '#6366f1' }]}
              onPress={() => setTargetRole(role)}
              activeOpacity={0.7}
            >
              <Text style={[styles.roleText, targetRole === role && { color: '#fff' }]}>
                {role === 'all' ? '👥 All' : role === 'teacher' ? '👨‍🏫 Teachers' : '🎓 Students'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Type */}
        <Text style={styles.label}>Type</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeRow}>
          {(Object.keys(NOTIFICATION_TYPE_CONFIG) as NotificationType[]).map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.typeChip,
                notifType === type && {
                  backgroundColor: NOTIFICATION_TYPE_CONFIG[type].color,
                  borderColor: NOTIFICATION_TYPE_CONFIG[type].color,
                },
              ]}
              onPress={() => setNotifType(type)}
              activeOpacity={0.7}
            >
              <Text style={[styles.typeChipText, notifType === type && { color: '#fff' }]}>
                {NOTIFICATION_TYPE_CONFIG[type].icon} {NOTIFICATION_TYPE_CONFIG[type].label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Title */}
        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Holiday Notice"
          placeholderTextColor="#9ca3af"
        />

        {/* Message */}
        <Text style={styles.label}>Message</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={message}
          onChangeText={setMessage}
          placeholder="Type your notification message..."
          placeholderTextColor="#9ca3af"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        {/* Send Button */}
        <TouchableOpacity
          style={[styles.sendButton, sending && { opacity: 0.6 }]}
          onPress={handleSend}
          disabled={sending}
          activeOpacity={0.8}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Text style={styles.sendIcon}>📨</Text>
              <Text style={styles.sendText}>Send Notification</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Sent History ── */}
      <View style={styles.historySection}>
        <Text style={styles.historyTitle}>📋 Sent Notifications</Text>
        {loadingHistory ? (
          <ActivityIndicator size="small" color="#6366f1" style={{ marginVertical: 20 }} />
        ) : sentNotifications.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>No notifications sent yet</Text>
            <Text style={styles.emptySubtext}>Use the form above to send your first notification</Text>
          </View>
        ) : (
          sentNotifications.map((notif: any) => {
            const notifType = notif.type as NotificationType;
            const targetRole = notif.target_role as TargetRole;
            const cfg = NOTIFICATION_TYPE_CONFIG[notifType] || NOTIFICATION_TYPE_CONFIG.info;
            return (
              <View key={notif.id} style={styles.historyItem}>
                <View style={styles.historyHeader}>
                  <View style={[styles.typeDot, { backgroundColor: cfg.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyTitleText}>{notif.title}</Text>
                    <Text style={styles.historyMeta}>
                      {TARGET_ROLE_LABELS[targetRole] || notif.target_role} ·{' '}
                      {formatRelativeTime(notif.created_at)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.historyMessage}>{notif.message}</Text>
              </View>
            );
          })
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  formTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#111827',
  },
  textArea: { minHeight: 100, paddingTop: 12 },
  roleSelector: { flexDirection: 'row', gap: 8 },
  roleOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  roleText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  typeRow: { marginBottom: 4 },
  typeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
  },
  typeChipText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    borderRadius: 12,
    padding: 14,
    marginTop: 20,
    gap: 8,
  },
  sendIcon: { fontSize: 18 },
  sendText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  historySection: { marginBottom: 16 },
  historyTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 12 },
  historyTitleText: { fontSize: 14, fontWeight: '600', color: '#111827' },
  historyItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#6366f1',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  historyHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  typeDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  historyMeta: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  historyMessage: { fontSize: 13, color: '#6b7280', marginTop: 6, lineHeight: 18 },
  emptyState: { alignItems: 'center', paddingVertical: 30 },
  emptyIcon: { fontSize: 40, marginBottom: 8 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#6b7280' },
  emptySubtext: { fontSize: 13, color: '#9ca3af', marginTop: 4, textAlign: 'center' },
});
