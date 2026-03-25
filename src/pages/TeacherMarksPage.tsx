import { useState, useMemo } from "react";
import { useAuth, TeacherUser } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { FileCheck, Save } from "lucide-react";
import { generateStudents } from "@/lib/mock-data";

const allStudents = generateStudents(60);

export default function TeacherMarksPage() {
  const { user } = useAuth();
  const teacher = user as TeacherUser;
  const [selectedClass, setSelectedClass] = useState(teacher.assignedClasses[0] || "");
  const [selectedSubject, setSelectedSubject] = useState(teacher.assignedSubjects?.[0] || "");
  const [examName, setExamName] = useState("");
  const [totalMarks, setTotalMarks] = useState("50");

  const classStudents = useMemo(() =>
    allStudents.filter(s => s.status === "active" && s.batch === selectedClass),
    [selectedClass]
  );

  const [marks, setMarks] = useState<Record<string, string>>({});

  const updateMark = (studentId: string, value: string) => {
    setMarks(prev => ({ ...prev, [studentId]: value }));
  };

  const handleSubmit = () => {
    if (!examName || !selectedSubject) {
      toast({ title: "Error", description: "Exam name and subject are required.", variant: "destructive" });
      return;
    }
    const filledCount = Object.values(marks).filter(v => v !== "").length;
    if (filledCount === 0) {
      toast({ title: "Error", description: "Please enter marks for at least one student.", variant: "destructive" });
      return;
    }
    toast({
      title: "Marks Submitted",
      description: `${examName} - ${selectedSubject}: ${filledCount} marks submitted for admin approval.`,
    });
    setMarks({});
    setExamName("");
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Enter Marks</h2>
          <p className="text-sm text-muted-foreground">Enter marks for your assigned subjects · Submitted for admin approval</p>
        </div>
      </div>

      <div className="surface-elevated rounded-lg p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-medium text-foreground">Class</label>
            <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground">
              {teacher.assignedClasses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Subject</label>
            <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground">
              {(teacher.assignedSubjects || []).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Exam Name</label>
            <Input value={examName} onChange={e => setExamName(e.target.value)} placeholder="e.g., Unit Test 4" className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Total Marks</label>
            <Input type="number" value={totalMarks} onChange={e => setTotalMarks(e.target.value)} className="mt-1" />
          </div>
        </div>
      </div>

      {examName && selectedSubject ? (
        <>
          <div className="surface-elevated rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Student</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase hidden sm:table-cell">Enrollment</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Marks (/{totalMarks})</th>
                  </tr>
                </thead>
                <tbody>
                  {classStudents.map(student => (
                    <tr key={student.id} className="border-b border-border/50">
                      <td className="px-4 py-2.5 text-foreground font-medium">{student.name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">{student.enrollmentNo}</td>
                      <td className="px-4 py-2.5 text-center">
                        <Input
                          type="number" min="0" max={totalMarks}
                          value={marks[student.id] || ""}
                          onChange={e => updateMark(student.id, e.target.value)}
                          className="w-20 mx-auto text-center tabular-nums"
                          placeholder="—"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSubmit}><Save className="w-4 h-4 mr-1" /> Submit for Approval</Button>
          </div>
        </>
      ) : (
        <div className="surface-elevated rounded-lg p-8 text-center text-muted-foreground">
          <FileCheck className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Select a class, subject, and enter exam name to start entering marks.</p>
        </div>
      )}
    </div>
  );
}
