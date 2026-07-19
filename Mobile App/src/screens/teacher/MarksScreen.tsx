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
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth, TeacherUser } from '../../contexts/AuthContext';
import StatusBadge from '../../components/StatusBadge';

export default function TeacherMarks() {
  const { user } = useAuth();
  const teacher = user as TeacherUser;
  const instId = teacher.instituteId;

  // Tab state
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');

  // Marks entry state
  const [batches, setBatches] = useState<string[]>([]);
  const [batchIdMap, setBatchIdMap] = useState<Record<string, string>>({});
  const [selectedBatch, setSelectedBatch] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [manualSubject, setManualSubject] = useState('');
  const [students, setStudents] = useState<any[]>([]);
  const [examName, setExamName] = useState('');
  const [examDate, setExamDate] = useState(new Date().toISOString().split('T')[0]);
  const [totalMarks, setTotalMarks] = useState('50');
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingExamKey, setEditingExamKey] = useState('');

  // History state
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const assigned = teacher.assignedClasses || [];
      setBatches(assigned);

      // Fetch batch_id mapping for batch_name lookup
      if (assigned.length > 0) {
        const { data: batchData } = await supabase
          .from('batches')
          .select('id, name')
          .eq('institute_id', instId)
          .in('name', assigned);

        const idMap: Record<string, string> = {};
        (batchData || []).forEach((b: any) => { idMap[b.name] = b.id; });
        setBatchIdMap(idMap);
      }

      if (assigned.length > 0) setSelectedBatch(assigned[0]);
      if (teacher.assignedSubjects?.length > 0) setSelectedSubject(teacher.assignedSubjects[0]);

      // Fetch students for first batch
      if (assigned.length > 0) {
        await loadStudents(assigned[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadStudents = async (batchName: string, existingMarks?: Record<string, string>) => {
    const { data } = await supabase
      .from('students')
      .select('id, name, enrollment_no')
      .eq('institute_id', instId)
      .eq('batch_name', batchName)
      .eq('status', 'active')
      .order('name');

    setStudents(data || []);
    setMarks(existingMarks || {});
  };

  const handleBatchChange = async (batchName: string) => {
    setSelectedBatch(batchName);
    setEditingExamKey('');
    setMarks({});
    await loadStudents(batchName);
  };

  const getSubject = () => {
    if (selectedSubject) return selectedSubject;
    if (manualSubject.trim()) return manualSubject.trim();
    return '';
  };

  const handleSubjectChange = (subject: string) => {
    setSelectedSubject(subject);
    setManualSubject('');
    setMarks({});
  };

  // ═══ Load existing marks for editing ═══
  const loadExistingMarks = async (examKey: string) => {
    const parts = examKey.split('|');
    if (parts.length < 2) return;
    const exName = parts[0];
    const sub = parts[1];

    setExamName(exName);
    setSelectedSubject(sub);
    setEditingExamKey(examKey);

    const { data } = await supabase
      .from('marks')
      .select('student_id, marks_obtained, total_marks, exam_date')
      .eq('institute_id', instId)
      .eq('exam_name', exName)
      .eq('subject', sub)
      .eq('submitted_by', teacher.name)
      .limit(1);

    if (data && data.length > 0) {
      setTotalMarks(String((data[0] as any).total_marks || 50));
      setExamDate((data[0] as any).exam_date || new Date().toISOString().split('T')[0]);
    }

    const existing: Record<string, string> = {};
    (data || []).forEach((m: any) => {
      existing[m.student_id] = String(m.marks_obtained);
    });
    setMarks(existing);
  };

  const handleSubmitMarks = async (bypassApproval = false) => {
    const subject = getSubject();
    if (!examName || !subject) {
      Alert.alert('Error', 'Please enter exam name and subject');
      return;
    }

    const batchId = batchIdMap[selectedBatch] || null;

    const marksToInsert = Object.entries(marks)
      .filter(([_, value]) => value !== '')
      .map(([studentId, value]) => ({
        institute_id: instId,
        batch_id: batchId,
        student_id: studentId,
        exam_name: examName,
        subject: subject,
        marks_obtained: parseInt(value) || 0,
        total_marks: parseInt(totalMarks) || 50,
        exam_date: examDate,
        status: bypassApproval ? 'approved' as const : 'pending' as const,
        submitted_by: teacher.name,
        submitted_by_role: 'teacher' as const,
      }));

    if (marksToInsert.length === 0) {
      Alert.alert('Error', 'Please enter marks for at least one student');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('marks').upsert(marksToInsert as any, {
        onConflict: 'institute_id,student_id,exam_name,subject',
      });

      if (error) throw error;

      Alert.alert(
        '✅ Success',
        bypassApproval
          ? `${marksToInsert.length} marks saved directly (approved).`
          : `${marksToInsert.length} marks submitted for admin approval.`
      );
      setExamName('');
      setSelectedSubject('');
      setManualSubject('');
      setEditingExamKey('');
      setMarks({});
      // Refresh history
      fetchHistory();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data } = await supabase
        .from('marks')
        .select('exam_name, subject, total_marks, status, created_at, submitted_by, marks_obtained, exam_date')
        .eq('institute_id', instId)
        .eq('submitted_by', teacher.name)
        .order('created_at', { ascending: false });

      if (data) {
        // Group by exam_name + subject
        const grouped: Record<string, any> = {};
        data.forEach((d: any) => {
          const key = `${d.exam_name}|${d.subject}`;
          if (!grouped[key]) {
            grouped[key] = {
              id: key,
              examName: d.exam_name,
              subject: d.subject,
              totalMarks: d.total_marks || 50,
              status: d.status || 'pending',
              submittedBy: d.submitted_by,
              createdAt: d.created_at,
              examDate: d.exam_date,
              studentCount: 0,
            };
          }
          grouped[key].studentCount++;
        });
        setSubmissions(Object.values(grouped));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // ═══ Fetch history on tab switch ═══
  useEffect(() => {
    if (activeTab === 'history') fetchHistory();
  }, [activeTab]);

  // ═══ Real-time subscription for status updates ═══
  useEffect(() => {
    // Subscribe to UPDATE events on marks table for this teacher
    const channel = supabase
      .channel('teacher-marks-status')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'marks',
          filter: `institute_id=eq.${instId}`,
        },
        (payload: any) => {
          // Only refresh if the status changed and was submitted by this teacher
          const record = payload.new;
          if (record.submitted_by === teacher.name && record.status) {
            // Refresh history to show updated status
            if (activeTab === 'history') {
              fetchHistory();
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [instId, teacher.name, activeTab]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f59e0b" />
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      {/* Tab Switcher */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'new' && styles.tabActive]}
          onPress={() => setActiveTab('new')}
        >
          <Text style={[styles.tabText, activeTab === 'new' && styles.tabTextActive]}>✏️ Enter Marks</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'history' && styles.tabActive]}
          onPress={() => setActiveTab('history')}
        >
          <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>📊 My Submissions</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {activeTab === 'new' ? (
          <>
            {/* Batch Selector */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {batches.map((b) => (
                <TouchableOpacity
                  key={b}
                  style={[styles.chip, selectedBatch === b && styles.chipActive]}
                  onPress={() => handleBatchChange(b)}
                >
                  <Text style={[styles.chipText, selectedBatch === b && styles.chipTextActive]}>{b}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Edit Mode Indicator */}
            {editingExamKey ? (
              <View style={styles.editBanner}>
                <Text style={styles.editBannerText}>✏️ Editing: {examName}</Text>
                <TouchableOpacity onPress={() => { setEditingExamKey(''); setExamName(''); setMarks({}); }}>
                  <Text style={styles.editBannerCancel}>✕ Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* Subject Selector */}
            {teacher.assignedSubjects && teacher.assignedSubjects.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
                {(teacher.assignedSubjects || []).map((sub) => (
                  <TouchableOpacity
                    key={sub}
                    style={[styles.chip, selectedSubject === sub && styles.chipActive]}
                    onPress={() => handleSubjectChange(sub)}
                  >
                    <Text style={[styles.chipText, selectedSubject === sub && styles.chipTextActive]}>{sub}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <TextInput
                style={[styles.formInput, { marginBottom: 10 }]}
                placeholder="Enter subject name..."
                placeholderTextColor="#9ca3af"
                value={manualSubject}
                onChangeText={(text) => { setManualSubject(text); setSelectedSubject(''); }}
              />
            )}

            {/* Exam Details */}
            <View style={styles.formRow}>
              <TextInput
                style={[styles.formInput, { flex: 2 }]}
                placeholder="Exam Name (e.g. Midterm, Final)"
                placeholderTextColor="#9ca3af"
                value={examName}
                onChangeText={setExamName}
              />
              <TextInput
                style={[styles.formInput, { width: 80 }]}
                placeholder="Total"
                placeholderTextColor="#9ca3af"
                value={totalMarks}
                onChangeText={setTotalMarks}
                keyboardType="numeric"
              />
            </View>

            {/* Exam Date */}
            <TextInput
              style={[styles.formInput, { marginBottom: 16 }]}
              placeholder="Date (YYYY-MM-DD)"
              placeholderTextColor="#9ca3af"
              value={examDate}
              onChangeText={setExamDate}
            />

            {/* Students */}
            {students.length === 0 ? (
              <Text style={styles.emptyText}>No students in this batch.</Text>
            ) : (
              students.map((student) => (
                <View key={student.id} style={styles.markRow}>
                  <View style={styles.studentInfo}>
                    <Text style={styles.studentName}>{student.name}</Text>
                    <Text style={styles.studentEnroll}>{student.enrollment_no}</Text>
                  </View>
                  <TextInput
                    style={styles.markInput}
                    placeholder="-"
                    placeholderTextColor="#d1d5db"
                    value={marks[student.id] || ''}
                    onChangeText={(text) => setMarks((prev) => ({ ...prev, [student.id]: text }))}
                    keyboardType="numeric"
                  />
                </View>
              ))
            )}

            {/* Submit Buttons */}
            <View style={styles.submitRow}>
              <TouchableOpacity
                style={[styles.saveButtonSecondary, saving && { opacity: 0.7 }]}
                onPress={() => handleSubmitMarks(true)}
                disabled={saving}
              >
                {saving ? (
                  <View style={styles.savingRow}>
                    <ActivityIndicator color="#fff" size="small" />
                    <Text style={styles.saveButtonText}>  Saving...</Text>
                  </View>
                ) : (
                  <Text style={styles.saveButtonText}>💾 Save Direct</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={() => handleSubmitMarks(false)}
                disabled={saving}
              >
                <Text style={styles.saveButtonText}>📤 Submit for Approval</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            {/* History */}
            {historyLoading ? (
              <ActivityIndicator size="large" color="#f59e0b" style={{ marginTop: 20 }} />
            ) : submissions.length === 0 ? (
              <View style={styles.emptyHistory}>
                <Text style={styles.emptyIcon}>📭</Text>
                <Text style={styles.emptyText}>No submissions yet</Text>
                <Text style={styles.emptySubtext}>Enter marks for exams and they will appear here.</Text>
              </View>
            ) : (
              submissions.map((sub) => (
                <TouchableOpacity
                  key={sub.id}
                  style={styles.submissionCard}
                  onPress={() => {
                    setActiveTab('new');
                    loadExistingMarks(sub.id);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.submissionHeader}>
                    <Text style={styles.submissionName}>{sub.examName}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <StatusBadge
                        variant={sub.status === 'approved' ? 'success' : sub.status === 'rejected' ? 'danger' : 'warning'}
                      >
                        {sub.status}
                      </StatusBadge>
                      <Text style={styles.editIcon}>✏️</Text>
                    </View>
                  </View>
                  <Text style={styles.submissionSubject}>
                    {sub.subject} · {sub.studentCount} students · Total: {sub.totalMarks}
                  </Text>
                  <Text style={styles.submissionDate}>
                    {sub.examDate
                      ? new Date(sub.examDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                      : new Date(sub.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#f8fafc' },
  container: { flex: 1, padding: 16 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 3,
    margin: 16,
    marginBottom: 0,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 },
  tabText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  tabTextActive: { color: '#f59e0b' },

  // Chips
  chipRow: { marginBottom: 10 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginRight: 8,
  },
  chipActive: { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextActive: { color: '#fff' },

  // Form
  formRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  formInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    color: '#111827',
  },

  // Marks
  markRow: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  studentInfo: { flex: 1 },
  studentName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  studentEnroll: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  markInput: {
    width: 60,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    color: '#111827',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },

  // Save
  submitRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#f59e0b',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonSecondary: {
    flex: 1,
    backgroundColor: '#22c55e',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonDisabled: { opacity: 0.7 },
  savingRow: { flexDirection: 'row', alignItems: 'center' },
  saveButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  // Empty
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', marginTop: 40 },
  emptyHistory: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptySubtext: { fontSize: 13, color: '#9ca3af', marginTop: 4, textAlign: 'center' },

  // Submissions
  submissionCard: {
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
  submissionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  submissionName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  submissionSubject: { fontSize: 13, color: '#6b7280', marginBottom: 4 },
  submissionDate: { fontSize: 12, color: '#9ca3af' },
  editIcon: { fontSize: 14, color: '#6366f1' },
  editBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#6366f1',
  },
  editBannerText: { fontSize: 14, fontWeight: '600', color: '#4338ca' },
  editBannerCancel: { fontSize: 13, fontWeight: '600', color: '#ef4444' },
});
