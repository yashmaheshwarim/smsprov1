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
import { useAuth, ParentUser } from '../../contexts/AuthContext';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';
import { formatCurrency } from '../../lib/utils';
import { generateFeeReport, generateReceipt } from '../../lib/pdf-report';

export default function ParentFeesScreen() {
  const { user } = useAuth();
  const parent = user as ParentUser;
  const childId = parent.childrenIds?.[0] || '';

  const [invoices, setInvoices] = useState<any[]>([]);
  const [childName, setChildName] = useState('');
  const [childEnroll, setChildEnroll] = useState('');
  const [childBatch, setChildBatch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (childId) fetchFees();
    else setLoading(false);
  }, [childId]);

  const fetchFees = async () => {
    setLoading(true);
    try {
      // Get child info
      const { data: stuData } = await supabase
        .from('students')
        .select('name, enrollment_no, batch_name')
        .eq('id', childId)
        .single();

      if (stuData) {
        setChildName(stuData.name);
        setChildEnroll(stuData.enrollment_no);
        setChildBatch(stuData.batch_name);
      }

      // Fetch invoices and student_fees
      const [invRes, sfRes] = await Promise.all([
        supabase.from('invoices').select('*').eq('student_id', childId).order('due_date', { ascending: false }),
        supabase.from('student_fees').select('*').eq('student_id', childId),
      ]);

      if (invRes.data && invRes.data.length > 0) {
        setInvoices(
          invRes.data.map((i: any) => {
            const matchingSf = (sfRes.data || []).find((sf: any) => sf.batch_fee_id === i.batch_fee_id);
            return {
              description: i.description || 'Tuition Fee',
              amount: i.amount || i.total_fees || 0,
              paidAmount: i.paid_fees || (i.status === 'paid' ? i.amount : 0) || 0,
              dueDate: i.due_date?.split('T')[0] || 'N/A',
              lastPaymentDate: i.last_payment_date || matchingSf?.updated_at || null,
              status: i.status || 'unpaid',
            };
          })
        );
      } else if (sfRes.data && sfRes.data.length > 0) {
        // Fallback: use student_fees directly
        setInvoices(
          sfRes.data.map((sf: any) => ({
            description: 'Tuition Fee',
            amount: sf.final_fee || 0,
            paidAmount: sf.paid_fees || 0,
            dueDate: 'N/A',
            lastPaymentDate: sf.updated_at || null,
            status: sf.status || 'unpaid',
          }))
        );
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
        <StatCard title="Pending" value={formatCurrency(totalFees - totalPaid)} color="#ef4444" />
      </View>

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
                    instituteName: childBatch || 'Institute',
                    studentName: childName,
                    enrollmentNo: childEnroll,
                    batchName: childBatch,
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
              <StatusBadge variant={inv.status === 'paid' ? 'success' : inv.status === 'partial' ? 'warning' : 'danger'}>
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
                  <View style={[styles.invoiceProgressFill, { width: `${Math.min(100, (inv.paidAmount / inv.amount) * 100)}%` as any }]} />
                </View>
              </View>
            )}
            {/* Receipt Button */}
            <TouchableOpacity
              style={styles.receiptBtn}
              onPress={async () => {
                try {
                  await generateReceipt({
                    receiptNo: `PAR-${childEnroll}-${i + 1}`,
                    instituteName: childBatch || 'Institute',
                    studentName: childName,
                    enrollmentNo: childEnroll,
                    batchName: childBatch,
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
