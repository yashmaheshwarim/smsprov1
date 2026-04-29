import { useState, useEffect } from "react";
import { useAuth, ParentUser } from "@/contexts/AuthContext";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { FileCheck, TrendingUp, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface ExamResult {
  id: string;
  examName: string;
  subject: string;
  marksObtained: number;
  totalMarks: number;
  percentage: number;
  grade: string;
  date: string;
}

export default function ParentMarksPage() {
  const { user } = useAuth();
  const parent = user as ParentUser;
  // Currently defaulting to the first child. Future iteration can add child selection dropdown
  const childId = parent.childrenIds[0] || "STU001";
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<ExamResult[]>([]);

  useEffect(() => {
    fetchMarks();
  }, []);

  const fetchMarks = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("marks")
        .select("*")
        .eq("student_id", childId)
        .order("created_at", { ascending: false });

      if (data && data.length > 0) {
        setResults(data.map((m: any) => ({
          id: m.id,
          examName: m.exam_name || "Exam",
          subject: m.subject || "N/A",
          marksObtained: m.marks_obtained || 0,
          totalMarks: m.total_marks || 100,
          percentage: m.total_marks ? Math.round((m.marks_obtained / m.total_marks) * 100) : 0,
          grade: getGrade(m.total_marks ? (m.marks_obtained / m.total_marks) * 100 : 0),
          date: m.created_at?.split("T")[0] || "N/A",
        })));
      } else {
        // Fallback mock data
        setResults([
          { id: "1", examName: "Unit Test 3", subject: "Physics", marksObtained: 42, totalMarks: 50, percentage: 84, grade: "A", date: "2025-03-10" },
          { id: "2", examName: "Unit Test 3", subject: "Chemistry", marksObtained: 38, totalMarks: 50, percentage: 76, grade: "B+", date: "2025-03-10" },
          { id: "3", examName: "Unit Test 3", subject: "Mathematics", marksObtained: 45, totalMarks: 50, percentage: 90, grade: "A+", date: "2025-03-10" },
        ]);
      }
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const avgPercentage = results.length > 0
    ? (results.reduce((a, r) => a + r.percentage, 0) / results.length).toFixed(1)
    : "0";

  const highScore = results.length > 0 ? Math.max(...results.map(r => r.percentage)) : 0;

  if (loading) {
    return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Marks & Results</h2>
        <p className="text-sm text-muted-foreground">Monitor your child's academic performance</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard title="Average Score" value={`${avgPercentage}%`} icon={TrendingUp} changeType={Number(avgPercentage) >= 60 ? "positive" : "negative"} />
        <StatCard title="Highest Score" value={`${highScore}%`} icon={FileCheck} changeType="positive" change="Best result" />
        <StatCard title="Total Exams" value={[...new Set(results.map(r => r.examName))].length} icon={FileCheck} />
      </div>

      {(() => {
        const exams = [...new Set(results.map(r => r.examName))];
        return exams.map(examName => {
          const examResults = results.filter(r => r.examName === examName);
          const examAvg = (examResults.reduce((a, r) => a + r.percentage, 0) / examResults.length).toFixed(1);
          return (
            <div key={examName} className="surface-elevated rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">{examName}</h3>
                <span className="text-xs font-bold text-primary">Avg: {examAvg}%</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/50">
                      <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground uppercase">Subject</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase">Marks</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground uppercase">%</th>
                      <th className="text-center px-4 py-2 text-xs font-medium text-muted-foreground uppercase">Grade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {examResults.map(r => (
                      <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/30">
                        <td className="px-4 py-2.5 font-medium text-foreground">{r.subject}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{r.marksObtained}/{r.totalMarks}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-foreground">{r.percentage}%</td>
                        <td className="px-4 py-2.5 text-center">
                          <StatusBadge variant={r.percentage >= 90 ? "success" : r.percentage >= 60 ? "primary" : r.percentage >= 40 ? "warning" : "destructive"}>
                            {r.grade}
                          </StatusBadge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        });
      })()}
    </div>
  );
}

function getGrade(percentage: number): string {
  if (percentage >= 90) return "A+";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B+";
  if (percentage >= 60) return "B";
  if (percentage >= 50) return "C";
  if (percentage >= 40) return "D";
  return "F";
}
