import { GraduationCap, Mail, Phone, BookOpen } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";

const teachers = [
  { id: "T001", name: "Dr. Rajesh Sharma", email: "rajesh@institute.com", phone: "+91 9876543210", subjects: ["Physics", "Mathematics"], batches: 3, status: "active" },
  { id: "T002", name: "Prof. Anita Verma", email: "anita@institute.com", phone: "+91 9876543211", subjects: ["Chemistry"], batches: 2, status: "active" },
  { id: "T003", name: "Mr. Suresh Patel", email: "suresh@institute.com", phone: "+91 9876543212", subjects: ["Biology"], batches: 2, status: "active" },
  { id: "T004", name: "Ms. Kavita Nair", email: "kavita@institute.com", phone: "+91 9876543213", subjects: ["English", "Hindi"], batches: 4, status: "active" },
  { id: "T005", name: "Dr. Amit Kumar", email: "amit@institute.com", phone: "+91 9876543214", subjects: ["Mathematics"], batches: 3, status: "on_leave" },
  { id: "T006", name: "Prof. Meera Iyer", email: "meera@institute.com", phone: "+91 9876543215", subjects: ["Physics"], batches: 2, status: "active" },
];

export default function TeachersPage() {
  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Teachers</h2>
        <Button size="sm"><GraduationCap className="w-4 h-4 mr-1" /> Add Teacher</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {teachers.map((t) => (
          <div key={t.id} className="surface-elevated rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-sm font-semibold text-primary">
                  {t.name.split(" ").slice(-2).map((n) => n[0]).join("")}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground truncate">{t.name}</p>
                  <StatusBadge variant={t.status === "active" ? "success" : "warning"}>
                    {t.status === "active" ? "Active" : "On Leave"}
                  </StatusBadge>
                </div>
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Mail className="w-3 h-3" /> {t.email}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Phone className="w-3 h-3" /> {t.phone}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <BookOpen className="w-3 h-3" /> {t.subjects.join(", ")}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{t.batches} batches assigned</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
