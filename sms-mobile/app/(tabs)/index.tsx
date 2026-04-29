import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export default function DashboardScreen() {
  const { user, role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ 
    institutes: 0, revenue: 0,
    students: 0, teachers: 0,
    attendance: 0,
    children: 0, pendingFees: 0
  });

  useEffect(() => {
    fetchStats();
  }, [role]);

  const fetchStats = async () => {
    if (role === 'superadmin') {
      const { data } = await supabase.from('institutes').select('sms_credits, whatsapp_credits');
      let rev = 0;
      if (data) Object.values(data).forEach((d: any) => { rev += (d.sms_credits || 0) * 0.25 + (d.whatsapp_credits || 0) * 0.20; });
      setStats(s => ({ ...s, institutes: data?.length || 0, revenue: rev }));
    } else if (role === 'admin') {
      // Fetch actual students count
      const { count: sCount } = await supabase.from('students').select('*', { count: 'exact', head: true });
      const { count: tCount } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'teacher');
      setStats(s => ({ ...s, students: sCount || 0, teachers: tCount || 0, revenue: 154000 }));
    } else if (role === 'student') {
      setStats(s => ({ ...s, attendance: 92, pendingFees: 25000 }));
    } else if (role === 'parent') {
      setStats(s => ({ ...s, children: 1, pendingFees: 25000 }));
    } else if (role === 'teacher') {
      setStats(s => ({ ...s, students: 145, classes: 4 } as any));
    }
    setLoading(false);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#3b82f6" /></View>;

  const getGreeting = () => {
    if (role === 'superadmin') return 'Super Admin';
    if (role === 'admin') return 'Institute Administrator';
    if (role === 'teacher') return 'Professor';
    if (role === 'student') return `Student: ${user?.email?.split('@')[0]}`;
    if (role === 'parent') return 'Parent Portal';
    return 'Portal';
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Welcome, {getGreeting()}</Text>
      
      <View style={styles.statsGrid}>
        {role === 'superadmin' && (
          <>
            <View style={styles.card}><Text style={styles.cardTitle}>Total Institutes</Text><Text style={styles.cardValue}>{stats.institutes}</Text></View>
            <View style={styles.card}><Text style={styles.cardTitle}>Est. Revenue</Text><Text style={styles.cardValue}>₹{stats.revenue.toLocaleString()}</Text></View>
          </>
        )}
        
        {role === 'admin' && (
          <>
            <View style={styles.card}><Text style={styles.cardTitle}>Active Students</Text><Text style={styles.cardValue}>{stats.students}</Text></View>
            <View style={styles.card}><Text style={styles.cardTitle}>Total Staff</Text><Text style={styles.cardValue}>{stats.teachers}</Text></View>
            <View style={styles.card}><Text style={styles.cardTitle}>Pending Collections</Text><Text style={styles.cardValue}>₹{stats.revenue.toLocaleString()}</Text></View>
          </>
        )}

        {role === 'teacher' && (
          <>
            <View style={styles.card}><Text style={styles.cardTitle}>My Students</Text><Text style={styles.cardValue}>{(stats as any).students}</Text></View>
            <View style={styles.card}><Text style={styles.cardTitle}>Assigned Batches</Text><Text style={styles.cardValue}>{(stats as any).classes}</Text></View>
            <View style={styles.card}><Text style={styles.cardTitle}>Today's Lectures</Text><Text style={styles.cardValue}>2</Text></View>
          </>
        )}

        {role === 'student' && (
          <>
            <View style={styles.card}><Text style={styles.cardTitle}>Overall Attendance</Text><Text style={styles.cardValue}>{stats.attendance}%</Text></View>
            <View style={styles.card}><Text style={styles.cardTitle}>Pending Dues</Text><Text style={styles.cardValue}>₹{stats.pendingFees.toLocaleString()}</Text></View>
            <View style={styles.card}><Text style={styles.cardTitle}>Recent Test Avg</Text><Text style={styles.cardValue}>84%</Text></View>
          </>
        )}

        {role === 'parent' && (
          <>
            <View style={styles.card}><Text style={styles.cardTitle}>Total Wards</Text><Text style={styles.cardValue}>{stats.children}</Text></View>
            <View style={styles.card}><Text style={styles.cardTitle}>Total Pending Fees</Text><Text style={styles.cardValue}>₹{stats.pendingFees.toLocaleString()}</Text></View>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
  header: { fontSize: 24, fontWeight: 'bold', color: '#f8fafc', marginBottom: 20 },
  statsGrid: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  card: { flex: 1, minWidth: '45%', backgroundColor: '#1e293b', padding: 20, borderRadius: 12, marginBottom: 12 },
  cardTitle: { color: '#94a3b8', fontSize: 13, marginBottom: 8, textTransform: 'uppercase', fontWeight: '600' },
  cardValue: { color: '#f8fafc', fontSize: 28, fontWeight: 'bold' }
});
