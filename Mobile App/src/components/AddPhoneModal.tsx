import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Alert,
} from 'react-native';
import { supabase } from '../lib/supabase';

interface AddPhoneModalProps {
  visible: boolean;
  onClose: () => void;
  studentId: string | null;
  studentName: string;
  /** Called after the number is saved so callers can update their local state. */
  onSaved?: (studentId: string, phone: string) => void;
}

/**
 * Quick "add mobile number" modal — lets staff feed a missing phone number for
 * a student right from the absent-students popup, so every absent student can
 * be notified without leaving the attendance flow.
 */
export default function AddPhoneModal({ visible, onClose, studentId, studentName, onSaved }: AddPhoneModalProps) {
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  // Fresh input each time the modal opens (or another student is targeted).
  useEffect(() => {
    if (visible) setPhone('');
  }, [visible, studentId]);

  const handleSave = async () => {
    if (!studentId) return;
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      Alert.alert('Invalid Number', 'Please enter a valid mobile number (at least 10 digits).');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('students')
        .update({ student_phone: digits })
        .eq('id', studentId);
      if (error) throw error;
      Alert.alert('✅ Saved', `${studentName}'s mobile number was added.`);
      onSaved?.(studentId, digits);
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not save the number.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>📞 Add Mobile Number</Text>
          {!!studentName && (
            <Text style={styles.subtitle}>
              For <Text style={styles.subtitleStrong}>{studentName}</Text> — saved to their profile so absent notifications can reach them.
            </Text>
          )}

          <TextInput
            style={styles.input}
            placeholder="e.g. 9876543210"
            placeholderTextColor="#9ca3af"
            keyboardType="phone-pad"
            autoFocus
            value={phone}
            onChangeText={setPhone}
          />

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveText}>Save Number</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = {
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%' as const,
    maxWidth: 360,
  },
  title: { fontSize: 18, fontWeight: '700' as const, color: '#111827', marginBottom: 6 },
  subtitle: { fontSize: 13, color: '#6b7280', marginBottom: 14 },
  subtitleStrong: { fontWeight: '600' as const, color: '#374151' },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#f9fafb',
    marginBottom: 16,
  },
  actions: { flexDirection: 'row' as const, gap: 10 },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center' as const,
  },
  cancelText: { color: '#374151', fontSize: 15, fontWeight: '600' as const },
  saveBtn: {
    flex: 1,
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center' as const,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '700' as const },
};
