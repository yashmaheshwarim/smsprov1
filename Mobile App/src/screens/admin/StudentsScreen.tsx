import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { supabase, isUuid } from '../../lib/supabase';
import { useAuth, AdminUser } from '../../contexts/AuthContext';
import StatusBadge from '../../components/StatusBadge';

export default function StudentsScreen({ navigation }: any) {
  const { user } = useAuth();
  const adminUser = user as AdminUser;
  const instId = adminUser?.instituteId || '';

  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (isUuid(instId)) fetchStudents();
  }, [instId]);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('students')
        .select('id, name, enrollment_no, batch_name, status, student_phone')
        .eq('institute_id', instId)
        .order('created_at', { ascending: false });

      setStudents(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = students.filter(
    (s) =>
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.enrollment_no?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or enrollment..."
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <Text style={styles.countText}>
        {filtered.length} student{filtered.length !== 1 ? 's' : ''}
      </Text>

      {loading ? (
        <ActivityIndicator size="large" color="#6366f1" style={{ marginTop: 20 }} />
      ) : (
        <ScrollView>
          {filtered.map((student) => (
            <TouchableOpacity
              key={student.id}
              style={styles.studentCard}
              onPress={() => navigation.navigate('StudentDetail', { studentId: student.id })}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {student.name
                    ?.split(' ')
                    .map((n: string) => n[0])
                    .join('')
                    .toUpperCase()}
                </Text>
              </View>
              <View style={styles.studentInfo}>
                <Text style={styles.studentName}>{student.name}</Text>
                <Text style={styles.studentEnroll}>{student.enrollment_no}</Text>
                <Text style={styles.studentBatch}>{student.batch_name}</Text>
              </View>
              <StatusBadge
                variant={student.status === 'active' ? 'success' : 'danger'}
              >
                {student.status}
              </StatusBadge>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
  },
  countText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
    marginBottom: 12,
  },
  studentCard: {
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
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6366f1',
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  studentEnroll: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  studentBatch: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 2,
  },
});
