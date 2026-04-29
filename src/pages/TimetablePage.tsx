import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Edit2, Trash2, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase, isUuid } from "@/lib/supabase";
import { useAuth, AdminUser } from "@/contexts/AuthContext";

interface TimetableEntry {
  id: string;
  day: string;
  startTime: string;
  endTime: string;
  subject: string;
  teacher: string;
  room: string;
  batch: string;
}

// Fixed: Added the missing subjectColors mapping
const subjectColors: Record<string, string> = {
  Physics: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
  Chemistry: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
  Mathematics: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
  Biology: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800",
  English: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800",
};

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const timeSlots = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];

const initialEntries: TimetableEntry[] = [
  { id: "1", day: "Monday", startTime: "09:00", endTime: "10:00", subject: "Physics", teacher: "Dr. Sharma", room: "101", batch: "JEE 2025 - Batch A" },
  { id: "2", day: "Monday", startTime: "10:00", endTime: "11:00", subject: "Chemistry", teacher: "Prof. Patel", room: "102", batch: "JEE 2025 - Batch A" },
  { id: "3", day: "Monday", startTime: "11:00", endTime: "12:00", subject: "Mathematics", teacher: "Dr. Gupta", room: "103", batch: "JEE 2025 - Batch A" },
  { id: "4", day: "Tuesday", startTime: "09:00", endTime: "10:00", subject: "Biology", teacher: "Dr. Reddy", room: "104", batch: "NEET 2025 - Batch B" },
  { id: "5", day: "Tuesday", startTime: "10:00", endTime: "11:00", subject: "Chemistry", teacher: "Prof. Patel", room: "102", batch: "NEET 2025 - Batch B" },
  { id: "6", day: "Wednesday", startTime: "09:00", endTime: "10:00", subject: "Physics", teacher: "Dr. Sharma", room: "101", batch: "JEE 2025 - Batch A" },
  { id: "7", day: "Wednesday", startTime: "14:00", endTime: "15:00", subject: "English", teacher: "Ms. Nair", room: "201", batch: "Foundation 10th" },
  { id: "8", day: "Thursday", startTime: "09:00", endTime: "10:00", subject: "Mathematics", teacher: "Dr. Gupta", room: "103", batch: "JEE 2025 - Batch A" },
  { id: "9", day: "Friday", startTime: "10:00", endTime: "11:00", subject: "Physics", teacher: "Dr. Sharma", room: "101", batch: "CET 2025" },
];

