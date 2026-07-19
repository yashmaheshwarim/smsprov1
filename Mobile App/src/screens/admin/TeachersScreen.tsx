import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { supabase, isUuid } from '../../lib/supabase';
import { useAuth, AdminUser } from '../../contexts/AuthContext';
import StatusBadge from '../../components/StatusBadge';

export default function TeachersScreen() {
  const { user } = useAuth();
  const adminUser = user as AdminUser;
  const instId = adminUser?.instituteId || '';

  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isUuid(instId)) fetchTeachers();
  }, [instId]);

  const fetchTeachers = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('teachers')
        .select('*')
        .eq('institute_id', instId)
        .order('name');

      setTeachers(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.pageTitle}>Teachers</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#6366f1" style={{ marginTop: 20 }} />
      ) : (
        teachers.map((teacher) => (
          <View key={teacher.id} style={styles.teacherCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {teacher.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
              </Text>
            </View>
            <View style={styles.teacherInfo}>
              <Text style={styles.teacherName}>{teacher.name || teacher.email}</Text>
              <Text style={styles.teacherEmail}>{teacher.email}</Text>
              <View style={styles.tagRow}>
                {(teacher.subjects || []).map((s: string) => (
                  <View key={s} style={styles.subjectTag}>
                    <Text style={styles.subjectTagText}>{s}</Text>
                  </View>
                ))}
              </View>
            </View>
            <StatusBadge variant={teacher.status === 'active' ? 'success' : 'warning'}>
              {teacher.status}
            </StatusBadge>
          </View>
        ))
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  pageTitle: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 16 },
  teacherCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: { fontSize: 14, fontWeight: '700', color: '#6366f1' },
  teacherInfo: { flex: 1 },
  teacherName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  teacherEmail: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  subjectTag: {
    backgroundColor: '#eef2ff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  subjectTagText: { fontSize: 10, color: '#6366f1', fontWeight: '500' },
});
