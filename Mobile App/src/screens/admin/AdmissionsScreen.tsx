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
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';

export default function AdmissionsScreen() {
  const { user } = useAuth();
  const adminUser = user as AdminUser;
  const instId = adminUser?.instituteId || '';

  const [inquiries, setInquiries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState({ studentName: '', parentName: '', phone: '', email: '', className: '', source: 'Walk-in' });

  useEffect(() => {
    if (isUuid(instId)) fetchInquiries();
  }, [instId]);

  const fetchInquiries = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('inquiries')
        .select('*')
        .eq('institute_id', instId)
        .order('created_at', { ascending: false });

      setInquiries(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!form.studentName) {
      Alert.alert('Error', 'Student name is required');
      return;
    }
    try {
      await supabase.from('inquiries').insert([{
        institute_id: instId,
        student_name: form.studentName,
        parent_name: form.parentName,
        phone: form.phone,
        email: form.email,
        class_name: form.className,
        source: form.source,
        status: 'new',
      }]);
      setShowAddModal(false);
      setForm({ studentName: '', parentName: '', phone: '', email: '', className: '', source: 'Walk-in' });
      fetchInquiries();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from('inquiries').update({ status }).eq('id', id);
    fetchInquiries();
  };

  const filtered = inquiries.filter(
    (i) =>
      i.student_name?.toLowerCase().includes(search.toLowerCase()) ||
      i.parent_name?.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: inquiries.length,
    active: inquiries.filter((i) => !['converted', 'rejected'].includes(i.status)).length,
    converted: inquiries.filter((i) => i.status === 'converted').length,
  };

  return (
    <View style={styles.container}>
      <View style={styles.statsRow}>
        <StatCard title="Total" value={stats.total} color="#6366f1" />
        <StatCard title="Active Leads" value={stats.active} color="#f59e0b" />
        <StatCard title="Converted" value={stats.converted} color="#22c55e" />
      </View>

      <View style={styles.headerRow}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search..."
            placeholderTextColor="#9ca3af"
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
          <Text style={styles.addButtonText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#6366f1" style={{ marginTop: 20 }} />
      ) : (
        <ScrollView>
          {filtered.map((inq) => (
            <View key={inq.id} style={styles.inquiryCard}>
              <View style={styles.inquiryHeader}>
                <Text style={styles.inquiryName}>{inq.student_name}</Text>
                <StatusBadge
                  variant={
                    inq.status === 'converted'
                      ? 'success'
                      : inq.status === 'rejected'
                        ? 'danger'
                        : inq.status === 'new'
                          ? 'info'
                          : 'warning'
                  }
                >
                  {inq.status}
                </StatusBadge>
              </View>
              <Text style={styles.inquiryParent}>Parent: {inq.parent_name || 'N/A'}</Text>
              <Text style={styles.inquiryPhone}>📞 {inq.phone || 'N/A'}</Text>
              <Text style={styles.inquiryClass}>📚 {inq.class_name || 'N/A'}</Text>
              {inq.status !== 'converted' && inq.status !== 'rejected' && (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.approveBtn}
                    onPress={() => updateStatus(inq.id, 'approved')}
                  >
                    <Text style={styles.approveBtnText}>✓ Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rejectBtn}
                    onPress={() => updateStatus(inq.id, 'rejected')}
                  >
                    <Text style={styles.rejectBtnText}>✗ Reject</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Add Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Inquiry</Text>
            <TextInput style={styles.modalInput} placeholder="Student Name *" placeholderTextColor="#9ca3af" value={form.studentName} onChangeText={(t) => setForm({ ...form, studentName: t })} />
            <TextInput style={styles.modalInput} placeholder="Parent Name" placeholderTextColor="#9ca3af" value={form.parentName} onChangeText={(t) => setForm({ ...form, parentName: t })} />
            <TextInput style={styles.modalInput} placeholder="Phone" placeholderTextColor="#9ca3af" value={form.phone} onChangeText={(t) => setForm({ ...form, phone: t })} />
            <TextInput style={styles.modalInput} placeholder="Email" placeholderTextColor="#9ca3af" value={form.email} onChangeText={(t) => setForm({ ...form, email: t })} keyboardType="email-address" />
            <TextInput style={styles.modalInput} placeholder="Class/Batch" placeholderTextColor="#9ca3af" value={form.className} onChangeText={(t) => setForm({ ...form, className: t })} />
            <TouchableOpacity style={styles.saveButton} onPress={handleAdd}>
              <Text style={styles.saveButtonText}>Add Inquiry</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setShowAddModal(false)}>
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
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  headerRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },
  addButton: { backgroundColor: '#6366f1', paddingHorizontal: 16, borderRadius: 12, justifyContent: 'center' },
  addButtonText: { color: '#fff', fontWeight: '600' },
  inquiryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  inquiryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  inquiryName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  inquiryParent: { fontSize: 13, color: '#6b7280', marginBottom: 2 },
  inquiryPhone: { fontSize: 13, color: '#6b7280', marginBottom: 2 },
  inquiryClass: { fontSize: 13, color: '#6b7280', marginBottom: 8 },
  actionRow: { flexDirection: 'row', gap: 8 },
  approveBtn: { backgroundColor: '#dcfce7', paddingVertical: 6, paddingHorizontal: 16, borderRadius: 8 },
  approveBtnText: { color: '#166534', fontWeight: '600', fontSize: 13 },
  rejectBtn: { backgroundColor: '#fee2e2', paddingVertical: 6, paddingHorizontal: 16, borderRadius: 8 },
  rejectBtnText: { color: '#991b1b', fontWeight: '600', fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 24 },
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
  saveButton: { backgroundColor: '#6366f1', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginBottom: 8 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cancelButton: { alignItems: 'center', paddingVertical: 8 },
  cancelText: { color: '#6b7280', fontWeight: '500' },
});
