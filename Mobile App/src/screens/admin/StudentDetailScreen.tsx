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
import { useRoute } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth, AdminUser } from '../../contexts/AuthContext';
import { useTableChange } from '../../contexts/RealtimeDataContext';
import StatusBadge from '../../components/StatusBadge';
import StatCard from '../../components/StatCard';
import { formatCurrency, formatDate } from '../../lib/utils';
import { generateFeeReport, generateReceipt, generateFullReport, generateFullReceipt } from '../../lib/pdf-report';

export default function StudentDetailScreen() {
  const route = useRoute<any>();
  const { user } = useAuth();
  const adminUser = user as AdminUser;
  const { studentId } = route.params;
  const [student, setStudent] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportGenerating, setReportGenerating] = useState(false);

  // Real-time: re-fetch attendance/marks when they change on any device (web or
  // mobile), so the detail screen never shows stale data.
  useTableChange('attendance', () => { fetchAttendance(); }, [studentId]);
  useTableChange('exam_attendance', () => { fetchAttendance(); }, [studentId]);
  useTableChange('marks', () => { fetchAttendance(); }, [studentId]);

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

      // Fetch all payment records for the student's fee records
      const sfIds = (sfData || []).map((sf: any) => sf.id);
      const paymentsBySf: Record<string, any[]> = {};
      if (sfIds.length > 0) {
        const { data: pData } = await supabase
          .from('payments')
          .select('*')
          .in('student_fee_id', sfIds)
          .order('payment_date', { ascending: true });
        (pData || []).forEach((p: any) => {
          if (!paymentsBySf[p.student_fee_id]) paymentsBySf[p.student_fee_id] = [];
          paymentsBySf[p.student_fee_id].push(p);
        });
      }

      // Merge invoices with student_fees payment data
      const merged = (iData || []).map((inv: any) => {
        // Match by batch_fee_id; fall back to the student's only fee record if there's no match
        const matchingSf =
          (sfData || []).find((sf: any) => sf.batch_fee_id === inv.batch_fee_id) ||
          ((sfData || []).length === 1 ? (sfData || [])[0] : undefined);
        return {
          ...inv,
          last_payment_date: inv.last_payment_date || matchingSf?.updated_at || null,
          paid_fees: inv.paid_fees || matchingSf?.paid_fees || 0,
          paymentHistory: (paymentsBySf[matchingSf?.id] || []).map((p: any) => ({
            date: p.payment_date,
            amount: Number(p.amount || 0),
            method: p.payment_method || 'cash',
            receiptNo: p.receipt_id || undefined,
          })),
        };
      });

      setInvoices(merged);

      await fetchAttendance();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Fetch attendance (lecture + exam) and dedupe by date — a student can have
   * multiple rows on the same day (one per subject), but a date should only
   * ever appear once in the report. Present wins over leave/absent.
   */
  const fetchAttendance = async () => {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const dateFrom = thirtyDaysAgo.toISOString().split('T')[0];

      const [{ data: aData }, { data: eaData }] = await Promise.all([
        supabase
          .from('attendance')
          .select('date, status')
          .eq('student_id', studentId)
          .gte('date', dateFrom)
          .order('date', { ascending: false }),
        supabase
          .from('exam_attendance')
          .select('exam_date, status, exam_name')
          .eq('student_id', studentId)
          .gte('exam_date', dateFrom)
          .order('exam_date', { ascending: false }),
      ]);

      const merged: any[] = [];
      (aData || []).forEach((r: any) => merged.push({ date: r.date, status: r.status }));
      (eaData || []).forEach((r: any) => merged.push({ date: r.exam_date, status: r.status, exam: r.exam_name }));

      // Dedupe by date — keep the best status for each day
      const dayMap = new Map<string, any>();
      const rank = (s: string) => (s === 'present' || s === 'late' ? 3 : s === 'leave' ? 2 : 1);
      merged.forEach((r) => {
        const existing = dayMap.get(r.date);
        if (!existing || rank(r.status) > rank(existing.status)) {
          dayMap.set(r.date, r);
        }
      });

      const deduped = Array.from(dayMap.values()).sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      setAttendance(deduped);
    } catch (err) {
      console.error(err);
    }
  };

  /**
   * Build + share the Student Full Report PDF (attendance + exam marks, no fees).
   * Mirrors the web app's full report: the attendance summary is overall
   * (all-time, deduplicated by date), exam marks are all-time and deduplicated
   * by exam+subject+date so repeated submissions never appear twice.
   */
  const generateFullReportPdf = async () => {
    if (!student) return;
    setReportGenerating(true);
    try {
      // Attendance (all time) — lecture + exam
      const [{ data: aData }, { data: eaData }] = await Promise.all([
        supabase
          .from('attendance')
          .select('date, status')
          .eq('student_id', studentId),
        supabase
          .from('exam_attendance')
          .select('exam_date, status')
          .eq('student_id', studentId),
      ]);

      // Merge + dedupe by date (dates normalised so lecture/exam rows merge),
      // present wins over leave/absent.
      const dayMap = new Map<string, { statuses: string[] }>();
      const push = (date: string, status: string) => {
        const day = String(date || '').split('T')[0];
        if (!day) return;
        const existing = dayMap.get(day);
        if (existing) {
          existing.statuses.push(status);
        } else {
          dayMap.set(day, { statuses: [status] });
        }
      };
      (aData || []).forEach((r: any) => push(r.date, r.status));
      (eaData || []).forEach((r: any) => push(r.exam_date, r.status));

      let present = 0;
      let absent = 0;
      let leave = 0;
      dayMap.forEach((group) => {
        if (group.statuses.some((s) => s === 'present' || s === 'late')) present++;
        else if (group.statuses.some((s) => s === 'leave')) leave++;
        else absent++;
      });
      const total = dayMap.size;

      // Exam marks (all time), deduplicated by exam+subject+date
      const { data: marksData } = await supabase
        .from('marks')
        .select('exam_name, subject, marks_obtained, total_marks, is_absent, exam_date')
        .eq('student_id', studentId)
        .order('exam_date', { ascending: false });

      const best = new Map<string, any>();
      (marksData || []).forEach((m: any) => {
        const key = `${m.exam_name || ''}|${m.subject || ''}|${(m.exam_date || '').split('T')[0]}`;
        const existing = best.get(key);
        if (!existing || (!m.is_absent && existing.is_absent)) best.set(key, m);
      });

      const examMarks = Array.from(best.values()).map((m: any) => ({
        date: (m.exam_date || '').split('T')[0],
        exam: m.exam_name || 'Exam',
        subject: m.subject || 'N/A',
        obtained: m.is_absent ? null : Number(m.marks_obtained ?? 0),
        total: Number(m.total_marks ?? 0),
        absent: !!m.is_absent,
      }));

      await generateFullReport({
        instituteName: adminUser?.instituteName || 'Institute',
        studentName: student.name || '',
        enrollmentNo: student.enrollment_no || '',
        batchName: student.batch_name || '',
        grnNo: student.grn_no || undefined,
        generatedAt: new Date().toISOString(),
        attendanceStats: {
          present,
          absent,
          leave,
          total,
          percentage: total > 0 ? Math.round((present / total) * 100) : 0,
        },
        examMarks,
      });
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Could not generate the full report.');
    } finally {
      setReportGenerating(false);
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

      {/* Full Report */}
      <TouchableOpacity
        style={[styles.fullReportBtn, reportGenerating && styles.fullReportBtnDisabled]}
        onPress={generateFullReportPdf}
        disabled={reportGenerating}
      >
        <Text style={styles.fullReportBtnText}>
          {reportGenerating ? '⏳ Generating...' : '📄 Download Full Report'}
        </Text>
        <Text style={styles.fullReportBtnSub}>
          Attendance (last 30 days) + all exam marks
        </Text>
      </TouchableOpacity>

      {/* Recent Attendance */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Attendance</Text>
        {attendance.slice(0, 5).map((a: any, i: number) => (
          <View key={`${a.date}-${i}`} style={styles.attItem}>
            <View style={{ flex: 1 }}>
              <Text style={styles.attDate}>{formatDate(a.date)}</Text>
              {a.exam ? (
                <Text style={styles.attExam}>{a.exam}</Text>
              ) : null}
            </View>
            <StatusBadge
              variant={
                a.status === 'present' || a.status === 'late'
                  ? 'success'
                  : a.status === 'leave'
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
              {/* Individual Receipt Buttons */}
              <View style={styles.receiptBtnRow}>
                <TouchableOpacity
                  style={styles.receiptBtn}
                  onPress={async () => {
                    try {
                      await generateFullReceipt({
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
                        paymentHistory: inv.paymentHistory || [],
                      });
                    } catch {}
                  }}
                >
                  <Text style={styles.receiptBtnText}>📄 Full Receipt</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.receiptBtn}
                  onPress={async () => {
                    try {
                      const latestPayment = (inv.paymentHistory || []).length > 0
                        ? (inv.paymentHistory || [])[(inv.paymentHistory || []).length - 1]
                        : null;
                      await generateReceipt({
                        receiptNo: inv.receipt_id || `INV-${inv.id?.slice(0, 8)}`,
                        instituteName: adminUser?.instituteName || 'Institute',
                        studentName: student.name || '',
                        enrollmentNo: student.enrollment_no || '',
                        batchName: student.batch_name || '',
                        description: inv.description || 'Tuition Fee',
                        totalFee: inv.amount || inv.total_fees || 0,
                        paidAmount: latestPayment ? latestPayment.amount : (inv.paid_fees || 0),
                        balanceDue: 0,
                        paymentDate: latestPayment
                          ? new Date(latestPayment.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
                          : inv.last_payment_date
                            ? new Date(inv.last_payment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
                            : new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
                        status: inv.status,
                        paymentMethod: latestPayment?.method || 'Cash',
                        paymentHistory: inv.paymentHistory || [],
                        currentPaymentOnly: true,
                      });
                    } catch {}
                  }}
                >
                  <Text style={styles.receiptBtnText}>🧾 Single Payment</Text>
                </TouchableOpacity>
              </View>
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
  attExam: {
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 1,
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
  receiptBtnRow: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8,
  },
  receiptBtn: {
    flex: 1,
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
  fullReportBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  fullReportBtnDisabled: { opacity: 0.7 },
  fullReportBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  fullReportBtnSub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    marginTop: 2,
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    paddingVertical: 20,
  },
});
