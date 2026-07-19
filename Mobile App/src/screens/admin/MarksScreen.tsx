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

export default function MarksScreen() {
  const { user } = useAuth();
  const adminUser = user as AdminUser;
  const instId = adminUser?.instituteId || '';

  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (isUuid(instId)) fetchMarks();
  }, [instId]);

  const fetchMarks = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('marks')
        .select('exam_name, subject, total_marks, status, created_at, batch_id, submitted_by')
        .eq('institute_id', instId);

      if (data) {
        const grouped: Record<string, any> = {};
        data.forEach((d: any) => {
          const key = `${d.exam_name}|${d.subject}|${d.batch_id}`;
          if (!grouped[key]) {
            grouped[key] = {
              id: key,
              examName: d.exam_name,
              subject: d.subject,
              totalMarks: d.total_marks || 50,
              status: d.status || 'pending',
              submittedBy: d.submitted_by || 'Admin',
              createdAt: d.created_at,
              studentCount: 0,
            };
          }
          grouped[key].studentCount++;
        });
        setExams(Object.values(grouped));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = exams.filter(
    (e) =>
      e.examName?.toLowerCase().includes(search.toLowerCase()) ||
      e.subject?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.pageTitle}>Marks & Reports</Text>
      <Text style={styles.pageSubtitle}>Review marks, approve and manage exams</Text>

      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search exams..."
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#6366f1" style={{ marginTop: 20 }} />
      ) : filtered.length === 0 ? (
        <Text style={styles.emptyText}>No exam records found</Text>
      ) : (
        filtered.map((exam) => (
          <View key={exam.id} style={styles.examCard}>
            <View style={styles.examHeader}>
              <Text style={styles.examName}>{exam.examName}</Text>
              <StatusBadge
                variant={
                  exam.status === 'approved'
                    ? 'success'
                    : exam.status === 'rejected'
                      ? 'danger'
                      : 'warning'
                }
              >
                {exam.status}
              </StatusBadge>
            </View>
            <Text style={styles.examSubject}>
              {exam.subject} · {exam.studentCount} students
            </Text>
            <Text style={styles.examMeta}>
              Total Marks: {exam.totalMarks} · By {exam.submittedBy}
            </Text>
          </View>
        ))
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  pageTitle: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 4 },
  pageSubtitle: { fontSize: 14, color: '#6b7280', marginBottom: 20 },
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
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', marginTop: 40 },
  examCard: {
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
  examHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  examName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  examSubject: { fontSize: 13, color: '#6b7280', marginBottom: 4 },
  examMeta: { fontSize: 12, color: '#9ca3af' },
});
