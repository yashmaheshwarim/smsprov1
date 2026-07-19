import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth, TeacherUser } from '../../contexts/AuthContext';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';
import NotificationBell from '../../components/NotificationBell';
import { getCached, TTL } from '../../lib/data-cache';
import { useNotification } from '../../contexts/NotificationContext';
import AdBanner from '../../components/AdBanner';

export default function TeacherDashboard() {
  const navigation = useNavigation<any>();
  const { user, logout } = useAuth();
  const teacher = user as TeacherUser;
  const todayStr = new Date().toISOString().split('T')[0];

  const { latestNotification } = useNotification();
  const lastNotifId = useRef<string | null>(null);

  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    totalStudents: 0,
    presentToday: 0,
    absentToday: 0,
    leaveToday: 0,
    marksSubmitted: 0,
  });

  const fetchData = useCallback(async () => {
    try {
      const assignedClasses = teacher.assignedClasses || [];
      if (assignedClasses.length === 0) {
        setBatches([]);
        setStats({ totalStudents: 0, presentToday: 0, absentToday: 0, leaveToday: 0, marksSubmitted: 0 });
        setLoading(false);
        return;
      }

      const instId = teacher.instituteId;

      // Single batch query instead of per-batch loops
      const studentsRes = await getCached<any>(
        `teacher:students:${instId}:${assignedClasses.join(',')}`,
        () => supabase
          .from('students')
          .select('id, name, enrollment_no, batch_name')
          .eq('institute_id', instId)
          .eq('status', 'active')
          .in('batch_name', assignedClasses)
          .order('name'),
        TTL.DEFAULT
      );

      const allStudents = studentsRes?.data || [];
      const studentIds = allStudents.map((s: any) => s.id);

      // Fetch today's attendance for ALL students in one query
      const attRes = await getCached<any>(
        `teacher:att:${instId}:${todayStr}:${assignedClasses.join(',')}`,
        () => supabase
          .from('attendance')
          .select('student_id, status')
          .eq('date', todayStr)
          .in('student_id', studentIds.length > 0 ? studentIds : ['none']),
        TTL.SHORT
      );

      const todayAtt = attRes?.data || [];

      // Group by batch
      const batchMap: Record<string, any> = {};
      for (const batchName of assignedClasses) {
        batchMap[batchName] = {
          batchName,
          students: [] as any[],
          studentCount: 0,
          attendanceMarked: false,
          presentCount: 0,
          absentCount: 0,
          leaveCount: 0,
        };
      }

      for (const s of allStudents) {
        if (batchMap[s.batch_name]) {
          batchMap[s.batch_name].students.push(s);
          batchMap[s.batch_name].studentCount++;
        }
      }

      // Count attendance per batch
      const attMap: Record<string, { present: number; absent: number; leave: number }> = {};
      for (const a of todayAtt) {
        if (!attMap[a.student_id]) {
          attMap[a.student_id] = { present: 0, absent: 0, leave: 0 };
        }
        if (a.status === 'present' || a.status === 'late') attMap[a.student_id].present++;
        else if (a.status === 'absent') attMap[a.student_id].absent++;
        else if (a.status === 'leave') attMap[a.student_id].leave++;
      }

      for (const s of allStudents) {
        const bName = s.batch_name;
        if (batchMap[bName]) {
          const sm = attMap[s.id];
          if (sm) {
            batchMap[bName].presentCount += sm.present;
            batchMap[bName].absentCount += sm.absent;
            batchMap[bName].leaveCount += sm.leave;
          }
        }
      }

      for (const b of assignedClasses) {
        if (batchMap[b]) {
          batchMap[b].attendanceMarked = (batchMap[b].presentCount + batchMap[b].absentCount + batchMap[b].leaveCount) > 0;
        }
      }

      const batchResults = assignedClasses.map((b: string) => batchMap[b]).filter(Boolean);
      setBatches(batchResults);

      // Overall stats
      const presentToday = todayAtt.filter((a: any) => a.status === 'present' || a.status === 'late').length;
      const absentToday = todayAtt.filter((a: any) => a.status === 'absent').length;
      const leaveToday = todayAtt.filter((a: any) => a.status === 'leave').length;

      // Count submitted marks (cached)
      const marksRes = await getCached<any>(
        `teacher:marks:${teacher.name}:${instId}`,
        () => supabase
          .from('marks')
          .select('*', { count: 'exact', head: true })
          .eq('institute_id', instId)
          .eq('submitted_by', teacher.name),
        TTL.LONG
      );

      setStats({
        totalStudents: allStudents.length,
        presentToday,
        absentToday,
        leaveToday,
        marksSubmitted: marksRes?.count || 0,
      });
    } catch (err) {
      console.error('[TeacherDashboard] Error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teacher.instituteId, teacher.name, teacher.assignedClasses, todayStr]);

  useEffect(() => {
    fetchData();
  }, []);

  // ── Realtime notification alert ──────────────────────────────────────
  useEffect(() => {
    if (!latestNotification || latestNotification.id === lastNotifId.current) return;
    lastNotifId.current = latestNotification.id;

    Alert.alert(
      `📢 ${latestNotification.title}`,
      `${latestNotification.message}\n\nTap View to read the full notification.`,
      [
        { text: 'Dismiss', style: 'cancel' },
        {
          text: 'View',
          onPress: () => navigation.navigate('Notifications'),
        },
      ]
    );
  }, [latestNotification, navigation]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const totalAttendanceMarked = stats.presentToday + stats.absentToday + stats.leaveToday;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f59e0b" />
        <Text style={styles.loadingText}>Loading your dashboard...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f59e0b" />}
      showsVerticalScrollIndicator={false}
    >
      {/* Welcome Header */}
      <View style={styles.welcomeCard}>
        <View style={styles.welcomeContent}>
          <Text style={styles.welcomeGreeting}>Good {getGreeting()} 👋</Text>
          <Text style={styles.welcomeName}>{teacher.name}</Text>
          <View style={styles.welcomeBadge}>
            <Text style={styles.welcomeBadgeText}>
              👨‍🏫 {teacher.assignedSubjects?.join(', ') || 'Teacher'}
            </Text>
          </View>
        </View>
        <View style={styles.welcomeRight}>
          <NotificationBell
            onPress={() => navigation.navigate('Notifications')}
            size={26}
            badgeColor="#ef4444"
          />
          <View style={styles.welcomeAvatar}>
            <Text style={styles.welcomeAvatarText}>
              {teacher.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
            </Text>
          </View>
        </View>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statCardWrap}>
          <StatCard title="My Batches" value={teacher.assignedClasses?.length || 0} icon="📚" color="#f59e0b" />
        </View>
        <View style={styles.statCardWrap}>
          <StatCard title="Students" value={stats.totalStudents} icon="👨‍🎓" color="#6366f1" />
        </View>
        <View style={styles.statCardWrap}>
          <StatCard title="Present" value={stats.presentToday} icon="✅" color="#22c55e" />
        </View>
        <View style={styles.statCardWrap}>
          <StatCard title="Absent" value={stats.absentToday} icon="❌" color="#ef4444" />
        </View>
      </View>

      {/* Today's Overview */}
      {totalAttendanceMarked > 0 && (
        <View style={styles.todayCard}>
          <View style={styles.todayHeader}>
            <Text style={styles.todayTitle}>📋 Today's Overview</Text>
          </View>
          <View style={styles.todayStats}>
            <View style={styles.todayStat}>
              <Text style={[styles.todayStatValue, { color: '#22c55e' }]}>{stats.presentToday}</Text>
              <Text style={styles.todayStatLabel}>Present</Text>
            </View>
            <View style={styles.todayStat}>
              <Text style={[styles.todayStatValue, { color: '#ef4444' }]}>{stats.absentToday}</Text>
              <Text style={styles.todayStatLabel}>Absent</Text>
            </View>
            <View style={styles.todayStat}>
              <Text style={[styles.todayStatValue, { color: '#f59e0b' }]}>{stats.leaveToday}</Text>
              <Text style={styles.todayStatLabel}>Leave</Text>
            </View>
            <View style={styles.todayStat}>
              <Text style={[styles.todayStatValue, { color: '#6366f1' }]}>{stats.marksSubmitted}</Text>
              <Text style={styles.todayStatLabel}>Marks</Text>
            </View>
          </View>
          <View style={styles.progressBarOuter}>
            <View
              style={[
                styles.progressBarInner,
                {
                  width: (stats.totalStudents > 0
                    ? `${((stats.presentToday / stats.totalStudents) * 100).toFixed(0)}%`
                    : '0%') as any,
                } as any,
              ]}
            />
          </View>
          <Text style={styles.progressLabel}>
            {stats.totalStudents > 0
              ? `${((stats.presentToday / stats.totalStudents) * 100).toFixed(0)}% attendance rate today`
              : 'No attendance marked yet'}
          </Text>
        </View>
      )}

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⚡ Quick Actions</Text>
        <View style={styles.actionGrid}>
          <TouchableOpacity style={styles.actionItem} onPress={() => navigation.navigate('Attendance')}>
            <View style={[styles.actionIconWrap, { backgroundColor: '#fef3c7' }]}>
              <Text style={styles.actionIcon}>📋</Text>
            </View>
            <Text style={styles.actionLabel}>Attendance</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionItem} onPress={() => navigation.navigate('AttendanceReport')}>
            <View style={[styles.actionIconWrap, { backgroundColor: '#fef3c7' }]}>
              <Text style={styles.actionIcon}>📊</Text>
            </View>
            <Text style={styles.actionLabel}>Att. Report</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionItem} onPress={() => navigation.navigate('ExamAttendance')}>
            <View style={[styles.actionIconWrap, { backgroundColor: '#dbeafe' }]}>
              <Text style={styles.actionIcon}>📝</Text>
            </View>
            <Text style={styles.actionLabel}>Exam Att.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionItem} onPress={() => navigation.navigate('Marks')}>
            <View style={[styles.actionIconWrap, { backgroundColor: '#dcfce7' }]}>
              <Text style={styles.actionIcon}>📊</Text>
            </View>
            <Text style={styles.actionLabel}>Enter Marks</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionItem} onPress={() => navigation.navigate('MarksReport')}>
            <View style={[styles.actionIconWrap, { backgroundColor: '#dcfce7' }]}>
              <Text style={styles.actionIcon}>📈</Text>
            </View>
            <Text style={styles.actionLabel}>Marks Report</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionItem} onPress={() => navigation.navigate('Students')}>
            <View style={[styles.actionIconWrap, { backgroundColor: '#fce7f3' }]}>
              <Text style={styles.actionIcon}>👨‍🎓</Text>
            </View>
            <Text style={styles.actionLabel}>Students</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionItem} onPress={() => navigation.navigate('Leaves')}>
            <View style={[styles.actionIconWrap, { backgroundColor: '#fef3c7' }]}>
              <Text style={styles.actionIcon}>📅</Text>
            </View>
            <Text style={styles.actionLabel}>Leave</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Batch-wise Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📚 My Batches ({batches.length})</Text>
        {batches.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>No batches assigned</Text>
            <Text style={styles.emptySubtext}>Contact your admin to get assigned to batches.</Text>
          </View>
        ) : (
          batches.map((batch) => (
            <TouchableOpacity
              key={batch.batchName}
              style={styles.batchCard}
              onPress={() => navigation.navigate('Attendance')}
              activeOpacity={0.7}
            >
              <View style={styles.batchHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.batchName}>{batch.batchName}</Text>
                  <Text style={styles.batchStudents}>🎓 {batch.studentCount} students</Text>
                </View>
                <StatusBadge variant={batch.attendanceMarked ? 'success' : 'warning'}>
                  {batch.attendanceMarked ? '✓ Done' : 'Pending'}
                </StatusBadge>
              </View>
              {batch.attendanceMarked && (
                <View style={styles.batchStats}>
                  <Text style={[styles.batchStatText, { color: '#22c55e' }]}>
                    ✅ {batch.presentCount} Present
                  </Text>
                  <Text style={[styles.batchStatText, { color: '#ef4444' }]}>
                    ❌ {batch.absentCount} Absent
                  </Text>
                  {batch.leaveCount > 0 && (
                    <Text style={[styles.batchStatText, { color: '#f59e0b' }]}>
                      💤 {batch.leaveCount} Leave
                    </Text>
                  )}
                </View>
              )}
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* ─── Ad Banner ─── */}
      <AdBanner size="banner" />

      {/* Logout */}
      <TouchableOpacity style={styles.logoutSection} onPress={handleLogout} activeOpacity={0.7}>
        <View style={styles.logoutContent}>
          <Text style={styles.logoutIcon}>🚪</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.logoutTitle}>Sign Out</Text>
            <Text style={styles.logoutSubtitle}>{teacher.email}</Text>
          </View>
          <Text style={styles.logoutArrow}>›</Text>
        </View>
      </TouchableOpacity>

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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  loadingText: { marginTop: 12, fontSize: 14, color: '#6b7280' },

  // Welcome
  welcomeCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f59e0b',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  welcomeContent: { flex: 1 },
  welcomeGreeting: { fontSize: 14, color: 'rgba(255,255,255,0.85)', marginBottom: 4 },
  welcomeName: { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 6 },
  welcomeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  welcomeBadgeText: { fontSize: 11, color: '#fff', fontWeight: '600' },
  welcomeRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  welcomeAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  welcomeAvatarText: { fontSize: 20, fontWeight: '700', color: '#fff' },

  // Stats
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  statCardWrap: {
    width: '48%' as any,
  },

  // Today Overview
  todayCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  todayHeader: { marginBottom: 12 },
  todayTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  todayStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  todayStat: { alignItems: 'center' },
  todayStatValue: { fontSize: 24, fontWeight: '700' },
  todayStatLabel: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  progressBarOuter: {
    height: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBarInner: { height: '100%', backgroundColor: '#22c55e', borderRadius: 4 },
  progressLabel: { fontSize: 11, color: '#9ca3af', textAlign: 'center' },

  // Sections
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 12 },

  // Quick Actions
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionItem: {
    width: '30%',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
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
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionIcon: { fontSize: 20 },
  actionLabel: { fontSize: 11, fontWeight: '600', color: '#374151', textAlign: 'center' },

  // Batches
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#374151' },
  emptySubtext: { fontSize: 14, color: '#9ca3af', marginTop: 4 },
  batchCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
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
  },
  batchName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  batchStudents: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  batchStats: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  batchStatText: { fontSize: 12, fontWeight: '500' },

  // Logout
  logoutSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  logoutContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoutIcon: { fontSize: 24 },
  logoutTitle: { fontSize: 15, fontWeight: '600', color: '#ef4444' },
  logoutSubtitle: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  logoutArrow: { fontSize: 24, color: '#d1d5db', fontWeight: '300' },
});
