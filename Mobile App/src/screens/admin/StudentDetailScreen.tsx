import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth, AdminUser } from '../../contexts/AuthContext';
import StatusBadge from '../../components/StatusBadge';
import StatCard from '../../components/StatCard';
import { formatCurrency, formatDate } from '../../lib/utils';
import { generateFeeReport, generateReceipt } from '../../lib/pdf-report';

export default function StudentDetailScreen({ route }: any) {
  const { user } = useAuth();
  const adminUser = user as AdminUser;
  const { studentId } = route.params;
  const [student, setStudent] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [studentId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: sData } = await supabase
        .from('students')
        .select('*')
        .eq('id', studentId)
        .single();

      setStudent(sData);

      const { data: iData } = await supabase
        .from('invoices')
        .select('*')
        .eq('student_id', studentId)
        .order('due_date', { ascending: false });

      // Also fetch student_fees for payment dates
      const { data: sfData } = await supabase
        .from('student_fees')
        .select('*')
        .eq('student_id', studentId);

      // Merge invoices with student_fees payment data
      const merged = (iData || []).map((inv: any) => {
        const matchingSf = (sfData || []).find((sf: any) => sf.batch_fee_id === inv.batch_fee_id);
        return {
          ...inv,
          last_payment_date: inv.last_payment_date || matchingSf?.updated_at || null,
          paid_fees: inv.paid_fees || matchingSf?.paid_fees || 0,
        };
      });

      setInvoices(merged);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data: aData } = await supabase
        .from('attendance')
        .select('date, status')
        .eq('student_id', studentId)
        .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
        .order('date', { ascending: false });

      setAttendance(aData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (!student) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Student not found</Text>
      </View>
    );
  }

  const presentCount = attendance.filter(
    (a: any) => a.status === 'present' || a.status === 'late'
  ).length;
  const attRate =
    attendance.length > 0
      ? ((presentCount / attendance.length) * 100).toFixed(0)
      : 'N/A';

  const totalFees = invoices.reduce((a: number, i: any) => a + (i.amount || 0), 0);
  const paidFees = invoices
    .filter((i: any) => i.status === 'paid')
    .reduce((a: number, i: any) => a + (i.amount || 0), 0);

  return (
    <ScrollView style={styles.container}>
      {/* Profile */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {student.name
              ?.split(' ')
              .map((n: string) => n[0])
              .join('')
              .toUpperCase()}
          </Text>
        </View>
        <Text style={styles.studentName}>{student.name}</Text>
        <Text style={styles.studentEnroll}>{student.enrollment_no}</Text>
        <StatusBadge variant={student.status === 'active' ? 'success' : 'danger'}>
          {student.status}
        </StatusBadge>
      </View>

      {/* Details */}
      <View style={styles.detailsCard}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>📧 Email</Text>
          <Text style={styles.detailValue}>{student.email || 'N/A'}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>📞 Phone</Text>
          <Text style={styles.detailValue}>
            {student.student_phone || student.phone || 'N/A'}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>📚 Batch</Text>
          <Text style={styles.detailValue}>{student.batch_name || 'N/A'}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>🔢 GRN</Text>
          <Text style={styles.detailValue}>{student.grn_no || 'N/A'}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>📅 Joined</Text>
          <Text style={styles.detailValue}>
            {student.join_date ? formatDate(student.join_date) : 'N/A'}
          </Text>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <StatCard title="Attendance" value={`${attRate}%`} color="#22c55e" />
        <StatCard title="Fees Paid" value={formatCurrency(paidFees)} color="#6366f1" />
        <StatCard title="Pending" value={formatCurrency(totalFees - paidFees)} color="#ef4444" />
      </View>

      {/* Recent Attendance */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Attendance</Text>
        {attendance.slice(0, 5).map((a: any, i: number) => (
          <View key={i} style={styles.attItem}>
            <Text style={styles.attDate}>{formatDate(a.date)}</Text>
            <StatusBadge
              variant={
                a.status === 'present'
                  ? 'success'
                  : a.status === 'late'
                    ? 'warning'
                    : 'danger'
              }
            >
              {a.status}
            </StatusBadge>
          </View>
        ))}
        {attendance.length === 0 && (
          <Text style={styles.emptyText}>No attendance records</Text>
        )}
      </View>

      {/* Fee Details with Payment Dates */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Fee Details</Text>
          {invoices.length > 0 && (
            <TouchableOpacity
              style={styles.pdfBtn}
              onPress={async () => {
                try {
                  await generateFeeReport({
                    instituteName: adminUser?.instituteName || 'Institute',
                    studentName: student.name || '',
                    enrollmentNo: student.enrollment_no || '',
                    batchName: student.batch_name || '',
                    totalFees: totalFees,
                    totalPaid: paidFees,
                    pending: totalFees - paidFees,
                    items: invoices.map((inv: any) => ({
                      description: inv.description || 'Tuition Fee',
                      amount: inv.amount || 0,
                      paidAmount: inv.paid_fees || 0,
                      dueDate: inv.due_date ? formatDate(inv.due_date) : 'N/A',
                      lastPaymentDate: inv.last_payment_date,
                      status: inv.status || 'unpaid',
                    })),
                  });
                } catch {
                  Alert.alert('Error', 'Could not generate PDF.');
                }
              }}
            >
              <Text style={styles.pdfBtnText}>📄 PDF</Text>
            </TouchableOpacity>
          )}
        </View>
        {invoices.map((inv: any) => (
          <View key={inv.id} style={styles.invoiceItem}>
            <View style={{ flex: 1 }}>
              <View style={styles.invoiceTopRow}>
                <Text style={styles.invoiceAmount}>{formatCurrency(inv.amount || inv.total_fees || 0)}</Text>
                <StatusBadge
                  variant={
                    inv.status === 'paid'
                      ? 'success'
                      : inv.status === 'partial'
                        ? 'warning'
                        : inv.status === 'pending'
                          ? 'warning'
                          : 'danger'
                  }
                >
                  {inv.status}
                </StatusBadge>
              </View>
              <View style={styles.invoiceDates}>
                <Text style={styles.invoiceDateLabel}>Due: {inv.due_date ? formatDate(inv.due_date) : 'N/A'}</Text>
                {inv.last_payment_date && (
                  <Text style={styles.invoiceDateLabel}>Paid: {formatDate(inv.last_payment_date)}</Text>
                )}
                {inv.created_at && (
                  <Text style={styles.invoiceDateLabel}>Created: {formatDate(inv.created_at)}</Text>              )}
              {/* Individual Receipt Button */}
              <TouchableOpacity
                style={styles.receiptBtn}
                onPress={async () => {
                  try {
                    await generateReceipt({
                      receiptNo: inv.receipt_id || `INV-${inv.id?.slice(0, 8)}`,
                      instituteName: adminUser?.instituteName || 'Institute',
                      studentName: student.name || '',
                      enrollmentNo: student.enrollment_no || '',
                      batchName: student.batch_name || '',
                      description: inv.description || 'Tuition Fee',
                      totalFee: inv.amount || inv.total_fees || 0,
                      paidAmount: inv.paid_fees || 0,
                      balanceDue: Math.max(0, (inv.amount || inv.total_fees || 0) - (inv.paid_fees || 0)),
                      paymentDate: inv.last_payment_date
                        ? new Date(inv.last_payment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
                        : new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
                      status: inv.status,
                    });
                  } catch {}
                }}
              >
                <Text style={styles.receiptBtnText}>🧾 Receipt</Text>
              </TouchableOpacity>
            </View>
              {(inv.status === 'partial' || (inv.paid_fees && inv.paid_fees < (inv.amount || inv.total_fees || 0))) && (
                <View style={styles.invoiceProgress}>
                  <View style={styles.invoiceProgressBar}>
                    <View
                      style={[
                        styles.invoiceProgressFill,
                        {
                          width: `${Math.min(100, ((inv.paid_fees || 0) / (inv.amount || inv.total_fees || 1)) * 100)}%` as any,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.invoiceProgressText}>
                    Paid {formatCurrency(inv.paid_fees || 0)} of {formatCurrency(inv.amount || inv.total_fees || 0)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        ))}
        {invoices.length === 0 && (
          <Text style={styles.emptyText}>No fee records</Text>
        )}
      </View>

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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#6366f1',
  },
  studentName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  studentEnroll: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  detailsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  detailLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  detailValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  pdfBtn: {
    backgroundColor: '#6366f1',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  pdfBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  attItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 6,
  },
  attDate: {
    fontSize: 14,
    color: '#374151',
  },
  invoiceItem: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  invoiceTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  invoiceAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  invoiceDates: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 4,
  },
  invoiceDateLabel: {
    fontSize: 11,
    color: '#6b7280',
  },
  invoiceProgress: {
    marginTop: 6,
  },
  invoiceProgressBar: {
    height: 6,
    backgroundColor: '#f3f4f6',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  invoiceProgressFill: {
    height: '100%',
    backgroundColor: '#f59e0b',
    borderRadius: 3,
  },
  invoiceProgressText: {
    fontSize: 10,
    color: '#6b7280',
  },
  receiptBtn: {
    marginTop: 8,
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
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    paddingVertical: 20,
  },
});