export default function TimetablePage() {
  const { user } = useAuth();
  const instId = user?.role === "admin" ? (user as AdminUser).instituteId : "INST-001";
  const [entries, setEntries] = useState<TimetableEntry[]>(instId === "INST-001" ? initialEntries : []);
  const [batches, setBatches] = useState<string[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [selectedBatch, setSelectedBatch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<TimetableEntry | null>(null);
  const [form, setForm] = useState({ day: "Monday", startTime: "09:00", endTime: "10:00", subject: "", teacher: "", room: "" });

  const filteredEntries = selectedBatch
    ? entries.filter((e) => e.batch === selectedBatch)
    : [];

  const getEntry = (day: string, time: string) =>
    filteredEntries.find((e) => e.day === day && e.startTime === time);

  useEffect(() => {
    const fetchBatches = async () => {
      if (!isUuid(instId)) {
        setLoadingBatches(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('batches')
          .select('name')
          .eq('institute_id', instId)
          .eq('status', 'active')
          .order('name');

        if (error) throw error;

        const batchNames = (data || []).map((b: { name: string }) => b.name);
        setBatches(batchNames);
        if (batchNames.length > 0) {
          setSelectedBatch(prev => prev || batchNames[0]);
        }
      } catch (err: unknown) {
        toast({
          title: "Error",
          description: err instanceof Error ? err.message : "Failed to load batches",
          variant: "destructive",
        });
      } finally {
        setLoadingBatches(false);
      }
    };

    fetchBatches();
  }, [instId]);

  const handleSave = () => {
    if (!form.subject || !form.teacher || !selectedBatch) return;
    if (editEntry) {
      setEntries((prev) => prev.map((e) => e.id === editEntry.id ? { ...e, ...form, batch: selectedBatch } : e));
    } else {
      setEntries((prev) => [...prev, { id: Date.now().toString(), ...form, batch: selectedBatch }]);
    }
    setDialogOpen(false);
    setEditEntry(null);
    setForm({ day: "Monday", startTime: "09:00", endTime: "10:00", subject: "", teacher: "", room: "" });
  };

  const handleDelete = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const openEdit = (entry: TimetableEntry) => {
    setEditEntry(entry);
    setForm({ day: entry.day, startTime: entry.startTime, endTime: entry.endTime, subject: entry.subject, teacher: entry.teacher, room: entry.room });
    setDialogOpen(true);
  };

  const openAdd = (day?: string, time?: string) => {
    setEditEntry(null);
    setForm({ day: day || "Monday", startTime: time || "09:00", endTime: time ? `${(parseInt(time) + 1).toString().padStart(2, '0')}:00` : "10:00", subject: "", teacher: "", room: "" });
    setDialogOpen(true);
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Timetable Management</h2>
          <p className="text-sm text-muted-foreground">Manage class schedules for each batch</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedBatch}
            onChange={(e) => setSelectedBatch(e.target.value)}
            className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground"
            disabled={loadingBatches}
          >
            {loadingBatches ? (
              <option>Loading batches...</option>
            ) : batches.length > 0 ? (
              batches.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))
            ) : (
              <option>No batches available</option>
            )}
          </select>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => openAdd()}>
                <Plus className="w-4 h-4 mr-1" /> Add Class
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editEntry ? "Edit Class" : "Add Class"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Day</Label>
                    <select value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} className="w-full px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground mt-1">
                      {days.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Room</Label>
                    <Input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="e.g. 101" className="mt-1" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Start Time</Label>
                    <Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">End Time</Label>
                    <Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Subject</Label>
                  <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Physics" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Teacher</Label>
                  <Input value={form.teacher} onChange={(e) => setForm({ ...form, teacher: e.target.value })} placeholder="e.g. Dr. Sharma" className="mt-1" />
                </div>
                <Button className="w-full" onClick={handleSave}>{editEntry ? "Update" : "Add"} Class</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Desktop Grid View */}
      <div className="hidden lg:block surface-elevated rounded-lg overflow-x-auto border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="p-3 text-left text-xs font-medium text-muted-foreground w-20">
                <Clock className="w-4 h-4" />
              </th>
              {days.map((day) => (
                <th key={day} className="p-3 text-left text-xs font-medium text-muted-foreground">{day}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeSlots.map((time) => (
              <tr key={time} className="border-b border-border/50">
                <td className="p-3 text-xs text-muted-foreground tabular-nums font-medium">{time}</td>
                {days.map((day) => {
                  const entry = getEntry(day, time);
                  return (
                    <td key={day} className="p-1.5 min-w-[120px]">
                      {entry ? (
                        <div className={cn("rounded-md px-2 py-1.5 border text-xs cursor-pointer group relative", subjectColors[entry.subject] || "bg-secondary text-secondary-foreground border-border")}>
                          <p className="font-medium">{entry.subject}</p>
                          <p className="opacity-80 truncate">{entry.teacher}</p>
                          <p className="opacity-60">Room {entry.room}</p>
                          <div className="absolute top-1 right-1 hidden group-hover:flex gap-0.5">
                            <button onClick={() => openEdit(entry)} className="p-0.5 rounded hover:bg-background/50"><Edit2 className="w-3 h-3" /></button>
                            <button onClick={() => handleDelete(entry.id)} className="p-0.5 rounded hover:bg-background/50 text-destructive"><Trash2 className="w-3 h-3" /></button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => openAdd(day, time)} className="w-full h-full min-h-[48px] rounded-md border border-dashed border-border/50 hover:border-primary/30 hover:bg-primary/5 transition-colors" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile List View */}
      <div className="lg:hidden space-y-2">
        {days.map((day) => {
          const dayEntries = filteredEntries.filter((e) => e.day === day).sort((a, b) => a.startTime.localeCompare(b.startTime));
          if (dayEntries.length === 0) return null;
          return (
            <div key={day} className="surface-elevated rounded-lg border border-border">
              <div className="px-4 py-2 border-b border-border bg-muted/30">
                <p className="text-sm font-semibold text-foreground">{day}</p>
              </div>
              <div className="divide-y divide-border/50">
                {dayEntries.map((entry) => {
                  // Logic to determine a color indicator for mobile
                  const colorClass = subjectColors[entry.subject] || "";
                  const indicatorColor = colorClass.includes("blue") ? "bg-blue-500" :
                    colorClass.includes("emerald") ? "bg-emerald-500" :
                      colorClass.includes("amber") ? "bg-amber-500" :
                        colorClass.includes("rose") ? "bg-rose-500" :
                          colorClass.includes("purple") ? "bg-purple-500" : "bg-muted-foreground";

                  return (
                    <div key={entry.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={cn("w-1.5 h-10 rounded-full", indicatorColor)} />
                        <div>
                          <p className="text-sm font-medium text-foreground">{entry.subject}</p>
                          <p className="text-xs text-muted-foreground">{entry.teacher} • Room {entry.room}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground tabular-nums bg-secondary px-1.5 py-0.5 rounded">{entry.startTime}–{entry.endTime}</span>
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(entry)} className="p-1.5 rounded hover:bg-secondary"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                          <button onClick={() => handleDelete(entry.id)} className="p-1.5 rounded hover:bg-secondary text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}