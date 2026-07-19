import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth, TeacherUser } from '../../contexts/AuthContext';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';

// ─── Date helpers ──────────────────────────────────────────────────────────
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getWeekRange(): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { from: formatDate(start), to: formatDate(end) };
}

function getMonthRange(): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: formatDate(start), to: formatDate(end) };
}

type RangePreset = 'today' | 'week' | 'month' | 'all';

// ─── Component ─────────────────────────────────────────────────────────────
export default function TeacherAttendanceReport() {
  const { user } = useAuth();
  const teacher = user as TeacherUser;
  const instId = teacher.instituteId;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [batches, setBatches] = useState<string[]>([]);
  const [selectedBatch, setSelectedBatch] = useState('all');

  const [range, setRange] = useState<RangePreset>('week');
  const [dateRange, setDateRange] = useState(() => getWeekRange());

  // Stats
  const [stats, setStats] = useState({
    totalDays: 0,
    totalStudents: 0,
    presentCount: 0,
    absentCount: 0,
    leaveCount: 0,
    attendanceRate: 0,
  });

  // Student-level data
  const [studentRecords, setStudentRecords] = useState<
    { id: string; name: string; enrollment: string; present: number; absent: number; leave: number; total: number }[]
  >([]);

  // ─── Range Presets ──────────────────────────────────────────────────

  const handleRangeChange = (preset: RangePreset) => {
    setRange(preset);
    switch (preset) {
      case 'today': {
        const today = formatDate(new Date());
        setDateRange({ from: today, to: today });
        break;
      }
      case 'week':
        setDateRange(getWeekRange());
        break;
      case 'month':
        setDateRange(getMonthRange());
        break;
      case 'all':
        setDateRange({ from: '2000-01-01', to: '2099-12-31' });
        break;
    }
  };

  // ─── Fetch Data ─────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      const assigned = teacher.assignedClasses || [];
      setBatches(assigned);

      if (assigned.length === 0) {
        setStats({ totalDays: 0, totalStudents: 0, presentCount: 0, absentCount: 0, leaveCount: 0, attendanceRate: 0 });
        setStudentRecords([]);
        return;
      }

      // Fetch students from assigned batches
      let studentQuery = supabase
        .from('students')
        .select('id, name, enrollment_no, batch_name')
        .eq('institute_id', instId)
        .eq('status', 'active')
        .in('batch_name', assigned)
        .order('batch_name')
        .order('name');

      if (selectedBatch !== 'all') {
        studentQuery = studentQuery.eq('batch_name', selectedBatch);
      }

      const { data: studentsData } = await studentQuery;
      if (!studentsData || studentsData.length === 0) {
        setStats({ totalDays: 0, totalStudents: 0, presentCount: 0, absentCount: 0, leaveCount: 0, attendanceRate: 0 });
        setStudentRecords([]);
        return;
      }

      const studentIds = studentsData.map((s: any) => s.id);

      // Fetch attendance records for date range
      const { data: attData } = await supabase
        .from('attendance')
        .select('student_id, status, date')
        .eq('institute_id', instId)
        .gte('date', dateRange.from)
        .lte('date', dateRange.to)
        .in('student_id', studentIds);

      // Count unique days
      const uniqueDays = new Set((attData || []).map((a: any) => a.date));

      // Calculate per-student stats
      const studentMap: Record<string, { present: number; absent: number; leave: number }> = {};
      for (const s of studentsData) {
        studentMap[s.id] = { present: 0, absent: 0, leave: 0 };
      }

      for (const a of attData || []) {
        if (studentMap[a.student_id]) {
          if (a.status === 'present' || a.status === 'late') studentMap[a.student_id].present++;
          else if (a.status === 'absent') studentMap[a.student_id].absent++;
          else if (a.status === 'leave') studentMap[a.student_id].leave++;
        }
      }

      // Build records
      const records = studentsData.map((s: any) => {
        const sm = studentMap[s.id] || { present: 0, absent: 0, leave: 0 };
        const total = sm.present + sm.absent + sm.leave;
        return {
          id: s.id,
          name: s.name,
          enrollment: s.enrollment_no || '',
          present: sm.present,
          absent: sm.absent,
          leave: sm.leave,
          total,
        };
      });

      setStudentRecords(records);

      // Overall stats
      const totalPresent = records.reduce((a: number, r: any) => a + r.present, 0);
      const totalAbsent = records.reduce((a: number, r: any) => a + r.absent, 0);
      const totalLeave = records.reduce((a: number, r: any) => a + r.leave, 0);
      const totalMarked = totalPresent + totalAbsent + totalLeave;

      setStats({
        totalDays: uniqueDays.size,
        totalStudents: studentsData.length,
        presentCount: totalPresent,
        absentCount: totalAbsent,
        leaveCount: totalLeave,
        attendanceRate: totalMarked > 0 ? Math.round((totalPresent / totalMarked) * 100) : 0,
      });
    } catch (err) {
      console.error('[TeacherAttReport] Error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [instId, teacher.assignedClasses, selectedBatch, dateRange]);

  useEffect(() => {
    fetchData();
  }, [selectedBatch, dateRange]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const rangePresets: { key: RangePreset; label: string; icon: string }[] = [
    { key: 'today', label: 'Today', icon: '📅' },
    { key: 'week', label: 'This Week', icon: '📆' },
    { key: 'month', label: 'This Month', icon: '📅' },
    { key: 'all', label: 'All Time', icon: '📊' },
  ];

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f59e0b" />
        <Text style={styles.loadingText}>Loading attendance report...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f59e0b" />}
    >
      {/* Date Range Selector */}
      <View style={styles.rangeRow}>
        {rangePresets.map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[styles.rangeChip, range === p.key && styles.rangeChipActive]}
            onPress={() => handleRangeChange(p.key)}
          >
            <Text style={[styles.rangeText, range === p.key && styles.rangeTextActive]}>
              {p.icon} {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Batch Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.batchRow}>
        <TouchableOpacity
          style={[styles.batchChip, selectedBatch === 'all' && styles.batchChipActive]}
          onPress={() => setSelectedBatch('all')}
        >
          <Text style={[styles.batchChipText, selectedBatch === 'all' && styles.batchChipTextActive]}>
            🌐 All ({batches.length})
          </Text>
        </TouchableOpacity>
        {batches.map((b) => (
          <TouchableOpacity
            key={b}
            style={[styles.batchChip, selectedBatch === b && styles.batchChipActive]}
            onPress={() => setSelectedBatch(b)}
          >
            <Text style={[styles.batchChipText, selectedBatch === b && styles.batchChipTextActive]}>{b}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Summary Stats */}
      <View style={styles.summaryGrid}>
        <View style={{ width: '48%' }}>
          <StatCard title="Attendance Rate" value={`${stats.attendanceRate}%`} color="#22c55e" />
        </View>
        <View style={{ width: '48%' }}>
          <StatCard title="Days Recorded" value={stats.totalDays} color="#6366f1" />
        </View>
        <View style={{ width: '48%' }}>
          <StatCard title="Present" value={stats.presentCount} color="#22c55e" />
        </View>
        <View style={{ width: '48%' }}>
          <StatCard title="Absent" value={stats.absentCount} color="#ef4444" />
        </View>
      </View>

      {/* Student-wise Report */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📋 Student-wise Report</Text>
        <Text style={styles.sectionSub}>
          {studentRecords.length} student{studentRecords.length !== 1 ? 's' : ''} · {dateRange.from} to {dateRange.to}
        </Text>

        {studentRecords.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>No attendance records found</Text>
          </View>
        ) : (
          studentRecords.map((r) => {
            const rate = r.total > 0 ? Math.round((r.present / r.total) * 100) : 0;
            return (
              <View key={r.id} style={styles.studentCard}>
                <View style={styles.studentHeader}>
                  <View style={styles.studentInfo}>
                    <Text style={styles.studentName}>{r.name}</Text>
                    <Text style={styles.studentEnroll}>{r.enrollment}</Text>
                  </View>
                  <View style={styles.attPercent}>
                    <Text style={[styles.attPercentText, { color: rate >= 75 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444' }]}>
                      {rate}%
                    </Text>
                  </View>
                </View>
                <View style={styles.attBar}>
                  <View
                    style={[
                      styles.attBarFill,
                      {
                        width: `${rate}%`,
                        backgroundColor: rate >= 75 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444',
                      },
                    ]}
                  />
                </View>
                <View style={styles.attStats}>
                  <Text style={styles.attStat}>✅ {r.present}</Text>
                  <Text style={styles.attStat}>❌ {r.absent}</Text>
                  <Text style={styles.attStat}>💤 {r.leave}</Text>
                  <Text style={styles.attStat}>📊 {r.total} days</Text>
                </View>
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
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  loadingText: { marginTop: 12, fontSize: 14, color: '#6b7280' },

  // Range Selector
  rangeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  rangeChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  rangeChipActive: { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
  rangeText: { fontSize: 12, color: '#374151', fontWeight: '500' },
  rangeTextActive: { color: '#fff' },

  // Batches
  batchRow: { marginBottom: 12, flexGrow: 0 },
  batchChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginRight: 8,
  },
  batchChipActive: { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
  batchChipText: { fontSize: 12, color: '#374151', fontWeight: '500' },
  batchChipTextActive: { color: '#fff' },

  // Stats
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },

  // Section
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 2 },
  sectionSub: { fontSize: 12, color: '#6b7280', marginBottom: 12 },

  // Student Cards
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#6b7280' },
  studentCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  studentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  studentInfo: { flex: 1 },
  studentName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  studentEnroll: { fontSize: 11, color: '#6b7280', marginTop: 1 },
  attPercent: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  attPercentText: { fontSize: 14, fontWeight: '800' },
  attBar: {
    height: 6,
    backgroundColor: '#f3f4f6',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  attBarFill: { height: '100%', borderRadius: 3 },
  attStats: {
    flexDirection: 'row',
    gap: 12,
  },
  attStat: { fontSize: 11, color: '#6b7280' },
});
