import { useParams, Link } from "react-router-dom";
import { generateStudents, generateInvoices, generateAttendance } from "@/lib/mock-data";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Phone, Mail, User, Calendar, BookOpen, IndianRupee, Edit, Download, Hash } from "lucide-react";
import { useMemo } from "react";

const allStudents = generateStudents(50);

const generateGRN = (index: number) => `GRN-${new Date().getFullYear()}-${String(index + 1).padStart(5, "0")}`;

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const studentIndex = allStudents.findIndex((s) => s.id === id);
  const student = allStudents[studentIndex];

  const invoices = useMemo(() => {
    if (!student) return [];
    return generateInvoices([student]);
  }, [student]);

  if (!student) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Student not found.</p>
        <Link to="/students" className="text-primary text-sm hover:underline mt-2 inline-block">← Back to Students</Link>
      </div>
    );
  }

  const grn = generateGRN(studentIndex);
  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
  const initials = student.name.split(" ").map((n) => n[0]).join("");

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <Link to="/students" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Students
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 mr-1" /> Export</Button>
          <Button size="sm"><Edit className="w-4 h-4 mr-1" /> Edit</Button>
        </div>
      </div>

      {/* Profile Card */}
      <div className="surface-elevated rounded-lg p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-xl font-bold text-primary">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">{student.name}</h2>
              <StatusBadge variant={student.status === "active" ? "success" : student.status === "inactive" ? "default" : "primary"}>
                {student.status}
              </StatusBadge>
              <StatusBadge variant={student.feeStatus === "paid" ? "success" : student.feeStatus === "partial" ? "warning" : "destructive"}>
                Fee: {student.feeStatus}
              </StatusBadge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{student.enrollmentNo}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5 pt-5 border-t border-border">
          <div className="flex items-center gap-2">
            <Hash className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">GRN</p>
              <p className="text-sm font-medium text-foreground font-mono">{grn}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Batch</p>
              <p className="text-sm font-medium text-foreground">{student.batch}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Phone</p>
              <p className="text-sm font-medium text-foreground tabular-nums">{student.phone}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="text-sm font-medium text-foreground truncate">{student.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Parent</p>
              <p className="text-sm font-medium text-foreground">{student.parentName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Joined</p>
              <p className="text-sm font-medium text-foreground tabular-nums">{student.joinDate}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Fee Info */}
      <div className="surface-elevated rounded-lg">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><IndianRupee className="w-4 h-4" /> Fee Details</h3>
        </div>
        <div className="divide-y divide-border/50">
          {invoices.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">{inv.id}</p>
                <p className="text-xs text-muted-foreground">Due: {inv.dueDate}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-foreground tabular-nums">{formatCurrency(inv.amount)}</p>
                <p className="text-xs text-muted-foreground tabular-nums">Paid: {formatCurrency(inv.paidAmount)}</p>
              </div>
              <StatusBadge variant={inv.status === "paid" ? "success" : inv.status === "partial" ? "warning" : "destructive"}>
                {inv.status}
              </StatusBadge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
