// Mock data for InstituteOS

export interface Student {
  id: string;
  name: string;
  enrollmentNo: string;
  batch: string;
  email: string;
  phone: string;
  status: 'active' | 'inactive' | 'alumni';
  feeStatus: 'paid' | 'partial' | 'overdue';
  parentName: string;
  joinDate: string;
  avatar?: string;
  grn?: string;
}

export interface AttendanceRecord {
  studentId: string;
  studentName: string;
  status: 'present' | 'absent' | 'late';
  date: string;
}

export interface FeeInvoice {
  id: string;
  studentName: string;
  enrollmentNo: string;
  amount: number;
  dueDate: string;
  paidAmount: number;
  status: 'paid' | 'partial' | 'overdue' | 'unpaid';
}

export interface StudyMaterial {
  id: string;
  title: string;
  subject: string;
  type: 'pdf' | 'video' | 'image';
  uploadedBy: string;
  uploadDate: string;
  size: string;
  batch: string;
  fileUrl?: string;
  fileName?: string;
}

export interface DashboardStats {
  totalStudents: number;
  activeStudents: number;
  totalTeachers: number;
  totalBatches: number;
  totalRevenue: number;
  pendingFees: number;
  attendanceRate: number;
  newAdmissions: number;
}

const firstNames = ['Aarav', 'Vivaan', 'Aditya', 'Ananya', 'Diya', 'Ishaan', 'Kavya', 'Rohan', 'Priya', 'Arjun', 'Meera', 'Siddharth', 'Neha', 'Raj', 'Pooja', 'Vikram', 'Sakshi', 'Amit', 'Riya', 'Karan'];
const lastNames = ['Sharma', 'Patel', 'Singh', 'Kumar', 'Gupta', 'Joshi', 'Verma', 'Reddy', 'Nair', 'Mehta', 'Shah', 'Iyer', 'Das', 'Maheshwari', 'Agarwal', 'Malhotra', 'Chauhan', 'Tiwari', 'Pandey', 'Mishra'];
const batches = ['JEE 2025 - Batch A', 'NEET 2025 - Batch B', 'Foundation 10th', 'Foundation 11th', 'CET 2025', 'Board 12th Science'];
const subjects = ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'English'];

const getInstId = () => {
  try {
    const saved = localStorage.getItem('apex_user');
    if (saved) {
      const user = JSON.parse(saved);
      if (user.role === 'admin') return user.instituteId || "INST-001";
    }
  } catch {}
  return "INST-001";
};

const isFresh = () => true; // Treat everyone as fresh to start with zero data everywhere

export const generateStudents = (count: number): Student[] => {
  if (isFresh()) return [];
  return Array.from({ length: count }, (_, i) => {
    const firstName = firstNames[i % firstNames.length];
    const lastName = lastNames[(i + 5) % lastNames.length];
    const statuses: Student['status'][] = ['active', 'active', 'active', 'active', 'inactive', 'alumni'];
    const feeStatuses: Student['feeStatus'][] = ['paid', 'paid', 'paid', 'partial', 'overdue'];
    return {
      id: `STU-${String(i + 1).padStart(4, '0')}`,
      name: `${firstName} ${lastName}`,
      enrollmentNo: `MT-${String(2025000 + i)}`,
      batch: batches[i % batches.length],
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@email.com`,
      phone: `+91 ${Math.floor(7000000000 + Math.random() * 3000000000)}`,
      status: statuses[i % statuses.length],
      feeStatus: feeStatuses[i % feeStatuses.length],
      parentName: `${firstNames[(i + 3) % firstNames.length]} ${lastName}`,
      joinDate: `2024-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
      grn: `GRN-${String(2025000 + i)}`,
    };
  });
};

export const generateAttendance = (students: Student[], date: string): AttendanceRecord[] => {
  if (isFresh()) return [];
  return students.filter(s => s.status === 'active').map(s => {
    const rand = Math.random();
    return {
      studentId: s.id,
      studentName: s.name,
      status: rand > 0.15 ? 'present' : rand > 0.05 ? 'late' : 'absent',
      date,
    };
  });
};

export const generateInvoices = (students: Student[]): FeeInvoice[] => {
  if (isFresh()) return [];
  return students.map((s, i) => {
    const amount = [15000, 20000, 25000, 18000, 22000][i % 5];
    const paidRatio = s.feeStatus === 'paid' ? 1 : s.feeStatus === 'partial' ? 0.5 : 0;
    return {
      id: `INV-${String(i + 1).padStart(5, '0')}`,
      studentName: s.name,
      enrollmentNo: s.enrollmentNo,
      amount,
      dueDate: `2025-${String((i % 12) + 1).padStart(2, '0')}-15`,
      paidAmount: amount * paidRatio,
      status: s.feeStatus === 'paid' ? 'paid' : s.feeStatus === 'partial' ? 'partial' : (Math.random() > 0.5 ? 'overdue' : 'unpaid'),
    };
  });
};

