import { useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  Building2, Users, BarChart3, IndianRupee, Settings, LogOut, Menu, X, Bell, Shield
} from "lucide-react";
import logo from "@/assets/maheshwari-tech-logo.png";

const navItems = [
  { title: "Institutes", href: "/", icon: Building2 },
  { title: "Members", href: "/members", icon: Users },
  { title: "Analytics", href: "/analytics", icon: BarChart3 },
  { title: "Revenue", href: "/revenue", icon: IndianRupee },
];

export function SuperAdminLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between h-14 px-4 border-b border-sidebar-border">
        <Link to="/" className="flex items-center gap-2">
          <img src={logo} alt="Apex SMS" className="h-7 w-auto object-contain" />
          <span className="text-sm font-semibold text-sidebar-accent-foreground">Apex SMS</span>
        </Link>
        <button onClick={() => setMobileOpen(false)} className="lg:hidden p-1 text-sidebar-muted">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-3 py-3">
        <div className="px-3 py-2 rounded-lg bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-violet-400" />
            <span className="text-xs font-bold text-violet-300 uppercase tracking-wider">Super Admin</span>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link key={item.href} to={item.href} onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              )}>
              <item.icon className="w-4 h-4 shrink-0" />
              <span>{item.title}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <button onClick={logout}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent/50 w-full transition-colors">
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </button>
        <div className="mt-2 px-3 py-2">
          <p className="text-[10px] text-sidebar-muted">Logged in as</p>
          <p className="text-xs font-semibold text-sidebar-foreground">{user?.name}</p>
          <p className="text-[10px] text-sidebar-muted mt-1">Powered by Maheshwari Tech</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex w-full bg-surface">
      {mobileOpen && <div className="fixed inset-0 bg-foreground/50 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />}
      <aside className={cn("fixed inset-y-0 left-0 z-50 w-64 bg-sidebar transform transition-transform duration-200 lg:hidden", mobileOpen ? "translate-x-0" : "-translate-x-full")}>
        {sidebar}
      </aside>
      <aside className="hidden lg:flex flex-col bg-sidebar border-r border-sidebar-border shrink-0 w-60">
        {sidebar}
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="lg:hidden p-2 -ml-2 text-muted-foreground">
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-base font-semibold text-foreground">Platform Control</h1>
          </div>
          <div className="flex items-center gap-2">
            <button className="relative p-2 rounded-md text-muted-foreground hover:text-foreground">
              <Bell className="w-4 h-4" />
            </button>
            <span className="text-sm text-muted-foreground hidden sm:block">{user?.name}</span>
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
