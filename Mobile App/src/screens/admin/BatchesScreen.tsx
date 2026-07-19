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
