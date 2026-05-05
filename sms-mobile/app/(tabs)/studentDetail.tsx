import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  StyleSheet,
  FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth, AdminUser } from '@/contexts/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Student {
  id: string;
  name: string;
  enrollment_no: string;
  batch_name: string;
  student_phone?: string;
  mother_phone?: string;
  father_phone?: string;
  email: string;
  guardian_name: string;
  status: string;
  join_date: string;
  grn_no?: string;
}

interface EditForm {
  name: string;
  email: string;
  studentPhone: string;
  motherPhone: string;
  fatherPhone: string;
  guardianName: string;
  batchId: string;
  status: string;
}

export default function StudentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  
  const isAdmin = user?.role === "admin";
  const instId = isAdmin ? (user as AdminUser).instituteId : "00000000-0000-0000-0000-000000000001";

  // ✅ ALL STATES DEFINED HERE
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({
    name: "",
    email: "",
    studentPhone: "",
    motherPhone: "",
    fatherPhone: "",
    guardianName: "",
    batchId: "",
    status: "active"
  });
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (id) {
      fetchStudentData();
    }
  }, [id]);

  const fetchStudentData = async () => {
    setLoading(true);
    try {
      const { data: sData, error } = await supabase
        .from("students")
        .select("*")
        .eq("id", id as string)
        .single();

      if (error || !sData) {
        Alert.alert("Error", "Student not found");
        return;
      }

      setStudent(sData);
    } catch (error) {
      Alert.alert("Error", "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const openEdit = () => {
    if (!student) return;
    setEditForm({
      name: student.name,
      email: student.email || "",
      studentPhone: student.student_phone || "",
      motherPhone: student.mother_phone || "",
      fatherPhone: student.father_phone || "",
      guardianName: student.guardian_name || "",
      batchId: "",
      status: student.status || "active"
    });
    setEditOpen(true);
  };

  const handleUpdateStudent = async () => {
    if (!editForm.name.trim()) {
      Alert.alert("Error", "Name is required");
      return;
    }

    setUpdating(true);
    try {
      const { error } = await supabase
        .from("students")
        .update({
          name: editForm.name,
          email: editForm.email || null,
          student_phone: editForm.studentPhone || null,
          mother_phone: editForm.motherPhone || null,
          father_phone: editForm.fatherPhone || null,
          guardian_name: editForm.guardianName || null,
          status: editForm.status,
          updated_at: new Date().toISOString()
        })
        .eq("id", id);

      if (error) throw error;

      await fetchStudentData();
      setEditOpen(false);
      Alert.alert("Success", "Profile updated!");
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setUpdating(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading student...</Text>
      </View>
    );
  }

  if (!student) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Student not found</Text>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={20} color="#007AFF" />
          <Text style={styles.backText}>Back to Students</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={20} color="#666" />
          <Text style={styles.backText}>Students</Text>
        </Pressable>
        <View style={styles.headerActions}>
          <Pressable style={styles.actionBtn}>
            <MaterialCommunityIcons name="download" size={20} color="#666" />
            <Text style={styles.actionText}>Export</Text>
          </Pressable>
          <Pressable style={styles.editBtn} onPress={openEdit}>
            <MaterialCommunityIcons name="pencil" size={20} color="white" />
            <Text style={styles.editText}>Edit</Text>
          </Pressable>
        </View>
      </View>

      {/* Profile Card */}
      <View style={styles.profileCard}>
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {student.name.split(' ').map(n => n[0]).join('').toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.studentName}>{student.name}</Text>
            <Text style={styles.enrollmentNo}>{student.enrollment_no}</Text>
            <View style={styles.statusRow}>
              <View style={[
                styles.statusBadge,
                student.status === 'active' ? styles.activeBadge : styles.inactiveBadge
              ]}>
                <Text style={styles.statusText}>{student.status}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.infoGrid}>
          <View style={styles.infoItem}>
            <MaterialCommunityIcons name="file-document" size={16} color="#666" />
            <Text style={styles.infoLabel}>GRN</Text>
            <Text style={styles.infoValue}>{student.grn_no || 'Pending'}</Text>
          </View>
          <View style={styles.infoItem}>
            <MaterialCommunityIcons name="book" size={16} color="#666" />
            <Text style={styles.infoLabel}>Batch</Text>
            <Text style={styles.infoValue}>{student.batch_name || 'N/A'}</Text>
          </View>
          <View style={styles.infoItem}>
            <MaterialCommunityIcons name="email" size={16} color="#666" />
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue} numberOfLines={1}>{student.email}</Text>
          </View>
        </View>
      </View>

      {/* Fee Summary Card */}
      <View style={styles.feeCard}>
        <Text style={styles.sectionTitle}>💰 Fee Summary</Text>
        <View style={styles.feeGrid}>
          <View style={styles.feeItem}>
            <Text style={styles.feeLabel}>Total Fee</Text>
            <Text style={styles.feeAmount}>₹25,000</Text>
          </View>
          <View style={styles.feeItem}>
            <Text style={styles.feeLabel}>Paid</Text>
            <Text style={styles.feeAmount}>₹15,000</Text>
          </View>
          <View style={styles.feeItem}>
            <Text style={styles.feeLabel}>Pending</Text>
            <Text style={[styles.feeAmount, styles.pendingAmount]}>₹10,000</Text>
          </View>
        </View>
        <Pressable style={styles.payButton} onPress={() => {}}>
          <Text style={styles.payButtonText}>Pay Now</Text>
        </Pressable>
      </View>

      {/* Edit Modal */}
      <Modal visible={editOpen} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalOverlay}>
          <View style={styles.modalHeader}>
            <Pressable style={styles.modalClose} onPress={() => setEditOpen(false)}>
              <MaterialCommunityIcons name="close" size={24} color="#666" />
            </Pressable>
            <Text style={styles.modalTitle}>Edit Profile</Text>
          </View>
          
          <ScrollView style={styles.modalScroll}>
            <TextInput
              style={styles.modalInput}
              placeholder="Full Name *"
              value={editForm.name}
              onChangeText={(text) => setEditForm({...editForm, name: text})}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Email"
              keyboardType="email-address"
              value={editForm.email}
              onChangeText={(text) => setEditForm({...editForm, email: text})}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Student Phone"
              keyboardType="phone-pad"
              value={editForm.studentPhone}
              onChangeText={(text) => setEditForm({...editForm, studentPhone: text})}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Mother Phone"
              keyboardType="phone-pad"
              value={editForm.motherPhone}
              onChangeText={(text) => setEditForm({...editForm, motherPhone: text})}
            />
          </ScrollView>

          <View style={styles.modalFooter}>
            <Pressable 
              style={styles.cancelBtn} 
              onPress={() => setEditOpen(false)}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable 
              style={[styles.saveBtn, updating && styles.saveBtnDisabled]}
              onPress={handleUpdateStudent}
              disabled={updating}
            >
              {updating ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.saveBtnText}>Save Changes</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
  },
  actionText: {
    fontSize: 14,
    color: '#666',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  editText: {
    color: 'white',
    fontWeight: '600',
  },
  profileCard: {
    backgroundColor: 'white',
    margin: 20,
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#007AFF20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  profileInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#1a1a1a',
  },
  enrollmentNo: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
    marginBottom: 8,
  },
  statusRow: {
    alignItems: 'flex-start',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  activeBadge: {
    backgroundColor: '#d4edda',
  },
  inactiveBadge: {
    backgroundColor: '#f8d7da',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  infoGrid: {
    flexDirection: 'row',
    gap: 24,
  },
  infoItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  infoLabel: {
    fontSize: 12,
    color: '#999',
    textTransform: 'uppercase',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    textAlign: 'center',
  },
  feeCard: {
    backgroundColor: 'white',
    margin: 20,
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#1a1a1a',
  },
  feeGrid: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  feeItem: {
    flex: 1,
  },
  feeLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  feeAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  pendingAmount: {
    color: '#ff3b30',
  },
  payButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  payButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalClose: {
    padding: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalScroll: {
    flex: 1,
    paddingHorizontal: 20,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: 'white',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  cancelBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  saveBtn: {
    flex: 1,
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    backgroundColor: '#ccc',
  },
  saveBtnText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});