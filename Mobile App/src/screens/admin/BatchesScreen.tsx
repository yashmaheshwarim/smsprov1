import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { supabase, isUuid } from '../../lib/supabase';
import { useAuth, AdminUser } from '../../contexts/AuthContext';
import StatusBadge from '../../components/StatusBadge';
import { generateBatchFullReport, generateBatchProgressReport } from '../../lib/pdf-report';

export default function BatchesScreen() {
  const { user } = useAuth();
  const adminUser = user as AdminUser;
  const instId = adminUser?.instituteId || '';

  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', className: '', subjects: '' });

  useEffect(() => {
    if (isUuid(instId)) fetchBatches();
  }, [instId]);

  const fetchBatches = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('batches')
        .select('*')
        .eq('institute_id', instId)
        .order('created_at', { ascending: false });

      if (data) {
        const batchesWithCounts = await Promise.all(
          data.map(async (batch: any) => {
            const { count } = await supabase
              .from('students')
              .select('*', { count: 'exact', head: true })
              .eq('institute_id', instId)
              .eq('batch_id', batch.id);
            return {
              ...batch,
              studentCount: count || 0,
            };
          })
        );
        setBatches(batchesWithCounts);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.name || !form.className) {
      Alert.alert('Error', 'Batch name and class are required');
      return;
    }

    try {
      const subjects = form.subjects.split(',').map((s) => s.trim()).filter(Boolean);

      if (editingId) {
        await supabase
          .from('batches')
          .update({ name: form.name, class_name: form.className, subjects })
          .eq('id', editingId);
      } else {
        await supabase.from('batches').insert([
          {
            institute_id: instId,
            name: form.name,
            class_name: form.className,
            subjects,
            status: 'active',
          },
        ]);
      }

      setShowModal(false);
      setEditingId(null);
      setForm({ name: '', className: '', subjects: '' });
      fetchBatches();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const openEdit = (batch: any) => {
    setEditingId(batch.id);
    setForm({
      name: batch.name,
      className: batch.class_name,
      subjects: (batch.subjects || []).join(', '),
    });
    setShowModal(true);
  };

  // ── Batch-wise reports ────────────────────────────────────────────────
  const [exportingBatch, setExportingBatch] = useState<string | null>(null);

  /** Fetch a batch's students + their all-time attendance and marks (chunked .in queries). */
  const fetchBatchReportData = async (batchId: string) => {
    const chunkIds = (arr: string[]) => {
      const out: string[][] = [];
      for (let i = 0; i < arr.length; i += 100) out.push(arr.slice(i, i + 100));
      return out;
    };

    const { data: students, error } = await supabase
      .from('students')
      .select('id, name, enrollment_no')
      .eq('batch_id', batchId)
      .eq('status', 'active')
      .order('name');
    if (error) throw error;
    const ids = (students || []).map((s: any) => s.id);
    if (ids.length === 0) throw new Error('No active students in this batch.');

    const fetchChunked = async (table: string, cols: string, dateCol: string) => {
      const results: any[] = [];
      for (const part of chunkIds(ids)) {
        const { data: rows } = await supabase.from(table).select(cols).in('student_id', part);
        if (rows) results.push(...rows);
      }
      return results.map((r: any) => ({ ...r, date: String(r[dateCol] || '').split('T')[0] }));
    };

    const [attendance, examAttendance, marks] = await Promise.all([
      fetchChunked('attendance', 'student_id, date, status', 'date'),
      fetchChunked('exam_attendance', 'student_id, exam_date, status', 'exam_date'),
      fetchChunked('marks', 'student_id, exam_name, subject, marks_obtained, total_marks, is_absent, exam_date', 'exam_date'),
    ]);

    return { studentList: students || [], attendance, examAttendance, marks };
  };

  /** Aggregate one student's attendance (deduped by day) and exam averages. */
  const buildStudentSummary = (
    s: { id: string; name: string; enrollment_no: string },
    attendance: any[],
    examAttendance: any[],
    marks: any[]
  ) => {
    // Days: merge lecture + exam attendance per date; present > leave > absent
    const dayMap = new Map<string, string[]>();
    attendance
      .filter((r) => r.student_id === s.id)
      .forEach((r) => {
        const list = dayMap.get(r.date) || [];
        list.push(r.status);
        dayMap.set(r.date, list);
      });
    examAttendance
      .filter((r) => r.student_id === s.id)
      .forEach((r) => {
        const list = dayMap.get(r.date) || [];
        list.push(r.status);
        dayMap.set(r.date, list);
      });

    const monthly = new Map<string, { present: number; absent: number; leave: number }>();
    let present = 0, absent = 0, leave = 0;
    dayMap.forEach((statuses, day) => {
      let bucket: 'present' | 'leave' | 'absent' = 'absent';
      if (statuses.some((st) => st === 'present' || st === 'late' || st === 'half-day')) bucket = 'present';
      else if (statuses.some((st) => st === 'leave')) bucket = 'leave';
      if (bucket === 'present') present++; else if (bucket === 'leave') leave++; else absent++;
      const month = day.slice(0, 7);
      const agg = monthly.get(month) ?? { present: 0, absent: 0, leave: 0 };
      if (bucket === 'present') agg.present++; else if (bucket === 'leave') agg.leave++; else agg.absent++;
      monthly.set(month, agg);
    });
    const total = present + absent + leave;

    const attendanceMonthly = Array.from(monthly.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, m]) => {
        const monthTotal = m.present + m.absent + m.leave;
        return {
          month: new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
          present: m.present,
          absent: m.absent,
          leave: m.leave,
          total: monthTotal,
          percentage: monthTotal > 0 ? Math.round((m.present / monthTotal) * 100) : 0,
        };
      });

    // Marks: dedupe by exam+subject+date, compute exam average %
    const seen = new Set<string>();
    const weighted: number[] = [];
    const examMarks: { date: string; exam: string; subject: string; obtained: number | null; total: number; absent: boolean }[] = [];
    marks
      .filter((m) => m.student_id === s.id)
      .forEach((m) => {
        const date = String(m.exam_date || '').split('T')[0];
        const key = `${m.exam_name || ''}|${m.subject || ''}|${date}`;
        if (seen.has(key)) return;
        seen.add(key);
        examMarks.push({
          date,
          exam: m.exam_name || 'Exam',
          subject: m.subject || 'N/A',
          obtained: m.is_absent ? null : Number(m.marks_obtained ?? 0),
          total: Number(m.total_marks ?? 0),
          absent: !!m.is_absent,
        });
        if (!m.is_absent && Number(m.total_marks || 0) > 0) {
          weighted.push((Number(m.marks_obtained ?? 0) / Number(m.total_marks)) * 100);
        }
      });

    return {
      name: s.name,
      enrollmentNo: s.enrollment_no,
      attendanceStats: {
        present,
        absent,
        leave,
        total,
        percentage: total > 0 ? Math.round((present / total) * 100) : 0,
      },
      attendanceMonthly,
      examAvg: weighted.length > 0 ? Math.round((weighted.reduce((a, b) => a + b, 0) / weighted.length) * 10) / 10 : null,
      examMarks,
    };
  };

  const handleBatchReport = async (batch: any, mode: 'full' | 'progress') => {
    setExportingBatch(batch.id);
    try {
      const { studentList, attendance, examAttendance, marks } = await fetchBatchReportData(batch.id);
      const summaries = studentList.map((s: any) => buildStudentSummary(s, attendance, examAttendance, marks));
      const generatedAt = new Date().toISOString();
      if (mode === 'full') {
        await generateBatchFullReport({
          instituteName: adminUser?.instituteName || 'Institute',
          batchName: batch.name,
          className: batch.class_name,
          generatedAt,
          students: summaries,
        });
      } else {
        await generateBatchProgressReport({
          instituteName: adminUser?.instituteName || 'Institute',
          batchName: batch.name,
          className: batch.class_name,
          generatedAt,
          rows: summaries.map((s: any) => ({
            name: s.name,
            enrollmentNo: s.enrollmentNo,
            total: s.attendanceStats.total,
            present: s.attendanceStats.present,
            absent: s.attendanceStats.absent,
            leave: s.attendanceStats.leave,
            attPct: s.attendanceStats.percentage,
            examAvg: s.examAvg,
          })),
        });
      }
      Alert.alert('Report Ready', `Batch ${mode === 'full' ? 'full' : 'progress'} report generated — share or save the PDF.`);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not generate batch report.');
    } finally {
      setExportingBatch(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Batches</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            setEditingId(null);
            setForm({ name: '', className: '', subjects: '' });
            setShowModal(true);
          }}
        >
          <Text style={styles.addButtonText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#6366f1" style={{ marginTop: 20 }} />
      ) : (
        <ScrollView>
          {batches.map((batch) => (
            <View key={batch.id} style={styles.batchCard}>
              <View style={styles.batchHeader}>
                <Text style={styles.batchName}>{batch.name}</Text>
                <StatusBadge
                  variant={batch.status === 'active' ? 'success' : 'default'}
                >
                  {batch.status}
                </StatusBadge>
              </View>
              <Text style={styles.batchClass}>Class: {batch.class_name}</Text>
              <Text style={styles.batchStudents}>🎓 {batch.studentCount} students</Text>
              <View style={styles.subjectRow}>
                {(batch.subjects || []).map((s: string) => (
                  <View key={s} style={styles.subjectTag}>
                    <Text style={styles.subjectTagText}>{s}</Text>
                  </View>
                ))}
              </View>
              {/* Batch-wise report downloads */}
              <View style={styles.reportRow}>
                <TouchableOpacity
                  style={styles.reportBtn}
                  onPress={() => handleBatchReport(batch, 'full')}
                  disabled={!!exportingBatch}
                >
                  <Text style={styles.reportBtnText}>
                    {exportingBatch === batch.id ? '⏳ Generating…' : '📄 Full Report'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.reportBtn}
                  onPress={() => handleBatchReport(batch, 'progress')}
                  disabled={!!exportingBatch}
                >
                  <Text style={styles.reportBtnText}>📊 Progress Report</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => openEdit(batch)}
              >
                <Text style={styles.editButtonText}>✏️ Edit</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Add/Edit Modal */}
      <Modal visible={showModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingId ? 'Edit Batch' : 'Create Batch'}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Batch Name"
              placeholderTextColor="#9ca3af"
              value={form.name}
              onChangeText={(text) => setForm({ ...form, name: text })}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Class / Standard"
              placeholderTextColor="#9ca3af"
              value={form.className}
              onChangeText={(text) => setForm({ ...form, className: text })}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Subjects (comma separated)"
              placeholderTextColor="#9ca3af"
              value={form.subjects}
              onChangeText={(text) => setForm({ ...form, subjects: text })}
            />
            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>
                {editingId ? 'Update' : 'Create'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowModal(false)}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  reportRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  reportBtn: {
    flex: 1,
    backgroundColor: '#eef2ff',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  reportBtnText: { fontSize: 12, fontWeight: '700', color: '#4338ca' },
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  pageTitle: { fontSize: 22, fontWeight: '700', color: '#111827' },
  addButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  addButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  batchCard: {
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
  batchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  batchName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  batchClass: { fontSize: 13, color: '#6b7280', marginBottom: 4 },
  batchStudents: { fontSize: 13, color: '#6b7280', marginBottom: 8 },
  subjectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 8 },
  subjectTag: {
    backgroundColor: '#eef2ff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  subjectTagText: { fontSize: 11, color: '#6366f1', fontWeight: '500' },
  editButton: { alignSelf: 'flex-start' },
  editButtonText: { fontSize: 13, color: '#6366f1', fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 16 },
  modalInput: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#111827',
    marginBottom: 12,
  },
  saveButton: {
    backgroundColor: '#6366f1',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cancelButton: { alignItems: 'center', paddingVertical: 8 },
  cancelText: { color: '#6b7280', fontWeight: '500' },
});
