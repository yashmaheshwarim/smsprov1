import { useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { useAuth, TeacherUser } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  CalendarCheck, Users, BookOpen, ClipboardList, MessageSquare,
  BarChart3, Calendar, CalendarDays, Menu, X, LogOut, Bell, FileCheck, Clock
} from "lucide-react";
import logo from "@/assets/maheshwari-tech-logo.png";

const allTeacherNav = [
  { key: "attendance", title: "Attendance", href: "/teacher/attendance", icon: CalendarCheck },
  { key: "students", title: "Students", href: "/teacher/students", icon: Users },
  { key: "materials", title: "Materials", href: "/teacher/materials", icon: BookOpen },
  { key: "assignments", title: "Assignments", href: "/teacher/assignments", icon: ClipboardList },
  { key: "marks", title: "Marks Entry", href: "/teacher/marks", icon: FileCheck },
  { key: "messages", title: "Messages", href: "/teacher/messages", icon: MessageSquare },
  { key: "analytics", title: "Analytics", href: "/teacher/analytics", icon: BarChart3 },
  { key: "timetable", title: "Timetable", href: "/teacher/timetable", icon: Clock },
  { key: "calendar", title: "Calendar", href: "/teacher/calendar", icon: Calendar },
  { key: "leaves", title: "Leaves", href: "/teacher/leaves", icon: CalendarDays },
];

export function TeacherLayout() {
  const { user, logout } = useAuth();
  const teacher = user as TeacherUser;
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleNav = allTeacherNav.filter(n => teacher.permissions[n.key]?.visible);

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between h-14 px-4 border-b border-sidebar-border">
        <Link to="/teacher/attendance" className="flex items-center gap-2">
          <img src={logo} alt="Apex SMS" className="h-7 w-auto object-contain" />
          <span className="text-sm font-semibold text-sidebar-accent-foreground">Apex SMS</span>
        </Link>
        <button onClick={() => setMobileOpen(false)} className="lg:hidden p-1 text-sidebar-muted"><X className="w-4 h-4" /></button>
      </div>
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {visibleNav.map(item => {
          const isActive = location.pathname === item.href;
          return (
            <Link key={item.href} to={item.href} onClick={() => setMobileOpen(false)}
              className={cn("flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}>
              <item.icon className="w-4 h-4 shrink-0" />
              <span>{item.title}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <div className="px-3 py-2">
          <p className="text-xs font-medium text-sidebar-foreground truncate">{teacher.name}</p>
          <p className="text-[10px] text-sidebar-muted">Teacher</p>
        </div>
        <button onClick={logout} className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent/50 w-full">
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex w-full bg-surface">
      {mobileOpen && <div className="fixed inset-0 bg-foreground/50 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />}
      <aside className={cn("fixed inset-y-0 left-0 z-50 w-64 bg-sidebar transform transition-transform duration-200 lg:hidden", mobileOpen ? "translate-x-0" : "-translate-x-full")}>{sidebar}</aside>
      <aside className="hidden lg:flex flex-col bg-sidebar border-r border-sidebar-border shrink-0 w-60">{sidebar}</aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="lg:hidden p-2 -ml-2 text-muted-foreground"><Menu className="w-5 h-5" /></button>
            <h1 className="text-base font-semibold text-foreground">Teacher Portal</h1>
          </div>
          <div className="flex items-center gap-2">
            <button className="relative p-2 rounded-md text-muted-foreground hover:text-foreground"><Bell className="w-4 h-4" /></button>
            <span className="text-sm text-muted-foreground hidden sm:block">{teacher.name}</span>
          </div>
        </header>
        <main className="flex-1 overflow-auto"><Outlet /></main>
      </div>
    </div>
  );
}
