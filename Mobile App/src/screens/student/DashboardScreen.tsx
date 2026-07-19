import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth, StudentUser } from '../../contexts/AuthContext';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';
import NotificationBell from '../../components/NotificationBell';
import { getCached, TTL } from '../../lib/data-cache';
import { useNotification } from '../../contexts/NotificationContext';
import AdBanner from '../../components/AdBanner';

export default function StudentDashboard() {
  const navigation = useNavigation<any>();
  const { user, logout } = useAuth();
  const student = user as StudentUser;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [feesData, setFeesData] = useState({ total: 0, paid: 0 });
  const [marksData, setMarksData] = useState<any[]>([]);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { latestNotification } = useNotification();
  const [studentInstId, setStudentInstId] = useState<string>('');
  const lastNotifId = useRef<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const sid = student.id;
      const cacheKey = `student:${sid}`;

      // All 3 queries in parallel with caching
      const [attRes, sfRes, mkRes] = await Promise.all([
        getCached<any>(`${cacheKey}:att`,
          () => supabase.from('attendance').select('date, status').eq('student_id', sid).order('date', { ascending: false }).limit(10),
          TTL.SHORT
        ),
        getCached<any>(`${cacheKey}:fees`,
          () => supabase.from('student_fees').select('paid_fees, final_fee').eq('student_id', sid),
          TTL.DEFAULT
        ),
        getCached<any>(`${cacheKey}:marks`,
          () => supabase.from('marks').select('exam_name, subject, marks_obtained, total_marks').eq('student_id', sid).order('created_at', { ascending: false }).limit(5),
          TTL.DEFAULT
        ),
      ]);

      const attData = attRes?.data || [];
      const sfData = sfRes?.data || [];
      const mkData = mkRes?.data || [];

      setAttendanceData(attData);

      if (sfData.length > 0) {
        const total = sfData.reduce((a: number, f: any) => a + (f.final_fee || 0), 0);
        const paid = sfData.reduce((a: number, f: any) => a + (f.paid_fees || 0), 0);
        setFeesData({ total, paid });
      } else {
        setFeesData({ total: 0, paid: 0 });
      }

      setMarksData(mkData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [student.id]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const handleLogout = useCallback(() => {
    Alert.alert('Sign Out', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  }, [logout]);

  // ── Resolve student's institute ID ───────────────────────────────────
  useEffect(() => {
    if (!student.id) return;
    supabase
      .from('students')
      .select('institute_id')
      .eq('id', student.id)
      .single()
      .then(({ data }: any) => {
        if (data?.institute_id) {
          setStudentInstId(data.institute_id);
        }
      })
      .catch(() => {
        // Fallback: try via batch name
        if (student.batch) {
          supabase
            .from('batches')
            .select('institute_id')
            .eq('name', student.batch)
            .single()
            .then(({ data: bData }: any) => {
              if (bData?.institute_id) setStudentInstId(bData.institute_id);
            })
            .catch(() => {});
        }
      });
  }, [student.id, student.batch]);

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

  const presentCount = useMemo(
    () => attendanceData.filter((a: any) => a.status === 'present' || a.status === 'late').length,
    [attendanceData]
  );
  const attRate = useMemo(
    () => attendanceData.length > 0 ? ((presentCount / attendanceData.length) * 100).toFixed(0) : 'N/A',
    [presentCount, attendanceData.length]
  );

  const avgPercentage = useMemo(
    () => marksData.length > 0
      ? (
          marksData.reduce(
            (a: number, m: any) => a + (m.total_marks > 0 ? (m.marks_obtained / m.total_marks) * 100 : 0),
            0
          ) / marksData.length
        ).toFixed(0)
      : 'N/A',
    [marksData]
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Welcome */}
      <View style={styles.welcomeCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {student.name
              .split(' ')
              .map((n: string) => n[0])
              .join('')}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.welcomeName}>Welcome, {student.name} 👋</Text>
          <Text style={styles.welcomeEnroll}>🎓 {student.enrollmentNo}</Text>
          <Text style={styles.welcomeBatch}>📚 {student.batch}</Text>
        </View>
        <NotificationBell
          onPress={() => navigation.navigate('Notifications')}
          size={26}
          badgeColor="#ef4444"
        />
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={{ width: '48%' }}>
          <StatCard title="Attendance" value={`${attRate}%`} color="#22c55e" />
        </View>
        <View style={{ width: '48%' }}>
          <StatCard title="Fees Paid" value={`₹${feesData.paid.toLocaleString()}`} color="#6366f1" />
        </View>
        <View style={{ width: '48%' }}>
          <StatCard title="Pending" value={`₹${(feesData.total - feesData.paid).toLocaleString()}`} color="#ef4444" />
        </View>
        <View style={{ width: '48%' }}>
          <StatCard title="Avg Score" value={`${avgPercentage}%`} color="#f59e0b" />
        </View>
      </View>

      {/* Recent Attendance */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Attendance</Text>
        {attendanceData.slice(0, 5).map((a: any, i: number) => (
          <View key={i} style={styles.listItem}>
            <Text style={styles.listText}>
              {new Date(a.date).toLocaleDateString('en-IN', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })}
            </Text>
            <StatusBadge
              variant={
                a.status === 'present'
                  ? 'success'
                  : a.status === 'late'
                    ? 'warning'
                    : 'danger'
              }
            >
              {a.status}
            </StatusBadge>
          </View>
        ))}
        {attendanceData.length === 0 && (
          <Text style={styles.emptyText}>No records yet</Text>
        )}
      </View>

      {/* Recent Marks */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Marks</Text>
        {marksData.map((m: any, i: number) => (
          <View key={i} style={styles.listItem}>
            <View style={{ flex: 1 }}>
              <Text style={styles.listText}>{m.subject}</Text>
              <Text style={styles.listSubtext}>{m.exam_name}</Text>
            </View>
            <StatusBadge variant={m.marks_obtained / m.total_marks >= 0.75 ? 'success' : 'warning'}>
              {m.marks_obtained}/{m.total_marks}
            </StatusBadge>
          </View>
        ))}
        {marksData.length === 0 && (
          <Text style={styles.emptyText}>No marks yet</Text>
        )}
      </View>

      {/* ─── Ad Banner ─── */}
      <AdBanner size="banner" />

      {/* Logout Button */}
      <TouchableOpacity style={styles.logoutSection} onPress={handleLogout} activeOpacity={0.7}>
        <View style={styles.logoutContent}>
          <Text style={styles.logoutIcon}>🚪</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.logoutTitle}>Sign Out</Text>
            <Text style={styles.logoutSubtitle}>{student.email}</Text>
          </View>
          <Text style={styles.logoutArrow}>›</Text>
        </View>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  logoutSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  logoutContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoutIcon: { fontSize: 24 },
  logoutTitle: { fontSize: 15, fontWeight: '600', color: '#ef4444' },
  logoutSubtitle: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  logoutArrow: { fontSize: 24, color: '#d1d5db', fontWeight: '300' },
  welcomeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eef2ff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    gap: 16,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarText: { fontSize: 22, fontWeight: '700', color: '#fff' },
  welcomeName: { fontSize: 18, fontWeight: '700', color: '#111827' },
  welcomeEnroll: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  welcomeBatch: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 12 },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 6,
  },
  listText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  listSubtext: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', paddingVertical: 20 },
});
