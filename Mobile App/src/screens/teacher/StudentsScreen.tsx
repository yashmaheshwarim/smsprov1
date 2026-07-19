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
import { supabase } from '../../lib/supabase';
import { useAuth, TeacherUser } from '../../contexts/AuthContext';
import StatusBadge from '../../components/StatusBadge';

export default function TeacherStudentsScreen() {
  const { user } = useAuth();
  const teacher = user as TeacherUser;
  const instId = teacher.instituteId;

  const [batches, setBatches] = useState<string[]>([]);
  const [selectedBatch, setSelectedBatch] = useState('all');
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (initialLoad) {
      fetchStudents(true);
      setInitialLoad(false);
    } else {
      fetchStudents(false);
    }
  }, [selectedBatch]);

  const fetchStudents = async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const assigned = teacher.assignedClasses || [];
      setBatches(assigned);

      let query = supabase
        .from('students')
        .select('id, name, enrollment_no, batch_name, status, student_phone, father_phone, mother_phone')
        .eq('institute_id', instId)
        .eq('status', 'active')
        .in('batch_name', assigned)
        .order('name');

      if (selectedBatch !== 'all') {
        query = query.eq('batch_name', selectedBatch);
      }

      const { data } = await query;
      setStudents(data || []);
    } catch (err) {
      console.error('[TeacherStudents] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = students.filter(
    (s) =>
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.enrollment_no?.toLowerCase().includes(search.toLowerCase()) ||
      s.student_phone?.includes(search)
  );

  return (
    <View style={styles.wrapper}>
      {/* Search */}
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, enrollment or phone..."
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Batch Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.batchRow}>
        <TouchableOpacity
          style={[styles.batchChip, selectedBatch === 'all' && styles.batchChipActive]}
          onPress={() => setSelectedBatch('all')}
        >
          <Text style={[styles.batchChipText, selectedBatch === 'all' && styles.batchChipTextActive]}>
            🌐 All ({students.length})
          </Text>
        </TouchableOpacity>
        {batches.map((b) => (
          <TouchableOpacity
            key={b}
            style={[styles.batchChip, selectedBatch === b && styles.batchChipActive]}
            onPress={() => setSelectedBatch(b)}
          >
            <Text style={[styles.batchChipText, selectedBatch === b && styles.batchChipTextActive]}>
              {b}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Count */}
      <Text style={styles.countText}>
        {filtered.length} student{filtered.length !== 1 ? 's' : ''}
        {selectedBatch !== 'all' ? ` in ${selectedBatch}` : ''}
      </Text>

      {/* Students List */}
      <View style={styles.listContainer}>
        {loading && initialLoad ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#f59e0b" />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>👨‍🎓</Text>
            <Text style={styles.emptyText}>No students found</Text>
          </View>
        ) : (
          <>
            {loading && !initialLoad && (
              <View style={styles.refreshingOverlay}>
                <ActivityIndicator size="small" color="#f59e0b" />
              </View>
            )}
            <ScrollView showsVerticalScrollIndicator={false}>
              {filtered.map((student) => (
                <View key={student.id} style={styles.studentCard}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {student.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.studentInfo}>
                    <Text style={styles.studentName}>{student.name}</Text>
                    <Text style={styles.studentEnroll}>{student.enrollment_no}</Text>
                    <Text style={styles.studentBatch}>{student.batch_name}</Text>
                    {student.student_phone && (
                      <Text style={styles.studentPhone}>📞 {student.student_phone}</Text>
                    )}
                  </View>
                  <StatusBadge variant={student.status === 'active' ? 'success' : 'danger'}>
                    {student.status}
                  </StatusBadge>
                </View>
              ))}
            </ScrollView>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContainer: { flex: 1, minHeight: 200 },
  refreshingOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: 'rgba(248,250,252,0.8)',
    borderRadius: 20,
    padding: 8,
    margin: 4,
  },

  // Search
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
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },

  // Batches
  batchRow: { marginBottom: 12, flexGrow: 0 },
  batchChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginRight: 8,
  },
  batchChipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  batchChipActive: { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
  batchChipTextActive: { color: '#fff' },

  // Count
  countText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
    marginBottom: 12,
  },

  // Student cards
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
    backgroundColor: '#fef3c7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: { fontSize: 14, fontWeight: '700', color: '#f59e0b' },
  studentInfo: { flex: 1 },
  studentName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  studentEnroll: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  studentBatch: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  studentPhone: { fontSize: 11, color: '#6366f1', marginTop: 2 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#6b7280' },
});
