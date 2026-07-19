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
import { useAuth, AdminUser } from '../../contexts/AuthContext';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';
import {
  fetchSessionStatus,
  disconnectSession,
  sendWhatsAppMessage,
  sendBulkWhatsAppMessages,
  getWhatsAppServerUrl,
  setWhatsAppServerUrl,
  saveServerUrl,
  loadServerUrl,
} from '../../lib/whatsapp-service';

// ─── Types ───────────────────────────────────────────────────────────────

interface MessageQueueItem {
  id: string;
  recipient: string;
  recipient_name: string;
  message: string;
  channel: string;
  status: string;
  created_at: string;
  error_message?: string;
}

interface StudentPhone {
  id: string;
  name: string;
  phone: string;
  batch_name: string;
}

// ─── Component ───────────────────────────────────────────────────────────

export default function WhatsAppScreen() {
  const { user } = useAuth();
  const adminUser = user as AdminUser;
  const instId = adminUser?.instituteId || '';

  // Connection state
  const [connected, setConnected] = useState(false);
  const [connectionPhone, setConnectionPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [sessionError, setSessionError] = useState('');

  // Server reachable state
  const [serverReachable, setServerReachable] = useState(false);
  const [checkingServer, setCheckingServer] = useState(true);

  // Server URL configuration
  const [showUrlConfig, setShowUrlConfig] = useState(false);
  const [serverUrlInput, setServerUrlInput] = useState('');
  const [serverUrl, setServerUrl] = useState('');

  // Info modal
  const [showInfo, setShowInfo] = useState(false);

  // Broadcast
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [selectedBatch, setSelectedBatch] = useState('all');
  const [batches, setBatches] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [sendTotal, setSendTotal] = useState(0);

  // Stats
  const [stats, setStats] = useState({
    totalSent: 0,
    pendingMessages: 0,
    failedMessages: 0,
  });

  // Message Queue viewer
  const [showQueue, setShowQueue] = useState(false);
  const [queueItems, setQueueItems] = useState<MessageQueueItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);

  // Test message
  const [testPhone, setTestPhone] = useState('');
  const [showTestModal, setShowTestModal] = useState(false);
  const [testMsg, setTestMsg] = useState('');

  // ─── Fetch Data ───────────────────────────────────────────────────────

  const fetchData = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      // Load server URL
      const savedUrl = await loadServerUrl();
      setServerUrl(savedUrl);
      setServerUrlInput(savedUrl);

      // Quick health check with shorter timeout on initial load
      setCheckingServer(true);
      const reachable = await checkServerHealth(3000);
      setCheckingServer(false);

      if (!isUuid(instId)) {
        if (!isRefresh) setLoading(false);
        return;
      }

      // Fetch batches from students
      const { data: sData } = await supabase
        .from('students')
        .select('batch_name')
        .eq('institute_id', instId)
        .eq('status', 'active');

      const batchNames = [...new Set((sData || []).map((s: any) => s.batch_name).filter(Boolean))] as string[];
      setBatches(batchNames);

      // Fetch message stats
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

      // Check session status (skip health check since we already checked above)
      await checkSessionStatus(true);
    } catch (err) {
      console.error('[WhatsApp] fetchData error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [instId]);

  const checkServerHealth = async (timeoutMs = 5000): Promise<boolean> => {
    try {
      const url = getWhatsAppServerUrl();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`${url}/api/health`, {
          signal: controller.signal,
        });
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
      
      // First verify the server is reachable (unless skipped)
      if (!skipHealthCheck) {
        const reachable = await checkServerHealth();
        if (!reachable) {
          setConnected(false);
          setConnectionPhone('');
          setSessionError('⚠️ Cannot reach the WhatsApp server. Make sure the server URL is correct.');
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

    // Auto-refresh status every 15 seconds
    const statusInterval = setInterval(() => {
      if (isUuid(instId)) {
        checkSessionStatus().catch(() => {});
      }
    }, 15000);

    // Auto-refresh stats every 60 seconds
    const statsInterval = setInterval(() => {
      if (isUuid(instId)) {
        fetchMessageStats().catch(() => {});
      }
    }, 60000);

    return () => {
      clearInterval(statusInterval);
      clearInterval(statsInterval);
    };
  }, [instId]);

  const fetchMessageStats = async () => {
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
  };

  // ─── Server URL Configuration ────────────────────────────────────────

  const handleSaveServerUrl = async () => {
    const url = serverUrlInput.trim();
    if (!url) {
      Alert.alert('Error', 'Please enter a valid server URL');
      return;
    }
    try {
      new URL(url);
    } catch {
      Alert.alert('Error', 'Please enter a valid URL (e.g., http://192.168.1.100:3001)');
      return;
    }
    setWhatsAppServerUrl(url);
    await saveServerUrl(url);
    setServerUrl(url);
    setShowUrlConfig(false);
    Alert.alert('✅ Saved', `Server URL updated to:\n${url}\n\nChecking connection...`);
    // Re-check session after URL change
    setTimeout(() => checkSessionStatus(), 1000);
  };

  const handleResetServerUrl = async () => {
    const defaultUrl = 'https://smsprov1-production.up.railway.app';
    setWhatsAppServerUrl(defaultUrl);
    await saveServerUrl(defaultUrl);
    setServerUrl(defaultUrl);
    setServerUrlInput(defaultUrl);
    Alert.alert('✅ Reset', `Server URL reset to:\n${defaultUrl}`);
    setTimeout(() => checkSessionStatus(), 1000);
  };

  // ─── Session Management ──────────────────────────────────────────────

  const handleRefreshStatus = async () => {
    setConnecting(true);
    try {
      // checkSessionStatus updates state, then fetchSessionStatus gets fresh data for alert
      const sessionInfo = await fetchSessionStatus(instId);
      if (sessionInfo) {
        setConnected(sessionInfo.status === 'connected');
        if (sessionInfo.phone) setConnectionPhone(sessionInfo.phone);
        if (sessionInfo.error) setSessionError(sessionInfo.error);
      } else {
        setConnected(false);
      }
      if (sessionInfo) {
        if (sessionInfo.status === 'connected') {
          Alert.alert(
            '✅ Connected',
            `WhatsApp is active${sessionInfo.phone ? ` on ${sessionInfo.phone}` : ''}.`
          );
        } else if (sessionInfo.status === 'disconnected') {
          Alert.alert(
            '📵 Not Connected',
            'WhatsApp is not connected. Please open the WebApp and scan the QR code there to establish the connection.\n\nOnce connected, the mobile app will automatically detect it.',
            [{ text: 'OK', style: 'default' }]
          );
        } else if (sessionInfo.status === 'connecting') {
          Alert.alert(
            '⏳ Connecting',
            'WhatsApp is currently trying to connect. Please wait...'
          );
        } else {
          Alert.alert(
            '⚠️ Error',
            `Status: ${sessionInfo.status}${sessionInfo.error ? `\nError: ${sessionInfo.error}` : ''}`
          );
        }
      } else {
        Alert.alert(
          '⚠️ Server Unreachable',
          `Cannot reach the WhatsApp server at:\n${getWhatsAppServerUrl()}\n\nMake sure the server is running and the URL is correct.`,
          [
            { text: 'OK', style: 'default' },
            { text: '⚙️ Configure URL', onPress: () => setShowUrlConfig(true) },
          ]
        );
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to check status');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    Alert.alert(
      'Disconnect WhatsApp',
      'Are you sure? This will stop all WhatsApp notifications.\n\nStudents will no longer receive absent alerts, fee reminders, or broadcasts via WhatsApp.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await disconnectSession(instId);
            } catch {}
            // Also update DB config
            await supabase.from('institute_config').upsert(
              {
                institute_id: instId,
                config_key: 'whatsapp_settings',
                config_value: {
                  whatsapp_connected: false,
                  auto_absent_alerts: true,
                  auto_fee_reminders: false,
                  broadcast_enabled: true,
                },
              },
              { onConflict: 'institute_id,config_key' }
            );
            setConnected(false);
            setConnectionPhone('');
            Alert.alert('✅ Disconnected', 'WhatsApp has been disconnected successfully.');
          },
        },
      ]
    );
  };

  // ─── Test Message ────────────────────────────────────────────────────

  const handleSendTest = async () => {
    if (!testPhone.trim()) {
      Alert.alert('Error', 'Please enter a phone number');
      return;
    }
    const msg = testMsg.trim() || 'This is a test message from Apex SMS.';
    setConnecting(true);
    try {
      const cleanPhone = testPhone.replace(/\D/g, '');
      const result = await sendWhatsAppMessage(instId, cleanPhone, msg);
      if (result.success) {
        // Log to message_queue
        await supabase.from('message_queue').insert([{
          institute_id: instId,
          recipient: cleanPhone,
          recipient_name: 'Test',
          message: msg,
          channel: 'whatsapp',
          priority: 'normal',
          status: 'sent',
        }]);
        Alert.alert('✅ Sent', 'Test message sent successfully!');
        setTestPhone('');
        setTestMsg('');
        setShowTestModal(false);
        fetchMessageStats();
      } else {
        Alert.alert('⚠️ Failed', result.error || 'Could not send test message. Check the server URL and connection status.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send test message');
    } finally {
      setConnecting(false);
    }
  };

  // ─── Broadcast ───────────────────────────────────────────────────────

  const handleBroadcast = async () => {
    if (!broadcastMessage.trim()) {
      Alert.alert('Error', 'Please enter a message to send');
      return;
    }

    setSending(true);
    setSendTotal(0);

    try {
      // Fetch students with phone numbers
      let query = supabase
        .from('students')
        .select('id, name, student_phone, father_phone, mother_phone, batch_name')
        .eq('institute_id', instId)
        .eq('status', 'active');

      if (selectedBatch !== 'all') {
        query = query.eq('batch_name', selectedBatch);
      }

      const { data: students, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      if (!students || students.length === 0) {
        Alert.alert('No Students', 'No students found for the selected batch.');
        setSending(false);
        return;
      }

      // Collect phone numbers (priority: student_phone > father_phone > mother_phone)
      const recipients: StudentPhone[] = [];
      for (const s of students) {
        const phone = s.student_phone || s.father_phone || s.mother_phone;
        if (phone) {
          const clean = phone.replace(/\D/g, '');
          if (clean.length >= 10) {
            recipients.push({
              id: s.id,
              name: s.name,
              phone: clean,
              batch_name: s.batch_name || '',
            });
          }
        }
      }

      if (recipients.length === 0) {
        Alert.alert('No Valid Numbers', 'No students with valid phone numbers found in the selected batch.');
        setSending(false);
        return;
      }

      setSendTotal(recipients.length);

      // Try REST API batch send
      const apiMessages = recipients.map((r) => ({
        to: r.phone,
        text: broadcastMessage,
      }));

      const batchResult = await sendBulkWhatsAppMessages(instId, apiMessages);

      if (batchResult.success) {
        // All sent via REST API
        const logs = recipients.map((r) => ({
          institute_id: instId,
          recipient: r.phone,
          recipient_name: r.name,
          message: broadcastMessage,
          channel: 'whatsapp',
          priority: 'normal',
          status: 'sent' as const,
        }));

        // Insert in batches of 100 to avoid payload limits
        for (let i = 0; i < logs.length; i += 100) {
          await supabase.from('message_queue').insert(logs.slice(i, i + 100));
        }

        Alert.alert(
          '✅ Broadcast Complete',
          `${recipients.length} message${recipients.length !== 1 ? 's' : ''} sent via WhatsApp.`
        );
      } else {
        // Fallback: queue messages for backend delivery
        const queueItems = recipients.map((r) => ({
          institute_id: instId,
          recipient: r.phone,
          recipient_name: r.name,
          message: broadcastMessage,
          channel: 'whatsapp',
          priority: 'normal',
          status: 'pending' as const,
        }));

        for (let i = 0; i < queueItems.length; i += 100) {
          const { error: insertError } = await supabase
            .from('message_queue')
            .insert(queueItems.slice(i, i + 100));
          if (insertError) throw insertError;
        }

        Alert.alert(
          '✅ Broadcast Queued',
          `${recipients.length} message${recipients.length !== 1 ? 's' : ''} queued for WhatsApp delivery. The backend server will process them when connected.`
        );
      }

      setBroadcastMessage('');
      fetchMessageStats();
    } catch (err: any) {
      Alert.alert('Broadcast Error', err.message || 'An unexpected error occurred.');
    } finally {
      setSending(false);
      setSendTotal(0);
    }
  };

  // ─── Message Queue Viewer ────────────────────────────────────────────

  const handleViewQueue = async () => {
    setShowQueue(true);
    setQueueLoading(true);
    try {
      const { data, error } = await supabase
        .from('message_queue')
        .select('*')
        .eq('institute_id', instId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setQueueItems(data || []);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not load message queue');
    } finally {
      setQueueLoading(false);
    }
  };

  const handleRetryFailed = async () => {
    try {
      const { data: failedItems, error } = await supabase
        .from('message_queue')
        .select('*')
        .eq('institute_id', instId)
        .eq('status', 'failed')
        .limit(50);

      if (error) throw error;
      if (!failedItems || failedItems.length === 0) {
        Alert.alert('No Failed Messages', 'There are no failed messages to retry.');
        return;
      }

      // Try resending
      const messages = failedItems.map((item: any) => ({
        to: item.recipient,
        text: item.message,
      }));

      const result = await sendBulkWhatsAppMessages(instId, messages);

      if (result.success) {
        // Mark as sent
        const ids = failedItems.map((item: any) => item.id);
        await supabase
          .from('message_queue')
          .update({ status: 'sent' })
          .in('id', ids);

        Alert.alert('✅ Retry Complete', `${ids.length} failed message${ids.length !== 1 ? 's' : ''} resent successfully.`);
      } else {
        Alert.alert('⚠️ Retry Failed', 'Could not reach the WhatsApp server. Check connection and try again.');
      }
      fetchMessageStats();
      handleViewQueue();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Retry failed');
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Connecting to WhatsApp service...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchData(true); }}
          />
        }
      >
        {/* ── Connection Status Card ── */}
        <View style={[styles.statusCard, connected ? styles.connectedCard : styles.disconnectedCard]}>
          <View style={styles.statusHeader}>
            <Text style={styles.statusIcon}>{connected ? '✅' : serverReachable ? '📵' : '🔴'}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {/* Server reachability indicator */}
              {checkingServer ? (
                <ActivityIndicator size="small" color="#6366f1" />
              ) : (
                <View style={[styles.serverDot, { backgroundColor: serverReachable ? '#22c55e' : '#ef4444' }]} />
              )}
              <TouchableOpacity style={styles.infoIconBtn} onPress={() => setShowInfo(true)}>
                <Text style={styles.infoIconText}>ℹ️</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.statusTitle}>
            {connected ? 'WhatsApp Connected' : serverReachable ? 'Not Connected' : 'Server Unreachable'}
          </Text>
          <Text style={styles.statusText}>
            {connected
              ? `Your WhatsApp is active and sending notifications.${connectionPhone ? `\n📞 ${connectionPhone}` : ''}`
              : serverReachable
                ? 'WhatsApp is not connected. Open the WebApp to scan the QR code and connect. The mobile app shares the same connection.'
                : `Cannot reach the WhatsApp server. Make sure the server is running at:\n${serverUrl}`}
          </Text>
          {sessionError ? (
            <Text style={styles.errorText}>⚠️ {sessionError}</Text>
          ) : null}

          {/* Server URL */}
          <View style={styles.serverUrlRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <View style={[styles.serverDotSmall, { backgroundColor: serverReachable ? '#22c55e' : '#ef4444' }]} />
              <Text style={styles.serverUrlLabel} numberOfLines={1}>{serverUrl}</Text>
            </View>
            <TouchableOpacity onPress={() => setShowUrlConfig(true)}>
              <Text style={styles.serverUrlEdit}>✏️ Edit</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.statusActions}>
            {connected ? (
              <>
                <TouchableOpacity style={styles.statusBtn} onPress={handleRefreshStatus}>
                  <Text style={styles.statusBtnText}>🔄 Refresh</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.testBtn} onPress={() => setShowTestModal(true)}>
                  <Text style={styles.testBtnText}>🧪 Test</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
                  <Text style={styles.disconnectBtnText}>Disconnect</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={[styles.connectBtn, !serverReachable && { backgroundColor: '#ef4444' }]} onPress={handleRefreshStatus}>
                <Text style={styles.connectBtnText}>
                  {serverReachable ? '🔄 Check Status' : '🔴 Retry Connection'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Stats ── */}
        <View style={styles.statsRow}>
          <StatCard title="Sent" value={stats.totalSent} color="#22c55e" onPress={handleViewQueue} />
          <StatCard title="Pending" value={stats.pendingMessages} color="#f59e0b" onPress={handleViewQueue} />
          <StatCard title="Failed" value={stats.failedMessages} color="#ef4444" onPress={handleViewQueue} />
        </View>

        {/* ── Quick Actions ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⚡ Quick Actions</Text>
          <View style={styles.actionGrid}>
            <TouchableOpacity
              style={[styles.actionItem, !connected && styles.actionDisabled]}
              onPress={handleRefreshStatus}
            >
              <Text style={styles.actionIcon}>🔄</Text>
              <Text style={styles.actionLabel}>Refresh Status</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionItem, !connected && styles.actionDisabled]}
              onPress={() => setShowTestModal(true)}
            >
              <Text style={styles.actionIcon}>🧪</Text>
              <Text style={styles.actionLabel}>Test Message</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionItem, !connected && styles.actionDisabled]}
              onPress={() => Alert.alert(
                '📋 Auto Alert Settings',
                'Automated attendance alerts are already active.\n\nAbsent notifications are sent to parents when you mark a student as absent in the Attendance screen.\n\nFee reminders can be enabled from the settings below.'
              )}
            >
              <Text style={styles.actionIcon}>📋</Text>
              <Text style={styles.actionLabel}>Auto Alert</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionItem}
              onPress={handleViewQueue}
            >
              <Text style={styles.actionIcon}>📊</Text>
              <Text style={styles.actionLabel}>View Queue</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Broadcast ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📢 Send Broadcast</Text>
          <Text style={styles.sectionSubtitle}>
            Send WhatsApp message to students/parents in a batch
          </Text>

          {/* Batch selector */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.batchRow}
          >
            <TouchableOpacity
              style={[styles.batchChip, selectedBatch === 'all' && styles.batchChipActive]}
              onPress={() => setSelectedBatch('all')}
            >
              <Text style={[styles.batchChipText, selectedBatch === 'all' && styles.batchChipTextActive]}>
                🌐 All Batches
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
            {batches.length === 0 && (
              <Text style={styles.batchEmptyText}>No batches found</Text>
            )}
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

          {/* Character count */}
          <Text style={styles.charCount}>{broadcastMessage.length}/1000</Text>

          {/* Send button */}
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!broadcastMessage.trim() || sending) && styles.sendButtonDisabled,
            ]}
            onPress={handleBroadcast}
            disabled={!broadcastMessage.trim() || sending}
          >
            {sending ? (
              <View style={styles.sendingRow}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.sendButtonText}>
                  {sendTotal > 0
                    ? ` Sending... (${sendTotal} messages)`
                    : ' Sending...'}
                </Text>
              </View>
            ) : (
              <Text style={styles.sendButtonText}>
                📤 Send Broadcast
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Features ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📋 Available Features</Text>
          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <Text style={styles.featureIcon}>📋</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>Absent Notifications</Text>
                <Text style={styles.featureDesc}>Auto-sent to parents when student is marked absent</Text>
              </View>
              <StatusBadge variant="success">Active</StatusBadge>
            </View>
            <View style={styles.featureItem}>
              <Text style={styles.featureIcon}>💰</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>Fee Reminders</Text>
                <Text style={styles.featureDesc}>Send payment reminders before due dates</Text>
              </View>
              <StatusBadge variant="warning">Manual</StatusBadge>
            </View>
            <View style={styles.featureItem}>
              <Text style={styles.featureIcon}>📢</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>Broadcast</Text>
                <Text style={styles.featureDesc}>Send announcements to selected batches</Text>
              </View>
              <StatusBadge variant="success">Active</StatusBadge>
            </View>
            <View style={styles.featureItem}>
              <Text style={styles.featureIcon}>📝</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>Marks Alerts</Text>
                <Text style={styles.featureDesc}>Notify parents when marks are published</Text>
              </View>
              <StatusBadge variant="info">Coming</StatusBadge>
            </View>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Server URL Config Modal ── */}
      <Modal visible={showUrlConfig} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.urlModal}>
            <Text style={styles.modalTitle}>⚙️ Server Configuration</Text>
            <Text style={styles.urlLabel}>WhatsApp Server URL</Text>
            <TextInput
              style={styles.urlInput}
              placeholder="http://192.168.1.100:3001"
              placeholderTextColor="#9ca3af"
              value={serverUrlInput}
              onChangeText={setServerUrlInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.urlHint}>
              Enter the URL where your WhatsApp Baileys server is running.{'\n'}
              For local development: http://localhost:3001{'\n'}
              For a network server: http://YOUR_IP:3001
            </Text>
            <View style={styles.urlActions}>
              <TouchableOpacity style={styles.urlCancelBtn} onPress={() => setShowUrlConfig(false)}>
                <Text style={styles.urlCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.urlResetBtn} onPress={handleResetServerUrl}>
                <Text style={styles.urlResetText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.urlSaveBtn} onPress={handleSaveServerUrl}>
                <Text style={styles.urlSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Info Modal ── */}
      <Modal visible={showInfo} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.infoModal}>
            <Text style={styles.infoTitle}>🔗 WhatsApp Connection</Text>
            <Text style={styles.infoText}>
              WhatsApp connection is managed via the WebApp.{'\n\n'}
              The WebApp handles QR scanning and session management.{'\n'}
              Both the WebApp and Mobile App share the same connection.{'\n\n'}
              Setup steps:{'\n'}
              1. Start your WhatsApp Baileys server{'\n'}
              2. Configure the server URL below (⚙️){'\n'}
              3. Open the WebApp and scan the QR code there{'\n'}
              4. Mobile app auto-detects the connection{'\n\n'}
              Current server URL:{'\n'}
              📡 {serverUrl || 'https://smsprov1-production.up.railway.app'}{'\n\n'}
              The server URL can be:{'\n'}
              • https://smsprov1-production.up.railway.app (production){'\n'}
              • http://localhost:3001 (local dev){'\n'}
              • http://YOUR_IP:3001 (network)
            </Text>
            <TouchableOpacity
              style={styles.infoBtn}
              onPress={() => setShowInfo(false)}
            >
              <Text style={styles.infoBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Test Message Modal ── */}
      <Modal visible={showTestModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.testModal}>
            <Text style={styles.modalTitle}>🧪 Test Message</Text>
            <Text style={styles.urlLabel}>Phone Number (with country code)</Text>
            <TextInput
              style={styles.urlInput}
              placeholder="919876543210"
              placeholderTextColor="#9ca3af"
              value={testPhone}
              onChangeText={setTestPhone}
              keyboardType="phone-pad"
            />
            <Text style={styles.urlLabel}>Message (optional)</Text>
            <TextInput
              style={[styles.urlInput, { minHeight: 60, textAlignVertical: 'top' }]}
              placeholder="This is a test message from Apex SMS"
              placeholderTextColor="#9ca3af"
              value={testMsg}
              onChangeText={setTestMsg}
              multiline
            />
            <View style={styles.urlActions}>
              <TouchableOpacity style={styles.urlCancelBtn} onPress={() => setShowTestModal(false)}>
                <Text style={styles.urlCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.urlSaveBtn, connecting && { opacity: 0.5 }]}
                onPress={handleSendTest}
                disabled={connecting}
              >
                {connecting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.urlSaveText}>Send</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Message Queue Modal ── */}
      <Modal visible={showQueue} transparent animationType="slide">
        <View style={styles.queueOverlay}>
          <View style={styles.queueModal}>
            <View style={styles.queueHeader}>
              <Text style={styles.queueTitle}>📊 Message Queue</Text>
              <TouchableOpacity onPress={() => setShowQueue(false)}>
                <Text style={styles.queueClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Queue action buttons */}
            <View style={styles.queueActions}>
              <TouchableOpacity style={styles.queueActionBtn} onPress={handleViewQueue}>
                <Text style={styles.queueActionText}>🔄 Refresh</Text>
              </TouchableOpacity>
              {stats.failedMessages > 0 && (
                <TouchableOpacity style={styles.queueRetryBtn} onPress={handleRetryFailed}>
                  <Text style={styles.queueRetryText}>🔄 Retry Failed ({stats.failedMessages})</Text>
                </TouchableOpacity>
              )}
            </View>

            {queueLoading ? (
              <View style={styles.queueLoadingContainer}>
                <ActivityIndicator size="large" color="#6366f1" />
              </View>
            ) : queueItems.length === 0 ? (
              <View style={styles.queueEmptyContainer}>
                <Text style={styles.queueEmptyIcon}>📭</Text>
                <Text style={styles.queueEmptyText}>No messages in queue</Text>
              </View>
            ) : (
              <ScrollView style={styles.queueList}>                  {queueItems.map((item: any) => (
                  <View key={item.id} style={styles.queueItem}>
                    <View style={styles.queueItemHeader}>
                      <Text style={styles.queueItemName} numberOfLines={1}>
                        {item.recipient_name || item.recipient}
                      </Text>
                      <StatusBadge
                        variant={
                          item.status === 'sent'
                            ? 'success'
                            : item.status === 'pending'
                              ? 'warning'
                              : 'danger'
                        }
                      >
                        {item.status}
                      </StatusBadge>
                    </View>
                    <Text style={styles.queueItemMsg} numberOfLines={2}>
                      {item.message}
                    </Text>
                    <Text style={styles.queueItemDate}>
                      {new Date(item.created_at).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                    {item.error_message && (
                      <Text style={styles.queueItemError}>❌ {item.error_message}</Text>
                    )}
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────

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
    padding: 20,
    marginBottom: 16,
  },
  connectedCard: { backgroundColor: '#f0fdf4' },
  disconnectedCard: { backgroundColor: '#fef2f2' },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  statusIcon: { fontSize: 36, marginBottom: 8 },
  statusTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 4 },
  statusText: { fontSize: 13, color: '#6b7280', lineHeight: 18, marginBottom: 8 },
  errorText: { fontSize: 12, color: '#ef4444', marginBottom: 8, fontWeight: '500' },
  serverUrlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  serverDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  serverDotSmall: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  serverUrlLabel: { fontSize: 11, color: '#6b7280', flex: 1, fontFamily: 'monospace' },
  serverUrlEdit: { fontSize: 12, color: '#6366f1', fontWeight: '600', marginLeft: 8 },
  statusActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  statusBtn: {
    backgroundColor: '#e5e7eb',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  statusBtnText: { color: '#374151', fontWeight: '600', fontSize: 13 },
  testBtn: {
    backgroundColor: '#dbeafe',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  testBtnText: { color: '#2563eb', fontWeight: '600', fontSize: 13 },
  connectBtn: {
    backgroundColor: '#22c55e',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  connectBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  qrBtn: {
    backgroundColor: '#6366f1',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  qrBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  disconnectBtn: {
    backgroundColor: '#fee2e2',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  disconnectBtnText: { color: '#ef4444', fontWeight: '600', fontSize: 13 },
  infoIconBtn: { padding: 4 },
  infoIconText: { fontSize: 20 },

  // ── Stats ──
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },

  // ── Sections ──
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 4 },
  sectionSubtitle: { fontSize: 13, color: '#6b7280', marginBottom: 12 },

  // ── Actions ──
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionItem: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  actionDisabled: { opacity: 0.5 },
  actionIcon: { fontSize: 28, marginBottom: 8 },
  actionLabel: { fontSize: 12, fontWeight: '600', color: '#374151', textAlign: 'center' },

  // ── Batches ──
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
  batchChipActive: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  batchChipText: { fontSize: 13, color: '#374151' },
  batchChipTextActive: { color: '#fff' },
  batchEmptyText: { fontSize: 13, color: '#9ca3af', fontStyle: 'italic' },

  // ── Broadcast ──
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
    backgroundColor: '#22c55e',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sendButtonDisabled: { backgroundColor: '#9ca3af' },
  sendButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  sendingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  // ── Features ──
  featureList: { gap: 8 },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    gap: 12,
  },
  featureIcon: { fontSize: 24 },
  featureTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  featureDesc: { fontSize: 11, color: '#6b7280', marginTop: 2 },

  // ── Modals ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },

  // URL Modal
  urlModal: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 380,
  },
  urlLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
    marginTop: 4,
  },
  urlInput: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  urlHint: {
    fontSize: 11,
    color: '#9ca3af',
    lineHeight: 16,
    marginBottom: 16,
  },
  urlActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  urlCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
  },
  urlCancelText: { color: '#6b7280', fontWeight: '600', fontSize: 14 },
  urlResetBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: '#feebc8',
  },
  urlResetText: { color: '#c05621', fontWeight: '600', fontSize: 14 },
  urlSaveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
  },
  urlSaveText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  // Info Modal
  infoModal: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 32,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  infoTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 8 },
  infoText: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  infoBtn: { paddingVertical: 10, paddingHorizontal: 32 },
  infoBtnText: { color: '#6366f1', fontWeight: '600', fontSize: 15 },

  // Test Modal
  testModal: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 380,
  },

  // Queue Modal
  queueOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  queueModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  queueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  queueTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  queueClose: { fontSize: 20, color: '#6b7280', padding: 4 },
  queueActions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  queueActionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
  },
  queueActionText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  queueRetryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
  },
  queueRetryText: { fontSize: 13, fontWeight: '600', color: '#ef4444' },
  queueLoadingContainer: { paddingVertical: 40, alignItems: 'center' },
  queueEmptyContainer: { paddingVertical: 40, alignItems: 'center' },
  queueEmptyIcon: { fontSize: 40, marginBottom: 8 },
  queueEmptyText: { fontSize: 14, color: '#9ca3af' },
  queueList: { maxHeight: 400 },
  queueItem: {
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  queueItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  queueItemName: { fontSize: 14, fontWeight: '600', color: '#111827', flex: 1, marginRight: 8 },
  queueItemMsg: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  queueItemDate: { fontSize: 10, color: '#9ca3af' },
  queueItemError: { fontSize: 11, color: '#ef4444', marginTop: 4 },

  // Modal titles
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
});
