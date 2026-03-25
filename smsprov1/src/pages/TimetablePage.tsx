import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Edit2, Trash2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const timeSlots = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];
const batches = ["JEE 2025 - Batch A", "NEET 2025 - Batch B", "Foundation 10th", "Foundation 11th", "CET 2025", "Board 12th Science"];

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

const subjectColors: Record<string, string> = {
  Physics: "bg-primary/10 text-primary border-primary/20",
  Chemistry: "bg-success/10 text-success border-success/20",
  Mathematics: "bg-warning/10 text-warning border-warning/20",
  Biology: "bg-destructive/10 text-destructive border-destructive/20",
  English: "bg-muted text-muted-foreground border-border",
};

export default function TimetablePage() {
  const [entries, setEntries] = useState<TimetableEntry[]>(initialEntries);
  const [selectedBatch, setSelectedBatch] = useState(batches[0]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<TimetableEntry | null>(null);
  const [form, setForm] = useState({ day: "Monday", startTime: "09:00", endTime: "10:00", subject: "", teacher: "", room: "" });

  const filteredEntries = entries.filter((e) => e.batch === selectedBatch);

  const getEntry = (day: string, time: string) =>
    filteredEntries.find((e) => e.day === day && e.startTime === time);

  const handleSave = () => {
    if (!form.subject || !form.teacher) return;
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
    setForm({ day: day || "Monday", startTime: time || "09:00", endTime: time ? `${parseInt(time) + 1}:00`.padStart(5, "0") : "10:00", subject: "", teacher: "", room: "" });
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
          >
            {batches.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
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
      <div className="hidden lg:block surface-elevated rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
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
                    <td key={day} className="p-1.5">
                      {entry ? (
                        <div className={cn("rounded-md px-2 py-1.5 border text-xs cursor-pointer group relative", subjectColors[entry.subject] || "bg-secondary text-secondary-foreground border-border")}>
                          <p className="font-medium">{entry.subject}</p>
                          <p className="opacity-70">{entry.teacher}</p>
                          <p className="opacity-50">Room {entry.room}</p>
                          <div className="absolute top-1 right-1 hidden group-hover:flex gap-0.5">
                            <button onClick={() => openEdit(entry)} className="p-0.5 rounded hover:bg-background/50"><Edit2 className="w-3 h-3" /></button>
                            <button onClick={() => handleDelete(entry.id)} className="p-0.5 rounded hover:bg-background/50"><Trash2 className="w-3 h-3" /></button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => openAdd(day, time)} className="w-full h-full min-h-[40px] rounded-md border border-dashed border-border/50 hover:border-primary/30 hover:bg-primary/5 transition-colors" />
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
            <div key={day} className="surface-elevated rounded-lg">
              <div className="px-4 py-2 border-b border-border">
                <p className="text-sm font-semibold text-foreground">{day}</p>
              </div>
              <div className="divide-y divide-border/50">
                {dayEntries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={cn("w-1 h-10 rounded-full", subjectColors[entry.subject]?.includes("primary") ? "bg-primary" : subjectColors[entry.subject]?.includes("success") ? "bg-success" : subjectColors[entry.subject]?.includes("warning") ? "bg-warning" : "bg-muted-foreground")} />
                      <div>
                        <p className="text-sm font-medium text-foreground">{entry.subject}</p>
                        <p className="text-xs text-muted-foreground">{entry.teacher} · Room {entry.room}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground tabular-nums">{entry.startTime}–{entry.endTime}</span>
                      <button onClick={() => openEdit(entry)} className="p-1 rounded hover:bg-secondary"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      <button onClick={() => handleDelete(entry.id)} className="p-1 rounded hover:bg-secondary"><Trash2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
