import { useState, useMemo } from "react";
import { Search, Plus, Filter, Download, MessageCircle } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { getStoredStudents, setStoredStudents, type Student } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

import { Link } from "react-router-dom";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import { supabase, isUuid } from "@/lib/supabase";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { DataImportDialog } from "@/components/shared/DataImportDialog";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';



export default function StudentsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const DEFAULT_UUID = "00000000-0000-0000-0000-000000000001";
  const instId = isAdmin ? (user as AdminUser).instituteId : DEFAULT_UUID;
  
  const [students, setStudents] = useState<Student[]>([]);
  const [dbBatches, setDbBatches] = useState<{id: string, name: string}[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [addOpen, setAddOpen] = useState(false);
const [editBatchOpen, setEditBatchOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [whatsappStudent, setWhatsappStudent] = useState<Student | null>(null);
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [messageType, setMessageType] = useState<string>("");
  const [customMessage, setCustomMessage] = useState("");
  const [form, setForm] = useState({ name: "", motherPhone: "", fatherPhone: "", studentPhone: "", email: "", batchId: "" });
  const [batchForm, setBatchForm] = useState({ batchId: "" });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const perPage = 15;

  useEffect(() => {
    if (isUuid(instId)) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [instId]);

  const fetchData = async () => {
    setLoading(true);
    
    // 1. Fetch Batches
    const { data: bData, error: bErr } = await supabase
      .from('batches')
      .select('id, name')
      .eq('institute_id', instId);
    
    if (bErr) {
      toast({ title: "Error fetching batches", description: bErr.message, variant: "destructive" });
    } else {
      setDbBatches(bData || []);
    }

    // 2. Fetch Students
    const { data: sData, error: sErr } = await supabase
      .from('students')
      .select('*')
      .eq('institute_id', instId)
      .order('created_at', { ascending: false });

    if (sErr) {
      toast({ title: "Error fetching students", description: sErr.message, variant: "destructive" });
    } else {
      setStudents((sData || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        enrollmentNo: s.enrollment_no,
        grn: s.grn_no || "",
        batch: s.batch_name,
        email: s.email,
        phone: s.student_phone || s.phone || "",
        motherPhone: s.mother_phone || s.guardian_phone || "",
        fatherPhone: s.father_phone || s.guardian_phone || "",
        studentPhone: s.student_phone || s.phone || "",
        status: s.status,
        feeStatus: 'paid',
        parentName: s.guardian_name,
        joinDate: s.join_date,
      })));
    }
    
    setLoading(false);
  };

  const allBatches = useMemo(() => {
    const list = dbBatches.map(b => b.name);
    // Include batches from students even if they aren't in the batches table (fallback)
    const studentBatches = students.map(s => s.batch);
    return Array.from(new Set([...list, ...studentBatches])).filter(Boolean);
  }, [dbBatches, students]);

  const handleExportToExcel = () => {
    if (filtered.length === 0) {
      toast({ title: "No data", description: "No students to export.", variant: "destructive" });
      return;
    }

    // Prepare data for Excel
    const exportData = filtered.map(student => ({
      'Name': student.name,
      'Enrollment No': student.enrollmentNo,
      'GRN': student.grn,
      'Batch': student.batch,
      'Email': student.email,
      'Student Phone': student.studentPhone || student.phone || "",
      'Mother Phone': student.motherPhone || "",
      'Father Phone': student.fatherPhone || "",
      'Status': student.status,
      'Fee Status': student.feeStatus,
      'Join Date': student.joinDate,
    }));

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Set column widths
    const columnWidths = [
      { wch: 20 }, // Name
      { wch: 15 }, // Enrollment No
      { wch: 12 }, // GRN
      { wch: 20 }, // Batch
      { wch: 25 }, // Email
      { wch: 15 }, // Student Phone
      { wch: 15 }, // Mother Phone
      { wch: 15 }, // Father Phone
      { wch: 10 }, // Status
      { wch: 12 }, // Fee Status
      { wch: 12 }, // Join Date
    ];
    ws['!cols'] = columnWidths;

    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    
    // Export file
    const fileName = `students_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    toast({ title: "Success", description: `Exported ${filtered.length} students to Excel.` });
  };

  const filtered = useMemo(() => {
    return students.filter((s) => {
      const name = s.name || "";
      const enrollment = s.enrollmentNo || "";
      const matchSearch = name.toLowerCase().includes(search.toLowerCase()) ||
        enrollment.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || s.status === statusFilter;
      const matchBatch = batchFilter === "all" || s.batch === batchFilter;
      return matchSearch && matchStatus && matchBatch;
    });
  }, [students, search, statusFilter, batchFilter]);

  const paginated = filtered.slice((page - 1) * perPage, page * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);

  const columns = [
    {
      key: "name",
      title: "Student",
      render: (s: Student) => (
        <Link to={`/students/${s.id}`} className="flex items-center gap-3 group">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-semibold text-primary">
              {(s.name || "S").split(" ").filter(Boolean).map((n) => n[0]).join("")}
            </span>
          </div>

          <div>
            <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{s.name}</p>
            <p className="text-xs text-muted-foreground">{s.enrollmentNo}</p>
          </div>
        </Link>
      ),
    },
    { key: "batch", title: "Batch", hideOnMobile: false, render: (s: Student) => <span className="text-sm text-foreground">{s.batch}</span> },
    { key: "phone", title: "Phone", hideOnMobile: false, render: (s: Student) => <span className="text-sm text-muted-foreground tabular-nums">{s.phone}</span> },
    {
      key: "whatsapp",
      title: "WhatsApp",
      hideOnMobile: false,
      render: (s: Student) => {
        const makeHref = (phone?: string) => {
          if (!phone) return "";
          const digits = phone.replace(/\D/g, "");
          if (!digits) return "";
          return `https://wa.me/${digits}`;
        };
        const iconBtn = (phone?: string, title?: string) => {
          const href = makeHref(phone);
          if (!href) return null;
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-md bg-green-100 hover:bg-green-200 text-green-700 transition-colors"
              title={title || phone}
            >
              <MessageCircle className="w-4 h-4" />
            </a>
          );
        };
        return (
          <div className="flex items-center gap-2">
            {iconBtn(s.studentPhone || s.phone, `Student: ${s.studentPhone || s.phone}`)}
            {iconBtn(s.motherPhone, `Mother: ${s.motherPhone}`)}
            {iconBtn(s.fatherPhone, `Father: ${s.fatherPhone}`)}
          </div>
        );
      },
    },
    {
      key: "status",
      title: "Status",
      render: (s: Student) => (
        <StatusBadge variant={s.status === "active" ? "success" : s.status === "inactive" ? "default" : "primary"}>
          {s.status}
        </StatusBadge>
      ),
    },
    {
      key: "feeStatus",
      title: "Fees",
      render: (s: Student) => (
        <StatusBadge variant={s.feeStatus === "paid" ? "success" : s.feeStatus === "partial" ? "warning" : "destructive"}>
          {s.feeStatus}
        </StatusBadge>
      ),
    },
    {
      key: "actions",
      title: "",
      render: (s: Student) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleEditBatch(s)}
            className="text-primary hover:text-primary hover:bg-primary/10"
          >
            Edit Batch
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleRevoke(s.id, s.name)}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            Revoke
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => generateStudentReport(s.id, s.name)}
            className="text-primary hover:text-primary hover:bg-primary/10"
            title="Download full student report"
          >
            <Download className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

  const generateStudentReport = async (studentId: string, studentName?: string) => {
    try {
      // Fetch student
      const { data: sData, error: sErr } = await supabase.from('students').select('*').eq('id', studentId).single();
      if (sErr) throw sErr;

      // Fetch all fee ids then payments
      const { data: feesData } = await supabase.from('student_fees').select('id,original_fee,final_fee,paid_fees,last_payment_date').eq('student_id', studentId);
      const feeIds = (feesData || []).map((f: any) => f.id);
      let payments: any[] = [];
      if (feeIds.length > 0) {
        const { data: pData } = await supabase.from('payments').select('*').in('student_fee_id', feeIds).order('payment_date', { ascending: false });
        payments = pData || [];
      }

      // Fetch attendance
      const { data: aData } = await supabase.from('attendance').select('*').eq('student_id', studentId).order('date', { ascending: false });

      // Fetch exam marks from DB (preferred) and fallback to localStorage
      let examMarks: any[] = [];
      try {
        const { data: dbMarks } = await supabase
          .from('marks')
          .select('exam_name, subject, marks_obtained, total_marks, created_at')
          .eq('student_id', studentId)
          .eq('institute_id', instId)
          .order('created_at', { ascending: false });
        if (dbMarks && dbMarks.length > 0) {
          examMarks = (dbMarks || []).map((m: any) => ({ examName: m.exam_name, subject: m.subject, obtained: m.marks_obtained, total: m.total_marks || 100, date: m.created_at }));
        } else {
          const saved = localStorage.getItem(`sms_exams_${instId}`);
          if (saved) {
            const allExams = JSON.parse(saved);
            allExams.forEach((exam: any) => {
              const studentMark = exam.marks?.find((m: any) => m.studentName === sData.name);
              if (studentMark) {
                examMarks.push({ examName: exam.examName, subject: exam.subject, obtained: studentMark.obtained, total: exam.totalMarks || 100, date: exam.submittedAt });
              }
            });
          }
        }
      } catch (err) {
        try {
          const saved = localStorage.getItem(`sms_exams_${instId}`);
          if (saved) {
            const allExams = JSON.parse(saved);
            allExams.forEach((exam: any) => {
              const studentMark = exam.marks?.find((m: any) => m.studentName === sData.name);
              if (studentMark) {
                examMarks.push({ examName: exam.examName, subject: exam.subject, obtained: studentMark.obtained, total: exam.totalMarks || 100, date: exam.submittedAt });
              }
            });
          }
        } catch (e) {
          // ignore
        }
      }

      // Build PDF
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      doc.setFontSize(18);
      doc.text(studentName || sData.name || 'Student Report', 40, 50);
      doc.setFontSize(11);
      doc.text(`Enrollment No: ${sData.enrollment_no || ''}`, 40, 70);
      doc.text(`Batch: ${sData.batch_name || ''}`, 300, 70);
      doc.text(`Email: ${sData.email || ''}`, 40, 90);
      doc.text(`Phone: ${sData.student_phone || sData.phone || ''}`, 300, 90);

      let y = 120;

      // Payments table
      doc.setFontSize(13);
      doc.text('Payments', 40, y);
      y += 10;
      if (payments.length === 0) {
        doc.setFontSize(10);
        doc.text('No payments found.', 40, y + 10);
        y += 30;
      } else {
        (autoTable as any)(doc, {
          startY: y,
          head: [['Date', 'Amount', 'Method', 'Transaction']],
          body: payments.map((p) => [new Date(p.payment_date).toLocaleDateString('en-IN'), formatCurrency(p.amount), p.payment_method || '-', p.transaction_id || '-']),
          styles: { fontSize: 9 },
          theme: 'striped',
          headStyles: { fillColor: [240, 240, 240] },
          margin: { left: 40, right: 40 }
        });
        y = (doc as any).lastAutoTable.finalY + 20;
      }

      // Attendance summary
      doc.setFontSize(13);
      doc.text('Attendance (recent)', 40, y);
      y += 10;
      if (!aData || aData.length === 0) {
        doc.setFontSize(10);
        doc.text('No attendance records.', 40, y + 10);
        y += 30;
      } else {
        const recent = (aData || []).slice(0, 50).map((a: any) => [new Date(a.date).toLocaleDateString('en-IN'), a.status]);
        (autoTable as any)(doc, {
          startY: y,
          head: [['Date', 'Status']],
          body: recent,
          styles: { fontSize: 9 },
          theme: 'grid',
          margin: { left: 40, right: 40 }
        });
        y = (doc as any).lastAutoTable.finalY + 20;
      }

      // Exam marks
      doc.setFontSize(13);
      doc.text('Exam Marks', 40, y);
      y += 10;
      if (examMarks.length === 0) {
        doc.setFontSize(10);
        doc.text('No exam marks found.', 40, y + 10);
      } else {
        (autoTable as any)(doc, {
          startY: y,
          head: [['Exam', 'Subject', 'Obtained', 'Total', 'Date']],
          body: examMarks.map((m) => [m.examName, m.subject, String(m.obtained), String(m.total), m.date ? new Date(m.date).toLocaleDateString('en-IN') : '-']),
          styles: { fontSize: 9 },
          theme: 'grid',
          margin: { left: 40, right: 40 }
        });
      }

      const fileName = `Student_Report_${sData.enrollment_no || sData.id}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      toast({ title: 'Report Generated', description: `Downloaded ${fileName}` });
    } catch (error: any) {
      console.error('Error generating student report:', error);
      toast({ title: 'Error', description: error?.message || 'Failed to generate report', variant: 'destructive' });
    }
  };

  const handleRevoke = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to revoke admission for ${name}?`)) return;

    const { error } = await supabase
      .from('students')
      .delete()
      .eq('id', id);

    if (error) {
      toast({ title: "Error", description: "Failed to revoke student: " + error.message, variant: "destructive" });
    } else {
      setStudents(prev => prev.filter(s => s.id !== id));
      toast({ title: "Success", description: `Admission for ${name} has been revoked.` });
    }
  };

  const handleEditBatch = (student: Student) => {
    setEditingStudent(student);
    const currentBatch = dbBatches.find(b => b.name === student.batch);
    setBatchForm({ batchId: currentBatch?.id || "" });
    setEditBatchOpen(true);
  };

  const handleSaveBatch = async () => {
    if (!editingStudent || !batchForm.batchId) {
      toast({ title: "Error", description: "Please select a batch.", variant: "destructive" });
      return;
    }

    const selectedBatch = dbBatches.find(b => b.id === batchForm.batchId);

    const { error } = await supabase
      .from('students')
      .update({
        batch_id: batchForm.batchId,
        batch_name: selectedBatch?.name
      })
      .eq('id', editingStudent.id);

    if (error) {
      toast({ title: "Error", description: "Failed to update batch: " + error.message, variant: "destructive" });
    } else {
      setStudents(prev => prev.map(s =>
        s.id === editingStudent.id
          ? { ...s, batch: selectedBatch?.name || "" }
          : s
      ));
      setEditBatchOpen(false);
      setEditingStudent(null);
      setBatchForm({ batchId: "" });
toast({ title: "Success", description: `${editingStudent.name}'s batch has been updated.` });
    }
  };

  const openWhatsappDialog = (student: Student, phone: string) => {
    setWhatsappStudent(student);
    setWhatsappPhone(phone);
    setMessageType("");
    setCustomMessage("");
    setWhatsappOpen(true);
  };

  const generateWhatsappLink = () => {
    if (!whatsappStudent || !whatsappPhone) return "";

    let message = "";
    const studentName = whatsappStudent.name;

    if (messageType === "fee_details") {
      message = `Hello Parent, Kindly clear the pending fee for ${studentName}. For details, please contact the institute.`;
    } else if (messageType === "marks_report") {
      message = `Hello Parent, The marks report for ${studentName} is available. Please contact the institute for details.`;
    } else if (messageType === "attendance") {
      message = `Hello Parent, This is to inform you about the attendance record of ${studentName}. For details, please contact the institute.`;
    } else if (messageType === "custom") {
      message = customMessage;
    } else {
      message = `Hello, this is a message from the institute regarding ${studentName}.`;
    }

    const cleanPhone = whatsappPhone.replace(/\D/g, '');
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  };

  const handleSendWhatsapp = () => {
    const link = generateWhatsappLink();
    if (link) {
      window.open(link, '_blank');
      setWhatsappOpen(false);
      toast({ title: "WhatsApp", description: "Opening WhatsApp chat..." });
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-card border border-border flex-1 sm:flex-initial sm:w-64">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search students..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
                <Filter className="w-4 h-4 mr-2" /> Filters
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72">
              <div className="space-y-4">
                <h4 className="font-medium text-sm">Filter Students</h4>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Status</label>
                    <select
                      value={statusFilter}
                      onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                      className="w-full px-3 py-2 rounded-md bg-secondary border-none text-sm text-foreground outline-none"
                    >
                      <option value="all">All Status</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="alumni">Alumni</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Batch</label>
                    <select
                      value={batchFilter}
                      onChange={(e) => { setBatchFilter(e.target.value); setPage(1); }}
                      className="w-full px-3 py-2 rounded-md bg-secondary border-none text-sm text-foreground outline-none"
                    >
                      <option value="all">All Batches</option>
                      {allBatches.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                </div>
                {(statusFilter !== "all" || batchFilter !== "all") && (
                  <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => { setStatusFilter("all"); setBatchFilter("all"); }}>
                    Clear Filters
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Students</p>
            <p className="text-lg font-bold text-primary tabular-nums leading-none mt-1">{students.length}</p>
          </div>
          <div className="h-8 w-px bg-border hidden sm:block" />
          <div className="flex items-center gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
            <DataImportDialog type="students" instituteId={instId} onSuccess={fetchData} />
            <Button size="sm" className="h-9" onClick={handleExportToExcel} variant="outline">
              <Download className="w-4 h-4 mr-1" /> Export Excel
            </Button>
            <Button size="sm" className="h-9" onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Add Student
            </Button>
          </div>

        </div>


      </div>

      {/* Table */}
      <DataTable data={paginated} columns={columns} />

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Showing {filtered.length === 0 ? 0 : ((page - 1) * perPage) + 1}–{Math.min(page * perPage, filtered.length)} of {filtered.length} students</span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Prev</Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages || totalPages === 0} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      </div>

      {/* Add Student Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Student</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Full Name</label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="John Doe" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Phone Numbers</label>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Mother</label>
                  <Input value={form.motherPhone} onChange={e => setForm(p => ({ ...p, motherPhone: e.target.value }))} placeholder="+91 XXXXXXXX" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Father</label>
                  <Input value={form.fatherPhone} onChange={e => setForm(p => ({ ...p, fatherPhone: e.target.value }))} placeholder="+91 XXXXXXXX" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Student</label>
                  <Input value={form.studentPhone} onChange={e => setForm(p => ({ ...p, studentPhone: e.target.value }))} placeholder="+91 XXXXXXXX" />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email Address</label>
              <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="john@example.com" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Batch</label>
              <select 
                value={form.batchId} 
                onChange={e => setForm(p => ({ ...p, batchId: e.target.value }))}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="">Select a batch</option>
                {dbBatches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>

          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={async () => {
              if(!form.name || !form.batchId || !form.email) {
                toast({ title: "Validation Error", description: "Name, email and batch are required.", variant: "destructive" });
                return;
              }

               // Check if email already exists locally to avoid duplicates before sending to DB
               const exists = students.find(s => s.email && form.email && s.email.toLowerCase() === form.email.toLowerCase());
              if (exists) {
                toast({ title: "Duplicate Student", description: "A student with this email already exists.", variant: "destructive" });
                return;
              }

              const selectedBatch = dbBatches.find(b => b.id === form.batchId);
              
              // Generate GRN locally — institutes table has no grn_prefix column
              const prefix = instId.replace(/-/g, '').toUpperCase().substring(0, 3);
              const randomSuffix = Math.floor(10000 + Math.random() * 90000); // 5 digits
              const generatedGrn = `${prefix}${randomSuffix}`;

                // 2. Insert Student
                const guardianPhone = form.motherPhone || form.fatherPhone || null;
                const { data, error } = await supabase
                  .from('students')
                  .insert([{
                    institute_id: instId,
                    name: form.name,
                    email: form.email,
                    guardian_phone: guardianPhone,
                    phone: form.studentPhone || null,
                    batch_id: form.batchId,
                    batch_name: selectedBatch?.name,
                    status: 'active',
                    join_date: new Date().toISOString().split('T')[0],
                    enrollment_no: `MT-${new Date().getFullYear()}${Math.floor(1000 + Math.random() * 9000)}`
                  }])
                  .select()
                  .single();

              if (error) {
                toast({ title: "Failed to save", description: error.message, variant: "destructive" });
                return;
              }

              // 3. Create GRN Record
              await supabase.from('grn_records').insert([{
                institute_id: instId,
                student_id: data.id,
                grn_number: generatedGrn,
                status: 'active',
                issued_date: data.join_date
              }]);

               const newStudent: Student = {
                 id: data.id,
                 name: data.name,
                 enrollmentNo: data.enrollment_no,
                 grn: "",
                 batch: data.batch_name,
                 email: data.email,
                 phone: data.phone || "",
                 motherPhone: "",
                 fatherPhone: "",
                 studentPhone: data.phone || "",
                 status: data.status as any,
                 feeStatus: 'paid',
                 parentName: 'Parent',
                 joinDate: data.join_date,
               };

               setStudents(prev => [newStudent, ...prev]);
               setAddOpen(false);
               setForm({ name: "", motherPhone: "", fatherPhone: "", studentPhone: "", email: "", batchId: "" });
               toast({ title: "Student Added", description: `${data.name} successfully registered!` });
             }}>Save Student</Button>


          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Batch Dialog */}
      <Dialog open={editBatchOpen} onOpenChange={setEditBatchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Batch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {editingStudent && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Changing batch for: <span className="font-medium text-foreground">{editingStudent.name}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Current batch: <span className="font-medium text-foreground">{editingStudent.batch || "None"}</span>
                </p>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">New Batch</label>
              <select
                value={batchForm.batchId}
                onChange={e => setBatchForm({ batchId: e.target.value })}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="">Select a batch</option>
                {dbBatches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditBatchOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveBatch}>Update Batch</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
