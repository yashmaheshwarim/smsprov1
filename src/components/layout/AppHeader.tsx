import { useState, useEffect } from "react";
import { Menu, Search, Bell, ChevronDown, User, Settings, LogOut } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

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
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <>
      <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 lg:px-6 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onMenuClick} className="lg:hidden p-2 -ml-2 rounded-md text-muted-foreground hover:text-foreground">
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="text-base font-semibold text-foreground">{title}</h1>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setSearchOpen(true)} className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md bg-secondary text-muted-foreground text-sm hover:bg-secondary/80 transition-colors">
            <Search className="w-4 h-4" />
            <span>Search...</span>
            <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-background border border-border ml-4">⌘K</kbd>
          </button>
          
          <Popover>
            <PopoverTrigger asChild>
              <button className="relative p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                <Bell className="w-4 h-4" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <div className="space-y-4">
                <h4 className="font-medium text-sm">Notifications</h4>
                <div className="space-y-2">
                  <div className="text-sm p-2 bg-secondary/50 rounded-md">New assignment submitted by Aarav Sharma</div>
                  <div className="text-sm p-2 bg-secondary/50 rounded-md">Server update scheduled for 2 AM</div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary transition-colors outline-none">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-xs font-semibold text-primary">{user?.name?.substring(0, 2).toUpperCase() || 'AD'}</span>
                </div>
                <span className="hidden sm:block text-sm font-medium text-foreground">{user?.name || 'Admin'}</span>
                <ChevronDown className="hidden sm:block w-3 h-3 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/settings')}>
                <User className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/settings')}>
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Suggestions">
            <CommandItem onSelect={() => { navigate('/students'); setSearchOpen(false); }}>Go to Students</CommandItem>
            <CommandItem onSelect={() => { navigate('/teachers'); setSearchOpen(false); }}>Go to Teachers</CommandItem>
            <CommandItem onSelect={() => { navigate('/attendance'); setSearchOpen(false); }}>Go to Attendance</CommandItem>
            <CommandItem onSelect={() => { navigate('/settings'); setSearchOpen(false); }}>Go to Settings</CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
