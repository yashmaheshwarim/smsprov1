import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';

export default function ManageMembers() {
  const [loading, setLoading] = useState(true);
  const [admins, setAdmins] = useState<any[]>([]);

  useEffect(() => {
    fetchAdmins();
  }, []);

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('institutes')
        .select('id, name, email, student_limit, teacher_limit, status')
        .order('name');

      setAdmins(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.pageTitle}>Manage Members</Text>
      <Text style={styles.pageSubtitle}>View all institute admins and their limits</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#6366f1" style={{ marginTop: 40 }} />
      ) : (
        admins.map((admin) => (
          <View key={admin.id} style={styles.card}>
            <Text style={styles.adminName}>{admin.name}</Text>
            <Text style={styles.adminEmail}>{admin.email || 'N/A'}</Text>
            <View style={styles.limits}>
              <Text style={styles.limitText}>🎓 Student limit: {admin.student_limit || 500}</Text>
              <Text style={styles.limitText}>👨‍🏫 Teacher limit: {admin.teacher_limit || 20}</Text>
              <Text style={styles.limitText}>📊 Status: {admin.status}</Text>
            </View>
          </View>
        ))
      )}

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
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  adminName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  adminEmail: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 8,
  },
  limits: {
    gap: 4,
  },
  limitText: {
    fontSize: 12,
    color: '#374151',
  },
});
