import { useState, useEffect } from "react";
import { useAuth, StudentUser } from "@/contexts/AuthContext";
import { StatusBadge } from "@/components/ui/status-badge";
import { Bell, MessageSquare, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface Announcement {
  id: string;
  title: string;
  message: string;
  date: string;
  type: "info" | "urgent" | "general";
}

export default function StudentMessagesPage() {
  const { user } = useAuth();
  const student = user as StudentUser;
  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    fetchMessages();
  }, []);

  const fetchMessages = async () => {
    setLoading(true);
    try {
      // Try Supabase
      const { data } = await supabase
        .from("announcements")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      if (data && data.length > 0) {
        setAnnouncements(data.map((a: any) => ({
          id: a.id,
          title: a.title,
          message: a.message || a.content || "",
          date: a.created_at?.split("T")[0] || "N/A",
          type: a.type || "general",
        })));
      } else {
        // Fallback: check localStorage announcements
        const stored = localStorage.getItem("announcements");
        if (stored) {
          const parsed = JSON.parse(stored);
          setAnnouncements(parsed.map((a: any) => ({
            id: a.id || String(Math.random()),
            title: a.title,
            message: a.message,
            date: a.date || new Date().toISOString().split("T")[0],
            type: a.type || "general",
          })));
        } else {
          setAnnouncements([
            { id: "1", title: "Mid-Term Exam Schedule Released", message: "Check timetable section for detailed schedule. Exams start March 20.", date: "2025-03-15", type: "urgent" },
            { id: "2", title: "Holiday Notice - Holi", message: "Institute will remain closed on March 14. Classes resume March 16.", date: "2025-03-14", type: "info" },
            { id: "3", title: "Parent-Teacher Meeting", message: "PTM scheduled for March 20, 10 AM - 1 PM. All parents are requested to attend.", date: "2025-03-12", type: "general" },
            { id: "4", title: "Science Lab Practical", message: "Physics and Chemistry practicals for JEE batch on March 18. Bring lab notebooks.", date: "2025-03-11", type: "info" },
          ]);
        }
      }
    } catch {
      setAnnouncements([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Messages & Notices</h2>
        <p className="text-sm text-muted-foreground">Announcements and messages from your institute</p>
      </div>

      {announcements.length === 0 ? (
        <div className="surface-elevated rounded-lg p-12 text-center">
          <MessageSquare className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No messages yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <div key={a.id} className="surface-elevated rounded-lg p-4 hover:ring-1 hover:ring-primary/20 transition-all">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg shrink-0 ${a.type === "urgent" ? "bg-destructive/10" : a.type === "info" ? "bg-primary/10" : "bg-secondary"}`}>
                  <Bell className={`w-4 h-4 ${a.type === "urgent" ? "text-destructive" : a.type === "info" ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-foreground">{a.title}</h3>
                    {a.type === "urgent" && <StatusBadge variant="destructive">Urgent</StatusBadge>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{a.message}</p>
                  <p className="text-[10px] text-muted-foreground mt-2">{new Date(a.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
