import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';

export default function AnalyticsScreen() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalValue: 0, totalInstitutes: 0, activeStudents: 0 });

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setLoading(true);
    const { data: institutes } = await supabase.from('institutes').select('sms_credits, whatsapp_credits');
    const { count: studentsCount } = await supabase.from('students').select('*', { count: 'exact', head: true });

    let estRev = 0;
    if (institutes) {
      institutes.forEach(i => {
         estRev += (i.sms_credits || 0) * 0.25 + (i.whatsapp_credits || 0) * 0.20;
      });
    }

    setStats({
      totalValue: estRev,
      totalInstitutes: institutes?.length || 0,
      activeStudents: studentsCount || 0
    });
    setLoading(false);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#3b82f6" /></View>;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Platform Analytics</Text>

      <View style={styles.card}>
        <View style={styles.iconContainer}>
          <Ionicons name="cash-outline" size={32} color="#10b981" />
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardLabel}>Estimated Revenue</Text>
          <Text style={styles.cardValue}>₹{stats.totalValue.toLocaleString()}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.iconContainer}>
          <Ionicons name="business-outline" size={32} color="#3b82f6" />
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardLabel}>Registered Institutes</Text>
          <Text style={styles.cardValue}>{stats.totalInstitutes}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.iconContainer}>
          <Ionicons name="people-outline" size={32} color="#f59e0b" />
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardLabel}>Total Global Students</Text>
          <Text style={styles.cardValue}>{stats.activeStudents}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
  header: { fontSize: 24, fontWeight: 'bold', color: '#f8fafc', marginBottom: 24 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', padding: 20, borderRadius: 16, marginBottom: 16 },
  iconContainer: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  cardInfo: { flex: 1 },
  cardLabel: { color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', marginBottom: 4, fontWeight: '600' },
  cardValue: { color: '#f8fafc', fontSize: 28, fontWeight: 'bold' }
});
