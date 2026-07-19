import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth, TeacherUser } from '../../contexts/AuthContext';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';

// ─── Component ─────────────────────────────────────────────────────────────
export default function TeacherMarksReport() {
  const { user } = useAuth();
  const teacher = user as TeacherUser;
  const instId = teacher.instituteId;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [batches, setBatches] = useState<string[]>([]);
  const [selectedBatch, setSelectedBatch] = useState('all');

  // Exams / Submissions
  const [exams, setExams] = useState<any[]>([]);

  // Stats
  const [stats, setStats] = useState({
    totalExams: 0,
    totalMarks: 0,
    avgScore: 0,
    passRate: 0,
  });

  // Selected exam drill-down
  const [selectedExam, setSelectedExam] = useState<any>(null);
  const [examStudents, setExamStudents] = useState<any[]>([]);

  // ─── Fetch Data ─────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const assigned = teacher.assignedClasses || [];
      setBatches(assigned);

      if (assigned.length === 0) {
        setExams([]);
        setStats({ totalExams: 0, totalMarks: 0, avgScore: 0, passRate: 0 });
        return;
      }

      // Get students in assigned batches
      let studentQuery = supabase
        .from('students')
        .select('id')
        .eq('institute_id', instId)
        .eq('status', 'active')
        .in('batch_name', assigned);

      if (selectedBatch !== 'all') {
        studentQuery = studentQuery.eq('batch_name', selectedBatch);
      }

      const { data: studentData } = await studentQuery;
      const studentIds = (studentData || []).map((s: any) => s.id);

      if (studentIds.length === 0) {
        setExams([]);
        setStats({ totalExams: 0, totalMarks: 0, avgScore: 0, passRate: 0 });
        return;
      }

      // Fetch marks for these students
      const { data: marksData } = await supabase
        .from('marks')
        .select('exam_name, subject, marks_obtained, total_marks, student_id, status, created_at, submitted_by')
        .eq('institute_id', instId)
        .in('student_id', studentIds)
        .order('created_at', { ascending: false });

      if (!marksData || marksData.length === 0) {
        setExams([]);
        setStats({ totalExams: 0, totalMarks: 0, avgScore: 0, passRate: 0 });
        return;
      }

      // Group by exam_name + subject
      const examGroups: Record<string, any> = {};
      for (const m of marksData as any[]) {
        const key = `${m.exam_name}|${m.subject}`;
        if (!examGroups[key]) {
          examGroups[key] = {
            key,
            examName: m.exam_name,
            subject: m.subject,
            totalMarks: m.total_marks,
            status: m.status,
            submittedBy: m.submitted_by,
            createdAt: m.created_at,
            marks: [],
            studentCount: 0,
            totalObtained: 0,
            passCount: 0,
          };
        }
        examGroups[key].marks.push(m);
        examGroups[key].studentCount++;
        examGroups[key].totalObtained += m.marks_obtained || 0;
        if ((m.marks_obtained || 0) >= (m.total_marks || 1) * 0.4) {
          examGroups[key].passCount++;
        }
      }

      const examList = Object.values(examGroups);
      setExams(examList);

      // Overall stats
      const totalMarksAll = examList.reduce((a: number, e: any) => a + e.totalObtained, 0);
      const totalStudentsAcrossExams = examList.reduce((a: number, e: any) => a + e.studentCount, 0);
      const totalPass = examList.reduce((a: number, e: any) => a + e.passCount, 0);

      setStats({
        totalExams: examList.length,
        totalMarks: totalMarksAll,
        avgScore: totalStudentsAcrossExams > 0 ? Math.round(totalMarksAll / totalStudentsAcrossExams) : 0,
        passRate: totalStudentsAcrossExams > 0 ? Math.round((totalPass / totalStudentsAcrossExams) * 100) : 0,
      });
    } catch (err) {
      console.error('[TeacherMarksReport] Error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [instId, teacher.assignedClasses, selectedBatch]);

  useEffect(() => {
    fetchData();
  }, [selectedBatch]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // ─── Drill-down ──────────────────────────────────────────────────────

  const handleExamPress = (exam: any) => {
    // Get student names for these marks
    const studentIds = exam.marks.map((m: any) => m.student_id);

    setSelectedExam(exam);

    // Fetch student names
    supabase
      .from('students')
      .select('id, name, enrollment_no, batch_name')
      .in('id', studentIds)
      .then(({ data }: any) => {
        const nameMap: Record<string, any> = {};
        if (data) {
          data.forEach((s: any) => { nameMap[s.id] = s; });
        }

        const studentsWithNames = exam.marks.map((m: any) => ({
          ...m,
          studentName: nameMap[m.student_id]?.name || 'Unknown',
          enrollment: nameMap[m.student_id]?.enrollment_no || '',
          batch: nameMap[m.student_id]?.batch_name || '',
          passed: (m.marks_obtained || 0) >= (m.total_marks || 1) * 0.4,
          percentage: m.total_marks > 0 ? Math.round((m.marks_obtained / m.total_marks) * 100) : 0,
        }));

        studentsWithNames.sort((a: any, b: any) => b.marks_obtained - a.marks_obtained);
        setExamStudents(studentsWithNames);
      });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f59e0b" />
        <Text style={styles.loadingText}>Loading marks report...</Text>
      </View>
    );
  }

  if (selectedExam) {
    // ── Drill-down View ──
    return (
      <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f59e0b" />}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedExam(null)}>
          <Text style={styles.backBtnText}>← Back to Exams</Text>
        </TouchableOpacity>

        <View style={styles.examDetailHeader}>
          <Text style={styles.examDetailName}>{selectedExam.examName}</Text>
          <Text style={styles.examDetailSubject}>{selectedExam.subject}</Text>
          <View style={styles.examDetailMeta}>
            <StatusBadge variant={selectedExam.status === 'approved' ? 'success' : selectedExam.status === 'rejected' ? 'danger' : 'warning'}>
              {selectedExam.status}
            </StatusBadge>
            <Text style={styles.examDetailMetaText}>
              Total: {selectedExam.totalMarks} · {selectedExam.studentCount} students
            </Text>
          </View>
        </View>

        {/* Score distribution */}
        <View style={styles.distRow}>
          {[
            { label: 'Avg', value: selectedExam.studentCount > 0 ? Math.round(selectedExam.totalObtained / selectedExam.studentCount) : 0, color: '#6366f1' },
            { label: 'Pass', value: selectedExam.passCount, color: '#22c55e' },
            { label: 'Fail', value: selectedExam.studentCount - selectedExam.passCount, color: '#ef4444' },
            { label: 'Pass %', value: selectedExam.studentCount > 0 ? Math.round((selectedExam.passCount / selectedExam.studentCount) * 100) : 0, color: '#f59e0b' },
          ].map((item) => (
            <View key={item.label} style={styles.distItem}>
              <Text style={[styles.distValue, { color: item.color }]}>{item.value}{item.label === 'Pass %' ? '%' : ''}</Text>
              <Text style={styles.distLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* Student marks list */}
        {examStudents.map((s: any) => (
          <View key={s.student_id} style={styles.studentMarkRow}>
            <View style={styles.markStudentInfo}>
              <Text style={styles.markStudentName}>{s.studentName}</Text>
              <Text style={styles.markStudentEnroll}>{s.enrollment}</Text>
            </View>
            <View style={styles.markScoreArea}>
              <Text style={[styles.markScore, { color: s.passed ? '#22c55e' : '#ef4444' }]}>
                {s.marks_obtained}/{s.total_marks}
              </Text>
              <Text style={styles.markPercent}>{s.percentage}%</Text>
            </View>
          </View>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  // ── Main List View ──
  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f59e0b" />}
    >
      {/* Batch Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.batchRow}>
        <TouchableOpacity
          style={[styles.batchChip, selectedBatch === 'all' && styles.batchChipActive]}
          onPress={() => setSelectedBatch('all')}
        >
          <Text style={[styles.batchChipText, selectedBatch === 'all' && styles.batchChipTextActive]}>
            🌐 All
          </Text>
        </TouchableOpacity>
        {batches.map((b) => (
          <TouchableOpacity
            key={b}
            style={[styles.batchChip, selectedBatch === b && styles.batchChipActive]}
            onPress={() => setSelectedBatch(b)}
          >
            <Text style={[styles.batchChipText, selectedBatch === b && styles.batchChipTextActive]}>{b}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Summary */}
      <View style={styles.summaryGrid}>
        <View style={{ width: '48%' }}>
          <StatCard title="Exams" value={stats.totalExams} color="#6366f1" />
        </View>
        <View style={{ width: '48%' }}>
          <StatCard title="Avg Score" value={stats.avgScore} color="#f59e0b" />
        </View>
      </View>

      {/* Exams List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📝 Submitted Exams</Text>

        {exams.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>No marks data found</Text>
            <Text style={styles.emptySubtext}>Enter marks to see reports here.</Text>
          </View>
        ) : (
          exams.map((exam) => (
            <TouchableOpacity key={exam.key} style={styles.examCard} onPress={() => handleExamPress(exam)} activeOpacity={0.7}>
              <View style={styles.examHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.examName}>{exam.examName}</Text>
                  <Text style={styles.examSubject}>{exam.subject}</Text>
                </View>
                <StatusBadge variant={exam.status === 'approved' ? 'success' : 'warning'}>
                  {exam.status}
                </StatusBadge>
              </View>

              <View style={styles.examStats}>
                <Text style={styles.examStat}>
                  🎓 {exam.studentCount} students
                </Text>
                <Text style={styles.examStat}>
                  📊 Avg: {exam.studentCount > 0 ? Math.round(exam.totalObtained / exam.studentCount) : 0}/{exam.totalMarks}
                </Text>
                <Text style={styles.examStat}>
                  ✅ Pass: {exam.passCount}/{exam.studentCount}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  loadingText: { marginTop: 12, fontSize: 14, color: '#6b7280' },

  // Batch
  batchRow: { marginBottom: 12, flexGrow: 0 },
  batchChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginRight: 8,
  },
  batchChipActive: { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
  batchChipText: { fontSize: 12, color: '#374151', fontWeight: '500' },
  batchChipTextActive: { color: '#fff' },

  // Stats
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },

  // Section
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 12 },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#6b7280' },
  emptySubtext: { fontSize: 13, color: '#9ca3af', marginTop: 4 },

  // Exam Cards
  examCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
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
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  examName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  examSubject: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  examStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  examStat: { fontSize: 11, color: '#6b7280' },

  // Back
  backBtn: {
    marginBottom: 12,
  },
  backBtnText: { fontSize: 14, color: '#f59e0b', fontWeight: '600' },

  // Exam Detail Header
  examDetailHeader: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  examDetailName: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 2 },
  examDetailSubject: { fontSize: 14, color: '#6b7280', marginBottom: 8 },
  examDetailMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  examDetailMetaText: { fontSize: 12, color: '#6b7280' },

  // Distribution
  distRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  distItem: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  distValue: { fontSize: 18, fontWeight: '800' },
  distLabel: { fontSize: 10, color: '#6b7280', marginTop: 2 },

  // Student Marks
  studentMarkRow: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  markStudentInfo: { flex: 1 },
  markStudentName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  markStudentEnroll: { fontSize: 11, color: '#6b7280', marginTop: 1 },
  markScoreArea: { alignItems: 'flex-end' },
  markScore: { fontSize: 15, fontWeight: '700' },
  markPercent: { fontSize: 11, color: '#6b7280', marginTop: 1 },
});
