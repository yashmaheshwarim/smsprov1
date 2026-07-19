import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth, ParentUser } from '../../contexts/AuthContext';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';
import NotificationBell from '../../components/NotificationBell';
import { getCached, TTL } from '../../lib/data-cache';
import AdBanner from '../../components/AdBanner';

export default function ParentDashboard() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const parent = user as ParentUser;

  const [loading, setLoading] = useState(true);
  const [child, setChild] = useState<any>(null);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [feesData, setFeesData] = useState({ total: 0, paid: 0 });
  const [marksData, setMarksData] = useState<any[]>([]);
  const [childInstId, setChildInstId] = useState<string>('');

  const childId = parent.childrenIds?.[0];

  useEffect(() => {
    if (childId) fetchData();
    else setLoading(false);
  }, [childId]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const cacheKey = `parent:${childId}`;

      // All 4 queries in parallel with caching
      const [childRes, attRes, sfRes, mkRes] = await Promise.all([
        getCached<any>(`${cacheKey}:info`,
          () => supabase.from('students').select('name, enrollment_no, batch_name, institute_id').eq('id', childId).single(),
          TTL.DEFAULT
        ),
        getCached<any>(`${cacheKey}:att`,
          () => supabase.from('attendance').select('date, status').eq('student_id', childId).order('date', { ascending: false }).limit(10),
          TTL.SHORT
        ),
        getCached<any>(`${cacheKey}:fees`,
          () => supabase.from('student_fees').select('paid_fees, final_fee').eq('student_id', childId),
          TTL.DEFAULT
        ),
        getCached<any>(`${cacheKey}:marks`,
          () => supabase.from('marks').select('exam_name, subject, marks_obtained, total_marks').eq('student_id', childId).order('created_at', { ascending: false }).limit(5),
          TTL.DEFAULT
        ),
      ]);

      const studentData = childRes?.data || null;
      const attData = attRes?.data || [];
      const sfData = sfRes?.data || [];
      const mkData = mkRes?.data || [];

      setChild(studentData);
      if (studentData?.institute_id) setChildInstId(studentData.institute_id);
      setAttendance(attData);

      if (sfData.length > 0) {
        const total = sfData.reduce((a: number, f: any) => a + (f.final_fee || 0), 0);
        const paid = sfData.reduce((a: number, f: any) => a + (f.paid_fees || 0), 0);
        setFeesData({ total, paid });
      }

      setMarksData(mkData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [childId]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (!child) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>No child data found</Text>
      </View>
    );
  }

  const presentCount = useMemo(
    () => attendance.filter((a: any) => a.status === 'present' || a.status === 'late').length,
    [attendance]
  );
  const attRate = useMemo(
    () => attendance.length > 0 ? ((presentCount / attendance.length) * 100).toFixed(0) : 'N/A',
    [presentCount, attendance.length]
  );

  const avgPct = useMemo(
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

  return (
    <ScrollView style={styles.container}>
      {/* Child Profile */}
      <View style={styles.childCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {child.name?.split(' ').map((n: string) => n[0]).join('')}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.childName}>{child.name}</Text>
          <Text style={styles.childEnroll}>🎓 {child.enrollment_no}</Text>
          <Text style={styles.childBatch}>📚 {child.batch_name}</Text>
        </View>
        <NotificationBell
          onPress={() => navigation.navigate('Attendance')}
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
          <StatCard title="Avg Score" value={`${avgPct}%`} color="#f59e0b" />
        </View>
      </View>

      {/* Recent Attendance */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Attendance</Text>
        {attendance.slice(0, 5).map((a: any, i: number) => (
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
        {attendance.length === 0 && (
          <Text style={styles.emptyText}>No records yet</Text>
        )}
      </View>

      {/* ─── Ad Banner ─── */}
      <AdBanner size="banner" />

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  childCard: {
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
  childName: { fontSize: 18, fontWeight: '700', color: '#111827' },
  childEnroll: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  childBatch: { fontSize: 13, color: '#6b7280', marginTop: 2 },
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
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', paddingVertical: 20 },
});
