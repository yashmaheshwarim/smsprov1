import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal
} from 'react-native';
import { supabase, isUuid } from '../../lib/supabase';
import { useAuth, AdminUser } from '../../contexts/AuthContext';
import StatusBadge from '../../components/StatusBadge';
import { generateMarksReport } from '../../lib/pdf-report';

// ─── Types ───────────────────────────────────────────────────────────────────
interface ExamEntry {
  id: string;
  examName: string;
  batch: string;
  batchId: string;
  subject: string;
  totalMarks: number;
  examDate: string;
  marks: { studentId: string; studentName: string; enrollmentNo: string; obtained: number }[];
  submittedBy: string;
  submittedByRole: 'teacher' | 'admin';
  status: 'pending' | 'approved' | 'rejected';
  studentCount: number;
  createdAt: string;
}

interface BatchOption {
  id: string;
  name: string;
  subjects: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const formatDate = (d: string) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return d;
  }
};

const getPercentageColor = (pct: number) => {
  if (pct >= 75) return '#16a34a';
  if (pct >= 50) return '#d97706';
  if (pct >= 33) return '#ea580c';
  return '#dc2626';
};

// ─── Main Component ─────────────────────────────────────────────────────────
export default function MarksScreen() {
  const { user } = useAuth();
  const adminUser = user as AdminUser;
  const instId = adminUser?.instituteId || '';
  const instituteName = adminUser?.instituteName || 'Institute';

  // Tab state
  const [activeTab, setActiveTab] = useState<'view' | 'edit' | 'reports'>('view');

  // Data state
  const [exams, setExams] = useState<ExamEntry[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [students, setStudents] = useState<{ id: string; name: string; enrollment_no: string; batch_name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [batchFilter, setBatchFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'a-z'>('newest');

  // View modal
  const [viewExam, setViewExam] = useState<ExamEntry | null>(null);

  // Edit state
  const [editBatchId, setEditBatchId] = useState('');
  const [editBatchExams, setEditBatchExams] = useState<ExamEntry[]>([]);
  const [selectedEditExam, setSelectedEditExam] = useState<ExamEntry | null>(null);
  const [editMarks, setEditMarks] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Report state
  const [reportBatchId, setReportBatchId] = useState('');
  const [reportExamName, setReportExamName] = useState('');
  const [reportExams, setReportExams] = useState<ExamEntry[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  // Realtime ref — initialized as null because fetchExams (useCallback) is declared below
  const fetchExamsRef = useRef<(() => Promise<void>) | null>(null);

  // ── Initial data load ──────────────────────────────────────────────────
  useEffect(() => {
    if (isUuid(instId)) {
      fetchInitialData();
    }
    return () => {};
  }, [instId]);

  // ── Realtime subscription ──────────────────────────────────────────────
  useEffect(() => {
    if (!isUuid(instId)) return;

    const channel = supabase
      .channel(`marks-admin-${instId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'marks', filter: `institute_id=eq.${instId}` },
        () => {
          fetchExamsRef.current?.();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [instId]);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchBatches(), fetchStudents(), fetchExams()]);
    } finally {
      setLoading(false);
    }
  };

  const fetchBatches = async () => {
    try {
      const { data } = await supabase
        .from('batches')
        .select('id, name, subjects')
        .eq('institute_id', instId)
        .eq('status', 'active')
        .order('name');
      setBatches((data || []).map((b: any) => ({ id: b.id, name: b.name, subjects: b.subjects || [] })));
    } catch (err) {
      console.error(err);
    }
  };

  const fetchStudents = async () => {
    try {
      const { data } = await supabase
        .from('students')
        .select('id, name, enrollment_no, batch_name')
        .eq('institute_id', instId)
        .eq('status', 'active');
      setStudents(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchExams = useCallback(async () => {
    if (!isUuid(instId)) return;
    try {
      const { data, error } = await supabase
        .from('marks')
        .select(`
          id,
          exam_name,
          subject,
          marks_obtained,
          total_marks,
          status,
          submitted_by,
          submitted_by_role,
          created_at,
          batch_id,
          student_id,
          exam_date,
          batch:batch_id (id, name),
          student:student_id (id, name, enrollment_no)
        `)
        .eq('institute_id', instId);

      if (error) throw error;

      const grouped: Record<string, ExamEntry> = {};
      (data || []).forEach((d: any) => {
        const key = `${d.exam_name}|${d.subject}|${d.batch_id}|${d.exam_date || ''}`;
        if (!grouped[key]) {
          grouped[key] = {
            id: key,
            examName: d.exam_name,
            batch: d.batch?.name || '',
            batchId: d.batch_id || '',
            subject: d.subject,
            totalMarks: d.total_marks || 0,
            examDate: d.exam_date || '',
            marks: [],
            submittedBy: d.submitted_by || 'Admin',
            submittedByRole: d.submitted_by_role || 'admin',
            status: d.status || 'pending',
            studentCount: 0,
            createdAt: d.created_at || '',
          };
        }
        grouped[key].marks.push({
          studentId: d.student_id,
          studentName: d.student?.name || 'Unknown',
          enrollmentNo: d.student?.enrollment_no || '',
          obtained: d.marks_obtained || 0,
        });
        grouped[key].studentCount++;
      });

      setExams(Object.values(grouped));
    } catch (err) {
      console.error(err);
    }
  }, [instId]);

  // Keep ref current for realtime subscription
  fetchExamsRef.current = fetchExams;

  // ── Filtered exams ─────────────────────────────────────────────────────
  const filteredExams = exams
    .filter((e) => {
      const matchSearch =
        e.examName.toLowerCase().includes(search.toLowerCase()) ||
        e.subject.toLowerCase().includes(search.toLowerCase()) ||
        e.batch.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'all' || e.status === statusFilter;
      const matchBatch = batchFilter === 'all' || e.batchId === batchFilter;
      return matchSearch && matchStatus && matchBatch;
    })
    .sort((a, b) => {
      if (sortOrder === 'a-z') return a.examName.localeCompare(b.examName);
      if (sortOrder === 'oldest') return (a.examDate || '').localeCompare(b.examDate || '');
      return (b.examDate || '').localeCompare(a.examDate || '');
    });

  // ── Stats ──────────────────────────────────────────────────────────────
  const stats = {
    total: exams.length,
    pending: exams.filter((e) => e.status === 'pending').length,
    approved: exams.filter((e) => e.status === 'approved').length,
    rejected: exams.filter((e) => e.status === 'rejected').length,
  };

  // ══════════════════════════════════════════════════════════════════════
  // APPROVE / REJECT
  // ══════════════════════════════════════════════════════════════════════
  const handleApproveReject = async (exam: ExamEntry, newStatus: 'approved' | 'rejected') => {
    try {
      const { error } = await supabase
        .from('marks')
        .update({ status: newStatus })
        .eq('institute_id', instId)
        .eq('exam_name', exam.examName)
        .eq('subject', exam.subject)
        .eq('batch_id', exam.batchId)
        .eq('exam_date', exam.examDate);

      if (error) throw error;
      Alert.alert('✅ Done', `Marks ${newStatus} successfully.`);
      await fetchExams();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  // ══════════════════════════════════════════════════════════════════════
  // DELETE EXAM
  // ══════════════════════════════════════════════════════════════════════
  const handleDeleteExam = (exam: ExamEntry) => {
    Alert.alert('Delete Exam', `Delete all marks for "${exam.examName}" — ${exam.subject}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase
              .from('marks')
              .delete()
              .eq('institute_id', instId)
              .eq('exam_name', exam.examName)
              .eq('subject', exam.subject)
              .eq('batch_id', exam.batchId)
              .eq('exam_date', exam.examDate);
            if (error) throw error;
            await fetchExams();
            Alert.alert('🗑️ Deleted', 'Exam marks removed.');
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  // ══════════════════════════════════════════════════════════════════════
  // EDIT MARKS — Load exams for selected batch
  // ══════════════════════════════════════════════════════════════════════
  const loadEditBatchExams = (batchId: string) => {
    setEditBatchId(batchId);
    const batchName = batches.find((b) => b.id === batchId)?.name || '';
    const batchExams = exams.filter((e) => e.batch === batchName);
    setEditBatchExams(batchExams);
    setSelectedEditExam(null);
    setEditMarks({});
  };

  const loadExamForEditing = (exam: ExamEntry) => {
    setSelectedEditExam(exam);
    const marksMap: Record<string, string> = {};
    exam.marks.forEach((m) => {
      marksMap[m.studentId] = String(m.obtained);
    });
    setEditMarks(marksMap);
  };

  const handleSaveEditMarks = async () => {
    if (!selectedEditExam) return;

    setSaving(true);
    try {
      const marksToUpsert = Object.entries(editMarks).map(([studentId, obtained]) => ({
        institute_id: instId,
        batch_id: selectedEditExam.batchId,
        student_id: studentId,
        exam_name: selectedEditExam.examName,
        subject: selectedEditExam.subject,
        marks_obtained: parseInt(obtained) || 0,
        total_marks: selectedEditExam.totalMarks,
        exam_date: selectedEditExam.examDate,
        status: 'pending' as const,
        submitted_by: instituteName,
        submitted_by_role: 'admin' as const,
      }));

      const { error } = await supabase.from('marks').upsert(marksToUpsert as any, {
        onConflict: 'institute_id,student_id,exam_name,subject,exam_date',
      });

      if (error) throw error;
      Alert.alert('✅ Saved', `Marks updated for ${marksToUpsert.length} students.`);
      await fetchExams();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  // ══════════════════════════════════════════════════════════════════════
  // REPORTS — Load exams for selected batch
  // ══════════════════════════════════════════════════════════════════════
  const loadReportExams = (batchId: string) => {
    setReportBatchId(batchId);
    const batchName = batches.find((b) => b.id === batchId)?.name || '';
    const batchExams = exams.filter((e) => e.batch === batchName && e.status === 'approved');
    setReportExams(batchExams);
    setReportExamName('');
  };

  const handleGenerateReport = async () => {
    if (!reportExamName || !reportBatchId) {
      Alert.alert('Error', 'Please select a batch and exam.');
      return;
    }

    const batchName = batches.find((b) => b.id === reportBatchId)?.name || '';
    const selectedExams = reportExams.filter((e) => e.examName === reportExamName);

    if (selectedExams.length === 0) {
      Alert.alert('Error', 'No approved exams found for this batch and exam name.');
      return;
    }

    setReportLoading(true);
    try {
      // Collect all students and their marks across subjects
      const studentMap = new Map<
        string,
        { name: string; enrollmentNo: string; subjects: { subject: string; obtained: number; total: number }[] }
      >();
      const allSubjects = new Set<string>();

      selectedExams.forEach((e) => {
        allSubjects.add(e.subject);
        e.marks.forEach((m) => {
          if (!studentMap.has(m.studentId)) {
            studentMap.set(m.studentId, { name: m.studentName, enrollmentNo: m.enrollmentNo, subjects: [] });
          }
          studentMap.get(m.studentId)!.subjects.push({
            subject: e.subject,
            obtained: m.obtained,
            total: e.totalMarks,
          });
        });
      });

      await generateMarksReport({
        instituteName,
        examName: reportExamName,
        batchName,
        subjects: Array.from(allSubjects),
        students: Array.from(studentMap.entries()).map(([id, data]) => ({
          id,
          name: data.name,
          enrollmentNo: data.enrollmentNo,
          subjects: data.subjects,
        })),
        generatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to generate report');
    } finally {
      setReportLoading(false);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading marks...</Text>
      </View>
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════════
  return (
    <View style={styles.wrapper}>
      {/* ── Tab Bar ── */}
      <View style={styles.tabBar}>
        <TabButton
          label="📋 View Exams"
          active={activeTab === 'view'}
          count={stats.total}
          onPress={() => setActiveTab('view')}
        />
        <TabButton
          label="✏️ Edit Marks"
          active={activeTab === 'edit'}
          onPress={() => { setActiveTab('edit'); }}
        />
        <TabButton
          label="📊 Reports"
          active={activeTab === 'reports'}
          onPress={() => setActiveTab('reports')}
        />
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {activeTab === 'view' && (
          <ViewExamsTab
            exams={filteredExams}
            stats={stats}
            search={search}
            setSearch={setSearch}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            batchFilter={batchFilter}
            setBatchFilter={setBatchFilter}
            sortOrder={sortOrder}
            setSortOrder={setSortOrder}
            batches={batches}
            viewExam={viewExam}
            setViewExam={setViewExam}
            onApprove={(e) => handleApproveReject(e, 'approved')}
            onReject={(e) => handleApproveReject(e, 'rejected')}
            onDelete={handleDeleteExam}
          />
        )}

        {activeTab === 'edit' && (
          <EditMarksTab
            batches={batches}
            editBatchId={editBatchId}
            onSelectBatch={loadEditBatchExams}
            editBatchExams={editBatchExams}
            selectedEditExam={selectedEditExam}
            onSelectExam={loadExamForEditing}
            editMarks={editMarks}
            onMarksChange={setEditMarks}
            onSave={handleSaveEditMarks}
            saving={saving}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsTab
            batches={batches}
            reportBatchId={reportBatchId}
            onSelectBatch={loadReportExams}
            reportExams={reportExams}
            reportExamName={reportExamName}
            onSelectExam={setReportExamName}
            onGenerate={handleGenerateReport}
            generating={reportLoading}
          />
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── View Marks Modal ── */}
      <Modal visible={!!viewExam} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>{viewExam?.examName}</Text>
                <Text style={styles.modalSubtitle}>
                  {viewExam?.subject} · {viewExam?.batch} · {viewExam?.examDate}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setViewExam(null)} style={styles.modalClose}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {viewExam?.marks
                .sort((a, b) => a.studentName.localeCompare(b.studentName))
                .map((m) => {
                  const pct = viewExam.totalMarks > 0 ? (m.obtained / viewExam.totalMarks) * 100 : 0;
                  return (
                    <View key={m.studentId} style={styles.markRow}>
                      <View style={styles.studentInfo}>
                        <Text style={styles.studentName}>{m.studentName}</Text>
                        <Text style={styles.studentEnroll}>{m.enrollmentNo}</Text>
                      </View>
                      <View style={styles.markCol}>
                        <Text style={styles.markObtained}>{m.obtained}</Text>
                        <Text style={styles.markTotal}>/ {viewExam.totalMarks}</Text>
                      </View>
                      <View style={[styles.pctBadge, { backgroundColor: getPercentageColor(pct) + '20' }]}>
                        <Text style={[styles.pctText, { color: getPercentageColor(pct) }]}>
                          {pct.toFixed(0)}%
                        </Text>
                      </View>
                    </View>
                  );
                })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB BUTTON COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function TabButton({
  label,
  active,
  count,
  onPress,
}: {
  label: string;
  active: boolean;
  count?: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.tabButton, active && styles.tabButtonActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.tabButtonText, active && styles.tabButtonTextActive]}>
        {label}
      </Text>
      {count !== undefined && (
        <View style={[styles.tabCount, active && styles.tabCountActive]}>
          <Text style={[styles.tabCountText, active && styles.tabCountTextActive]}>
            {count}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// VIEW EXAMS TAB
// ═══════════════════════════════════════════════════════════════════════════
function ViewExamsTab({
  exams,
  stats,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  batchFilter,
  setBatchFilter,
  sortOrder,
  setSortOrder,
  batches,
  viewExam,
  setViewExam,
  onApprove,
  onReject,
  onDelete,
}: {
  exams: ExamEntry[];
  stats: { total: number; pending: number; approved: number; rejected: number };
  search: string;
  setSearch: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  batchFilter: string;
  setBatchFilter: (v: string) => void;
  sortOrder: string;
  setSortOrder: (v: 'newest' | 'oldest' | 'a-z') => void;
  batches: BatchOption[];
  viewExam: ExamEntry | null;
  setViewExam: (v: ExamEntry | null) => void;
  onApprove: (e: ExamEntry) => void;
  onReject: (e: ExamEntry) => void;
  onDelete: (e: ExamEntry) => void;
}) {
  return (
    <View>
      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={[styles.statChip, { backgroundColor: '#eef2ff' }]}>
          <Text style={[styles.statChipValue, { color: '#4338ca' }]}>{stats.total}</Text>
          <Text style={styles.statChipLabel}>Total</Text>
        </View>
        <View style={[styles.statChip, { backgroundColor: '#fef3c7' }]}>
          <Text style={[styles.statChipValue, { color: '#b45309' }]}>{stats.pending}</Text>
          <Text style={styles.statChipLabel}>Pending</Text>
        </View>
        <View style={[styles.statChip, { backgroundColor: '#dcfce7' }]}>
          <Text style={[styles.statChipValue, { color: '#16a34a' }]}>{stats.approved}</Text>
          <Text style={styles.statChipLabel}>Approved</Text>
        </View>
        <View style={[styles.statChip, { backgroundColor: '#fee2e2' }]}>
          <Text style={[styles.statChipValue, { color: '#dc2626' }]}>{stats.rejected}</Text>
          <Text style={styles.statChipLabel}>Rejected</Text>
        </View>
      </View>

      {/* Filters */}
      <View style={styles.filterBar}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search exams, subjects, batches..."
            placeholderTextColor="#9ca3af"
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      <View style={styles.filterRow}>
        {/* Status filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChips}>
          {['all', 'pending', 'approved', 'rejected'].map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.chip, statusFilter === s && styles.chipActive]}
              onPress={() => setStatusFilter(s)}
            >
              <Text style={[styles.chipText, statusFilter === s && styles.chipTextActive]}>
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Sort toggles */}
        <View style={styles.sortRow}>
          {(['newest', 'oldest', 'a-z'] as const).map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.sortBtn, sortOrder === s && styles.sortBtnActive]}
              onPress={() => setSortOrder(s)}
            >
              <Text style={[styles.sortBtnText, sortOrder === s && styles.sortBtnTextActive]}>
                {s === 'a-z' ? 'A-Z' : s === 'newest' ? 'New' : 'Old'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Batch filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.batchChips}>
        <TouchableOpacity
          style={[styles.chip, batchFilter === 'all' && styles.chipActive]}
          onPress={() => setBatchFilter('all')}
        >
          <Text style={[styles.chipText, batchFilter === 'all' && styles.chipTextActive]}>All Batches</Text>
        </TouchableOpacity>
        {batches.map((b) => (
          <TouchableOpacity
            key={b.id}
            style={[styles.chip, batchFilter === b.id && styles.chipActive]}
            onPress={() => setBatchFilter(b.id)}
          >
            <Text style={[styles.chipText, batchFilter === b.id && styles.chipTextActive]}>{b.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Exam list */}
      {exams.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={styles.emptyText}>No exam records found</Text>
          <Text style={styles.emptySubtext}>
            {search || statusFilter !== 'all' || batchFilter !== 'all'
              ? 'Try adjusting your search or filters.'
              : 'Marks entered by teachers will appear here.'}
          </Text>
        </View>
      ) : (
        exams.map((exam) => (
          <View key={exam.id} style={styles.examCard}>
            <TouchableOpacity onPress={() => setViewExam(exam)} activeOpacity={0.7}>
              <View style={styles.examHeader}>
                <View style={styles.examTitleRow}>
                  <Text style={styles.examName}>{exam.examName}</Text>
                  <StatusBadge
                    variant={
                      exam.status === 'approved'
                        ? 'success'
                        : exam.status === 'rejected'
                          ? 'danger'
                          : 'warning'
                    }
                  >
                    {exam.status}
                  </StatusBadge>
                </View>
                <Text style={styles.examMeta}>
                  {exam.subject} · {exam.batch}
                </Text>
                <Text style={styles.examMeta2}>
                  {exam.studentCount} students · {exam.totalMarks > 0 ? `${exam.totalMarks} marks each` : 'No total set'}
                  {exam.examDate ? ` · ${formatDate(exam.examDate)}` : ''}
                </Text>
                <Text style={styles.examSubmitted}>
                  By {exam.submittedBy} ({exam.submittedByRole}) · {exam.createdAt ? formatDate(exam.createdAt) : ''}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Actions */}
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => setViewExam(exam)}
              >
                <Text style={styles.actionBtnText}>👁️ View</Text>
              </TouchableOpacity>

              {exam.status === 'pending' && (
                <>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.approveBtn]}
                    onPress={() => onApprove(exam)}
                  >
                    <Text style={styles.actionBtnTextWhite}>✅ Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.rejectBtn]}
                    onPress={() => onReject(exam)}
                  >
                    <Text style={styles.actionBtnTextWhite}>❌ Reject</Text>
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity
                style={[styles.actionBtn, styles.deleteBtn]}
                onPress={() => onDelete(exam)}
              >
                <Text style={styles.actionBtnTextDanger}>🗑️</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EDIT MARKS TAB
// ═══════════════════════════════════════════════════════════════════════════
function EditMarksTab({
  batches,
  editBatchId,
  onSelectBatch,
  editBatchExams,
  selectedEditExam,
  onSelectExam,
  editMarks,
  onMarksChange,
  onSave,
  saving,
}: {
  batches: BatchOption[];
  editBatchId: string;
  onSelectBatch: (id: string) => void;
  editBatchExams: ExamEntry[];
  selectedEditExam: ExamEntry | null;
  onSelectExam: (e: ExamEntry) => void;
  editMarks: Record<string, string>;
  onMarksChange: (m: Record<string, string>) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <View>
      <Text style={styles.sectionTitle}>✏️ Edit Marks</Text>
      <Text style={styles.sectionSubtitle}>
        Select a batch and exam to edit marks per student
      </Text>

      {/* Batch selector */}
      <Text style={styles.fieldLabel}>Select Batch</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        {batches.map((b) => (
          <TouchableOpacity
            key={b.id}
            style={[styles.chip, editBatchId === b.id && styles.chipActive]}
            onPress={() => onSelectBatch(b.id)}
          >
            <Text style={[styles.chipText, editBatchId === b.id && styles.chipTextActive]}>
              {b.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {editBatchId ? (
        <>
          {/* Exam selector */}
          {editBatchExams.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyText}>No exams found for this batch.</Text>
            </View>
          ) : (
            <>
              <Text style={styles.fieldLabel}>Select Exam to Edit</Text>
              {editBatchExams.map((exam) => (
                <TouchableOpacity
                  key={exam.id}
                  style={[
                    styles.examSelectCard,
                    selectedEditExam?.id === exam.id && styles.examSelectCardActive,
                  ]}
                  onPress={() => onSelectExam(exam)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.examSelectName}>{exam.examName}</Text>
                    <Text style={styles.examSelectMeta}>
                      {exam.subject} · {exam.studentCount} students · {exam.totalMarks} marks
                      {exam.status !== 'approved' ? (
                        <Text style={{ color: '#d97706' }}> ({exam.status})</Text>
                      ) : null}
                    </Text>
                  </View>
                  <StatusBadge
                    variant={
                      exam.status === 'approved'
                        ? 'success'
                        : exam.status === 'rejected'
                          ? 'danger'
                          : 'warning'
                    }
                  >
                    {exam.status}
                  </StatusBadge>
                </TouchableOpacity>
              ))}
            </>
          )}

          {/* Inline marks editing */}
          {selectedEditExam && (
            <View style={styles.editSection}>
              <View style={styles.editHeader}>
                <View>
                  <Text style={styles.editTitle}>
                    {selectedEditExam.examName} — {selectedEditExam.subject}
                  </Text>
                  <Text style={styles.editMeta}>
                    Total Marks: {selectedEditExam.totalMarks} · Date:{' '}
                    {formatDate(selectedEditExam.examDate)}
                  </Text>
                </View>
              </View>

              {/* Student marks list */}
              {selectedEditExam.marks
                .sort((a, b) => a.studentName.localeCompare(b.studentName))
                .map((m) => (
                  <View key={m.studentId} style={styles.editMarkRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.studentName}>{m.studentName}</Text>
                      <Text style={styles.studentEnroll}>{m.enrollmentNo}</Text>
                    </View>
                    <TextInput
                      style={[
                        styles.markInput,
                        editMarks[m.studentId] &&
                          parseInt(editMarks[m.studentId]) > selectedEditExam.totalMarks &&
                          styles.markInputError,
                      ]}
                      placeholder="-"
                      placeholderTextColor="#d1d5db"
                      value={editMarks[m.studentId] || ''}
                      onChangeText={(text) =>
                        onMarksChange({ ...editMarks, [m.studentId]: text })
                      }
                      keyboardType="numeric"
                    />
                    <Text style={styles.markOutOf}>/ {selectedEditExam.totalMarks}</Text>
                  </View>
                ))}

              {/* Save button */}
              <TouchableOpacity
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={onSave}
                disabled={saving}
              >
                {saving ? (
                  <View style={styles.savingRow}>
                    <ActivityIndicator color="#fff" size="small" />
                    <Text style={styles.saveButtonText}>  Saving...</Text>
                  </View>
                ) : (
                  <Text style={styles.saveButtonText}>💾 Save All Marks</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>👆</Text>
          <Text style={styles.emptyText}>Select a batch to begin editing</Text>
        </View>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// REPORTS TAB
// ═══════════════════════════════════════════════════════════════════════════
function ReportsTab({
  batches,
  reportBatchId,
  onSelectBatch,
  reportExams,
  reportExamName,
  onSelectExam,
  onGenerate,
  generating,
}: {
  batches: BatchOption[];
  reportBatchId: string;
  onSelectBatch: (id: string) => void;
  reportExams: ExamEntry[];
  reportExamName: string;
  onSelectExam: (name: string) => void;
  onGenerate: () => void;
  generating: boolean;
}) {
  return (
    <View>
      <Text style={styles.sectionTitle}>📊 Generate Report Cards</Text>
      <Text style={styles.sectionSubtitle}>
        Generate professional report cards for approved exams
      </Text>

      {/* Batch selector */}
      <Text style={styles.fieldLabel}>Select Batch</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        {batches.map((b) => (
          <TouchableOpacity
            key={b.id}
            style={[styles.chip, reportBatchId === b.id && styles.chipActive]}
            onPress={() => onSelectBatch(b.id)}
          >
            <Text style={[styles.chipText, reportBatchId === b.id && styles.chipTextActive]}>
              {b.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {reportBatchId ? (
        <>
          {/* Exam name selector (from approved exams) */}
          {reportExams.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyText}>No approved exams found for this batch.</Text>
              <Text style={styles.emptySubtext}>Approve exams in the View tab first.</Text>
            </View>
          ) : (
            <>
              <Text style={styles.fieldLabel}>Select Exam</Text>
              {[
                ...new Set(reportExams.map((e) => e.examName)),
              ].map((examName) => {
                const count = reportExams.filter((e) => e.examName === examName).length;
                return (
                  <TouchableOpacity
                    key={examName}
                    style={[
                      styles.examSelectCard,
                      reportExamName === examName && styles.examSelectCardActive,
                    ]}
                    onPress={() => onSelectExam(examName)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.examSelectName}>{examName}</Text>
                      <Text style={styles.examSelectMeta}>
                        {count} subject{count > 1 ? 's' : ''} · All approved
                      </Text>
                    </View>
                    <Text style={styles.reportSubjectCount}>{count}</Text>
                  </TouchableOpacity>
                );
              })}

              {reportExamName && (
                <TouchableOpacity
                  style={[styles.generateButton, generating && styles.saveButtonDisabled]}
                  onPress={onGenerate}
                  disabled={generating}
                >
                  {generating ? (
                    <View style={styles.savingRow}>
                      <ActivityIndicator color="#fff" size="small" />
                      <Text style={styles.saveButtonText}>  Generating PDF...</Text>
                    </View>
                  ) : (
                    <Text style={styles.saveButtonText}>
                      📄 Generate Report Card for {reportExamName}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </>
          )}
        </>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>👆</Text>
          <Text style={styles.emptyText}>Select a batch to see approved exams</Text>
        </View>
      )}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// STYLES
// ═════════════════════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#f8fafc' },
  container: { flex: 1, padding: 16 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc', gap: 12 },
  loadingText: { color: '#6b7280', fontSize: 14 },

  // ── Tab Bar ──
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 14,
    padding: 4,
    margin: 16,
    marginBottom: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
    gap: 4,
  },
  tabButtonActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 },
  tabButtonText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  tabButtonTextActive: { color: '#6366f1' },
  tabCount: {
    backgroundColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  tabCountActive: { backgroundColor: '#eef2ff' },
  tabCountText: { fontSize: 11, fontWeight: '700', color: '#6b7280' },
  tabCountTextActive: { color: '#6366f1' },

  // ── Stats ──
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statChip: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  statChipValue: { fontSize: 20, fontWeight: '800' },
  statChipLabel: { fontSize: 10, color: '#6b7280', marginTop: 2, fontWeight: '500' },

  // ── Search & Filters ──
  filterBar: { marginBottom: 8 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchIcon: { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },

  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  filterChips: { flex: 1 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginRight: 6,
  },
  chipActive: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  chipText: { fontSize: 12, color: '#374151', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  batchChips: { marginBottom: 12 },

  sortRow: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: 8, padding: 2 },
  sortBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  sortBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  sortBtnText: { fontSize: 11, color: '#6b7280', fontWeight: '600' },
  sortBtnTextActive: { color: '#6366f1' },

  // ── Exam Card ──
  examCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  examHeader: { marginBottom: 12 },
  examTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  examName: { fontSize: 16, fontWeight: '700', color: '#111827' },
  examMeta: { fontSize: 13, color: '#6b7280', marginBottom: 2 },
  examMeta2: { fontSize: 12, color: '#6b7280', marginBottom: 2 },
  examSubmitted: { fontSize: 11, color: '#9ca3af', marginTop: 2 },

  // ── Actions ──
  actionsRow: {
    flexDirection: 'row',
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 10,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  approveBtn: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  rejectBtn: { backgroundColor: '#ef4444', borderColor: '#ef4444' },
  deleteBtn: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  actionBtnText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  actionBtnTextWhite: { fontSize: 12, fontWeight: '600', color: '#fff' },
  actionBtnTextDanger: { fontSize: 12 },

  // ── Empty State ──
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 15, color: '#6b7280', fontWeight: '600', textAlign: 'center', marginBottom: 4 },
  emptySubtext: { fontSize: 13, color: '#9ca3af', textAlign: 'center' },

  // ── Section title ──
  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 4 },
  sectionSubtitle: { fontSize: 13, color: '#6b7280', marginBottom: 20 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 4 },

  // ── Chip row ──
  chipRow: { marginBottom: 16 },

  // ── Exam select card ──
  examSelectCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  examSelectCardActive: {
    borderColor: '#6366f1',
    backgroundColor: '#eef2ff',
  },
  examSelectName: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 2 },
  examSelectMeta: { fontSize: 12, color: '#6b7280' },
  reportSubjectCount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6366f1',
    backgroundColor: '#eef2ff',
    borderRadius: 20,
    width: 36,
    height: 36,
    textAlign: 'center',
    lineHeight: 36,
    overflow: 'hidden',
  },

  // ── Edit Section ──
  editSection: { marginTop: 16 },
  editHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#6366f1',
  },
  editTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 2 },
  editMeta: { fontSize: 12, color: '#6b7280' },

  // ── Mark Row ──
  markRow: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  studentInfo: { flex: 1 },
  studentName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  studentEnroll: { fontSize: 11, color: '#6b7280', marginTop: 1 },

  // View modal mark col
  markCol: { alignItems: 'center', marginRight: 12 },
  markObtained: { fontSize: 18, fontWeight: '700', color: '#111827' },
  markTotal: { fontSize: 11, color: '#9ca3af' },
  pctBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  pctText: { fontSize: 13, fontWeight: '700' },

  // Edit mark row
  editMarkRow: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  markInput: {
    width: 56,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    color: '#111827',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  markInputError: { borderColor: '#ef4444', backgroundColor: '#fef2f2' },
  markOutOf: { fontSize: 12, color: '#9ca3af', marginLeft: 4 },

  // ── Save ──
  saveButton: {
    backgroundColor: '#6366f1',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  generateButton: {
    backgroundColor: '#16a34a',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonDisabled: { opacity: 0.7 },
  savingRow: { flexDirection: 'row', alignItems: 'center' },
  saveButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // ── Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 2 },
  modalSubtitle: { fontSize: 13, color: '#6b7280' },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: { fontSize: 14, fontWeight: '700', color: '#6b7280' },
  modalBody: {},
});
