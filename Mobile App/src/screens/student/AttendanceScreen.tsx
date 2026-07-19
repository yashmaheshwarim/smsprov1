import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth, StudentUser } from '../../contexts/AuthContext';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';

export default function StudentAttendanceScreen() {
  const { user } = useAuth();
  const student = user as StudentUser;

  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAttendance();
  }, []);

  const fetchAttendance = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('attendance')
        .select('date, status')
        .eq('student_id', student.id)
        .order('date', { ascending: false })
        .limit(50);

      if (data && data.length > 0) {
        setRecords(data);
      } else {
        setRecords([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const present = records.filter((r) => r.status === 'present' || r.status === 'late').length;
  const absent = records.filter((r) => r.status === 'absent').length;
  const rate = records.length > 0 ? ((present / records.length) * 100).toFixed(1) : '0';

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.statsRow}>
        <StatCard title="Rate" value={`${rate}%`} color="#22c55e" />
        <StatCard title="Present" value={present} color="#3b82f6" />
        <StatCard title="Absent" value={absent} color="#ef4444" />
      </View>

      {/* Progress bar */}
      <View style={[styles.progressBar, { marginBottom: 4 }]}>
        <View style={{
          height: '100%',
          width: `${Math.min(Number(rate), 100)}%`,
          backgroundColor: Number(rate) >= 75 ? '#22c55e' : '#ef4444',
          borderRadius: 6,
        }} />
      </View>
      <Text style={styles.progressLabel}>Minimum required: 75%</Text>

      {/* Records */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Attendance History</Text>
        {records.map((r, i) => (
          <View key={i} style={styles.recordItem}>
            <View style={styles.dotContainer}>
              <View style={[
                styles.dot,
                { backgroundColor: r.status === 'present' ? '#22c55e' : r.status === 'late' ? '#f59e0b' : '#ef4444' }
              ]} />
              <Text style={styles.dateText}>
                {new Date(r.date).toLocaleDateString('en-IN', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </Text>
            </View>
            <StatusBadge variant={r.status === 'present' ? 'success' : r.status === 'late' ? 'warning' : 'danger'}>
              {r.status}
            </StatusBadge>
          </View>
        ))}
        {records.length === 0 && (
          <Text style={styles.emptyText}>No attendance records found</Text>
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  progressBar: {
    height: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressLabel: { fontSize: 12, color: '#6b7280', marginBottom: 20 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 12 },
  recordItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 6,
  },
  dotContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dateText: { fontSize: 14, color: '#374151' },
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', paddingVertical: 20 },
});
