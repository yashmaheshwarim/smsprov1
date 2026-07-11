import { useState } from "react";
import { useLocation, Link } from "react-router-dom";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import {
  LayoutDashboard, Users, GraduationCap, CalendarCheck, IndianRupee,
  Key, Upload, Settings,
  ChevronLeft, ChevronRight, X, Calendar, Plug, CalendarDays, Camera, LogOut, UserPlus, UserCheck,
  Hash, FileCheck, Layers, Clock, MessageCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import logo from "@/assets/maheshwari-tech-logo.png";
import {
  MAIN_NAV_PAGES,
  CREDENTIALS_NAV_PAGES,
  SETTINGS_PAGE,
  type PageConfig,
} from "@/lib/page-config";

/** Resolve Lucide icon from icon name string */
function resolveIcon(iconName: string): React.ElementType {
  const iconMap: Record<string, React.ElementType> = {
    LayoutDashboard, Users, GraduationCap, CalendarCheck, IndianRupee,
    Key, Upload, Settings, Calendar, Plug, CalendarDays, Camera,
    UserPlus, UserCheck, Hash, FileCheck, Layers, Clock, MessageCircle,
  };
  return iconMap[iconName] || LayoutDashboard;
}

interface NavItem extends PageConfig {
  icon: React.ElementType;
}

function buildNavItems(configs: PageConfig[]): NavItem[] {
  return configs.map((c) => ({ ...c, icon: resolveIcon(c.iconName) }));
}

const navItems = buildNavItems(MAIN_NAV_PAGES);
const credentialsNav = buildNavItems(CREDENTIALS_NAV_PAGES);
const settingsNav = buildNavItems([SETTINGS_PAGE]);

interface AppSidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function AppSidebar({ mobileOpen, onMobileClose }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { logout, user } = useAuth();

  const admin = user as AdminUser;
  const visibleNav = navItems.filter(item => admin.pageAccess?.[item.key] !== false);
  const visibleCredentials = credentialsNav.filter(item => admin.pageAccess?.[item.key] !== false);

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between h-14 px-4 border-b border-sidebar-border">
        <Link to="/" className="flex items-center gap-2 min-w-0">
          <img src={logo} alt="Apex SMS" className="h-7 w-auto object-contain" />
          {!collapsed && (
            <span className="text-sm font-semibold text-sidebar-accent-foreground truncate">Apex SMS</span>
          )}
        </Link>
        <button onClick={onMobileClose} className="lg:hidden p-1 rounded-md text-sidebar-muted hover:text-sidebar-foreground">
          <X className="w-4 h-4" />
        </button>
        <button onClick={() => setCollapsed(!collapsed)} className="hidden lg:flex p-1 rounded-md text-sidebar-muted hover:text-sidebar-foreground">
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2 px-2">
        {/* Main Navigation */}
        <div className="space-y-0.5">
          {visibleNav.map((item) => {
            const isActive = location.pathname === item.href || 
              (item.href !== "/" && location.pathname.startsWith(item.href));
            return (
              <Link key={item.href} to={item.href} onClick={onMobileClose}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                )}>
                <item.icon className="w-4 h-4 shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-sidebar-primary/20 text-sidebar-primary">{item.badge}</span>
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </div>

        {/* Separator */}
        {!collapsed && (visibleCredentials.length > 0 || admin.pageAccess?.settings !== false) && (
          <div className="my-3 px-3">
            <div className="h-px bg-sidebar-border/50" />
          </div>
        )}

        {/* Credentials Section */}
        {visibleCredentials.length > 0 && (
          <div className="space-y-0.5 mb-2">
            {visibleCredentials.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link key={item.href} to={item.href} onClick={onMobileClose}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                    isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                  )}>
                  <item.icon className="w-4 h-4 shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.badge && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-sidebar-primary/20 text-sidebar-primary">{item.badge}</span>
                      )}
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        {admin.pageAccess?.settings !== false && (
          <Link to={SETTINGS_PAGE.href} onClick={onMobileClose}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors">
            <Settings className="w-4 h-4 shrink-0" />
            {!collapsed && <span>{SETTINGS_PAGE.label}</span>}
          </Link>
        )}
        <button onClick={logout}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors w-full">
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
        {!collapsed && (
          <div className="mt-2 px-3 py-2">
            <p className="text-[10px] text-sidebar-muted">Logged in as</p>
            <p className="text-xs font-semibold text-sidebar-foreground">{user?.name}</p>
            <p className="text-[10px] text-sidebar-muted mt-1">Powered by Maheshwari Tech</p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 bg-foreground/50 z-40 lg:hidden" onClick={onMobileClose} />}
      <aside className={cn("fixed inset-y-0 left-0 z-50 w-64 bg-sidebar transform transition-transform duration-200 lg:hidden", mobileOpen ? "translate-x-0" : "-translate-x-full")}>
        {sidebarContent}
      </aside>
      <aside className={cn("hidden lg:flex flex-col bg-sidebar border-r border-sidebar-border shrink-0 transition-all duration-200", collapsed ? "w-16" : "w-60")}>
        {sidebarContent}
      </aside>
    </>
  );
}
