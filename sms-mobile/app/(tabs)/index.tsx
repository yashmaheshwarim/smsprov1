import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import AnimatedEntry from '../../components/AnimatedEntry';

const formatCurrency = (n: number) =>
  `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export default function DashboardScreen() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const DEFAULT_UUID = "00000000-0000-0000-0000-000000000001";
  const instId = isAdmin ? (user as any).instituteId : DEFAULT_UUID;
  const isFresh = instId === DEFAULT_UUID;

  const [stats, setStats] = useState({
    totalStudents: 0,
    totalRevenue: 0,
    attendanceRate: 0,
    newAdmissions: 0,
  });

  const [recentStudents, setRecentStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardData();
  }, [instId]);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch Student Count
      const { count: studentCount } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('institute_id', instId);

      // Fetch Inquiries (New Admissions)
      const { count: inquiryCount } = await supabase
        .from('inquiries')
        .select('*', { count: 'exact', head: true })
        .eq('institute_id', instId);

      // Fetch Recent Students
      const { data: recentS } = await supabase
        .from('students')
        .select('id, name, enrollment_no, batch_name, status')
        .eq('institute_id', instId)
        .order('created_at', { ascending: false })
        .limit(5);

      // Fetch Invoices
      const { data: invoices } = await supabase
        .from('invoices')
        .select('amount, paid_amount, due_date')
        .eq('institute_id', instId);

      // Fetch Attendance
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const { data: attendance } = await supabase
        .from('attendance')
        .select('date, status')
        .eq('institute_id', instId)
        .gte('date', weekAgo.toISOString());

      let totalRev = 0;
      if (invoices) {
        invoices.forEach(inv => {
          totalRev += (inv.paid_amount || 0);
        });
      }

      let totalAttDays = 0;
      let totalPresent = 0;
      if (attendance) {
        attendance.forEach((att: any) => {
          totalAttDays++;
          if (att.status === 'present' || att.status === 'late') totalPresent++;
        });
      }

      const overallAttRate = totalAttDays > 0 ? Math.round((totalPresent / totalAttDays) * 100) : 0;

      setStats({
        totalStudents: studentCount || 0,
        newAdmissions: inquiryCount || 0,
        totalRevenue: totalRev,
        attendanceRate: overallAttRate,
      });

      if (recentS) {
        setRecentStudents(recentS.map(s => ({
          ...s,
          batch: s.batch_name,
          feeStatus: 'paid' // Placeholder
        })));
      }
    } catch (err: any) {
      console.error('Error fetching dashboard data:', err);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#3b82f6" /></View>;

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={{ color: 'red' }}>{error}</Text>
      </View>
    );
  }

  const getGreeting = () => {
    if (user?.role === 'super_admin') return 'Super Admin';
    if (user?.role === 'admin') return 'Institute Administrator';
    if (user?.role === 'teacher') return 'Professor';
    if (user?.role === 'student') return `Student: ${user?.name}`;
    if (user?.role === 'parent') return 'Parent Portal';
    return 'Portal';
  };

  return (
    <AnimatedEntry style={styles.wrapper} delay={100}>
      <ScrollView style={styles.container}>
        <Text style={styles.header}>Welcome, {getGreeting()}</Text>

        <View style={styles.statsGrid}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Total Students</Text>
            <Text style={styles.cardValue}>{stats.totalStudents}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Total Revenue</Text>
            <Text style={styles.cardValue}>{formatCurrency(stats.totalRevenue)}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Attendance Rate</Text>
            <Text style={styles.cardValue}>{stats.attendanceRate}%</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>New Inquiries</Text>
            <Text style={styles.cardValue}>{stats.newAdmissions}</Text>
          </View>
        </View>

        {recentStudents.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Students</Text>
            {recentStudents.map(student => (
              <View key={student.id} style={styles.studentCard}>
                <Text style={styles.studentName}>{student.name}</Text>
                <Text style={styles.studentDetail}>{student.enrollment_no} • {student.batch}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </AnimatedEntry>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#ffffff' },
  container: { flex: 1, padding: 16, backgroundColor: '#ffffff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff' },
  header: { fontSize: 24, fontWeight: 'bold', color: '#1e293b', marginBottom: 20 },
  statsGrid: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: 20 },
  card: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#f8fafc',
    padding: 20,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTitle: { color: '#64748b', fontSize: 13, marginBottom: 8, textTransform: 'uppercase', fontWeight: '600' },
  cardValue: { color: '#1e293b', fontSize: 28, fontWeight: 'bold' },
  section: { marginTop: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b', marginBottom: 10 },
  studentCard: {
    backgroundColor: '#f8fafc',
    padding: 15,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  studentName: { color: '#1e293b', fontSize: 16, fontWeight: 'bold' },
  studentDetail: { color: '#64748b', fontSize: 14 },
});
