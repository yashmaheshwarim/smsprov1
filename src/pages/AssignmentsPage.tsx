import { ClipboardList, Plus, Calendar, Users } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";

const assignments = [
  { id: "A001", title: "Thermodynamics Problem Set", subject: "Physics", batch: "JEE 2025 - Batch A", dueDate: "2025-02-15", submissions: 28, total: 35, status: "active" },
  { id: "A002", title: "Organic Chemistry Worksheet", subject: "Chemistry", batch: "NEET 2025 - Batch B", dueDate: "2025-02-18", submissions: 40, total: 42, status: "active" },
  { id: "A003", title: "Calculus Integration Quiz", subject: "Mathematics", batch: "JEE 2025 - Batch A", dueDate: "2025-02-10", submissions: 35, total: 35, status: "completed" },
  { id: "A004", title: "Cell Biology Diagram Labeling", subject: "Biology", batch: "NEET 2025 - Batch B", dueDate: "2025-02-20", submissions: 12, total: 42, status: "active" },
  { id: "A005", title: "Electromagnetic Theory Test", subject: "Physics", batch: "Foundation 11th", dueDate: "2025-02-08", submissions: 30, total: 30, status: "completed" },
  { id: "A006", title: "Chemical Bonding MCQs", subject: "Chemistry", batch: "Board 12th Science", dueDate: "2025-02-22", submissions: 5, total: 38, status: "active" },
];

export default function AssignmentsPage() {
  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Assignments & Tests</h2>
        <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Create Assignment</Button>
      </div>

      <div className="space-y-3">
        {assignments.map((a) => (
          <div key={a.id} className="surface-interactive rounded-lg p-4 cursor-pointer">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-md bg-primary/10 shrink-0">
                  <ClipboardList className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{a.title}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <StatusBadge variant="default">{a.subject}</StatusBadge>
                    <span className="text-xs text-muted-foreground">{a.batch}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 sm:gap-6">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  <span className="tabular-nums">{a.dueDate}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="w-3 h-3" />
                  <span className="tabular-nums">{a.submissions}/{a.total}</span>
                </div>
                <StatusBadge variant={a.status === "completed" ? "success" : "primary"}>
                  {a.status}
                </StatusBadge>
              </div>
            </div>
            {/* Progress bar */}
            <div className="mt-3 h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${(a.submissions / a.total) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
