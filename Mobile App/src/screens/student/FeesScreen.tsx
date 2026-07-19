import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth, StudentUser } from '../../contexts/AuthContext';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';
import { formatCurrency } from '../../lib/utils';
import { generateFeeReport, generateReceipt } from '../../lib/pdf-report';

export default function StudentFeesScreen() {
  const { user } = useAuth();
  const student = user as StudentUser;

  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFees();
  }, []);

  const fetchFees = async () => {
    setLoading(true);
    try {
      const { data: sfData } = await supabase
        .from('student_fees')
        .select('paid_fees, final_fee, status, batch_fee_id, updated_at')
        .eq('student_id', student.id);

      if (sfData && sfData.length > 0) {
        const enriched = await Promise.all(
          sfData.map(async (sf: any) => {
            let description = 'Tuition Fee';
            let dueDate = 'N/A';
            let lastPaymentDate = sf.updated_at || null;
            if (sf.batch_fee_id) {
              const { data: bf } = await supabase
                .from('batch_fees')
                .select('title, due_date')
                .eq('id', sf.batch_fee_id)
                .single();
              if (bf) {
                description = bf.title || description;
                dueDate = bf.due_date?.split('T')[0] || 'N/A';
              }
            }
            // Also check the invoices table for payment dates
            const { data: invData } = await supabase
              .from('invoices')
              .select('last_payment_date, paid_fees')
              .eq('student_id', student.id)
              .eq('batch_fee_id', sf.batch_fee_id)
              .maybeSingle();
            if (invData?.last_payment_date) {
              lastPaymentDate = invData.last_payment_date;
            }
            return {
              description,
              amount: sf.final_fee || 0,
              paidAmount: sf.paid_fees || 0,
              dueDate,
              lastPaymentDate,
              status: sf.status || 'unpaid',
            };
          })
        );
        setInvoices(enriched);
      } else {
        setInvoices([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const totalFees = invoices.reduce((a, i) => a + i.amount, 0);
  const totalPaid = invoices.reduce((a, i) => a + i.paidAmount, 0);
  const pending = totalFees - totalPaid;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.statsRow}>
        <StatCard title="Total Fees" value={formatCurrency(totalFees)} color="#6366f1" />
        <StatCard title="Paid" value={formatCurrency(totalPaid)} color="#22c55e" />
        <StatCard title="Pending" value={formatCurrency(pending)} color="#ef4444" />
      </View>

      {/* Progress */}
      {totalFees > 0 && (
        <View style={styles.progressSection}>
          <View style={styles.progressRow}>
            <Text style={styles.progressLabel}>Payment Progress</Text>
            <Text style={styles.progressPct}>
              {((totalPaid / totalFees) * 100).toFixed(0)}%
            </Text>
          </View>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: ((totalPaid / totalFees) * 100).toFixed(0) + '%' as any },
              ]}
            />
          </View>
        </View>
      )}

      {/* Invoice List with Payment Dates */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Invoices</Text>
          {invoices.length > 0 && (
            <TouchableOpacity
              style={styles.pdfBtn}
              onPress={async () => {
                try {
                  await generateFeeReport({
                    instituteName: student.batch || 'Institute',
                    studentName: student.name,
                    enrollmentNo: student.enrollmentNo,
                    batchName: student.batch,
                    totalFees,
                    totalPaid,
                    pending,
                    items: invoices.map((inv) => ({
                      description: inv.description,
                      amount: inv.amount,
                      paidAmount: inv.paidAmount,
                      dueDate: inv.dueDate,
                      lastPaymentDate: inv.lastPaymentDate,
                      status: inv.status,
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
        {invoices.map((inv, i) => (
          <View key={i} style={styles.invoiceCard}>
            <View style={styles.invoiceHeader}>
              <Text style={styles.invoiceDesc}>{inv.description}</Text>
              <StatusBadge
                variant={
                  inv.status === 'paid'
                    ? 'success'
                    : inv.status === 'partial'
                      ? 'warning'
                      : 'danger'
                }
              >
                {inv.status}
              </StatusBadge>
            </View>
            <View style={styles.invoiceDetails}>
              <Text style={styles.invoiceAmount}>{formatCurrency(inv.amount)}</Text>
              <Text style={styles.invoicePaid}>Paid: {formatCurrency(inv.paidAmount)}</Text>
            </View>
            <View style={styles.invoiceDates}>
              <Text style={styles.invoiceDateText}>📅 Due: {inv.dueDate || 'N/A'}</Text>
              {inv.lastPaymentDate && (
                <Text style={styles.invoiceDateText}>💳 Last Payment: {new Date(inv.lastPaymentDate).toLocaleDateString('en-IN')}</Text>
              )}
            </View>
            {inv.status === 'partial' && (
              <View style={styles.invoiceProgress}>
                <View style={styles.invoiceProgressBar}>
                  <View
                    style={[
                      styles.invoiceProgressFill,
                      { width: `${Math.min(100, (inv.paidAmount / inv.amount) * 100)}%` as any },
                    ]}
                  />
                </View>
              </View>
            )}
            {/* Receipt Button */}
            <TouchableOpacity
              style={styles.receiptBtn}
              onPress={async () => {
                try {
                  await generateReceipt({
                    receiptNo: `STU-${student.enrollmentNo}-${i + 1}`,
                    instituteName: student.batch || 'Institute',
                    studentName: student.name,
                    enrollmentNo: student.enrollmentNo,
                    batchName: student.batch,
                    description: inv.description,
                    totalFee: inv.amount,
                    paidAmount: inv.paidAmount,
                    balanceDue: inv.amount - inv.paidAmount,
                    paymentDate: inv.lastPaymentDate
                      ? new Date(inv.lastPaymentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
                      : new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
                    status: inv.status,
                  });
                } catch {}
              }}
            >
              <Text style={styles.receiptBtnText}>🧾 Receipt</Text>
            </TouchableOpacity>
          </View>
        ))}
        {invoices.length === 0 && (
          <Text style={styles.emptyText}>No invoices found</Text>
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  progressSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressLabel: { fontSize: 14, color: '#374151', fontWeight: '500' },
  progressPct: { fontSize: 14, fontWeight: '700', color: '#6366f1' },
  progressBar: {
    height: 10,
    backgroundColor: '#f3f4f6',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#22c55e',
    borderRadius: 5,
  },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
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
  invoiceCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  invoiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  invoiceDesc: { fontSize: 15, fontWeight: '600', color: '#111827' },
  invoiceDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  invoiceAmount: { fontSize: 16, fontWeight: '700', color: '#111827' },
  invoicePaid: { fontSize: 13, color: '#22c55e', fontWeight: '500' },
  invoiceDue: { fontSize: 12, color: '#6b7280' },
  invoiceDates: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
  },
  invoiceDateText: {
    fontSize: 11,
    color: '#6b7280',
  },
  invoiceProgress: {
    marginTop: 6,
  },
  invoiceProgressBar: {
    height: 5,
    backgroundColor: '#f3f4f6',
    borderRadius: 3,
    overflow: 'hidden',
  },
  invoiceProgressFill: {
    height: '100%',
    backgroundColor: '#f59e0b',
    borderRadius: 3,
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
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', paddingVertical: 20 },
});
