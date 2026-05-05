import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AnimatedEntry from '../../components/AnimatedEntry';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface StudentFee {
  id: string;
  student_name: string;
  enrollment_no: string;
  batch_name: string;
  total_fees: number;
  paid_fees: number;
  status: "paid" | "pending" | "partial" | "overdue";
}

export default function FeesScreen() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const DEFAULT_UUID = "00000000-0000-0000-0000-000000000001";
  const instId = isAdmin ? (user as any).instituteId : DEFAULT_UUID;

  const [fees, setFees] = useState<StudentFee[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, paid: 0, pending: 0, overdue: 0 });

  useEffect(() => {
    fetchFees();
  }, [instId]);

  const fetchFees = async () => {
    setLoading(true);
    try {
      // This is a simplified query - in real app, you'd join with student_fees table
      const { data } = await supabase
        .from('students')
        .select('id, name, enrollment_no, batch_name')
        .eq('institute_id', instId)
        .limit(20);

      if (data) {
        // Mock fee data for demo
        const mockFees: StudentFee[] = data.map(student => ({
          id: student.id,
          student_name: student.name,
          enrollment_no: student.enrollment_no,
          batch_name: student.batch_name,
          total_fees: Math.floor(Math.random() * 5000) + 10000,
          paid_fees: Math.floor(Math.random() * 8000),
          status: ['paid', 'pending', 'partial', 'overdue'][Math.floor(Math.random() * 4)] as any,
        }));
        setFees(mockFees);

        // Calculate stats
        const total = mockFees.reduce((sum, f) => sum + f.total_fees, 0);
        const paid = mockFees.filter(f => f.status === 'paid').length;
        const pending = mockFees.filter(f => f.status === 'pending').length;
        const overdue = mockFees.filter(f => f.status === 'overdue').length;
        setStats({ total, paid, pending, overdue });
      }
    } catch (error) {
      console.error('Error fetching fees:', error);
      Alert.alert('Error', 'Failed to load fees data');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return '#10b981';
      case 'pending': return '#f59e0b';
      case 'partial': return '#3b82f6';
      case 'overdue': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const renderItem = ({ item }: { item: StudentFee }) => (
    <TouchableOpacity style={styles.card} activeOpacity={0.8}>
      <View style={styles.info}>
        <Text style={styles.name}>{item.student_name}</Text>
        <Text style={styles.subtext}>{item.enrollment_no} • {item.batch_name}</Text>
        <Text style={styles.amount}>₹{item.total_fees.toLocaleString()} total • ₹{item.paid_fees.toLocaleString()} paid</Text>
      </View>
      <View style={[styles.status, { backgroundColor: getStatusColor(item.status) }]}>
        <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#3b82f6" /></View>;

  return (
    <AnimatedEntry style={styles.wrapper} delay={140}>
      <View style={styles.container}>
        <Text style={styles.header}>Fees Management</Text>

        <View style={styles.stats}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>₹{stats.total.toLocaleString()}</Text>
            <Text style={styles.statLabel}>Total Fees</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.paid}</Text>
            <Text style={styles.statLabel}>Paid</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.pending}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.overdue}</Text>
            <Text style={styles.statLabel}>Overdue</Text>
          </View>
        </View>

        <FlatList
          data={fees}
          keyExtractor={f => f.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={<Text style={styles.emptyText}>No fees data found.</Text>}
        />

        <TouchableOpacity style={styles.fab} onPress={() => Alert.alert('Coming Soon', 'Fee collection functionality will be added soon!')}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    </AnimatedEntry>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#ffffff' },
  container: { flex: 1, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff' },
  header: { fontSize: 24, fontWeight: 'bold', color: '#1e293b', marginBottom: 16 },
  stats: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: '#f8fafc', padding: 12, borderRadius: 12, marginHorizontal: 4, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  statValue: { fontSize: 18, fontWeight: 'bold', color: '#1e293b', marginBottom: 4 },
  statLabel: { fontSize: 12, color: '#64748b' },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', padding: 16, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  info: { flex: 1 },
  name: { color: '#1e293b', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  subtext: { color: '#64748b', fontSize: 12, marginBottom: 2 },
  amount: { color: '#64748b', fontSize: 12 },
  status: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  statusText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  emptyText: { color: '#64748b', textAlign: 'center', marginTop: 50, fontSize: 16 },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#3b82f6',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
});