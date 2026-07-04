import { useState, useMemo, useEffect } from "react";
import { useAuth, TeacherUser } from "@/contexts/AuthContext";
import { generateStudents, generateAttendance } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Check, X, Clock, Save, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const allStudents = generateStudents(60);
const today = new Date().toISOString().split("T")[0];

type AttendanceStatus = "present" | "absent" | "late";

interface MonthlyRecord {
  studentId: string;
  studentName: string;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  totalDays: number;
  percentage: number;
}

export default function TeacherAttendancePage() {
  const { user } = useAuth();
  const teacher = user as TeacherUser;
  const [selectedClass, setSelectedClass] = useState(teacher.assignedClasses[0] || "");
  const [view, setView] = useState<"mark" | "monthly">("mark");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear] = useState(new Date().getFullYear());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);
  const [absentStudents, setAbsentStudents] = useState<any[]>([]);

   const classStudents = useMemo(() =>
     allStudents.filter(s => s.status === "active" && s.batch === selectedClass),
     [selectedClass]
   );

   // Pagination for mark view
   const totalStudents = classStudents.length;
   const totalPages = Math.ceil(totalStudents / pageSize);
   const startIndex = (currentPage - 1) * pageSize;
   const endIndex = Math.min(startIndex + pageSize, totalStudents);
   const paginatedStudents = classStudents.slice(startIndex, endIndex);

    // Reset page when class changes
    useEffect(() => {
      setCurrentPage(1);
    }, [selectedClass]);

   const initialRecords = useMemo(() =>
     generateAttendance(classStudents, today).map(r => ({
       ...r,
       lateTime: r.status === "late" ? "09:15" : undefined,
     })),
     [classStudents]
   );

  const [records, setRecords] = useState(initialRecords);

  const updateStatus = (studentId: string, status: AttendanceStatus) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
    setRecords(prev =>
      prev.map(r =>
        r.studentId === studentId
          ? { ...r, status, lateTime: status === "late" ? timeStr : undefined }
          : r
      )
    );
  };

  const handleSave = () => {
    // Collect absent students
    const absent = records.filter(r => r.status === "absent").map(r => {
      const student = allStudents.find(s => s.id === r.studentId);
      return {
        ...r,
        phone: student?.phone,
        studentName: student?.name,
      };
    });

    setAbsentStudents(absent);

    // Save attendance (mock for now)
    toast({ title: "Attendance Saved", description: `Attendance for ${classStudents.length} students in ${selectedClass} saved.` });

    // Show WhatsApp dialog if there are absent students
    if (absent.length > 0) {
      setShowWhatsAppDialog(true);
    }
  };

   // Monthly data with pagination
   const monthlyData: MonthlyRecord[] = useMemo(() => {
     const totalDays = 24;
     return classStudents.map(s => {
       const present = Math.floor(Math.random() * 8) + 16;
       const late = Math.floor(Math.random() * 4);
       const absent = totalDays - present - late;
       return {
         studentId: s.id,
         studentName: s.name,
         presentDays: present,
         absentDays: Math.max(0, absent),
         lateDays: late,
         totalDays,
         percentage: Math.round(((present + late) / totalDays) * 100),
       };
     });
   }, [classStudents, selectedMonth]);

   // Pagination for monthly view
   const totalMonthlyItems = monthlyData.length;
   const totalMonthlyPages = Math.ceil(totalMonthlyItems / pageSize);
   const monthlyStartIndex = (currentPage - 1) * pageSize;
   const monthlyEndIndex = Math.min(monthlyStartIndex + pageSize, totalMonthlyItems);
   const paginatedMonthlyData = monthlyData.slice(monthlyStartIndex, monthlyEndIndex);

   // Reset page when class or month changes
   useEffect(() => {
     setCurrentPage(1);
   }, [selectedClass, selectedMonth]);

  const sendWhatsAppMessage = (student: any) => {
    if (!student.phone) {
      toast({ title: "Error", description: "No phone number available for this student." });
      return;
    }

    const currentDate = new Date().toLocaleDateString("en-IN", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });
    const message = `Your child ${student.studentName} was absent on ${currentDate} in classes.\n${user?.name || 'Admin'}`;
    const encodedMessage = encodeURIComponent(message);
    const phoneNumber = student.phone.replace(/\D/g, ''); // Remove all non-digits
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;

    window.open(whatsappUrl, '_blank');
  };

  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const stats = {
    present: records.filter(r => r.status === "present").length,
    absent: records.filter(r => r.status === "absent").length,
    late: records.filter(r => r.status === "late").length,
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Attendance</h2>
          <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground">
            {teacher.assignedClasses.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="flex gap-1 p-1 bg-secondary rounded-lg">
            <button onClick={() => setView("mark")} className={cn("px-3 py-1.5 text-xs font-medium rounded-md", view === "mark" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>Mark</button>
            <button onClick={() => setView("monthly")} className={cn("px-3 py-1.5 text-xs font-medium rounded-md", view === "monthly" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>Monthly</button>
          </div>
        </div>
      </div>

      {view === "mark" ?
        <div>
          <div className="grid grid-cols-3 gap-3">
            <div className="surface-elevated rounded-lg p-3 text-center">
              <p className="text-2xl font-semibold text-success tabular-nums">{stats.present}</p>
              <p className="text-xs text-muted-foreground">Present</p>
            </div>
            <div className="surface-elevated rounded-lg p-3 text-center">
              <p className="text-2xl font-semibold text-destructive tabular-nums">{stats.absent}</p>
              <p className="text-xs text-muted-foreground">Absent</p>
            </div>
            <div className="surface-elevated rounded-lg p-3 text-center">
              <p className="text-2xl font-semibold text-warning tabular-nums">{stats.late}</p>
              <p className="text-xs text-muted-foreground">Late</p>
            </div>
          </div>

           <div className="flex justify-end">
             <Button size="sm" onClick={handleSave}><Save className="w-4 h-4 mr-1" /> Save</Button>
           </div>

           <div className="surface-elevated rounded-lg divide-y divide-border/50">
             {paginatedStudents.map(student => {
               const record = records.find(r => r.studentId === student.id);
               const status = record?.status || "present";
               const lateTime = (record as any)?.lateTime;
               return (
                 <div key={student.id} className="flex items-center justify-between px-4 py-3 hover:bg-secondary/30 transition-colors">
                   <div className="flex items-center gap-3 min-w-0">
                     <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                       <span className="text-xs font-semibold text-primary">{student.name.split(" ").map(n => n[0]).join("")}</span>
                     </div>
                     <div className="min-w-0">
                       <p className="text-sm font-medium text-foreground truncate">{student.name}</p>
                       <div className="flex items-center gap-2">
                         <p className="text-xs text-muted-foreground">{student.enrollmentNo}</p>
                         {status === "late" && lateTime && (
                           <span className="text-[10px] text-warning font-medium bg-warning/10 px-1.5 py-0.5 rounded tabular-nums">Late at {lateTime}</span>
                         )}
                       </div>
                     </div>
                   </div>
                   <div className="flex gap-1 p-1 bg-secondary rounded-lg shrink-0">
                     {([
                       { key: "present" as const, label: "P" },
                       { key: "absent" as const, label: "A" },
                       { key: "late" as const, label: "L" },
                     ]).map(({ key, label }) => (
                       <button key={key} onClick={() => updateStatus(student.id, key)} className={cn(
                         "px-3 py-1.5 text-xs font-medium rounded-md transition-all active:scale-95",
                         status === key
                           ? key === "present" ? "bg-success text-success-foreground" : key === "absent" ? "bg-destructive text-destructive-foreground" : "bg-warning text-warning-foreground"
                           : "text-muted-foreground hover:text-foreground"
                       )}>
                         {label}
                       </button>
                     ))}
                   </div>
                 </div>
               );
             })}
             {classStudents.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No students in this class.</p>}
           </div>

           {/* Pagination Controls */}
           {totalPages > 1 && (
             <div className="flex items-center justify-between border-t px-4 py-3 bg-card">
               <p className="text-sm text-muted-foreground">
                 Showing {startIndex + 1}-{endIndex} of {totalStudents} students
               </p>
               <div className="flex items-center gap-2">
                 <Button
                   variant="outline"
                   size="sm"
                   onClick={() => setCurrentPage(1)}
                   disabled={currentPage === 1}
                   className="h-8 px-2"
                 >
                   <ChevronsLeft className="h-4 w-4" />
                 </Button>
                 <Button
                   variant="outline"
                   size="sm"
                   onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                   disabled={currentPage === 1}
                   className="h-8 px-2"
                 >
                   <ChevronLeft className="h-4 w-4" />
                 </Button>

                 <div className="flex items-center gap-1">
                   {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                     let pageNum: number;
                     if (totalPages <= 5) {
                       pageNum = i + 1;
                     } else if (currentPage <= 3) {
                       pageNum = i + 1;
                     } else if (currentPage >= totalPages - 2) {
                       pageNum = totalPages - 4 + i;
                     } else {
                       pageNum = currentPage - 2 + i;
                     }
                     return (
                       <Button
                         key={pageNum}
                         variant={currentPage === pageNum ? "default" : "outline"}
                         size="sm"
                         onClick={() => setCurrentPage(pageNum)}
                         className="h-8 w-8"
                       >
                         {pageNum}
                       </Button>
                     );
                   })}
                 </div>

                 <Button
                   variant="outline"
                   size="sm"
                   onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                   disabled={currentPage === totalPages}
                   className="h-8 px-2"
                 >
                   <ChevronRight className="h-4 w-4" />
                 </Button>
                 <Button
                   variant="outline"
                   size="sm"
                   onClick={() => setCurrentPage(totalPages)}
                   disabled={currentPage === totalPages}
                   className="h-8 px-2"
                 >
                   <ChevronsRight className="h-4 w-4" />
                 </Button>
               </div>
             </div>
           )}
        </div>
       :
        <div>
          <div className="flex items-center justify-between">
            <Button size="icon" variant="ghost" onClick={() => setSelectedMonth(p => Math.max(0, p - 1))}><ChevronLeft className="w-4 h-4" /></Button>
            <span className="text-sm font-medium text-foreground">{months[selectedMonth]} {selectedYear}</span>
            <Button size="icon" variant="ghost" onClick={() => setSelectedMonth(p => Math.min(11, p + 1))}><ChevronRight className="w-4 h-4" /></Button>
          </div>

           <div className="surface-elevated rounded-lg overflow-hidden">
             <div className="overflow-x-auto">
               <table className="w-full text-sm">
                 <thead>
                   <tr className="border-b border-border bg-secondary/50">
                     <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Student</th>
                     <th className="text-center px-3 py-3 text-xs font-medium text-success uppercase">P</th>
                     <th className="text-center px-3 py-3 text-xs font-medium text-destructive uppercase">A</th>
                     <th className="text-center px-3 py-3 text-xs font-medium text-warning uppercase">L</th>
                     <th className="text-center px-3 py-3 text-xs font-medium text-muted-foreground uppercase">Avg %</th>
                   </tr>
                 </thead>
                 <tbody>
                   {paginatedMonthlyData.map(row => (
                     <tr key={row.studentId} className="border-b border-border/50 hover:bg-secondary/30">
                       <td className="px-4 py-2.5 text-foreground font-medium">{row.studentName}</td>
                       <td className="text-center px-3 py-2.5 tabular-nums text-success">{row.presentDays}</td>
                       <td className="text-center px-3 py-2.5 tabular-nums text-destructive">{row.absentDays}</td>
                       <td className="text-center px-3 py-2.5 tabular-nums text-warning">{row.lateDays}</td>
                       <td className="text-center px-3 py-2.5">
                         <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full tabular-nums",
                           row.percentage >= 85 ? "bg-success/10 text-success" :
                             row.percentage >= 70 ? "bg-warning/10 text-warning" :
                               "bg-destructive/10 text-destructive"
                         )}>{row.percentage}%</span>
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
           </div>

           {/* Pagination Controls for Monthly View */}
           {totalMonthlyPages > 1 && (
             <div className="flex items-center justify-between border-t px-4 py-3 bg-card mt-4">
               <p className="text-sm text-muted-foreground">
                 Showing {monthlyStartIndex + 1}-{monthlyEndIndex} of {totalMonthlyItems} students
               </p>
               <div className="flex items-center gap-2">
                 <Button
                   variant="outline"
                   size="sm"
                   onClick={() => setCurrentPage(1)}
                   disabled={currentPage === 1}
                   className="h-8 px-2"
                 >
                   <ChevronsLeft className="h-4 w-4" />
                 </Button>
                 <Button
                   variant="outline"
                   size="sm"
                   onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                   disabled={currentPage === 1}
                   className="h-8 px-2"
                 >
                   <ChevronLeft className="h-4 w-4" />
                 </Button>

                 <div className="flex items-center gap-1">
                   {Array.from({ length: Math.min(5, totalMonthlyPages) }, (_, i) => {
                     let pageNum: number;
                     if (totalMonthlyPages <= 5) {
                       pageNum = i + 1;
                     } else if (currentPage <= 3) {
                       pageNum = i + 1;
                     } else if (currentPage >= totalMonthlyPages - 2) {
                       pageNum = totalMonthlyPages - 4 + i;
                     } else {
                       pageNum = currentPage - 2 + i;
                     }
                     return (
                       <Button
                         key={pageNum}
                         variant={currentPage === pageNum ? "default" : "outline"}
                         size="sm"
                         onClick={() => setCurrentPage(pageNum)}
                         className="h-8 w-8"
                       >
                         {pageNum}
                       </Button>
                     );
                   })}
                 </div>

                 <Button
                   variant="outline"
                   size="sm"
                   onClick={() => setCurrentPage(p => Math.min(totalMonthlyPages, p + 1))}
                   disabled={currentPage === totalMonthlyPages}
                   className="h-8 px-2"
                 >
                   <ChevronRight className="h-4 w-4" />
                 </Button>
                 <Button
                   variant="outline"
                   size="sm"
                   onClick={() => setCurrentPage(totalMonthlyPages)}
                   disabled={currentPage === totalMonthlyPages}
                   className="h-8 px-2"
                 >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
           )}
        </div>
      }

      {/* WhatsApp Notification Dialog */}
      <Dialog open={showWhatsAppDialog} onOpenChange={setShowWhatsAppDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send Absence Notifications</DialogTitle>
            <DialogDescription>
              Send WhatsApp messages to parents of absent students.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {absentStudents.map((student) => (
              <div key={student.studentId} className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                <div>
                  <p className="text-sm font-medium">{student.studentName}</p>
                  {student.phone && (
                    <p className="text-xs text-muted-foreground font-mono">{student.phone}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => sendWhatsAppMessage(student)}
                  className="flex items-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  Send
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowWhatsAppDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
