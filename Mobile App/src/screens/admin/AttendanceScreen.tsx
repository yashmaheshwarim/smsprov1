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

export default function AttendanceScreen() {
  const { user } = useAuth();
  const adminUser = user as AdminUser;
  const instId = adminUser?.instituteId || '';

  const [students, setStudents] = useState<any[]>([]);
  const [records, setRecords] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState('all');
  const [batches, setBatches] = useState<string[]>([]);

  // Absent popup state
  const [showAbsentPopup, setShowAbsentPopup] = useState(false);
  const [absentStudents, setAbsentStudents] = useState<any[]>([]);

  useEffect(() => {
    if (isUuid(instId)) fetchData();
  }, [instId]);

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

      const { data: aData } = await supabase
        .from('attendance')
        .select('student_id, status')
        .eq('institute_id', instId)
        .eq('date', today);

      const initialRecords: Record<string, string> = {};
      (sData || []).forEach((s: any) => {
        const existing = aData?.find((a: any) => a.student_id === s.id);
        initialRecords[s.id] = existing ? existing.status : 'present';
      });
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
      // Get the student IDs for the current batch filter
      const batchStudentIds = new Set(filteredStudents.map((s) => s.id));

      // Only save records for students in the selected batch
      const attendanceToSave = Object.entries(records)
        .filter(([studentId]) => batchStudentIds.has(studentId))
        .map(([studentId, status]) => ({
          institute_id: instId,
          student_id: studentId,
          date: today,
          status,
          type: 'lecture',
        }));

      // Delete existing attendance only for students in this batch
      await supabase
        .from('attendance')
        .delete()
        .eq('institute_id', instId)
        .eq('date', today)
        .in('student_id', Array.from(batchStudentIds));

      const { error } = await supabase.from('attendance').insert(attendanceToSave);
      if (error) throw error;

      // Collect absent students from the current batch only
      const absent = filteredStudents
        .filter((s) => records[s.id] === 'absent')
        .map((s) => ({
          id: s.id,
          name: s.name,
          phone: s.student_phone || s.father_phone || s.mother_phone,
          enrollmentNo: s.enrollment_no,
          batch: s.batch_name,
        }))
        .filter((s) => s.phone); // Only those with phone numbers

      setAbsentStudents(absent);

      if (absent.length > 0) {
        setShowAbsentPopup(true);
      } else {
        Alert.alert('✅ Success', 'Attendance saved! No absent students to notify.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Derived data (must be declared before useCallbacks that reference them) ──
  const filteredStudents = useMemo(
    () =>
      selectedBatch === 'all'
        ? students
        : students.filter((s) => s.batch_name === selectedBatch),
    [students, selectedBatch]
  );

  const presentCount = filteredStudents.filter((s) => records[s.id] === 'present').length;
  const absentCount = filteredStudents.filter((s) => records[s.id] === 'absent').length;
  const leaveCount = filteredStudents.filter((s) => records[s.id] === 'leave').length;

  // Mark all selected as Present/Absent
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

    // Send via real WhatsApp service (Baileys server REST API)
    try {
      const result = await sendAbsentNotification(instId, phone, studentName);
      if (result.success) {
        Alert.alert('✅ Sent', `WhatsApp message sent to ${studentName}'s parent.`);
      } else {
        Alert.alert('⚠️ Error', result.error || 'Could not send WhatsApp message.');
      }
    } catch (err: any) {
      // Final fallback: open wa.me link
      const formattedPhone = formatWhatsAppPhone(phone);
      const message = `Dear Parent, this is to inform you that ${studentName} was marked absent today (${new Date().toLocaleDateString('en-IN')}). Please contact the institute for more details.`;
      const waUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
      Linking.openURL(waUrl).catch(() => {
        Alert.alert('Error', 'Could not open WhatsApp. Make sure WhatsApp is installed.');
      });
    }
  };

  const sendBulkWhatsApp = async () => {
    // Send via real WhatsApp service
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
        // Final fallback: open wa.me with first parent
        const namesList = absentStudents.map((s) => s.name).join(', ');
        const totalCount = absentStudents.length;
        const msg = `Absent Students (${totalCount}): ${namesList}. Date: ${new Date().toLocaleDateString('en-IN')}. Please contact the institute for more details.`;
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
        {/* Date Display */}
        <View style={styles.headerCard}>
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

        {/* Batch Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.batchRow}>
          <TouchableOpacity
            style={[styles.batchChip, selectedBatch === 'all' && styles.batchChipActive]}
            onPress={() => setSelectedBatch('all')}
          >
            <Text style={[styles.batchChipText, selectedBatch === 'all' && styles.batchChipTextActive]}>
              📋 All
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
          <TouchableOpacity
            style={styles.bulkPresentBtn}
            onPress={() => markAllAs('present')}
          >
            <Text style={styles.bulkBtnText}>✅ Mark All Present</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.bulkAbsentBtn}
            onPress={() => markAllAs('absent')}
          >
            <Text style={styles.bulkBtnText}>❌ Mark All Absent</Text>
          </TouchableOpacity>
        </View>

        {/* Student Count */}
        <Text style={styles.countText}>
          Showing {filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''}
        </Text>

        {/* Student List */}
        {filteredStudents.map((student) => (
          <React.Fragment key={student.id}>
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
          </React.Fragment>
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

      {/* Absent Students WhatsApp Popup */}
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
                    onPress={() => sendWhatsApp(student.phone, student.name, student.id)}
                  >
                    <Text style={styles.whatsappBtnText}>📱 Send</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            <View style={styles.modalActions}>
              {absentStudents.length > 1 && (
                <TouchableOpacity
                  style={styles.bulkWhatsAppBtn}
                  onPress={sendBulkWhatsApp}
                >
                  <Text style={styles.bulkWhatsAppText}>
                    📤 Send All ({absentStudents.length})
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.modalDoneBtn}
                onPress={() => setShowAbsentPopup(false)}
              >
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
  headerCard: {
    backgroundColor: '#6366f1',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  dateLabel: { fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '600', letterSpacing: 1 },
  dateText: { fontSize: 16, color: '#fff', fontWeight: '600', marginTop: 4 },
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
