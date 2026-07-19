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
  Linking,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth, TeacherUser } from '../../contexts/AuthContext';
import { formatWhatsAppPhone } from '../../lib/utils';
import { sendAbsentNotification, sendBulkAbsentNotifications } from '../../lib/whatsapp-service';
import StatusBadge from '../../components/StatusBadge';

const todayStr = new Date().toISOString().split('T')[0];

export default function TeacherAttendance() {
  const { user } = useAuth();
  const teacher = user as TeacherUser;
  const instId = teacher.instituteId;

  const [batches, setBatches] = useState<any[]>([]);
  const [selectedBatch, setSelectedBatch] = useState('');
  const [students, setStudents] = useState<any[]>([]);
  const [records, setRecords] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Absent popup
  const [showAbsentPopup, setShowAbsentPopup] = useState(false);
  const [absentStudents, setAbsentStudents] = useState<any[]>([]);

  useEffect(() => {
    fetchBatches();
  }, []);

  const fetchBatches = async () => {
    setLoading(true);
    try {
      const assigned = teacher.assignedClasses || [];
      const batchData: { batchName: string; students: any[]; existingRecords: Record<string, string> }[] = [];

      for (const batchName of assigned) {
        const { data: studentsData } = await supabase
          .from('students')
          .select('id, name, enrollment_no, student_phone, father_phone, mother_phone')
          .eq('institute_id', instId)
          .eq('batch_name', batchName)
          .eq('status', 'active')
          .order('name');

        // Load existing attendance for today
        const studentIds = (studentsData || []).map((s: any) => s.id);
        const existing: Record<string, string> = {};

        if (studentIds.length > 0) {
          const { data: todayAtt } = await supabase
            .from('attendance')
            .select('student_id, status')
            .eq('date', todayStr)
            .in('student_id', studentIds);

          if (todayAtt) {
            todayAtt.forEach((a: any) => {
              existing[a.student_id] = a.status;
            });
          }
        }

        // Default to present for students without existing record
        (studentsData || []).forEach((s: any) => {
          if (!existing[s.id]) existing[s.id] = 'present';
        });

        batchData.push({ batchName, students: studentsData || [], existingRecords: existing });
      }

      setBatches(batchData);
      if (batchData.length > 0) {
        setSelectedBatch(batchData[0].batchName);
        setStudents(batchData[0].students);
        setRecords(batchData[0].existingRecords);
      }
    } catch (err) {
      console.error('[TeacherAttendance] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBatchChange = useCallback((batchName: string) => {
    setSelectedBatch(batchName);
    const batch = batches.find((b) => b.batchName === batchName);
    if (batch) {
      setStudents(batch.students);
      setRecords(batch.existingRecords);
    }
  }, [batches]);

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

  // Derived stats
  const presentCount = students.filter((s) => records[s.id] === 'present').length;
  const absentCount = students.filter((s) => records[s.id] === 'absent').length;
  const leaveCount = students.filter((s) => records[s.id] === 'leave').length;

  // ─── WhatsApp Notifications ──────────────────────────────────────

  const sendSingleWhatsApp = async (phone: string, studentName: string) => {
    if (!phone) {
      Alert.alert('No Phone', `${studentName} has no phone number on record.`);
      return;
    }
    const tryApiThenFallback = async () => {
      const result = await sendAbsentNotification(instId, phone, studentName);
      if (result.success) {
        Alert.alert('✅ Sent', `WhatsApp message sent to ${studentName}'s parent.`);
        return;
      }
      // API failed — message queued. Offer to open WhatsApp directly.
      const formattedPhone = formatWhatsAppPhone(phone);
      const msg = `Dear Parent, ${studentName} was marked absent today (${new Date().toLocaleDateString('en-IN')}). Please contact the institute for more details.`;
      Alert.alert(
        '📱 Open WhatsApp?',
        `${result.error}\n\nWould you like to open WhatsApp directly to send the message now?`,
        [
          { text: 'Later', style: 'cancel' },
          {
            text: 'Open WhatsApp',
            onPress: () => {
              Linking.openURL(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(msg)}`).catch(() => {
                Alert.alert('Error', 'Could not open WhatsApp.');
              });
            },
          },
        ]
      );
    };
    tryApiThenFallback();
  };

  const sendBulkWhatsApp = async () => {
    const result = await sendBulkAbsentNotifications(
      instId,
      absentStudents.map((s) => ({ phone: s.phone, name: s.name }))
    );
    if (result.sent > 0) {
      Alert.alert(
        '✅ Bulk Sent',
        `${result.sent} notification${result.sent !== 1 ? 's' : ''} sent.${result.failed > 0 ? ` ${result.failed} queued for later.` : ''}`
      );
      return;
    }

    // All failed — offer to open WhatsApp for the first student
    const namesList = absentStudents.map((s) => s.name).join(', ');
    const msg = `Absent Students: ${namesList}. Date: ${new Date().toLocaleDateString('en-IN')}.`;
    const firstPhone = absentStudents[0]?.phone;
    if (!firstPhone) {
      Alert.alert('⚠️ Failed', 'No valid phone numbers. Messages queued for backend delivery.');
      return;
    }
    const formattedPhone = formatWhatsAppPhone(firstPhone);
    Alert.alert(
      '📱 Messages Queued',
      `All ${absentStudents.length} messages have been queued for backend delivery.\n\nWould you like to open WhatsApp to send a quick summary instead?`,
      [
        { text: 'Done', style: 'cancel' },
        {
          text: 'Open WhatsApp',
          onPress: () => {
            Linking.openURL(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(msg)}`).catch(() => {
              Alert.alert('Error', 'Could not open WhatsApp.');
            });
          },
        },
      ]
    );
  };

  // ─── Save ────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    try {
      const currentStudentIds = students.map((s) => s.id);

      const attendanceToSave = Object.entries(records)
        .filter(([studentId]) => currentStudentIds.includes(studentId))
        .map(([studentId, status]) => ({
          institute_id: instId,
          student_id: studentId,
          date: todayStr,
          status,
          type: 'lecture',
        }));

      // Delete existing records for today for these students
      await supabase
        .from('attendance')
        .delete()
        .eq('institute_id', instId)
        .eq('date', todayStr)
        .in('student_id', currentStudentIds);

      const { error } = await supabase.from('attendance').insert(attendanceToSave);
      if (error) throw error;

      // Collect absent students with phone numbers
      const absent = students
        .filter((s) => records[s.id] === 'absent' && (s.student_phone || s.father_phone || s.mother_phone))
        .map((s) => ({
          id: s.id,
          name: s.name,
          phone: s.student_phone || s.father_phone || s.mother_phone,
          enrollmentNo: s.enrollment_no,
          batch: selectedBatch,
        }));

      setAbsentStudents(absent);

      if (absent.length > 0) {
        setShowAbsentPopup(true);
      } else {
        Alert.alert('✅ Saved', 'Attendance saved successfully!');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f59e0b" />
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Date Header */}
        <View style={styles.dateCard}>
          <Text style={styles.dateLabel}>TODAY</Text>
          <Text style={styles.dateText}>
            {new Date().toLocaleDateString('en-IN', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </Text>
        </View>

        {/* Batch Selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.batchRow}>
          {batches.map((b) => (
            <TouchableOpacity
              key={b.batchName}
              style={[styles.batchChip, selectedBatch === b.batchName && styles.batchChipActive]}
              onPress={() => handleBatchChange(b.batchName)}
            >
              <Text style={[styles.batchChipText, selectedBatch === b.batchName && styles.batchChipTextActive]}>
                {b.batchName} ({b.students.length})
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

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
            <Text style={styles.statIcon}>💤</Text>
            <Text style={[styles.statNumber, { color: '#92400e' }]}>{leaveCount}</Text>
            <Text style={styles.statLabel}>Leave</Text>
          </View>
        </View>

        {/* Bulk Actions */}
        <View style={styles.bulkActions}>
          <TouchableOpacity style={styles.bulkPresentBtn} onPress={() => markAllAs('present')}>
            <Text style={styles.bulkBtnText}>✅ All Present</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.bulkAbsentBtn} onPress={() => markAllAs('absent')}>
            <Text style={styles.bulkBtnText}>❌ All Absent</Text>
          </TouchableOpacity>
        </View>

        {/* Count */}
        <Text style={styles.countText}>{students.length} student{students.length !== 1 ? 's' : ''}</Text>

        {/* Student List */}
        {students.map((student) => (
          <View key={student.id} style={styles.studentRow}>
            <View style={styles.studentInfo}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
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
                      { backgroundColor: colors[status].bg, borderColor: isActive ? 'transparent' : '#e5e7eb' },
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
            <Text style={styles.saveButtonText}>💾 Save Attendance</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Absent WhatsApp Popup */}
      <Modal visible={showAbsentPopup} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalIcon}>📢</Text>
              <Text style={styles.modalTitle}>Notify Absent Students</Text>
              <Text style={styles.modalSubtitle}>
                {absentStudents.length} student{absentStudents.length !== 1 ? 's' : ''} marked absent
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
                    onPress={() => sendSingleWhatsApp(student.phone, student.name)}
                  >
                    <Text style={styles.whatsappBtnText}>📱 Send</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            <View style={styles.modalActions}>
              {absentStudents.length > 1 && (
                <TouchableOpacity style={styles.bulkWhatsAppBtn} onPress={sendBulkWhatsApp}>
                  <Text style={styles.bulkWhatsAppText}>📤 Send All ({absentStudents.length})</Text>
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
  wrapper: { flex: 1, backgroundColor: '#f8fafc' },
  container: { flex: 1, padding: 16 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },

  // Date Header
  dateCard: {
    backgroundColor: '#f59e0b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  dateLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: '600', letterSpacing: 1 },
  dateText: { fontSize: 16, color: '#fff', fontWeight: '600', marginTop: 4 },

  // Batches
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
  batchChipActive: { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
  batchChipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  batchChipTextActive: { color: '#fff' },

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
  statNumber: { fontSize: 24, fontWeight: '700' },
  statLabel: { fontSize: 11, color: '#6b7280', marginTop: 4, fontWeight: '500' },

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
  countText: { fontSize: 12, color: '#6b7280', fontWeight: '500', marginBottom: 8 },

  // Students
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
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fef3c7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 11, fontWeight: '700', color: '#f59e0b' },
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

  // WhatsApp Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
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
