import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase, isUuid } from '../../lib/supabase';
import { useAuth, AdminUser } from '../../contexts/AuthContext';
import StatusBadge from '../../components/StatusBadge';

export default function StudentsScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const adminUser = user as AdminUser;
  const instId = adminUser?.instituteId || '';

  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [suspendModalVisible, setSuspendModalVisible] = useState(false);
  const [suspendStudent, setSuspendStudent] = useState<any>(null);
  const [suspendDays, setSuspendDays] = useState('');

  useEffect(() => {
    if (isUuid(instId)) fetchStudents();
  }, [instId]);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('students')
        .select('id, name, enrollment_no, batch_name, status, student_phone, suspended_until')
        .eq('institute_id', instId)
        .order('created_at', { ascending: false });

      setStudents(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = students.filter(
    (s) =>
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.enrollment_no?.toLowerCase().includes(search.toLowerCase())
  );

  const isSuspended = (student: any) => {
    if (!student.suspended_until) return false;
    return new Date(student.suspended_until) > new Date();
  };

  const handleSuspend = async () => {
    if (!suspendStudent) return;
    const days = parseInt(suspendDays, 10);
    if (isNaN(days) || days <= 0) {
      Alert.alert('Error', 'Please enter a valid number of days.');
      return;
    }
    const suspendedUntil = new Date();
    suspendedUntil.setDate(suspendedUntil.getDate() + days);
    const { error } = await supabase
      .from('students')
      .update({ suspended_until: suspendedUntil.toISOString() })
      .eq('id', suspendStudent.id);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('✅ Suspended', `${suspendStudent.name} suspended for ${days} day(s).`);
      setSuspendModalVisible(false);
      setSuspendStudent(null);
      fetchStudents();
    }
  };

  const handleUnsuspend = async (student: any) => {
    const { error } = await supabase
      .from('students')
      .update({ suspended_until: null })
      .eq('id', student.id);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('✅ Unsuspended', `${student.name} has been unsuspended.`);
      fetchStudents();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or enrollment..."
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <Text style={styles.countText}>
        {filtered.length} student{filtered.length !== 1 ? 's' : ''}
      </Text>

      {loading ? (
        <ActivityIndicator size="large" color="#6366f1" style={{ marginTop: 20 }} />
      ) : (
        <ScrollView>
          {filtered.map((student) => (
            <TouchableOpacity
              key={student.id}
              style={styles.studentCard}
              onPress={() => navigation.navigate('StudentDetail', { studentId: student.id })}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {student.name
                    ?.split(' ')
                    .map((n: string) => n[0])
                    .join('')
                    .toUpperCase()}
                </Text>
              </View>
              <View style={styles.studentInfo}>
                <Text style={styles.studentName}>{student.name}</Text>
                <Text style={styles.studentEnroll}>{student.enrollment_no}</Text>
                <Text style={styles.studentBatch}>{student.batch_name}</Text>
              </View>
              <StatusBadge
                variant={student.status === 'active' ? 'success' : 'danger'}
              >
                {student.status}
              </StatusBadge>
              <TouchableOpacity
                style={[styles.suspendBtn, isSuspended(student) && styles.unsuspendBtn]}
                onPress={() => {
                  if (isSuspended(student)) {
                    handleUnsuspend(student);
                  } else {
                    setSuspendStudent(student);
                    setSuspendDays('');
                    setSuspendModalVisible(true);
                  }
                }}
              >
                <Text style={[styles.suspendBtnText, isSuspended(student) && styles.unsuspendBtnText]}>
                  {isSuspended(student) ? '↩️ Unsuspend' : '⏸️ Suspend'}
                </Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Suspend Modal */}
      <Modal visible={suspendModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>⏸️ Suspend Student</Text>
            <Text style={styles.modalSubtitle}>
              Suspend {suspendStudent?.name} for how many days?
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Number of days (e.g. 7)"
              placeholderTextColor="#9ca3af"
              keyboardType="numeric"
              value={suspendDays}
              onChangeText={setSuspendDays}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => { setSuspendModalVisible(false); setSuspendStudent(null); }}
              >
                <Text style={[styles.modalBtnText, { color: '#374151' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleSuspend}
              >
                <Text style={styles.modalBtnText}>Suspend</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 16,
  },
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
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
  },
  countText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
    marginBottom: 12,
  },
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
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6366f1',
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  studentEnroll: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  studentBatch: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 2,
  },
  suspendBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fbbf24',
    marginLeft: 8,
  },
  suspendBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#b45309',
  },
  unsuspendBtn: {
    backgroundColor: '#dcfce7',
    borderColor: '#22c55e',
  },
  unsuspendBtnText: {
    color: '#16a34a',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '80%',
    maxWidth: 360,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalConfirmBtn: {
    flex: 1,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
