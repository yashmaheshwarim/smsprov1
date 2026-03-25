import { Menu, Search, Bell, ChevronDown } from "lucide-react";
import { useLocation } from "react-router-dom";

const routeTitles: Record<string, string> = {
  "/": "Dashboard",
  "/students": "Students",
  "/teachers": "Manage Teachers",
  "/attendance": "Attendance",
  "/fees": "Fee Management",
  "/materials": "Study Materials",
  "/assignments": "Assignments",
  "/messages": "Messages & Wallet",
  "/analytics": "Analytics",
  "/import": "Import Data",
  "/settings": "Settings",
  "/timetable": "Timetable",
  "/integrations": "Integrations",
  "/documents": "Documents",
  "/leaves": "Leave Management",
  "/camera": "Camera Capture",
  "/admissions": "Admission Management",
  "/grn": "GRN Management",
  "/marks": "Marks & Report Cards",
  "/batches": "Batch Management",
};

interface AppHeaderProps {
  onMenuClick: () => void;
}

export function AppHeader({ onMenuClick }: AppHeaderProps) {
  const location = useLocation();
  const title = routeTitles[location.pathname] || "Apex SMS";

  return (
    <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 lg:px-6 shrink-0">
      <div className="flex items-center gap-3">
        <button onClick={onMenuClick} className="lg:hidden p-2 -ml-2 rounded-md text-muted-foreground hover:text-foreground">
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-base font-semibold text-foreground">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md bg-secondary text-muted-foreground text-sm">
          <Search className="w-4 h-4" />
          <span>Search...</span>
          <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-background border border-border ml-4">⌘K</kbd>
        </div>
        <button className="relative p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />
        </button>
        <button className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary transition-colors">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-xs font-semibold text-primary">AD</span>
          </div>
          <span className="hidden sm:block text-sm font-medium text-foreground">Admin</span>
          <ChevronDown className="hidden sm:block w-3 h-3 text-muted-foreground" />
        </button>
      </div>
    </header>
  );
}
