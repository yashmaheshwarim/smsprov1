import { useState, useEffect } from "react";
import { Calendar as CalendarIcon, Clock, MapPin, Plus, MessageSquare } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, isSameDay, parseISO } from "date-fns";
import { CalendarEvent, initialCalendarEvents, CalendarEventType } from "@/lib/mock-data";

export default function CalendarPage() {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  
  // Form Dialog state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newEvent, setNewEvent] = useState<Partial<CalendarEvent>>({ type: "event" });

  useEffect(() => {
    const saved = localStorage.getItem('calendar_events');
    if (saved) {
      try {
        setEvents(JSON.parse(saved));
      } catch {
        setEvents(initialCalendarEvents);
      }
    } else {
      setEvents(initialCalendarEvents);
      localStorage.setItem('calendar_events', JSON.stringify(initialCalendarEvents));
    }
  }, []);

  const handleAddEvent = () => {
    if (!newEvent.title || !date || !newEvent.type) return;
    
    // Convert to UTC-independent local time ISO string to avoid timezone shift on reload
    // but standard toISOString() uses UTC. We can just use the local date at midnight.
    const dateAtMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    const event: CalendarEvent = {
      id: `ev-${Date.now()}`,
      title: newEvent.title,
      date: dateAtMidnight.toISOString(),
      type: newEvent.type as CalendarEventType,
      time: newEvent.time,
      location: newEvent.location,
      comments: newEvent.comments,
    };
    
    const updated = [...events, event];
    setEvents(updated);
    localStorage.setItem('calendar_events', JSON.stringify(updated));
    setNewEvent({ type: "event", title: "", time: "", location: "", comments: "" });
    setIsAddOpen(false);
  };

  const getDayEvents = (targetDate: Date) => {
    return events.filter(e => isSameDay(parseISO(e.date), targetDate));
  };

  const selectedDateEvents = date ? getDayEvents(date) : [];

  const getBadgeVariant = (type: CalendarEventType) => {
    switch (type) {
      case "holiday": return "destructive";
      case "exam": return "warning";
      case "parent_meeting": return "secondary";
      default: return "primary";
    }
  };

  const getCategoryColor = (type: CalendarEventType) => {
    switch (type) {
      case "holiday": return "bg-destructive";
      case "exam": return "bg-warning";
      case "parent_meeting": return "bg-secondary";
      default: return "bg-primary";
    }
  };

  const getModifierDates = (type: CalendarEventType) => {
    return events.filter(e => e.type === type).map(e => parseISO(e.date));
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in w-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Academic Calendar</h2>
          <p className="text-muted-foreground text-sm mt-1">Manage institutional events, holidays, and meetings.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 align-top mx-auto mt-6">
        <div className="md:col-span-1 border rounded-xl overflow-hidden shadow-sm bg-card h-fit flex flex-col items-center p-4">
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            className="rounded-md"
            modifiers={{
              holiday: getModifierDates("holiday"),
              exam: getModifierDates("exam"),
              event: getModifierDates("event"),
              parent_meeting: getModifierDates("parent_meeting"),
            }}
            modifiersStyles={{
              holiday: { color: "var(--destructive)", fontWeight: "bold" },
              exam: { color: "var(--warning)", fontWeight: "bold" },
              event: { color: "var(--primary)", fontWeight: "bold" },
              parent_meeting: { color: "var(--secondary)", fontWeight: "bold" },
            }}
          />
        </div>

        <div className="md:col-span-2 space-y-6">
          <div className="bg-card shadow-sm border rounded-xl overflow-hidden p-0 flex flex-col h-full min-h-[400px]">
            <div className="p-5 border-b border-border bg-muted/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  Events on {date ? format(date, "MMMM do, yyyy") : "Selected Date"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {selectedDateEvents.length} event{selectedDateEvents.length !== 1 ? 's' : ''} scheduled
                </p>
              </div>
              
              <Button onClick={() => setIsAddOpen(true)} className="gap-2 shadow-sm rounded-full">
                <Plus className="w-4 h-4" /> Add Event
              </Button>
            </div>
            
            <div className="p-5 flex-1 overflow-y-auto">
              {selectedDateEvents.length > 0 ? (
                <div className="space-y-4">
                  {selectedDateEvents.map((ev) => (
                    <div key={ev.id} className="group border border-border/60 hover:border-primary/50 transition-colors rounded-xl p-4 flex gap-4 bg-background shadow-xs hover:shadow-sm">
                      <div className="mt-1 flex-shrink-0">
                        <div className={`w-3 h-3 rounded-full ${getCategoryColor(ev.type)} mt-1.5 shadow-sm ring-4 ring-background`} />
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-foreground text-base tracking-tight">{ev.title}</p>
                          <StatusBadge variant={getBadgeVariant(ev.type)}>
                            {ev.type.replace('_', ' ')}
                          </StatusBadge>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground font-medium">
                          {ev.time && (
                            <div className="flex items-center gap-1.5 bg-muted/50 px-2 py-0.5 rounded-md">
                              <Clock className="w-3.5 h-3.5" /> {ev.time}
                            </div>
                          )}
                          {ev.location && (
                            <div className="flex items-center gap-1.5 bg-muted/50 px-2 py-0.5 rounded-md">
                              <MapPin className="w-3.5 h-3.5" /> {ev.location}
                            </div>
                          )}
                        </div>
                        
                        {ev.comments && (
                          <div className="mt-3 p-3 bg-secondary/20 border border-secondary/30 rounded-lg flex items-start gap-2 max-w-prose text-sm">
                            <MessageSquare className="w-4 h-4 mt-0.5 text-secondary-foreground/70 shrink-0" />
                            <p className="text-secondary-foreground leading-relaxed italic">{ev.comments}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 flex flex-col items-center justify-center text-muted-foreground h-full border-2 border-dashed border-border/50 rounded-xl bg-muted/10 mx-auto">
                  <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4 text-muted-foreground/50">
                    <CalendarIcon className="w-8 h-8" />
                  </div>
                  <h4 className="text-base font-medium text-foreground mb-1">No events scheduled</h4>
                  <p className="text-sm max-w-[250px]">Select a date and click "Add Event" to create a new occasion.</p>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
             <div className="bg-destructive/10 border-destructive/20 border text-destructive p-3 rounded-xl flex items-center gap-3 shadow-sm">
               <div className="w-3 h-3 rounded-full bg-destructive shadow-sm" />
               <span className="text-sm font-semibold tracking-tight">Holidays</span>
             </div>
             <div className="bg-warning/10 border-warning/20 border text-warning p-3 rounded-xl flex items-center gap-3 shadow-sm">
               <div className="w-3 h-3 rounded-full bg-warning shadow-sm" />
               <span className="text-sm font-semibold tracking-tight">Exams</span>
             </div>
             <div className="bg-primary/10 border-primary/20 border text-primary p-3 rounded-xl flex items-center gap-3 shadow-sm">
               <div className="w-3 h-3 rounded-full bg-primary shadow-sm" />
               <span className="text-sm font-semibold tracking-tight">Events</span>
             </div>
             <div className="bg-secondary/20 border-secondary/30 border text-secondary-foreground p-3 rounded-xl flex items-center gap-3 shadow-sm">
               <div className="w-3 h-3 rounded-full bg-secondary shadow-sm" />
               <span className="text-sm font-semibold tracking-tight leading-none">Meetings</span>
             </div>
          </div>
        </div>
      </div>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add Event on {date ? format(date, "MMM dd, yyyy") : ""}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title" className="text-left font-medium">Title <span className="text-destructive">*</span></Label>
              <Input
                id="title"
                placeholder="E.g., Final Physics Exam"
                value={newEvent.title || ""}
                onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                className="w-full"
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="type" className="text-left font-medium">Event Type <span className="text-destructive">*</span></Label>
              <Select
                value={newEvent.type}
                onValueChange={(val) => setNewEvent({ ...newEvent, type: val as CalendarEventType })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="event">General Event</SelectItem>
                  <SelectItem value="holiday">Holiday</SelectItem>
                  <SelectItem value="exam">Exam</SelectItem>
                  <SelectItem value="parent_meeting">Parent Meeting</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="time" className="text-left font-medium">Time</Label>
                <Input
                  id="time"
                  type="time"
                  value={newEvent.time || ""}
                  onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="location" className="text-left font-medium">Location</Label>
                <Input
                  id="location"
                  placeholder="Room 101"
                  value={newEvent.location || ""}
                  onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="comments" className="text-left font-medium">Comments / Notes</Label>
              <Textarea
                id="comments"
                placeholder="Add any extra details..."
                value={newEvent.comments || ""}
                onChange={(e) => setNewEvent({ ...newEvent, comments: e.target.value })}
                className="resize-none min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddEvent}>Save Event</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
