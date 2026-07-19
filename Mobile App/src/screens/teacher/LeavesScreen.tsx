import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth, TeacherUser } from '../../contexts/AuthContext';

export default function TeacherLeaves() {
  const { user } = useAuth();
  const teacher = user as TeacherUser;
  const [form, setForm] = useState({
    type: 'sick',
    fromDate: '',
    toDate: '',
    reason: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.fromDate || !form.reason) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }

    setSaving(true);
    try {
      const { data: teacherRecord } = await supabase
        .from('teachers')
        .select('id')
        .eq('email', teacher.email)
        .maybeSingle();

      const { error } = await supabase.from('leave_requests').insert([
        {
          institute_id: teacher.instituteId,
          teacher_id: teacherRecord?.id || null,
          teacher_name: teacher.name,
          type: form.type,
          from_date: form.fromDate,
          to_date: form.toDate || form.fromDate,
          reason: form.reason,
          status: 'pending',
        },
      ]);

      if (error) throw error;

      Alert.alert('Success', 'Leave request submitted for approval.');
      setForm({ type: 'sick', fromDate: '', toDate: '', reason: '' });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.pageTitle}>Apply for Leave</Text>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Leave Type</Text>
        <View style={styles.typeRow}>
          {['sick', 'personal', 'vacation', 'other'].map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.typeChip,
                form.type === type && styles.typeChipActive,
              ]}
              onPress={() => setForm({ ...form, type })}
            >
              <Text
                style={[
                  styles.typeChipText,
                  form.type === type && styles.typeChipTextActive,
                ]}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>From Date</Text>
        <TextInput
          style={styles.input}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#9ca3af"
          value={form.fromDate}
          onChangeText={(text) => setForm({ ...form, fromDate: text })}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>To Date (Optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#9ca3af"
          value={form.toDate}
          onChangeText={(text) => setForm({ ...form, toDate: text })}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Reason *</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Please describe your reason for leave"
          placeholderTextColor="#9ca3af"
          value={form.reason}
          onChangeText={(text) => setForm({ ...form, reason: text })}
          multiline
          numberOfLines={4}
        />
      </View>

      <TouchableOpacity
        style={styles.submitButton}
        onPress={handleSubmit}
        disabled={saving}
      >
        <Text style={styles.submitButtonText}>
          {saving ? 'Submitting...' : '📤 Submit Leave Request'}
        </Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  pageTitle: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 24 },
  formGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  typeChipActive: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  typeChipText: { fontSize: 13, color: '#374151' },
  typeChipTextActive: { color: '#fff' },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    color: '#111827',
  },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  submitButton: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
