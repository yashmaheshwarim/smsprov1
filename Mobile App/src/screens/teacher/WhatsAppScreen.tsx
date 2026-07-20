import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase, isUuid } from '../../lib/supabase';
import { useAuth, TeacherUser } from '../../contexts/AuthContext';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';
import {
  fetchSessionStatus,
  sendWhatsAppMessage,
  sendBulkWhatsAppMessages,
  getWhatsAppServerUrl,
  loadServerUrl,
  getWalletBalance,
  getWalletUsageSummary,
} from '../../lib/whatsapp-service';

// ─── Types ───────────────────────────────────────────────────────────────

interface StudentWithPhone {
  id: string;
  name: string;
  enrollment_no: string;
  batch_name: string;
  phone: string;
}

interface BatchGroup {
  batchName: string;
  students: StudentWithPhone[];
}

// ─── Component ───────────────────────────────────────────────────────────

export default function TeacherWhatsAppScreen() {
  const { user } = useAuth();
  const teacher = user as TeacherUser;
  const instId = teacher.instituteId;

  // Connection state (read-only)
  const [connected, setConnected] = useState(false);
  const [connectionPhone, setConnectionPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingServer, setCheckingServer] = useState(true);
  const [serverReachable, setServerReachable] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [sessionError, setSessionError] = useState('');

  // Broadcast
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [selectedBatch, setSelectedBatch] = useState('all');
  const [sending, setSending] = useState(false);
  const [sendTotal, setSendTotal] = useState(0);

  // Stats
  const [stats, setStats] = useState({
    totalSent: 0,
    pendingMessages: 0,
    failedMessages: 0,
  });

  // Students grouped by batch
  const [batches, setBatches] = useState<string[]>([]);
  const [batchGroups, setBatchGroups] = useState<BatchGroup[]>([]);

  // Wallet balance
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletBalanceLoading, setWalletBalanceLoading] = useState(false);

  // Wallet usage summary
  const [usageSummary, setUsageSummary] = useState({ today: 0, thisMonth: 0 });
  const [usageSummaryLoading, setUsageSummaryLoading] = useState(false);

  // Individual message
  const [selectedStudent, setSelectedStudent] = useState<StudentWithPhone | null>(null);
  const [individualMsg, setIndividualMsg] = useState('');

  // ─── Fetch Data ───────────────────────────────────────────────────────

  const fetchData = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const savedUrl = await loadServerUrl();
      setServerUrl(savedUrl);

      // Check server health
      setCheckingServer(true);
      const reachable = await checkServerHealth();
      setCheckingServer(false);

      if (!isUuid(instId)) {
        if (!isRefresh) setLoading(false);
        return;
      }

      const assigned = teacher.assignedClasses || [];
      setBatches(assigned);

      // Fetch students from teacher's assigned batches
      const { data: students } = await supabase
        .from('students')
        .select('id, name, enrollment_no, batch_name, student_phone, father_phone, mother_phone')
        .eq('institute_id', instId)
        .eq('status', 'active')
        .in('batch_name', assigned)
        .order('batch_name')
        .order('name');

      // Group by batch and extract phone
      const grouped: Record<string, StudentWithPhone[]> = {};
      for (const s of students || []) {
        const phone = s.student_phone || s.father_phone || s.mother_phone || '';
        if (!grouped[s.batch_name]) grouped[s.batch_name] = [];
        grouped[s.batch_name].push({
          id: s.id,
          name: s.name,
          enrollment_no: s.enrollment_no,
          batch_name: s.batch_name,
          phone: phone.replace(/\D/g, ''),
        });
      }
      setBatchGroups(
        assigned.map((b: string) => ({
          batchName: b,
          students: grouped[b] || [],
        }))
      );

      // Fetch message stats for this institute
      const { count: sentCount } = await supabase
        .from('message_queue')
        .select('*', { count: 'exact', head: true })
        .eq('institute_id', instId)
        .eq('status', 'sent');

      const { count: pendingCount } = await supabase
        .from('message_queue')
        .select('*', { count: 'exact', head: true })
        .eq('institute_id', instId)
        .eq('status', 'pending');

      const { count: failedCount } = await supabase
        .from('message_queue')
        .select('*', { count: 'exact', head: true })
        .eq('institute_id', instId)
        .eq('status', 'failed');

      setStats({
        totalSent: sentCount || 0,
        pendingMessages: pendingCount || 0,
        failedMessages: failedCount || 0,
      });

      // Fetch wallet balance
      await fetchWalletBalance();

      // Fetch wallet usage summary
      await fetchUsageSummary();

      // Check session status
      await checkSessionStatus(true);
    } catch (err) {
      console.error('[TeacherWhatsApp] Error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [instId, teacher.assignedClasses]);

  const checkServerHealth = async (): Promise<boolean> => {
    try {
      const url = getWhatsAppServerUrl();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      try {
        const res = await fetch(`${url}/api/health`, { signal: controller.signal });
        const reachable = res.ok;
        setServerReachable(reachable);
        return reachable;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch {
      setServerReachable(false);
      return false;
    }
  };

  const checkSessionStatus = async (skipHealthCheck = false) => {
    try {
      setSessionError('');
      if (!skipHealthCheck) {
        const reachable = await checkServerHealth();
        if (!reachable) {
          setConnected(false);
          setConnectionPhone('');
          return;
        }
      }

      const sessionInfo = await fetchSessionStatus(instId);
      if (sessionInfo) {
        setConnected(sessionInfo.status === 'connected');
        if (sessionInfo.phone) setConnectionPhone(sessionInfo.phone);
        if (sessionInfo.error) setSessionError(sessionInfo.error);
      } else {
        // Fallback: check institute_config
        const { data: config } = await supabase
          .from('institute_config')
          .select('config_value')
          .eq('institute_id', instId)
          .eq('config_key', 'whatsapp_settings')
          .maybeSingle();

        setConnected(config?.config_value?.whatsapp_connected || false);
      }
    } catch {
      setConnected(false);
      setServerReachable(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchWalletBalance = async () => {
    if (!isUuid(instId)) return;
    setWalletBalanceLoading(true);
    try {
      const { balance } = await getWalletBalance(instId);
      setWalletBalance(balance);
    } catch {
      // ignore
    } finally {
      setWalletBalanceLoading(false);
    }
  };

  const fetchUsageSummary = async () => {
    if (!isUuid(instId)) return;
    setUsageSummaryLoading(true);
    try {
      const summary = await getWalletUsageSummary(instId);
      setUsageSummary(summary);
    } catch {
      // ignore
    } finally {
      setUsageSummaryLoading(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData(true);
  }, [fetchData]);

  // ─── Broadcast ────────────────────────────────────────────────────────

  const handleBroadcast = async () => {
    if (!broadcastMessage.trim()) {
      Alert.alert('Error', 'Please enter a message to send');
      return;
    }

    setSending(true);
    setSendTotal(0);

    try {
      // Get students for selected batch(es)
      let studentsQuery = supabase
        .from('students')
        .select('id, name, student_phone, father_phone, mother_phone, batch_name')
        .eq('institute_id', instId)
        .eq('status', 'active')
        .in('batch_name', teacher.assignedClasses || []);

      if (selectedBatch !== 'all') {
        studentsQuery = studentsQuery.eq('batch_name', selectedBatch);
      }

      const { data: students } = await studentsQuery;

      if (!students || students.length === 0) {
        Alert.alert('No Students', 'No students found for the selected batch.');
        setSending(false);
        return;
      }

      // Collect phone numbers
      const recipients: { to: string; text: string; name: string }[] = [];
      for (const s of students) {
        const phone = s.student_phone || s.father_phone || s.mother_phone;
        if (phone) {
          const clean = phone.replace(/\D/g, '');
          if (clean.length >= 10) {
            recipients.push({
              to: clean,
              text: broadcastMessage,
              name: s.name,
            });
          }
        }
      }

      if (recipients.length === 0) {
        Alert.alert('No Valid Numbers', 'No students with valid phone numbers found.');
        setSending(false);
        return;
      }

      setSendTotal(recipients.length);

      const batchResult = await sendBulkWhatsAppMessages(
        instId,
        recipients.map((r) => ({ to: r.to, text: r.text }))
      );

      if (batchResult.success) {
        const logs = recipients.map((r) => ({
          institute_id: instId,
          recipient: r.to,
          recipient_name: r.name,
          message: broadcastMessage,
          channel: 'whatsapp',
          priority: 'normal',
          status: 'sent' as const,
        }));

        for (let i = 0; i < logs.length; i += 100) {
          await supabase.from('message_queue').insert(logs.slice(i, i + 100));
        }

        Alert.alert(
          '✅ Broadcast Complete',
          `${recipients.length} message${recipients.length !== 1 ? 's' : ''} sent via WhatsApp.`
        );
      } else {
        const queueItems = recipients.map((r) => ({
          institute_id: instId,
          recipient: r.to,
          recipient_name: r.name,
          message: broadcastMessage,
          channel: 'whatsapp',
          priority: 'normal',
          status: 'pending' as const,
        }));

        for (let i = 0; i < queueItems.length; i += 100) {
          await supabase.from('message_queue').insert(queueItems.slice(i, i + 100));
        }

        Alert.alert(
          '✅ Broadcast Queued',
          `${recipients.length} message${recipients.length !== 1 ? 's' : ''} queued for delivery.`
        );
      }

      setBroadcastMessage('');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Broadcast failed');
    } finally {
      setSending(false);
      setSendTotal(0);
    }
  };

  // ─── Individual Message ───────────────────────────────────────────────

  const handleSendIndividual = async () => {
    if (!selectedStudent) return;
    if (!individualMsg.trim()) {
      Alert.alert('Error', 'Please enter a message');
      return;
    }

    if (!selectedStudent.phone || selectedStudent.phone.length < 10) {
      Alert.alert('No Phone', 'This student does not have a valid phone number.');
      return;
    }

    try {
      const result = await sendWhatsAppMessage(instId, selectedStudent.phone, individualMsg);

      if (result.success) {
        await supabase.from('message_queue').insert([{
          institute_id: instId,
          recipient: selectedStudent.phone,
          recipient_name: selectedStudent.name,
          message: individualMsg,
          channel: 'whatsapp',
          priority: 'normal',
          status: 'sent',
        }]);
        Alert.alert('✅ Sent', `Message sent to ${selectedStudent.name}`);
      } else {
        await supabase.from('message_queue').insert([{
          institute_id: instId,
          recipient: selectedStudent.phone,
          recipient_name: selectedStudent.name,
          message: individualMsg,
          channel: 'whatsapp',
          priority: 'normal',
          status: 'pending',
        }]);
        Alert.alert('⚠️ Queued', result.error || 'Could not send directly. Message queued.');
      }

      setIndividualMsg('');
      setSelectedStudent(null);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send message');
    }
  };

  const getStudentCount = () => {
    return batchGroups.reduce((sum, g) => sum + g.students.length, 0);
  };

  const getPhoneCount = () => {
    return batchGroups.reduce((sum, g) => sum + g.students.filter((s) => s.phone.length >= 10).length, 0);
  };

  // ─── Render ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f59e0b" />
        <Text style={styles.loadingText}>Loading WhatsApp...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f59e0b" />}
      >
        {/* ── Connection Status Card (Read-only) ── */}
        <View style={[styles.statusCard, connected ? styles.connectedCard : styles.disconnectedCard]}>
          <View style={styles.statusHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={styles.statusIcon}>{connected ? '✅' : serverReachable ? '📵' : '🔴'}</Text>
              <View>
                <Text style={styles.statusTitle}>
                  {connected ? 'WhatsApp Connected' : serverReachable ? 'Not Connected' : 'Server Unreachable'}
                </Text>
              </View>
            </View>
            {checkingServer ? (
              <ActivityIndicator size="small" color="#f59e0b" />
            ) : (
              <View style={[styles.serverDot, { backgroundColor: serverReachable ? '#22c55e' : '#ef4444' }]} />
            )}
          </View>

          <Text style={styles.statusDesc}>
            {connected
              ? `WhatsApp is active and ready to send messages.${connectionPhone ? `\n📞 ${connectionPhone}` : ''}`
              : serverReachable
                ? 'WhatsApp is not connected yet. Please ask the admin to scan the QR code from the WebApp to establish the connection.'
                : `Cannot reach the WhatsApp server.\n📡 ${serverUrl}`}
          </Text>

          {sessionError ? (
            <Text style={styles.sessionError}>⚠️ {sessionError}</Text>
          ) : null}

          <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
            <Text style={styles.refreshBtnText}>🔄 Refresh Status</Text>
          </TouchableOpacity>
        </View>

        {/* ── Wallet Balance ── */}
        <View style={styles.walletCard}>
          {walletBalanceLoading ? (
            <ActivityIndicator size="small" color="#f59e0b" />
          ) : (
            <>
              <View style={styles.walletRow}>
                <Text style={styles.walletIcon}>💰</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.walletLabel}>Wallet Balance</Text>
                  <Text style={[
                    styles.walletAmount,
                    walletBalance !== null && walletBalance < 10 && styles.walletAmountLow,
                    walletBalance !== null && walletBalance === 0 && styles.walletAmountEmpty,
                  ]}>
                    {walletBalance !== null ? walletBalance.toLocaleString() : '—'} credits
                  </Text>
                </View>
                {walletBalance !== null && walletBalance < 10 && (
                  <View style={styles.walletLowBadge}>
                    <Text style={styles.walletLowText}>
                      {walletBalance === 0 ? '⚠️ Empty' : '⚠️ Low'}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.walletHint}>1 message = 1 credit</Text>
            </>
          )}
        </View>

        {/* ── Stats ── */}
        <View style={styles.statsRow}>
          <View style={{ width: '31%' }}>
            <StatCard title="Sent" value={stats.totalSent} color="#22c55e" />
          </View>
          <View style={{ width: '31%' }}>
            <StatCard title="Pending" value={stats.pendingMessages} color="#f59e0b" />
          </View>
          <View style={{ width: '31%' }}>
            <StatCard title="Failed" value={stats.failedMessages} color="#ef4444" />
          </View>
        </View>

        {/* ── Credit Usage Summary ── */}
        <View style={styles.usageCard}>
          {usageSummaryLoading ? (
            <View style={styles.usageLoadingRow}>
              <ActivityIndicator size="small" color="#f59e0b" />
              <Text style={styles.usageLoadingText}>Loading usage...</Text>
            </View>
          ) : (
            <>
              <Text style={styles.usageTitle}>📊 Credit Usage</Text>
              <View style={styles.usageRow}>
                <View style={styles.usageItem}>
                  <Text style={styles.usageValue}>{usageSummary.today.toLocaleString()}</Text>
                  <Text style={styles.usageLabel}>Today</Text>
                </View>
                <View style={styles.usageDivider} />
                <View style={styles.usageItem}>
                  <Text style={styles.usageValue}>{usageSummary.thisMonth.toLocaleString()}</Text>
                  <Text style={styles.usageLabel}>This Month</Text>
                </View>
                <View style={styles.usageDivider} />
                <View style={styles.usageItem}>
                  <Text style={styles.usageValue}>
                    {walletBalance !== null
                      ? (walletBalance + usageSummary.thisMonth).toLocaleString()
                      : '—'}
                  </Text>
                  <Text style={styles.usageLabel}>Total Purchased</Text>
                </View>
              </View>
            </>
          )}
        </View>

        {/* ── My Batches ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>📚 My Batches ({batches.length})</Text>
            <Text style={styles.studentCount}>
              {getStudentCount()} students · {getPhoneCount()} with phone
            </Text>
          </View>

          {batchGroups.map((group) => (
            <View key={group.batchName} style={styles.batchCard}>
              <View style={styles.batchHeader}>
                <Text style={styles.batchName}>{group.batchName}</Text>
                <StatusBadge variant="success">{group.students.length} students</StatusBadge>
              </View>

              {group.students.length === 0 ? (
                <Text style={styles.noStudents}>No students in this batch</Text>
              ) : (
                group.students.map((student) => (
                  <View key={student.id} style={styles.studentRow}>
                    <View style={styles.studentAvatar}>
                      <Text style={styles.studentAvatarText}>
                        {student.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                      </Text>
                    </View>
                    <View style={styles.studentInfo}>
                      <Text style={styles.studentName}>{student.name}</Text>
                      <Text style={styles.studentEnroll}>{student.enrollment_no}</Text>
                      {student.phone ? (
                        <Text style={styles.studentPhone}>📞 {student.phone}</Text>
                      ) : (
                        <Text style={styles.noPhone}>No phone</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.msgBtn,
                        (!connected || !student.phone || student.phone.length < 10) && styles.msgBtnDisabled,
                      ]}
                      onPress={() => {
                        if (!connected) {
                          Alert.alert('Not Connected', 'WhatsApp is not connected. Ask admin to connect first.');
                          return;
                        }
                        if (!student.phone || student.phone.length < 10) {
                          Alert.alert('No Phone', 'This student does not have a valid phone number.');
                          return;
                        }
                        setSelectedStudent(student);
                        setIndividualMsg('');
                      }}
                    >
                      <Text style={styles.msgBtnIcon}>💬</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          ))}

          {batches.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyText}>No batches assigned</Text>
              <Text style={styles.emptySubtext}>Contact your admin to get assigned to batches.</Text>
            </View>
          )}
        </View>

        {/* ── Broadcast ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📢 Send Broadcast</Text>
          <Text style={styles.sectionSubtitle}>
            Send WhatsApp message to all students in a batch
          </Text>

          {/* Batch selector */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.batchRow}>
            <TouchableOpacity
              style={[styles.batchChip, selectedBatch === 'all' && styles.batchChipActive]}
              onPress={() => setSelectedBatch('all')}
            >
              <Text style={[styles.batchChipText, selectedBatch === 'all' && styles.batchChipTextActive]}>
                🌐 All My Batches
              </Text>
            </TouchableOpacity>
            {batches.map((b) => (
              <TouchableOpacity
                key={b}
                style={[styles.batchChip, selectedBatch === b && styles.batchChipActive]}
                onPress={() => setSelectedBatch(b)}
              >
                <Text style={[styles.batchChipText, selectedBatch === b && styles.batchChipTextActive]}>
                  {b}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Message input */}
          <TextInput
            style={styles.broadcastInput}
            placeholder="Type your broadcast message here..."
            placeholderTextColor="#9ca3af"
            value={broadcastMessage}
            onChangeText={setBroadcastMessage}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            maxLength={1000}
          />

          <Text style={styles.charCount}>{broadcastMessage.length}/1000</Text>

          {/* Send button */}
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!broadcastMessage.trim() || sending || !connected) && styles.sendButtonDisabled,
            ]}
            onPress={handleBroadcast}
            disabled={!broadcastMessage.trim() || sending || !connected}
          >
            {sending ? (
              <View style={styles.sendingRow}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.sendButtonText}>
                  {sendTotal > 0 ? ` Sending... (${sendTotal})` : ' Sending...'}
                </Text>
              </View>
            ) : (
              <Text style={styles.sendButtonText}>
                📤 Send Broadcast
              </Text>
            )}
          </TouchableOpacity>

          {!connected && (
            <Text style={styles.disabledHint}>
              ⚠️ WhatsApp is not connected. Ask the admin to connect from the WebApp first.
            </Text>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Individual Message Modal ── */}
      <Modal visible={!!selectedStudent} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.msgModal}>
            {selectedStudent && (
              <>
                <View style={styles.msgModalHeader}>
                  <View style={styles.msgModalAvatar}>
                    <Text style={styles.msgModalAvatarText}>
                      {selectedStudent.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.msgModalName}>{selectedStudent.name}</Text>
                    <Text style={styles.msgModalEnroll}>{selectedStudent.enrollment_no}</Text>
                    <Text style={styles.msgModalBatch}>{selectedStudent.batch_name}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedStudent(null)}>
                    <Text style={styles.modalClose}>✕</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.msgModalPhone}>📞 {selectedStudent.phone}</Text>

                <TextInput
                  style={styles.msgModalInput}
                  placeholder="Type your message..."
                  placeholderTextColor="#9ca3af"
                  value={individualMsg}
                  onChangeText={setIndividualMsg}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  maxLength={500}
                />

                <View style={styles.msgModalActions}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => setSelectedStudent(null)}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sendMsgBtn, !individualMsg.trim() && { opacity: 0.5 }]}
                    onPress={handleSendIndividual}
                    disabled={!individualMsg.trim()}
                  >
                    <Text style={styles.sendMsgBtnText}>Send 💬</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: { marginTop: 12, fontSize: 14, color: '#6b7280' },

  // ── Status Card ──
  statusCard: {
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
  },
  connectedCard: { backgroundColor: '#f0fdf4' },
  disconnectedCard: { backgroundColor: '#fef2f2' },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusIcon: { fontSize: 28 },
  statusTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  serverDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusDesc: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
    marginBottom: 8,
  },
  sessionError: {
    fontSize: 12,
    color: '#ef4444',
    fontWeight: '500',
    marginBottom: 8,
  },
  refreshBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.05)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  refreshBtnText: { fontSize: 13, fontWeight: '600', color: '#374151' },

  // ── Usage Summary ──
  usageCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  usageLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  usageLoadingText: {
    fontSize: 13,
    color: '#9ca3af',
  },
  usageTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 12,
  },
  usageRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  usageItem: {
    alignItems: 'center',
    flex: 1,
  },
  usageValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#d97706',
  },
  usageLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
    fontWeight: '500',
  },
  usageDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#e5e7eb',
  },

  // ── Wallet Card ──
  walletCard: {
    backgroundColor: '#fffbeb',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  walletIcon: { fontSize: 28 },
  walletLabel: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  walletAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#d97706',
  },
  walletAmountLow: {
    color: '#dc2626',
  },
  walletAmountEmpty: {
    color: '#dc2626',
  },
  walletLowBadge: {
    backgroundColor: '#fef3c7',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  walletLowText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400e',
  },
  walletHint: {
    fontSize: 11,
    color: '#d97706',
    marginTop: 4,
    marginLeft: 40,
    fontWeight: '500',
  },

  // ── Stats ──
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
    justifyContent: 'space-between',
  },

  // ── Sections ──
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 4 },
  sectionSubtitle: { fontSize: 13, color: '#6b7280', marginBottom: 12 },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  studentCount: { fontSize: 12, color: '#9ca3af' },

  // ── Batch Cards ──
  batchCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  batchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  batchName: { fontSize: 16, fontWeight: '600', color: '#111827', flex: 1 },
  noStudents: { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingVertical: 12 },
  noPhone: { fontSize: 11, color: '#ef4444', marginTop: 2 },

  // ── Student Rows ──
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f9fafb',
  },
  studentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fef3c7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  studentAvatarText: { fontSize: 11, fontWeight: '700', color: '#f59e0b' },
  studentInfo: { flex: 1 },
  studentName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  studentEnroll: { fontSize: 11, color: '#6b7280', marginTop: 1 },
  studentPhone: { fontSize: 11, color: '#6366f1', marginTop: 1 },
  msgBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#dcfce7',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  msgBtnDisabled: { backgroundColor: '#f3f4f6', opacity: 0.5 },
  msgBtnIcon: { fontSize: 16 },

  // ── Empty State ──
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#374151' },
  emptySubtext: { fontSize: 14, color: '#9ca3af', marginTop: 4 },

  // ── Broadcast ──
  batchRow: { marginBottom: 12 },
  batchChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginRight: 8,
  },
  batchChipActive: { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
  batchChipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  batchChipTextActive: { color: '#fff' },
  broadcastInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    minHeight: 100,
    marginBottom: 4,
  },
  charCount: { fontSize: 11, color: '#9ca3af', textAlign: 'right', marginBottom: 8 },
  sendButton: {
    backgroundColor: '#f59e0b',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sendButtonDisabled: { backgroundColor: '#9ca3af' },
  sendButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  sendingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  disabledHint: {
    fontSize: 12,
    color: '#ef4444',
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '500',
  },

  // ── Individual Message Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  msgModal: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 380,
  },
  msgModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  msgModalAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fef3c7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  msgModalAvatarText: { fontSize: 14, fontWeight: '700', color: '#f59e0b' },
  msgModalName: { fontSize: 16, fontWeight: '700', color: '#111827' },
  msgModalEnroll: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  msgModalBatch: { fontSize: 11, color: '#9ca3af', marginTop: 1 },
  modalClose: { fontSize: 20, color: '#6b7280', padding: 4 },
  msgModalPhone: { fontSize: 13, color: '#6366f1', marginBottom: 12, fontWeight: '500' },
  msgModalInput: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    minHeight: 80,
    marginBottom: 12,
  },
  msgModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
  },
  cancelBtnText: { color: '#6b7280', fontWeight: '600', fontSize: 14 },
  sendMsgBtn: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendMsgBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
