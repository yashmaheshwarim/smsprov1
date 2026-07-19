// ─── User Roles ──────────────────────────────────────────────────────────────

export type UserRole = 'super_admin' | 'admin' | 'teacher' | 'student' | 'parent';

export interface PagePermission {
  visible: boolean;
  read: boolean;
  write: boolean;
}

export interface TeacherUser {
  id: string;
  name: string;
  email: string;
  role: 'teacher';
  instituteId: string;
  assignedClasses: string[];
  assignedSubjects: string[];
  permissions: Record<string, PagePermission>;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'admin';
  instituteName: string;
  instituteId: string;
  pageAccess: Record<string, boolean>;
  canAddTeachers?: boolean;
  canAddStudents?: boolean;
  canAddParents?: boolean;
}

export interface SuperAdminUser {
  id: string;
  name: string;
  email: string;
  role: 'super_admin';
}

export interface StudentUser {
  id: string;
  name: string;
  email: string;
  role: 'student';
  enrollmentNo: string;
  grn: string;
  batch: string;
  parentId: string;
}

export interface ParentUser {
  id: string;
  name: string;
  email: string;
  role: 'parent';
  childrenIds: string[];
}

export type AppUser = TeacherUser | AdminUser | SuperAdminUser | StudentUser | ParentUser;

// ─── Data Types ──────────────────────────────────────────────────────────────

export interface Student {
  id: string;
  name: string;
  enrollmentNo: string;
  grn: string;
  batch: string;
  email: string;
  phone: string;
  mother_phone?: string;
  father_phone?: string;
  student_phone?: string;
  status: string;
  feeStatus: string;
  parentName: string;
  joinDate: string;
}

export interface Teacher {
  id: string;
  name: string;
  email: string;
  phone: string;
  subjects: string[];
  batches: number;
  status: string;
}

export interface Batch {
  id: string;
  name: string;
  className: string;
  studentCount: number;
  subjects: string[];
  status: 'active' | 'archived';
  createdAt: string;
}

export interface Invoice {
  id: string;
  studentName: string;
  enrollmentNo: string;
  batch: string;
  amount: number;
  paidAmount: number;
  dueDate: string;
  status: 'paid' | 'partial' | 'pending' | 'overdue' | 'unpaid';
  description: string;
}

export interface AttendanceRecord {
  id?: string;
  date: string;
  status: 'present' | 'absent' | 'late' | 'leave';
  subject?: string;
  type?: string;
}

export interface ExamEntry {
  id: string;
  examName: string;
  batch: string;
  subject: string;
  totalMarks: number;
  examDate: string;
  marks: { studentId: string; studentName: string; obtained: number }[];
  status: 'pending' | 'approved' | 'rejected';
}

export interface Inquiry {
  id: string;
  studentName: string;
  parentName: string;
  phone: string;
  email: string;
  className: string;
  source: string;
  status: string;
  notes: string;
  createdAt: string;
}

export interface Institute {
  id: string;
  name: string;
  adminName: string;
  adminEmail: string;
  students: number;
  teachers: number;
  studentLimit: number;
  teacherLimit: number;
  expiryDate?: string;
  status: string;
  walletCredits: number;
}

export interface DashboardStats {
  totalStudents: number;
  totalRevenue: number;
  attendanceRate: number;
  newAdmissions: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: 'event' | 'holiday' | 'exam' | 'parent_meeting';
  time?: string;
  location?: string;
  comments?: string;
}

export interface StudentFee {
  id: string;
  student_id: string;
  batch_fee_id: string;
  student_name: string;
  enrollment_no: string;
  batch_name: string;
  original_fee: number;
  final_fee: number;
  paid_fees: number;
  discount_amount: number;
  discount_reason?: string;
  status: 'paid' | 'pending' | 'partial' | 'overdue';
}

export interface BatchFee {
  id: string;
  batch_id: string;
  title: string;
  total_fees: number;
  description?: string;
  due_date?: string;
  batch_name: string;
  student_count: number;
  created_at: string;
}
