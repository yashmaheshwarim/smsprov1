import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth, TeacherUser } from '../../contexts/AuthContext';
import { useTableChange } from '../../contexts/RealtimeDataContext';
import StatusBadge from '../../components/StatusBadge';

const todayStr = new Date().toISOString().split('T')[0];

export default function TeacherExamAttendance() {
  const { user } = useAuth();
  const teacher = user as TeacherUser;
  const instId = teacher.instituteId;

  // Step 1: Select batch and subject
  const [batches, setBatches] = useState<string[]>([]);
  const [selectedBatch, setSelectedBatch] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [examName, setExamName] = useState('');

  // Step 2: Students and attendance
  const [students, setStudents] = useState<any[]>([]);
  const [records, setRecords] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showConfig, setShowConfig] = useState(true);

  // Existing exams
  const [existingExams, setExistingExams] = useState<any[]>([]);
  const [showExamPicker, setShowExamPicker] = useState(false);
  const [newExamInput, setNewExamInput] = useState('');

  // Real-time: re-fetch when marks/exam_attendance change on any device
  useTableChange('marks', () => { fetchInitialData(); }, [instId]);
  useTableChange('exam_attendance', () => { fetchInitialData(); }, [instId]);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const assigned = teacher.assignedClasses || [];
      setBatches(assigned);
      if (assigned.length > 0) setSelectedBatch(assigned[0]);
      if (teacher.assignedSubjects?.length > 0) setSelectedSubject(teacher.assignedSubjects[0]);

      // Fetch existing exam names from marks table (all teachers + admin)
      const { data: marks } = await supabase
        .from('marks')
        .select('exam_name, subject, exam_date, batch:batch_id (name)')
        .eq('institute_id', instId);

      const examMap = new Map<string, { examName: string; subject: string; batch: string; examDate: string }>();
      (marks || []).forEach((m: any) => {
        if (m.exam_name && m.subject) {
          const dateStr = m.exam_date || todayStr;
          const key = `${m.exam_name}|${m.subject}|${m.batch?.name || ''}|${dateStr}`;
          if (!examMap.has(key)) {
            examMap.set(key, { examName: m.exam_name, subject: m.subject, batch: m.batch?.name || '', examDate: dateStr });
          }
        }
      });

      // Also fetch from exam_attendance table (exams saved directly from attendance page)
      const { data: eaData } = await supabase
        .from('exam_attendance')
        .select('exam_name, subject, exam_date')
        .eq('institute_id', instId);

      (eaData || []).forEach((ea: any) => {
        if (ea.exam_name) {
          const dateStr = ea.exam_date || todayStr;
          const key = `${ea.exam_name}|${ea.subject || ''}||${dateStr}`;
          if (!examMap.has(key)) {
            examMap.set(key, { examName: ea.exam_name, subject: ea.subject || '', batch: '', examDate: dateStr });
          }
        }
      });

      setExistingExams(Array.from(examMap.values()));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudents = useCallback(async () => {
    if (!selectedBatch) return;
    setLoading(true);
    try {
      const { data: sData } = await supabase
        .from('students')
        .select('id, name, enrollment_no')
        .eq('institute_id', instId)
        .eq('batch_name', selectedBatch)
        .eq('status', 'active')
        .order('name');

      const studentList = sData || [];
      setStudents(studentList);

      // Check for existing exam attendance
      const studentIds = studentList.map((s: any) => s.id);
      const initial: Record<string, string> = {};

      if (studentIds.length > 0 && examName) {
        const { data: eaData } = await supabase
          .from('exam_attendance')
          .select('student_id, status')
          .eq('institute_id', instId)
          .eq('exam_name', examName)
          .eq('exam_date', todayStr);

        if (eaData) {
          eaData.forEach((a: any) => {
            initial[a.student_id] = a.status;
          });
        }
      }

      studentList.forEach((s: any) => {
        if (!initial[s.id]) initial[s.id] = 'present';
      });
      setRecords(initial);
      setShowConfig(false);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedBatch, examName, instId]);

  const updateStatus = useCallback((studentId: string, status: string) => {
    setRecords((prev) => ({ ...prev, [studentId]: status }));
  }, []);

  const markAllAs = useCallback((status: string) => {
    const newRecords = { ...records };
    students.forEach((s) => {
      newRecords[s.id] = status;
    });
    setRecords(newRecords);
  }, [records, students]);

  const handleSave = async () => {
    if (!examName || !selectedSubject) {
      Alert.alert('Error', 'Please set exam name and subject first.');
      return;
    }
    setSaving(true);
    try {
      const currentIds = students.map((s) => s.id);

      // ── 1. Save exam_attendance rows ──
      const recordsToSave = Object.entries(records)
        .filter(([studentId]) => currentIds.includes(studentId))
        .map(([studentId, status]) => ({
          institute_id: instId,
          student_id: studentId,
          exam_name: examName,
          subject: selectedSubject,
          exam_date: todayStr,
          status,
        }));

      // Delete existing exam_attendance for this exam
      await supabase
        .from('exam_attendance')
        .delete()
        .eq('institute_id', instId)
        .eq('exam_name', examName)
        .eq('exam_date', todayStr);

      const { error: eaError } = await supabase.from('exam_attendance').insert(recordsToSave);
      if (eaError) throw eaError;

      // ── 2. Sync absent students to marks table so report cards include them ──
      // Find the batch_id for this batch name
      const { data: batchData } = await supabase
        .from('batches')
        .select('id')
        .eq('institute_id', instId)
        .eq('name', selectedBatch)
        .single();

      const batchId = batchData?.id || null;

      // Build marks rows — absent students get is_absent=true, marks_obtained=0
      const absentStudents = Object.entries(records)
        .filter(([studentId, status]) => currentIds.includes(studentId) && status === 'absent');

      if (absentStudents.length > 0) {
        const marksToUpsert = absentStudents.map(([studentId]) => ({
          institute_id: instId,
          batch_id: batchId,
          student_id: studentId,
          exam_name: examName,
          subject: selectedSubject,
          marks_obtained: 0,
          total_marks: 50,
          exam_date: todayStr,
          is_absent: true,
          status: 'pending' as const,
          submitted_by: teacher.name || 'Teacher',
          submitted_by_role: 'teacher' as const,
        }));

        const { error: marksError } = await supabase.from('marks').upsert(marksToUpsert as any, {
          onConflict: 'institute_id,student_id,exam_name,subject,exam_date',
        });
        if (marksError) console.warn('Could not sync absent to marks table:', marksError.message);
      }

      Alert.alert('✅ Saved', `Exam attendance saved for ${students.length} students.`);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSelectExistingExam = (exam: any) => {
    setExamName(exam.examName);
    setSelectedSubject(exam.subject);
    setShowExamPicker(false);
  };

  const presentCount = students.filter((s) => records[s.id] === 'present').length;
  const absentCount = students.filter((s) => records[s.id] === 'absent').length;

  if (loading && students.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f59e0b" />
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Config Section */}
        <View style={styles.configCard}>
          <Text style={styles.configTitle}>📝 Exam Attendance</Text>
          <Text style={styles.configSubtitle}>Mark attendance for exams</Text>

          {/* Batch Selector */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {batches.map((b) => (
              <TouchableOpacity
                key={b}
                style={[styles.chip, selectedBatch === b && styles.chipActive]}
                onPress={() => { setSelectedBatch(b); setShowConfig(true); }}
              >
                <Text style={[styles.chipText, selectedBatch === b && styles.chipTextActive]}>{b}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Subject Selector */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {(teacher.assignedSubjects || []).map((sub) => (
              <TouchableOpacity
                key={sub}
                style={[styles.chip, selectedSubject === sub && styles.chipActive]}
                onPress={() => setSelectedSubject(sub)}
              >
                <Text style={[styles.chipText, selectedSubject === sub && styles.chipTextActive]}>{sub}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Exam Name */}
          <View style={styles.examNameRow}>
            <TouchableOpacity style={styles.examNameInput} onPress={() => setShowExamPicker(true)}>
              <Text style={examName ? styles.examNameText : styles.examNamePlaceholder}>
                {examName || 'Select or type exam name'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.loadBtn} onPress={fetchStudents}>
              <Text style={styles.loadBtnText}>Load</Text>
            </TouchableOpacity>
          </View>
        </View>

        {!showConfig && students.length > 0 && (
          <>
            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={[styles.statBox, { backgroundColor: '#dcfce7', borderColor: '#22c55e' }]}>
                <Text style={styles.statIcon}>✅</Text>
                <Text style={[styles.statNumber, { color: '#166534' }]}>{presentCount}</Text>
                <Text style={styles.statLabel}>Present</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: '#fee2e2', borderColor: '#ef4444' }]}>
                <Text style={styles.statIcon}>❌</Text>
                <Text style={[styles.statNumber, { color: '#991b1b' }]}>{absentCount}</Text>
                <Text style={styles.statLabel}>Absent</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: '#fef3c7', borderColor: '#f59e0b' }]}>
                <Text style={styles.statNumber}>{students.length}</Text>
                <Text style={styles.statLabel}>Total</Text>
              </View>
            </View>

            {/* Bulk */}
            <View style={styles.bulkActions}>
              <TouchableOpacity style={styles.bulkPresentBtn} onPress={() => markAllAs('present')}>
                <Text style={styles.bulkBtnText}>✅ All Present</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.bulkAbsentBtn} onPress={() => markAllAs('absent')}>
                <Text style={styles.bulkBtnText}>❌ All Absent</Text>
              </TouchableOpacity>
            </View>

            {/* Students */}
            {students.map((student) => (
              <View key={student.id} style={styles.studentRow}>
                <View style={styles.studentInfo}>
                  <Text style={styles.studentName}>{student.name}</Text>
                  <Text style={styles.studentEnroll}>{student.enrollment_no}</Text>
                </View>
                <View style={styles.statusButtons}>
                  {(['present', 'absent'] as const).map((status) => {
                    const isActive = records[student.id] === status;
                    return (
                      <TouchableOpacity
                        key={status}
                        style={[
                          styles.statusBtn,
                          {
                            backgroundColor: isActive ? (status === 'present' ? '#22c55e' : '#ef4444') : '#f3f4f6',
                          },
                        ]}
                        onPress={() => updateStatus(student.id, status)}
                      >
                        <Text style={[styles.statusBtnText, { color: isActive ? '#fff' : '#9ca3af' }]}>
                          {status === 'present' ? 'P' : 'A'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}

            {/* Save */}
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <View style={styles.savingRow}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.saveButtonText}>  Saving...</Text>
                </View>
              ) : (
                <Text style={styles.saveButtonText}>💾 Save Exam Attendance</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {!showConfig && students.length === 0 && (
          <Text style={styles.emptyText}>No students found in this batch.</Text>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Exam Picker Modal */}
      <Modal visible={showExamPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalIcon}>📋</Text>
              <Text style={styles.modalTitle}>Select or Enter Exam</Text>
            </View>

            {existingExams.length > 0 && (
              <>
                <Text style={styles.modalSubtitle}>Your existing exams:</Text>
                <ScrollView style={{ maxHeight: 250 }}>
                  {existingExams.map((exam, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.examOption}
                      onPress={() => handleSelectExistingExam(exam)}
                    >
                      <Text style={styles.examOptionName}>{exam.examName}</Text>
                      <Text style={styles.examOptionSub}>{exam.subject} {exam.batch ? `· ${exam.batch}` : ''} {exam.examDate ? `· ${exam.examDate}` : ''}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            <Text style={[styles.modalSubtitle, { marginTop: 12 }]}>Or type a new exam name:</Text>
            <TextInput
              style={styles.newExamInput}
              placeholder="Enter exam name..."
              placeholderTextColor="#9ca3af"
              value={newExamInput}
              onChangeText={setNewExamInput}
            />
            <TouchableOpacity
              style={styles.newExamBtn}
              onPress={() => {
                if (newExamInput.trim()) {
                  setExamName(newExamInput.trim());
                  setNewExamInput('');
                  setShowExamPicker(false);
                } else {
                  Alert.alert('Error', 'Please enter an exam name.');
                }
              }}
            >
              <Text style={styles.newExamBtnText}>✏️ Use This Name</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowExamPicker(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#f8fafc' },
  container: { flex: 1, padding: 16 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },

  // Config
  configCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  configTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 2 },
  configSubtitle: { fontSize: 13, color: '#6b7280', marginBottom: 16 },
  chipRow: { marginBottom: 10 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginRight: 8,
  },
  chipActive: { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextActive: { color: '#fff' },
  examNameRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  examNameInput: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  examNameText: { fontSize: 14, color: '#111827', fontWeight: '500' },
  examNamePlaceholder: { fontSize: 14, color: '#9ca3af' },
  loadBtn: {
    backgroundColor: '#f59e0b',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  loadBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statBox: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  statIcon: { fontSize: 18, marginBottom: 4 },
  statNumber: { fontSize: 24, fontWeight: '700', color: '#111827' },
  statLabel: { fontSize: 11, color: '#6b7280', marginTop: 4 },

  // Bulk Actions
  bulkActions: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  bulkPresentBtn: {
    flex: 1,
    backgroundColor: '#dcfce7',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#22c55e',
  },
  bulkAbsentBtn: {
    flex: 1,
    backgroundColor: '#fee2e2',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  bulkBtnText: { fontSize: 13, fontWeight: '600', color: '#374151' },

  // Students
  studentRow: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  studentInfo: { flex: 1 },
  studentName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  studentEnroll: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  statusButtons: { flexDirection: 'row', gap: 6 },
  statusBtn: {
    width: 42,
    height: 38,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBtnText: { fontSize: 15, fontWeight: '800' },

  // Save
  saveButton: {
    backgroundColor: '#f59e0b',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonDisabled: { opacity: 0.7 },
  savingRow: { flexDirection: 'row', alignItems: 'center' },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', marginTop: 40 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  modalHeader: { alignItems: 'center', marginBottom: 16 },
  modalIcon: { fontSize: 32, marginBottom: 4 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  modalSubtitle: { fontSize: 13, color: '#6b7280', marginBottom: 8 },
  examOption: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 14,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  examOptionName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  examOptionSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  newExamBtn: {
    backgroundColor: '#fef3c7',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  newExamBtnText: { fontSize: 14, fontWeight: '600', color: '#92400e' },
  newExamInput: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    marginBottom: 8,
  },
  cancelBtn: {
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
});
