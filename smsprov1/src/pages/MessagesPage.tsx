import { MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

const announcements = [
  { id: 1, title: "Mid-Term Exam Schedule Released", message: "The mid-term examination schedule for all batches has been published. Please check the timetable section.", date: "2025-02-10", type: "announcement", author: "Admin" },
  { id: 2, title: "Fee Payment Deadline Extended", message: "The fee payment deadline for Q2 has been extended to March 15, 2025.", date: "2025-02-08", type: "fee_reminder", author: "Accounts" },
  { id: 3, title: "Holiday Notice - Republic Day", message: "The institute will remain closed on January 26, 2025. Classes resume on January 27.", date: "2025-01-24", type: "announcement", author: "Admin" },
  { id: 4, title: "New Physics Study Material Available", message: "Updated notes for Electromagnetic Theory have been uploaded to the Study Materials section.", date: "2025-02-09", type: "material_update", author: "Dr. Rajesh Sharma" },
  { id: 5, title: "Parent-Teacher Meeting", message: "PTM for JEE 2025 batches scheduled on February 20. All parents are requested to attend.", date: "2025-02-12", type: "announcement", author: "Admin" },
];

const typeVariants: Record<string, "primary" | "warning" | "success"> = {
  announcement: "primary",
  fee_reminder: "warning",
  material_update: "success",
};

export default function MessagesPage() {
  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Messages & Announcements</h2>
        <Button size="sm"><Send className="w-4 h-4 mr-1" /> New Announcement</Button>
      </div>

      <div className="space-y-3">
        {announcements.map((a) => (
          <div key={a.id} className="surface-elevated rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-md bg-primary/10 shrink-0 mt-0.5">
                <MessageSquare className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <p className="text-sm font-semibold text-foreground">{a.title}</p>
                  <div className="flex items-center gap-2">
                    <StatusBadge variant={typeVariants[a.type] || "default"}>
                      {a.type.replace("_", " ")}
                    </StatusBadge>
                    <span className="text-xs text-muted-foreground tabular-nums">{a.date}</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{a.message}</p>
                <p className="text-xs text-muted-foreground mt-2">— {a.author}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
