import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth, ParentUser } from '../../contexts/AuthContext';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';

export default function ParentMarksScreen() {
  const { user } = useAuth();
  const parent = user as ParentUser;
  const childId = parent.childrenIds?.[0] || '';

  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (childId) fetchMarks();
    else setLoading(false);
  }, [childId]);

  const fetchMarks = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('marks')
        .select('exam_name, subject, marks_obtained, total_marks')
        .eq('student_id', childId)
        .order('created_at', { ascending: false });

      if (data && data.length > 0) {
        setResults(
          data.map((m: any) => ({
            examName: m.exam_name || 'Exam',
            subject: m.subject || 'N/A',
            marksObtained: m.marks_obtained || 0,
            totalMarks: m.total_marks || 100,
            percentage: m.total_marks
              ? Math.round((m.marks_obtained / m.total_marks) * 100)
              : 0,
            grade: getGrade(
              m.total_marks ? (m.marks_obtained / m.total_marks) * 100 : 0
            ),
          }))
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const avgPercentage =
    results.length > 0
      ? (results.reduce((a, r) => a + r.percentage, 0) / results.length).toFixed(0)
      : '0';
  const highScore =
    results.length > 0 ? Math.max(...results.map((r) => r.percentage)) : 0;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  const examGroups: Record<string, any[]> = {};
  results.forEach((r) => {
    if (!examGroups[r.examName]) examGroups[r.examName] = [];
    examGroups[r.examName].push(r);
  });

  return (
    <ScrollView style={styles.container}>
      <View style={styles.statsRow}>
        <StatCard title="Average Score" value={`${avgPercentage}%`} color="#6366f1" />
        <StatCard title="Highest" value={`${highScore}%`} color="#22c55e" />
        <StatCard title="Exams" value={Object.keys(examGroups).length} color="#f59e0b" />
      </View>

      {Object.entries(examGroups).map(([examName, examResults]) => (
        <View key={examName} style={styles.examSection}>
          <Text style={styles.examTitle}>{examName}</Text>
          {examResults.map((r, i) => (
            <View key={i} style={styles.resultRow}>
              <Text style={styles.subjectName}>{r.subject}</Text>
              <Text style={styles.marksText}>
                {r.marksObtained}/{r.totalMarks}
              </Text>
              <StatusBadge
                variant={r.percentage >= 75 ? 'success' : r.percentage >= 50 ? 'warning' : 'danger'}>
                {r.percentage}%
              </StatusBadge>
            </View>
          ))}
        </View>
      ))}

      {results.length === 0 && (
        <Text style={styles.emptyText}>No marks records found</Text>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function getGrade(percentage: number): string {
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B+';
  if (percentage >= 60) return 'B';
  if (percentage >= 50) return 'C';
  if (percentage >= 40) return 'D';
  return 'F';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  examSection: { marginBottom: 20 },
  examTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#e5e7eb',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 6,
    gap: 8,
  },
  subjectName: { flex: 1, fontSize: 14, color: '#374151', fontWeight: '500' },
  marksText: { fontSize: 14, color: '#111827', fontWeight: '600', marginRight: 8 },
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', marginTop: 40 },
});
