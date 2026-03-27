import { useState, useMemo } from "react";
import { GraduationCap, Mail, Phone, BookOpen, Search, Filter } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const initialTeachers = [
  { id: "T001", name: "Dr. Rajesh Sharma", email: "rajesh@institute.com", phone: "+91 9876543210", subjects: ["Physics", "Mathematics"], batches: 3, status: "active" },
  { id: "T002", name: "Prof. Anita Verma", email: "anita@institute.com", phone: "+91 9876543211", subjects: ["Chemistry"], batches: 2, status: "active" },
  { id: "T003", name: "Mr. Suresh Patel", email: "suresh@institute.com", phone: "+91 9876543212", subjects: ["Biology"], batches: 2, status: "active" },
  { id: "T004", name: "Ms. Kavita Nair", email: "kavita@institute.com", phone: "+91 9876543213", subjects: ["English", "Hindi"], batches: 4, status: "active" },
  { id: "T005", name: "Dr. Amit Kumar", email: "amit@institute.com", phone: "+91 9876543214", subjects: ["Mathematics"], batches: 3, status: "on_leave" },
  { id: "T006", name: "Prof. Meera Iyer", email: "meera@institute.com", phone: "+91 9876543215", subjects: ["Physics"], batches: 2, status: "active" },
];

const allSubjects = Array.from(new Set(initialTeachers.flatMap(t => t.subjects)));

export default function TeachersPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");

  const filteredTeachers = useMemo(() => {
    return initialTeachers.filter(t => {
      const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) || t.email.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || t.status === statusFilter;
      const matchSubject = subjectFilter === "all" || t.subjects.includes(subjectFilter);
      return matchSearch && matchStatus && matchSubject;
    });
  }, [search, statusFilter, subjectFilter]);

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-card border border-border flex-1 sm:flex-initial sm:w-64">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search teachers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
                <Filter className="w-4 h-4 mr-2" /> Filters
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72">
              <div className="space-y-4">
                <h4 className="font-medium text-sm">Filter Teachers</h4>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Status</label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full px-3 py-2 rounded-md bg-secondary border-none text-sm text-foreground outline-none"
                    >
                      <option value="all">All Status</option>
                      <option value="active">Active</option>
                      <option value="on_leave">On Leave</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Subject</label>
                    <select
                      value={subjectFilter}
                      onChange={(e) => setSubjectFilter(e.target.value)}
                      className="w-full px-3 py-2 rounded-md bg-secondary border-none text-sm text-foreground outline-none"
                    >
                      <option value="all">All Subjects</option>
                      {allSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                {(statusFilter !== "all" || subjectFilter !== "all") && (
                  <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => { setStatusFilter("all"); setSubjectFilter("all"); }}>
                    Clear Filters
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="h-9">
            <GraduationCap className="w-4 h-4 mr-1" /> Add Teacher
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredTeachers.map((t) => (
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
