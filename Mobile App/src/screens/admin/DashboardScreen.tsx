import React, { useState, useEffect, useCallback, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase, isUuid } from '../../lib/supabase';
import { useAuth, AdminUser } from '../../contexts/AuthContext';
import StatCard from '../../components/StatCard';
import NotificationBell from '../../components/NotificationBell';
import { formatCurrency } from '../../lib/utils';
import { getCached, invalidateCachePrefix, CacheKeys, TTL } from '../../lib/data-cache';
import AdBanner from '../../components/AdBanner';

// ─── Realtime subscription key ───────────────────────────────────────────────
const CHANNEL = 'dashboard-realtime';

// ─── Quick Action Card (memoized) ────────────────────────────────────────────
const QuickAction = memo(({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) => (
  <TouchableOpacity style={styles.actionItem} onPress={onPress} activeOpacity={0.7}>
    <View style={styles.actionIconWrap}>
      <Text style={styles.actionIcon}>{icon}</Text>
    </View>
    <Text style={styles.actionLabel}>{label}</Text>
  </TouchableOpacity>
));

// ─── Recent Student Row (memoized) ──────────────────────────────────────────
const StudentRow = memo(({ name, enrollment, batch, onPress }: {
  name: string; enrollment: string; batch: string; onPress: () => void;
}) => (
  <TouchableOpacity style={styles.studentItem} onPress={onPress} activeOpacity={0.7}>
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>
        {name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
      </Text>
    </View>
    <View style={styles.studentInfo}>
      <Text style={styles.studentName}>{name}</Text>
      <Text style={styles.studentEnroll}>{enrollment}</Text>
    </View>
    <Text style={styles.studentBatch}>{batch}</Text>
  </TouchableOpacity>
));

// ─── Leave Row (memoized) ───────────────────────────────────────────────────
const LeaveRow = memo(({ teacherName, type }: { teacherName: string; type: string }) => (
  <View style={styles.leaveItem}>
    <View style={styles.leaveDot} />
    <View style={{ flex: 1 }}>
      <Text style={styles.leaveTeacher}>{teacherName}</Text>
      <Text style={styles.leaveType}>{type}</Text>
    </View>
    <View style={styles.leaveBadge}>
      <Text style={styles.leaveBadgeText}>Pending</Text>
    </View>
  </View>
));

// ─── Quick Actions config (stable, outside component to preserve memo) ────────
const QUICK_ACTIONS = [
  { icon: '👨‍🎓', label: 'Students', screen: 'Students' },
  { icon: '📋', label: 'Attendance', screen: 'Attendance' },
  { icon: '💰', label: 'Fees', screen: 'Fees' },
  { icon: '📚', label: 'Batches', screen: 'Batches' },
  { icon: '📝', label: 'Marks', screen: 'Marks' },
  { icon: '📥', label: 'Admissions', screen: 'Admissions' },
  { icon: '👨‍🏫', label: 'Teachers', screen: 'Teachers' },
  { icon: '💬', label: 'WhatsApp', screen: 'WhatsApp' },
  { icon: '📅', label: 'Calendar', screen: 'Calendar' },
  { icon: '⚙️', label: 'Settings', screen: 'Settings' },
];

// ─── Skeleton Loader ─────────────────────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <View style={styles.container}>
      {[1, 2].map((row) => (
        <View key={row} style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          {[1, 2].map((i) => (
            <View key={i} style={[styles.skeletonCard]} />
          ))}
        </View>
      ))}
    </View>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const adminUser = user as AdminUser;
  const instId = adminUser?.instituteId || '';

  const [stats, setStats] = useState({
    totalStudents: 0,
    totalRevenue: 0,
    attendanceRate: 0,
    newAdmissions: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recentStudents, setRecentStudents] = useState<any[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<any[]>([]);

  // ── Fetch all dashboard data ──────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!isUuid(instId)) {
      setLoading(false);
      return;
    }
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      // Use cache for slower queries, keep attendance fresh
      const studentCountRes = await getCached<any>(CacheKeys.studentCount(instId),
        () => supabase.from('students').select('*', { count: 'exact', head: true }).eq('institute_id', instId),
        120_000
      );
      const inquiryCountRes = await getCached<any>(`inquiries:count:${instId}`,
        () => supabase.from('inquiries').select('*', { count: 'exact', head: true }).eq('institute_id', instId),
        120_000
      );
      const recentS = await getCached<any>(CacheKeys.students(instId) + ':recent',
        () => supabase.from('students').select('id, name, enrollment_no, batch_name').eq('institute_id', instId).order('created_at', { ascending: false }).limit(5),
        30_000
      );
      const invoicesRes = await getCached<any>(CacheKeys.invoices(instId),
        () => supabase.from('invoices').select('amount, paid_amount').eq('institute_id', instId),
        60_000
      );
      const leavesRes = await getCached<any>(CacheKeys.leaves(instId),
        () => supabase.from('leave_requests').select('id, teacher_name, type, status').eq('institute_id', instId).eq('status', 'pending'),
        30_000
      );
      const attRes = await getCached<any>(CacheKeys.attendance(instId, todayStr),
        () => supabase.from('attendance').select('status').eq('institute_id', instId).eq('date', todayStr),
        TTL.SHORT
      );

      const studentCount = studentCountRes?.count || 0;
      const inquiryCount = inquiryCountRes?.count || 0;
      const invoicesData = invoicesRes?.data || [];
      const recentData = recentS?.data || [];
      const leavesData = leavesRes?.data || [];
      const attendanceData = attRes?.data || [];

      const totalRev = invoicesData.reduce((a: number, i: any) => a + (i.paid_amount || 0), 0);

      // Calculate today's attendance rate
      const totalToday = attendanceData?.length || 0;
      const presentToday = attendanceData?.filter((a: any) => a.status === 'present' || a.status === 'late').length || 0;
      const attRate = totalToday > 0 ? Math.round((presentToday / totalToday) * 100) : 0;

      setStats({
        totalStudents: studentCount,
        totalRevenue: totalRev,
        attendanceRate: attRate,
        newAdmissions: inquiryCount,
      });

      setRecentStudents(
        recentData.map((s: any) => ({
          id: s.id,
          name: s.name,
          enrollmentNo: s.enrollment_no,
          batch: s.batch_name,
        }))
      );
      setPendingLeaves(leavesData);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [instId]);

  // ── Notification count (admin overview) ──────────────────────────────
  const [notifCount, setNotifCount] = useState(0);

  useEffect(() => {
    if (!isUuid(instId)) return;

    const fetchNotifCount = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('institute_id', instId);
      setNotifCount(count ?? 0);
    };

    fetchNotifCount();

    // Subscribe to realtime INSERTs on notifications for this institute
    const channel = supabase
      .channel('admin-notif-bell')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `institute_id=eq.${instId}`,
        },
        () => {
          setNotifCount((prev) => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [instId]);

  // ── Realtime subscription (dashboard data) ───────────────────────────
  useEffect(() => {
    fetchData();

    const channel = supabase.channel(CHANNEL)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'students', filter: `institute_id=eq.${instId}` },
        () => { invalidateCachePrefix(`students:${instId}`); fetchData(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance', filter: `institute_id=eq.${instId}` },
        () => { invalidateCachePrefix(`attendance:${instId}`); fetchData(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invoices', filter: `institute_id=eq.${instId}` },
        () => { invalidateCachePrefix(`invoices:${instId}`); fetchData(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [instId, fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  // ── Navigation helpers ─────────────────────────────────────────────────
  const navigateTo = useCallback((screen: string) => {
    try { navigation.navigate(screen); } catch { /* drawer doesn't have this screen */ }
  }, [navigation]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
      showsVerticalScrollIndicator={false}
    >
      {/* Welcome Header */}
      <View style={styles.welcomeCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.welcomeGreeting}>Good {getGreeting()} 👋</Text>
          <Text style={styles.welcomeName}>{adminUser?.instituteName || 'Institute'}</Text>
        </View>
        <View style={styles.welcomeRight}>
          <NotificationBell
            count={notifCount}
            onPress={() => navigateTo('Announcements')}
            size={26}
            badgeColor="#ef4444"
          />
          <View style={styles.welcomeAvatar}>
            <Text style={styles.welcomeAvatarText}>
              {adminUser?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
            </Text>
          </View>
        </View>
      </View>

      {/* Stats Cards — Tappable */}
      <View style={styles.statsGrid}>
        <View style={{ width: '48%' }}>
          <StatCard
            title="Total Students"
            value={stats.totalStudents.toLocaleString()}
            icon="👨‍🎓"
            color="#6366f1"
            onPress={() => navigateTo('Students')}
          />
        </View>
        <View style={{ width: '48%' }}>
          <StatCard
            title="Revenue"
            value={formatCurrency(stats.totalRevenue)}
            icon="💰"
            color="#22c55e"
            onPress={() => navigateTo('Fees')}
          />
        </View>
        <View style={{ width: '48%' }}>
          <StatCard
            title="Attendance"
            value={stats.attendanceRate > 0 ? `${stats.attendanceRate}%` : '—'}
            icon="📋"
            color="#f59e0b"
            onPress={() => navigateTo('Attendance')}
          />
        </View>
        <View style={{ width: '48%' }}>
          <StatCard
            title="Inquiries"
            value={stats.newAdmissions}
            icon="📥"
            color="#ec4899"
            onPress={() => navigateTo('Admissions')}
          />
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>⚡ Quick Actions</Text>
        </View>
        <View style={styles.actionsGrid}>
          {QUICK_ACTIONS.map((action) => (
            <QuickAction
              key={action.label}
              icon={action.icon}
              label={action.label}
              onPress={() => navigateTo(action.screen)}
            />
          ))}
        </View>
      </View>

      {/* Today Overview */}
      {stats.attendanceRate > 0 && (
        <View style={styles.todayCard}>
          <View style={styles.todayRow}>
            <Text style={styles.todayLabel}>Today's Attendance</Text>
            <Text style={[
              styles.todayValue,
              { color: stats.attendanceRate >= 75 ? '#22c55e' : '#ef4444' }
            ]}>
              {stats.attendanceRate}%
            </Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, {
              width: `${Math.min(stats.attendanceRate, 100)}%`,
              backgroundColor: stats.attendanceRate >= 75 ? '#22c55e' : '#ef4444'
            }]} />
          </View>
        </View>
      )}

      {/* Recent Students */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>👨‍🎓 Recent Students</Text>
          <TouchableOpacity onPress={() => navigateTo('Students')}>
            <Text style={styles.viewAll}>View All →</Text>
          </TouchableOpacity>
        </View>
        {recentStudents.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>No students yet</Text>
          </View>
        ) : (
          recentStudents.map((s) => (
            <StudentRow
              key={s.id}
              name={s.name}
              enrollment={s.enrollmentNo}
              batch={s.batch}
              onPress={() => navigateTo('Students')}
            />
          ))
        )}
      </View>

      {/* ─── Ad Banner ─── */}
      <AdBanner size="banner" />

      {/* Pending Leaves */}
      {pendingLeaves.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>📋 Pending Leaves ({pendingLeaves.length})</Text>
          </View>
          {pendingLeaves.slice(0, 3).map((leave: any) => (
            <LeaveRow key={leave.id} teacherName={leave.teacher_name} type={leave.type} />
          ))}
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  welcomeCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#6366f1',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  welcomeGreeting: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginBottom: 4 },
  welcomeName: { fontSize: 22, fontWeight: '700', color: '#fff' },
  welcomeRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  welcomeAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  welcomeAvatarText: { fontSize: 20, fontWeight: '700', color: '#fff' },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  viewAll: { fontSize: 13, color: '#6366f1', fontWeight: '600' },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionItem: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    width: '30%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  actionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionIcon: { fontSize: 20 },
  actionLabel: { fontSize: 11, fontWeight: '600', color: '#374151', textAlign: 'center' },
  todayCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  todayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  todayLabel: { fontSize: 14, color: '#374151', fontWeight: '500' },
  todayValue: { fontSize: 20, fontWeight: '700' },
  progressBar: {
    height: 10,
    backgroundColor: '#f3f4f6',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 5 },
  studentItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: { fontSize: 12, fontWeight: '700', color: '#6366f1' },
  studentInfo: { flex: 1 },
  studentName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  studentEnroll: { fontSize: 12, color: '#6b7280' },
  studentBatch: { fontSize: 11, color: '#9ca3af' },
  emptyState: { alignItems: 'center', paddingVertical: 20 },
  emptyIcon: { fontSize: 36, marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#9ca3af' },
  leaveItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    padding: 14,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#fef3c7',
  },
  leaveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f59e0b',
    marginRight: 12,
  },
  leaveTeacher: { fontSize: 14, fontWeight: '600', color: '#92400e' },
  leaveType: { fontSize: 12, color: '#b45309', marginTop: 2, textTransform: 'capitalize' },
  leaveBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  leaveBadgeText: { fontSize: 10, color: '#92400e', fontWeight: '600' },
  skeletonCard: {
    flex: 1,
    height: 80,
    backgroundColor: '#e5e7eb',
    borderRadius: 12,
    opacity: 0.3,
  },
});
