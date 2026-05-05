import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, TouchableOpacity, Alert } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import AnimatedEntry from '../../components/AnimatedEntry';

export default function InstitutesScreen() {
  const [institutes, setInstitutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInstitutes();
  }, []);

  const fetchInstitutes = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('institutes').select('*').order('created_at', { ascending: false });
    if (data) setInstitutes(data);
    setLoading(false);
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
    const { error } = await supabase.from('institutes').update({ status: newStatus }).eq('id', id);
    if (!error) {
      fetchInstitutes();
    } else {
      Alert.alert('Error', error.message);
    }
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <TouchableOpacity 
           style={[styles.badge, { backgroundColor: item.status === 'active' ? '#10b981' : '#ef4444' }]}
           onPress={() => toggleStatus(item.id, item.status)}
        >
          <Text style={styles.badgeText}>{item.status.toUpperCase()}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.cardSub}>Admin: {item.email || "N/A"}</Text>
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Students Lim</Text>
          <Text style={styles.statValue}>{item.student_limit || "Uncapped"}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>SMS Credits</Text>
          <Text style={styles.statValue}>{item.sms_credits || 0}</Text>
        </View>
      </View>
    </View>
  );

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#3b82f6" /></View>;

  return (
    <AnimatedEntry style={styles.wrapper} delay={120}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.header}>Manage Institutes</Text>
          <TouchableOpacity onPress={fetchInstitutes} style={styles.refreshButton}>
             <Ionicons name="refresh" size={24} color="#3b82f6" />
          </TouchableOpacity>
        </View>
        <FlatList
          data={institutes}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={<Text style={styles.emptyText}>No institutes found.</Text>}
        />
      </View>
    </AnimatedEntry>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#0f172a' },
  container: { flex: 1, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  header: { fontSize: 24, fontWeight: 'bold', color: '#f8fafc' },
  refreshButton: { padding: 10, borderRadius: 12, backgroundColor: '#111827' },
  card: { backgroundColor: '#111827', padding: 18, borderRadius: 16, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.12)' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardTitle: { color: '#f8fafc', fontSize: 18, fontWeight: 'bold', flex: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  cardSub: { color: '#94a3b8', fontSize: 14, marginBottom: 12 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statBox: { backgroundColor: '#0f172a', padding: 12, borderRadius: 12, flex: 0.48 },
  statLabel: { color: '#94a3b8', fontSize: 10, textTransform: 'uppercase', marginBottom: 4 },
  statValue: { color: '#f8fafc', fontSize: 16, fontWeight: 'bold' },
  emptyText: { color: '#94a3b8', textAlign: 'center' },
});