export const getStoredStudents = (instituteId: string = "INST-001"): Student[] => {
  const saved = localStorage.getItem(`sms_students_${instituteId}`);
  if (saved) return JSON.parse(saved);
  return [];
};

export const setStoredStudents = (students: Student[], instituteId: string = "INST-001") => {
  localStorage.setItem(`sms_students_${instituteId}`, JSON.stringify(students));
};

export const getStoredInvoices = (instituteId: string = "INST-001"): FeeInvoice[] => {
  const saved = localStorage.getItem(`sms_invoices_${instituteId}`);
  if (saved) return JSON.parse(saved);
  return [];
};

export const setStoredInvoices = (invoices: FeeInvoice[], instituteId: string = "INST-001") => {
  localStorage.setItem(`sms_invoices_${instituteId}`, JSON.stringify(invoices));
};

export const generateStudyMaterials = (): StudyMaterial[] => {
  if (isFresh()) return [];
  const materials = [
    { title: 'Thermodynamics Notes', subject: 'Physics', type: 'pdf' as const },
    { title: 'Organic Chemistry Lecture', subject: 'Chemistry', type: 'video' as const },
    { title: 'Calculus Problem Set', subject: 'Mathematics', type: 'pdf' as const },
    { title: 'Cell Biology Diagrams', subject: 'Biology', type: 'image' as const },
    { title: 'Mechanics Formulas', subject: 'Physics', type: 'pdf' as const },
    { title: 'Chemical Bonding Video', subject: 'Chemistry', type: 'video' as const },
    { title: 'Trigonometry Worksheet', subject: 'Mathematics', type: 'pdf' as const },
    { title: 'Genetics Notes', subject: 'Biology', type: 'pdf' as const },
    { title: 'Electromagnetic Theory', subject: 'Physics', type: 'video' as const },
    { title: 'Periodic Table Reference', subject: 'Chemistry', type: 'image' as const },
  ];
  return materials.map((m, i) => ({
    ...m,
    id: `MAT-${String(i + 1).padStart(3, '0')}`,
    uploadedBy: `${firstNames[(i + 2) % firstNames.length]} ${lastNames[i % lastNames.length]}`,
    uploadDate: `2025-01-${String((i % 28) + 1).padStart(2, '0')}`,
    size: m.type === 'video' ? `${(50 + i * 30)}MB` : `${(1 + i * 0.5).toFixed(1)}MB`,
    batch: batches[i % batches.length],
  }));
};

export const getDashboardStats = (instituteId: string): DashboardStats => {
  const students = getStoredStudents(instituteId);
  const invoices = getStoredInvoices(instituteId);
  const revenue = invoices.reduce((s, i) => s + i.paidAmount, 0);
  const pending = invoices.reduce((s, i) => s + (i.amount - i.paidAmount), 0);
  
  return {
    totalStudents: students.length,
    activeStudents: students.filter(s => s.status === 'active').length,
    totalTeachers: 0, // Should count from storage if available
    totalBatches: 0, // Should count from storage if available
    totalRevenue: revenue,
    pendingFees: pending,
    attendanceRate: 0,
    newAdmissions: 0,
  };
};

export const dashboardStats: DashboardStats = {
  totalStudents: 0,
  activeStudents: 0,
  totalTeachers: 0,
  totalBatches: 0,
  totalRevenue: 0,
  pendingFees: 0,
  attendanceRate: 0,
  newAdmissions: 0,
};

export const revenueData = [
  { month: 'Jul', revenue: 0, collected: 0 },
  { month: 'Aug', revenue: 0, collected: 0 },
  { month: 'Sep', revenue: 0, collected: 0 },
  { month: 'Oct', revenue: 0, collected: 0 },
  { month: 'Nov', revenue: 0, collected: 0 },
  { month: 'Dec', revenue: 0, collected: 0 },
  { month: 'Jan', revenue: 0, collected: 0 },
];

export const attendanceTrend = [
  { day: 'Mon', rate: 0 },
  { day: 'Tue', rate: 0 },
  { day: 'Wed', rate: 0 },
  { day: 'Thu', rate: 0 },
  { day: 'Fri', rate: 0 },
  { day: 'Sat', rate: 0 },
];

export type CalendarEventType = "holiday" | "exam" | "event" | "parent_meeting";

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: CalendarEventType;
  time?: string;
  location?: string;
  comments?: string;
}

export const initialCalendarEvents: CalendarEvent[] = [];
