import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { supabase, isUuid } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';

interface Institute {
  id: string;
  name: string;
  adminName: string;
  adminEmail: string;
  students: number;
  teachers: number;
  studentLimit: number;
  teacherLimit: number;
  status: string;
  walletCredits: number;
}

export default function SuperAdminDashboard() {
  const { user, logout } = useAuth();
  const [institutes, setInstitutes] = useState<Institute[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    fetchInstitutes();
  }, []);

  const fetchInstitutes = async () => {
    setLoading(true);
    try {
      const [institutesRes, studentsRes] = await Promise.all([
        supabase.from('institutes').select('*').order('created_at', { ascending: false }),
        supabase.from('students').select('institute_id'),
      ]);

      const studentCounts: Record<string, number> = {};
      (studentsRes.data || []).forEach((s: any) => {
        if (s.institute_id) {
          studentCounts[s.institute_id] = (studentCounts[s.institute_id] || 0) + 1;
        }
      });

      const formatted: Institute[] = (institutesRes.data || []).map((inst: any) => ({
        id: inst.id,
        name: inst.name,
        adminName: inst.email?.split('@')[0] || 'N/A',
        adminEmail: inst.email,
        students: studentCounts[inst.id] || 0,
        teachers: 0,
        studentLimit: inst.student_limit || 500,
        teacherLimit: inst.teacher_limit || 20,
        status: inst.status || 'active',
        walletCredits: inst.wallet_credits || 0,
      }));

      setInstitutes(formatted);
    } catch (error: any) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  const stats = {
    total: institutes.length,
    active: institutes.filter((i) => i.status === 'active').length,
    totalStudents: institutes.reduce((a, i) => a + i.students, 0),
    totalCredits: institutes.reduce((a, i) => a + i.walletCredits, 0),
  };

  return (
    <ScrollView style={styles.container}>
      {/* Logout Button */}
      <TouchableOpacity
        style={styles.logoutButton}
        onPress={() => setShowLogoutConfirm(true)}
      >
        <Text style={styles.logoutText}>🚪 Logout</Text>
      </TouchableOpacity>

      <Text style={styles.pageTitle}>Institute Management</Text>
      <Text style={styles.pageSubtitle}>
        Manage all institutes, page access, and credits
      </Text>

      {/* Stats Overview */}
      <View style={styles.statsGrid}>
        <View style={{ width: '47%' }}>
          <StatCard title="Total Institutes" value={stats.total} color="#6366f1" />
        </View>
        <View style={{ width: '47%' }}>
          <StatCard
            title="Active"
            value={stats.active}
            color="#22c55e"
          />
        </View>
        <View style={{ width: '47%' }}>
          <StatCard
            title="Total Students"
            value={stats.totalStudents.toLocaleString()}
            color="#f59e0b"
          />
        </View>
        <View style={{ width: '47%' }}>
          <StatCard
            title="Wallet Credits"
            value={stats.totalCredits.toLocaleString()}
            color="#ec4899"
          />
        </View>
      </View>

      {/* Recent Institutes */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Institutes</Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowAddModal(true)}
          >
            <Text style={styles.addButtonText}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#6366f1" style={{ marginTop: 20 }} />
        ) : (
          institutes.slice(0, 20).map((inst) => (
            <View key={inst.id} style={styles.instituteCard}>
              <View style={styles.instituteHeader}>
                <Text style={styles.instituteName}>{inst.name}</Text>
                <StatusBadge
                  variant={
                    inst.status === 'active'
                      ? 'success'
                      : inst.status === 'suspended'
                        ? 'danger'
                        : 'warning'
                  }
                >
                  {inst.status}
                </StatusBadge>
              </View>
              <Text style={styles.instituteEmail}>{inst.adminEmail}</Text>
              <View style={styles.instituteStats}>
                <Text style={styles.statItem}>
                  🎓 {inst.students}/{inst.studentLimit} Students
                </Text>
                <Text style={styles.statItem}>
                  👛 {inst.walletCredits} credits
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Logout Confirmation */}
      <Modal visible={showLogoutConfirm} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Logout</Text>
            <Text style={styles.modalText}>Are you sure you want to logout?</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowLogoutConfirm(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleLogout}
              >
                <Text style={styles.confirmButtonText}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 16,
  },
  logoutButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    marginBottom: 8,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ef4444',
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 24,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  addButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  instituteCard: {
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
  instituteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  instituteName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  instituteEmail: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8,
  },
  instituteStats: {
    flexDirection: 'row',
    gap: 16,
  },
  statItem: {
    fontSize: 12,
    color: '#374151',
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
    maxWidth: 320,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  modalText: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f3f4f6',
  },
  cancelButtonText: {
    color: '#374151',
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: '#ef4444',
  },
  confirmButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
