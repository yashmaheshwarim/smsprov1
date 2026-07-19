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
} from 'react-native';
import { supabase, isUuid } from '../../lib/supabase';
import { useAuth, AdminUser } from '../../contexts/AuthContext';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';
import { formatCurrency, formatDate } from '../../lib/utils';
import { generateFeeReport, generateListReport, generateReceipt } from '../../lib/pdf-report';

export default function FeesScreen() {
  const { user } = useAuth();
  const adminUser = user as AdminUser;
  const instId = adminUser?.instituteId || '';

  const [studentFees, setStudentFees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (isUuid(instId)) fetchStudentFees();
  }, [instId]);

  const fetchStudentFees = async () => {
    setLoading(true);
    try {
      const [sfRes, invRes] = await Promise.all([
        supabase.from('student_fees').select('*').eq('institute_id', instId).order('created_at', { ascending: false }),
        supabase.from('invoices').select('student_id, due_date, last_payment_date, paid_fees, status').eq('institute_id', instId),
      ]);

      const data = sfRes.data;
      const invoices = invRes.data || [];

      if (data && data.length > 0) {
        const enriched = await Promise.all(
          data.map(async (fee: any) => {
            const [studentRes] = await Promise.all([
              supabase
                .from('students')
                .select('name, enrollment_no, batch_name')
                .eq('id', fee.student_id)
                .single(),
            ]);
            const studentData = studentRes.data;
            // Find matching invoice for dates
            const matchingInv = invoices.find((inv: any) => inv.student_id === fee.student_id);
            return {
              ...fee,
              student_name: studentData?.name || 'Unknown',
              enrollment_no: studentData?.enrollment_no || '',
              batch_name: studentData?.batch_name || '',
              due_date: matchingInv?.due_date || null,
              last_payment_date: matchingInv?.last_payment_date || null,
            };
          })
        );
        setStudentFees(enriched);
      } else {
        setStudentFees([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = studentFees.filter(
    (f) =>
      f.student_name?.toLowerCase().includes(search.toLowerCase()) ||
      f.enrollment_no?.toLowerCase().includes(search.toLowerCase())
  );

  const handleDownloadPdf = async () => {
    try {
      await generateListReport(
        'Fee Report',
        adminUser?.instituteName || 'Institute',
        ['Student', 'Enrollment', 'Batch', 'Fee', 'Paid', 'Pending', 'Due Date', 'Last Payment', 'Status'],
        filtered.map((f) => [
          f.student_name,
          f.enrollment_no,
          f.batch_name,
          formatCurrency(f.final_fee),
          formatCurrency(f.paid_fees || 0),
          formatCurrency(Math.max(0, f.final_fee - (f.paid_fees || 0))),
          f.due_date ? formatDate(f.due_date) : '—',
          f.last_payment_date ? formatDate(f.last_payment_date) : '—',
          f.status,
        ])
      );
    } catch {
      Alert.alert('Error', 'Could not generate PDF.');
    }
  };

  const stats = {
    total: studentFees.reduce((a, f) => a + f.final_fee, 0),
    collected: studentFees.reduce((a, f) => a + (f.paid_fees || 0), 0),
    pending: studentFees.reduce((a, f) => a + (f.final_fee - (f.paid_fees || 0)), 0),
    overdue: studentFees.filter((f) => f.status === 'overdue').length,
  };

  return (
    <ScrollView style={styles.container}>
      {/* Stats */}
      <View style={styles.statsRow}>
        <StatCard title="Total Fees" value={formatCurrency(stats.total)} color="#6366f1" />
        <StatCard title="Collected" value={formatCurrency(stats.collected)} color="#22c55e" />
        <StatCard title="Pending" value={formatCurrency(stats.pending)} color="#ef4444" />
        <StatCard title="Overdue" value={stats.overdue} color="#f59e0b" />
      </View>

      {/* Actions Row */}
      <View style={styles.actionsRow}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search students..."
            placeholderTextColor="#9ca3af"
            value={search}
            onChangeText={setSearch}
          />
        </View>
        {filtered.length > 0 && (
          <TouchableOpacity style={styles.pdfBtn} onPress={handleDownloadPdf}>
            <Text style={styles.pdfBtnText}>📄 PDF</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Fee list */}
      {loading ? (
        <ActivityIndicator size="large" color="#6366f1" style={{ marginTop: 20 }} />
      ) : (
        filtered.map((fee) => (
          <View key={fee.id} style={styles.feeCard}>
            <View style={styles.feeHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.studentName}>{fee.student_name}</Text>
                <Text style={styles.studentEnroll}>{fee.enrollment_no}</Text>
              </View>
              <StatusBadge
                variant={
                  fee.status === 'paid'
                    ? 'success'
                    : fee.status === 'pending'
                      ? 'warning'
                      : fee.status === 'partial'
                        ? 'info'
                        : 'danger'
                }
              >
                {fee.status}
              </StatusBadge>
            </View>
            <View style={styles.feeDetails}>
              <View style={styles.feeCol}>
                <Text style={styles.feeLabel}>Fee</Text>
                <Text style={styles.feeValue}>{formatCurrency(fee.final_fee)}</Text>
              </View>
              <View style={styles.feeCol}>
                <Text style={styles.feeLabel}>Paid</Text>
                <Text style={[styles.feeValue, { color: '#22c55e' }]}>
                  {formatCurrency(fee.paid_fees || 0)}
                </Text>
              </View>
              <View style={styles.feeCol}>
                <Text style={styles.feeLabel}>Pending</Text>
                <Text style={[styles.feeValue, { color: '#ef4444' }]}>
                  {formatCurrency(Math.max(0, fee.final_fee - (fee.paid_fees || 0)))}
                </Text>
              </View>
            </View>
            {/* Payment Dates */}
            <View style={styles.feeDates}>
              {fee.due_date && (
                <Text style={styles.feeDateText}>📅 Due: {new Date(fee.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
              )}
              {fee.last_payment_date && (
                <Text style={styles.feeDateText}>💳 Last Payment: {new Date(fee.last_payment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
              )}
            </View>
            {/* Receipt Button */}
            <TouchableOpacity
              style={styles.receiptBtn}
              onPress={async () => {
                try {
                  await generateReceipt({
                    receiptNo: fee.receipt_id || `SF-${fee.id?.slice(0, 8)}`,
                    instituteName: adminUser?.instituteName || 'Institute',
                    studentName: fee.student_name,
                    enrollmentNo: fee.enrollment_no,
                    batchName: fee.batch_name,
                    description: 'Tuition Fee',
                    totalFee: fee.final_fee,
                    paidAmount: fee.paid_fees || 0,
                    balanceDue: Math.max(0, fee.final_fee - (fee.paid_fees || 0)),
                    paymentDate: fee.last_payment_date
                      ? new Date(fee.last_payment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
                      : new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
                    status: fee.status,
                  });
                } catch {}
              }}
            >
              <Text style={styles.receiptBtnText}>🧾 Receipt</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
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
  pdfBtn: {
    backgroundColor: '#6366f1',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  pdfBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },
  feeCard: {
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
  feeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  studentName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  studentEnroll: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  feeDetails: { flexDirection: 'row', gap: 16 },
  feeCol: { flex: 1 },
  feeLabel: { fontSize: 11, color: '#9ca3af', marginBottom: 2 },
  feeValue: { fontSize: 15, fontWeight: '700', color: '#111827' },
  feeDates: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  feeDateText: {
    fontSize: 11,
    color: '#6b7280',
  },
  receiptBtn: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    alignItems: 'center',
    paddingVertical: 6,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
  },
  receiptBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400e',
  },
});
