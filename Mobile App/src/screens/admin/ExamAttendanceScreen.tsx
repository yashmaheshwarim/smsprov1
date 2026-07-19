import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Linking,
  FlatList,
} from 'react-native';
import { supabase, isUuid } from '../../lib/supabase';
import { useAuth, AdminUser } from '../../contexts/AuthContext';
import { formatWhatsAppPhone } from '../../lib/utils';
import { sendAbsentNotification, sendBulkAbsentNotifications } from '../../lib/whatsapp-service';
import StatusBadge from '../../components/StatusBadge';

const today = new Date().toISOString().split('T')[0];

interface ExamInfo {
  examName: string;
  subject: string;
  batch: string;
  examDate: string;
}

export default function ExamAttendanceScreen() {
  const { user } = useAuth();
  const adminUser = user as AdminUser;
  const instId = adminUser?.instituteId || '';

  const [activeTab, setActiveTab] = useState<'lecture' | 'exam'>('lecture');
  const [students, setStudents] = useState<any[]>([]);
  const [records, setRecords] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState('all');
  const [batches, setBatches] = useState<string[]>([]);

  // Exam attendance specific
  const [exams, setExams] = useState<ExamInfo[]>([]);
  const [selectedExam, setSelectedExam] = useState<ExamInfo | null>(null);
  const [showExamSelector, setShowExamSelector] = useState(false);
  const [examDateFilter, setExamDateFilter] = useState('');
  const [fetchingExams, setFetchingExams] = useState(false);

  // Absent popup state
  const [showAbsentPopup, setShowAbsentPopup] = useState(false);
  const [absentStudents, setAbsentStudents] = useState<any[]>([]);

  useEffect(() => {
    if (isUuid(instId)) {
      fetchData();
      fetchExams();
    }
  }, [instId]);

  const fetchExams = async () => {
    setFetchingExams(true);
    try {
      const examMap = new Map<string, ExamInfo>();

      // Fetch from marks table
      const { data, error } = await supabase
        .from('marks')
        .select('exam_name, subject, exam_date, batch:batch_id (name)')
        .eq('institute_id', instId);

      if (!error && data) {
        data.forEach((d: any) => {
          if (d.exam_name && d.subject) {
            const dateStr = d.exam_date || today;
            const key = `${d.exam_name}|${d.subject}|${d.batch?.name || ''}|${dateStr}`;
            if (!examMap.has(key)) {
              examMap.set(key, {
                examName: d.exam_name,
                subject: d.subject,
                batch: d.batch?.name || '',
                examDate: dateStr,
              });
            }
          }
        });
      }

      // Fetch from exam_attendance table
      const { data: eaData } = await supabase
        .from('exam_attendance')
        .select('exam_name, subject, exam_date')
        .eq('institute_id', instId);

      if (eaData) {
        eaData.forEach((d: any) => {
          if (d.exam_name) {
            const dateStr = d.exam_date || today;
            const key = `${d.exam_name}|${d.subject || ''}||${dateStr}`;
            if (!examMap.has(key)) {
              examMap.set(key, {
                examName: d.exam_name,
                subject: d.subject || '',
                batch: '',
                examDate: dateStr,
              });
            }
          }
        });
      }

      setExams(Array.from(examMap.values()));
    } catch (err) {
      console.error('Failed to fetch exams:', err);
    } finally {
      setFetchingExams(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: sData } = await supabase
        .from('students')
        .select('id, name, enrollment_no, batch_name, student_phone, father_phone, mother_phone')
        .eq('institute_id', instId)
        .eq('status', 'active')
        .order('name');

      setStudents(sData || []);
      const batchNames = [
        ...new Set((sData || []).map((s: any) => s.batch_name).filter(Boolean)),
      ] as string[];
      setBatches(batchNames);

      let initialRecords: Record<string, string> = {};

      if (activeTab === 'exam' && selectedExam) {
        const effectiveDate = examDateFilter || today;
        const { data: eaData } = await supabase
          .from('exam_attendance')
          .select('student_id, status')
          .eq('institute_id', instId)
          .eq('exam_name', selectedExam.examName)
          .eq('exam_date', effectiveDate);

        (sData || []).forEach((s: any) => {
          if (selectedExam.batch && s.batch_name !== selectedExam.batch) return;
          const existing = eaData?.find((a: any) => a.student_id === s.id);
          initialRecords[s.id] = existing ? existing.status : 'present';
        });
      } else {
        const { data: aData } = await supabase
          .from('attendance')
          .select('student_id, status')
          .eq('institute_id', instId)
          .eq('date', today);

        (sData || []).forEach((s: any) => {
          const existing = aData?.find((a: any) => a.student_id === s.id);
          initialRecords[s.id] = existing ? existing.status : 'present';
        });
      }

      setRecords(initialRecords);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = useCallback((studentId: string, status: string) => {
    setRecords((prev) => ({ ...prev, [studentId]: status }));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (activeTab === 'exam' && selectedExam) {
        const effectiveDate = examDateFilter || today;
        const recordsToSave = Object.entries(records)
          .filter(([_, status]) => status === 'present' || status === 'absent' || status === 'leave')
          .map(([studentId, status]) => ({
            institute_id: instId,
            student_id: studentId,
            exam_name: selectedExam.examName,
            subject: selectedExam.subject,
            exam_date: effectiveDate,
            status,
          }));

        // Delete existing
        await supabase
          .from('exam_attendance')
          .delete()
          .eq('institute_id', instId)
          .eq('exam_name', selectedExam.examName)
          .eq('exam_date', effectiveDate);

        const { error } = await supabase.from('exam_attendance').insert(recordsToSave);
        if (error) throw error;
      } else {
        const attendanceToSave = Object.entries(records).map(([studentId, status]) => ({
          institute_id: instId,
          student_id: studentId,
          date: today,
          status,
          type: 'lecture',
        }));

        await supabase
          .from('attendance')
          .delete()
          .eq('institute_id', instId)
          .eq('date', today);

        const { error } = await supabase.from('attendance').insert(attendanceToSave);
        if (error) throw error;
      }

      // Collect absent students
      const absent = students
        .filter((s) => {
          // Only include students relevant to the current view
          if (activeTab === 'exam' && selectedExam?.batch) {
            return s.batch_name === selectedExam.batch && records[s.id] === 'absent';
          }
          if (selectedBatch !== 'all') {
            return s.batch_name === selectedBatch && records[s.id] === 'absent';
          }
          return records[s.id] === 'absent';
        })
        .map((s) => ({
          id: s.id,
          name: s.name,
          phone: s.student_phone || s.father_phone || s.mother_phone,
          enrollmentNo: s.enrollment_no,
          batch: s.batch_name,
        }))
        .filter((s) => s.phone);

      setAbsentStudents(absent);

      if (absent.length > 0) {
        setShowAbsentPopup(true);
      } else {
        Alert.alert('✅ Success', `${activeTab === 'exam' ? 'Exam' : 'Lecture'} attendance saved! No absent students to notify.`);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSelectExam = (exam: ExamInfo) => {
    setSelectedExam(exam);
    setShowExamSelector(false);
    setExamDateFilter(exam.examDate || '');
    setLoading(true);
    setTimeout(() => fetchData(), 0);
  };

  // ── Derived data ──
  const filteredStudents = useMemo(() => {
    if (activeTab === 'exam' && selectedExam?.batch) {
      return students.filter((s) => s.batch_name === selectedExam.batch);
    }
    return selectedBatch === 'all'
      ? students
      : students.filter((s) => s.batch_name === selectedBatch);
  }, [students, selectedBatch, activeTab, selectedExam]);

  const presentCount = filteredStudents.filter((s) => records[s.id] === 'present').length;
  const absentCount = filteredStudents.filter((s) => records[s.id] === 'absent').length;
  const leaveCount = filteredStudents.filter((s) => records[s.id] === 'leave').length;

  const markAllAs = useCallback((status: string) => {
    const newRecords = { ...records };
    filteredStudents.forEach((s) => {
      newRecords[s.id] = status;
    });
    setRecords(newRecords);
  }, [records, filteredStudents]);

  const sendWhatsApp = async (phone: string, studentName: string, studentId: string) => {
    if (!phone) {
      Alert.alert('No Phone', `${studentName} has no phone number on record.`);
      return;
    }

    // Send via real WhatsApp service
    try {
      const result = await sendAbsentNotification(instId, phone, studentName);
      if (result.success) {
        Alert.alert('✅ Sent', `WhatsApp message sent to ${studentName}'s parent.`);
      } else {
        Alert.alert('⚠️ Error', result.error || 'Could not send WhatsApp message.');
      }
    } catch (err: any) {
      // Fallback: open wa.me
      const formattedPhone = formatWhatsAppPhone(phone);
      const message = `Dear Parent, this is to inform you that ${studentName} was marked absent for the ${selectedExam ? selectedExam.examName + ' exam' : 'lecture'} today (${new Date().toLocaleDateString('en-IN')}). Please contact the institute for more details.`;
      const waUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
      Linking.openURL(waUrl).catch(() => {
        Alert.alert('Error', 'Could not open WhatsApp.');
      });
    }
  };

  const sendBulkWhatsApp = async () => {
    try {
      const result = await sendBulkAbsentNotifications(
        instId,
        absentStudents.map((s) => ({ phone: s.phone, name: s.name }))
      );

      if (result.sent > 0) {
        Alert.alert(
          '✅ Bulk Sent',
          `${result.sent} absent notification${result.sent !== 1 ? 's' : ''} sent via WhatsApp.${result.failed > 0 ? `\n${result.failed} failed.` : ''}`
        );
      } else {
        const namesList = absentStudents.map((s) => s.name).join(', ');
        const msg = `Absent Students: ${namesList}. Date: ${new Date().toLocaleDateString('en-IN')}.`;
        const formattedPhone = formatWhatsAppPhone(absentStudents[0].phone);
        Linking.openURL(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(msg)}`).catch(() => {
          Alert.alert('Error', 'Could not send WhatsApp messages.');
        });
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not send WhatsApp messages.');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Tab Switcher */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'lecture' && styles.tabActive]}
            onPress={() => { setActiveTab('lecture'); setSelectedExam(null); setLoading(true); setTimeout(() => fetchData(), 0); }}
          >
            <Text style={[styles.tabText, activeTab === 'lecture' && styles.tabTextActive]}>📚 Lecture</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'exam' && styles.tabActive]}
            onPress={() => { setActiveTab('exam'); setLoading(true); setTimeout(() => fetchData(), 0); }}
          >
            <Text style={[styles.tabText, activeTab === 'exam' && styles.tabTextActive]}>📝 Exam</Text>
          </TouchableOpacity>
        </View>

        {/* Exam Selector */}
        {activeTab === 'exam' && (
          <TouchableOpacity
            style={styles.examSelector}
            onPress={() => setShowExamSelector(true)}
          >
            <Text style={styles.examSelectorIcon}>📋</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.examSelectorLabel}>
                {selectedExam ? `${selectedExam.examName} - ${selectedExam.subject}` : 'Select Exam'}
              </Text>
              {selectedExam && (
                <Text style={styles.examSelectorSub}>
                  {selectedExam.batch} · {selectedExam.examDate}
                </Text>
              )}
            </View>
            <Text style={styles.examSelectorArrow}>›</Text>
          </TouchableOpacity>
        )}

        {/* Exam Date Filter */}
        {activeTab === 'exam' && selectedExam && (
          <View style={styles.dateFilterRow}>
            <Text style={styles.dateFilterLabel}>Exam Date:</Text>
            <TouchableOpacity
              style={styles.dateFilterInput}
              onPress={() => {
                // Simple date input: set to today or next day
                const nextDate = new Date();
                nextDate.setDate(nextDate.getDate() + 1);
                const newDate = examDateFilter === today ? nextDate.toISOString().split('T')[0] : today;
                setExamDateFilter(newDate);
                setLoading(true);
                setTimeout(() => fetchData(), 0);
              }}
            >
              <Text style={styles.dateFilterText}>{examDateFilter || today}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Batch Filter (lecture only) */}
        {activeTab === 'lecture' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.batchRow}>
            <TouchableOpacity
              style={[styles.batchChip, selectedBatch === 'all' && styles.batchChipActive]}
              onPress={() => setSelectedBatch('all')}
            >
              <Text style={[styles.batchChipText, selectedBatch === 'all' && styles.batchChipTextActive]}>📋 All</Text>
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
        )}

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statBox, { backgroundColor: '#dcfce7', borderColor: '#22c55e' }]}>
            <Text style={styles.statIcon}>✅</Text>
            <Text style={[styles.statNumber, { color: '#166534' }]}>{presentCount}</Text>
            <Text style={styles.statLabel}>Present</Text>
          </View>
          <TouchableOpacity
            style={[styles.statBox, { backgroundColor: '#fee2e2', borderColor: '#ef4444' }]}
            onPress={() => {
              const abs = filteredStudents.filter((s) => records[s.id] === 'absent');
              if (abs.length > 0) {
                setAbsentStudents(abs.map((s) => ({
                  id: s.id,
                  name: s.name,
                  phone: s.student_phone || s.father_phone || s.mother_phone,
                  enrollmentNo: s.enrollment_no,
                  batch: s.batch_name,
                })).filter((s) => s.phone));
                setShowAbsentPopup(true);
              }
            }}
          >
            <Text style={styles.statIcon}>❌</Text>
            <Text style={[styles.statNumber, { color: '#991b1b' }]}>{absentCount}</Text>
            <Text style={styles.statLabel}>Absent</Text>
          </TouchableOpacity>
          <View style={[styles.statBox, { backgroundColor: '#fef3c7', borderColor: '#f59e0b' }]}>
            <Text style={styles.statIcon}>💤</Text>
            <Text style={[styles.statNumber, { color: '#92400e' }]}>{leaveCount}</Text>
            <Text style={styles.statLabel}>Leave</Text>
          </View>
        </View>

        {/* Bulk Actions */}
        <View style={styles.bulkActions}>
          <TouchableOpacity style={styles.bulkPresentBtn} onPress={() => markAllAs('present')}>
            <Text style={styles.bulkBtnText}>✅ Mark All Present</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.bulkAbsentBtn} onPress={() => markAllAs('absent')}>
            <Text style={styles.bulkBtnText}>❌ Mark All Absent</Text>
          </TouchableOpacity>
        </View>

        {/* Student Count */}
        <Text style={styles.countText}>
          Showing {filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''}
          {activeTab === 'exam' && selectedExam && ` for ${selectedExam.examName}`}
        </Text>

        {/* Student List */}
        {filteredStudents.map((student) => (
          <View key={student.id}>
            <View style={styles.studentRow}>
              <View style={styles.studentInfo}>
                <View style={styles.studentAvatar}>
                  <Text style={styles.studentAvatarText}>
                    {student.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                  </Text>
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.studentName}>{student.name}</Text>
                  <Text style={styles.studentEnroll}>{student.enrollment_no}</Text>
                </View>
              </View>
              <View style={styles.statusButtons}>
                {(['present', 'absent', 'leave'] as const).map((status) => {
                  const isActive = records[student.id] === status;
                  const colors = {
                    present: { bg: isActive ? '#22c55e' : '#f0fdf4', text: isActive ? '#fff' : '#22c55e' },
                    absent: { bg: isActive ? '#ef4444' : '#fef2f2', text: isActive ? '#fff' : '#ef4444' },
                    leave: { bg: isActive ? '#f59e0b' : '#fffbeb', text: isActive ? '#fff' : '#f59e0b' },
                  };
                  return (
                    <TouchableOpacity
                      key={status}
                      style={[
                        styles.statusBtn,
                        {
                          backgroundColor: colors[status].bg,
                          borderColor: isActive ? 'transparent' : '#e5e7eb',
                        },
                        isActive && styles.statusBtnActive,
                      ]}
                      onPress={() => updateStatus(student.id, status)}
                    >
                      <Text style={[styles.statusBtnText, { color: colors[status].text }]}>
                        {status === 'present' ? 'P' : status === 'absent' ? 'A' : 'L'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        ))}

        {/* Save Button */}
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
            <Text style={styles.saveButtonText}>
              💾 Save {activeTab === 'exam' ? 'Exam' : 'Lecture'} Attendance
            </Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Exam Selector Modal */}
      <Modal visible={showExamSelector} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalIcon}>📝</Text>
              <Text style={styles.modalTitle}>Select Exam</Text>
              <Text style={styles.modalSubtitle}>Choose an exam to mark attendance for</Text>
            </View>

            {fetchingExams ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#6366f1" />
              </View>
            ) : exams.length === 0 ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Text style={{ color: '#6b7280', fontSize: 14, textAlign: 'center' }}>
                  No exams found.{'\n'}Create exams in the Marks section first.
                </Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
                {exams.map((exam, index) => (
                  <TouchableOpacity
                    key={`${exam.examName}|${exam.subject}|${exam.batch}|${exam.examDate}`}
                    style={styles.examItem}
                    onPress={() => handleSelectExam(exam)}
                  >
                    <View style={styles.examItemNumber}>
                      <Text style={styles.examItemNumberText}>{index + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.examItemName}>{exam.examName}</Text>
                      <Text style={styles.examItemSub}>
                        {exam.subject} · {exam.batch || 'All'} · {exam.examDate}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <TouchableOpacity
              style={styles.modalDoneBtn}
              onPress={() => setShowExamSelector(false)}
            >
              <Text style={styles.modalDoneText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Absent Students WhatsApp Popup */}
      <Modal visible={showAbsentPopup} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalIcon}>📢</Text>
              <Text style={styles.modalTitle}>Notify Absent Students</Text>
              <Text style={styles.modalSubtitle}>
                {absentStudents.length} student{absentStudents.length !== 1 ? 's' : ''} marked absent
                {activeTab === 'exam' && selectedExam && ` for ${selectedExam.examName}`}
              </Text>
            </View>

            <ScrollView style={styles.absentList} showsVerticalScrollIndicator={false}>
              {absentStudents.map((student) => (
                <View key={student.id} style={styles.absentItem}>
                  <View style={styles.absentInfo}>
                    <Text style={styles.absentName}>{student.name}</Text>
                    <Text style={styles.absentBatch}>{student.batch} · {student.enrollmentNo}</Text>
                    <Text style={styles.absentPhone}>📞 {student.phone}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.whatsappBtn}
                    onPress={() => sendWhatsApp(student.phone, student.name, student.id)}
                  >
                    <Text style={styles.whatsappBtnText}>📱 Send</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            <View style={styles.modalActions}>
              {absentStudents.length > 1 && (
                <TouchableOpacity style={styles.bulkWhatsAppBtn} onPress={sendBulkWhatsApp}>
                  <Text style={styles.bulkWhatsAppText}>
                    📤 Send All ({absentStudents.length})
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.modalDoneBtn} onPress={() => setShowAbsentPopup(false)}>
                <Text style={styles.modalDoneText}>✅ Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  // Tabs
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 3,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 },
  tabText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  tabTextActive: { color: '#6366f1' },
  // Exam Selector
  examSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  examSelectorIcon: { fontSize: 20, marginRight: 12 },
  examSelectorLabel: { fontSize: 14, fontWeight: '600', color: '#111827' },
  examSelectorSub: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  examSelectorArrow: { fontSize: 24, color: '#9ca3af', fontWeight: '300' },
  // Exam items
  examItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  examItemNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  examItemNumberText: { fontSize: 12, fontWeight: '700', color: '#6366f1' },
  examItemName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  examItemSub: { fontSize: 11, color: '#6b7280', marginTop: 1 },
  // Date filter
  dateFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateFilterLabel: { fontSize: 13, color: '#6b7280', fontWeight: '500', marginRight: 8 },
  dateFilterInput: {
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  dateFilterText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  // Existing styles (reused from AttendanceScreen)
  batchRow: { marginBottom: 16 },
  batchChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginRight: 8,
  },
  batchChipActive: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  batchChipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  batchChipTextActive: { color: '#fff' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statBox: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  statIcon: { fontSize: 18, marginBottom: 4 },
  statNumber: { fontSize: 24, fontWeight: '700' },
  statLabel: { fontSize: 11, color: '#6b7280', marginTop: 4, fontWeight: '500' },
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
  countText: { fontSize: 12, color: '#6b7280', fontWeight: '500', marginBottom: 8 },
  studentRow: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  studentInfo: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  studentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  studentAvatarText: { fontSize: 11, fontWeight: '700', color: '#6366f1' },
  studentName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  studentEnroll: { fontSize: 11, color: '#6b7280', marginTop: 1 },
  statusButtons: { flexDirection: 'row', gap: 6 },
  statusBtn: {
    flex: 1,
    height: 38,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  statusBtnActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  statusBtnText: { fontSize: 15, fontWeight: '800' },
  saveButton: {
    backgroundColor: '#6366f1',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonDisabled: { opacity: 0.7 },
  savingRow: { flexDirection: 'row', alignItems: 'center' },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  modalHeader: { alignItems: 'center', marginBottom: 20 },
  modalIcon: { fontSize: 40, marginBottom: 8 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 4 },
  modalSubtitle: { fontSize: 14, color: '#6b7280' },
  absentList: { maxHeight: 300, marginBottom: 16 },
  absentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#fee2e2',
  },
  absentInfo: { flex: 1 },
  absentName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  absentBatch: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  absentPhone: { fontSize: 12, color: '#991b1b', marginTop: 2 },
  whatsappBtn: {
    backgroundColor: '#22c55e',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  whatsappBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  modalActions: { gap: 8 },
  bulkWhatsAppBtn: {
    backgroundColor: '#22c55e',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  bulkWhatsAppText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalDoneBtn: {
    backgroundColor: '#f3f4f6',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalDoneText: { color: '#374151', fontSize: 15, fontWeight: '600' },
});
