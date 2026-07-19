import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Dimensions } from 'react-native';
import { supabase } from '../../lib/supabase';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';

const screenWidth = Dimensions.get('window').width;

export default function SuperAdminAnalytics() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalInstitutes: 0,
    activeInstitutes: 0,
    totalStudents: 0,
    totalCredits: 0,
    statusData: [] as { name: string; value: number }[],
  });

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const { data: institutes } = await supabase.from('institutes').select('*');
      const { count } = await supabase.from('students').select('*', { count: 'exact', head: true });

      if (institutes) {
        const active = institutes.filter((i: any) => i.status === 'active').length;
        const totalCredits = institutes.reduce((a: number, i: any) => a + (i.wallet_credits || 0), 0);

        setStats({
          totalInstitutes: institutes.length,
          activeInstitutes: active,
          totalStudents: count || 0,
          totalCredits,
          statusData: [
            { name: 'Active', value: active },
            { name: 'Suspended', value: institutes.filter((i: any) => i.status === 'suspended').length },
            { name: 'Trial', value: institutes.filter((i: any) => i.status === 'trial').length },
            { name: 'Expired', value: institutes.filter((i: any) => i.status === 'expired').length },
          ].filter(d => d.value > 0),
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.statsGrid}>
        <StatCard title="Total Institutes" value={stats.totalInstitutes} color="#6366f1" />
        <StatCard title="Active" value={stats.activeInstitutes} color="#22c55e" />
        <StatCard title="Total Students" value={stats.totalStudents.toLocaleString()} color="#f59e0b" />
        <StatCard title="Total Credits" value={stats.totalCredits.toLocaleString()} color="#ec4899" />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Status Distribution</Text>
        <View style={styles.statusGrid}>
          {stats.statusData.map((item) => (
            <View key={item.name} style={styles.statusItem}>
              <StatusBadge
                variant={
                  item.name === 'Active'
                    ? 'success'
                    : item.name === 'Trial'
                      ? 'info'
                      : 'danger'
                }
              >
                {item.name}: {item.value}
              </StatusBadge>
            </View>
          ))}
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusItem: {
    marginBottom: 4,
  },
});
