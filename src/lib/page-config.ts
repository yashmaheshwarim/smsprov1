/**
 * Shared page configuration.
 * This is the SINGLE source of truth for all admin pages.
 * - AppSidebar renders nav items from here
 * - AuthContext's ALL_ADMIN_PAGES is derived from here
 * - SuperAdminDashboard renders page access toggles from here
 *
 * Adding a new page here automatically makes it:
 * 1. Appear in the sidebar
 * 2. Toggleable in the super admin page access dialog
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PageConfig {
  /** Unique key used for access control (pageAccess[key]) */
  key: string;
  /** Display label in sidebar and toggle dialogs */
  label: string;
  /** Route href */
  href: string;
  /** Lucide icon name (resolved in sidebar) */
  iconName: string;
  /** Badge text to show (e.g. count) */
  badge?: string;
}

// ─── Page Definitions ────────────────────────────────────────────────────────

/** All admin sidebar pages (main section) */
export const MAIN_NAV_PAGES: PageConfig[] = [
  { key: "dashboard",          label: "Dashboard",          href: "/",                    iconName: "LayoutDashboard" },
  { key: "students",           label: "Students",           href: "/students",            iconName: "Users",          badge: "" },
  { key: "grn",                label: "GRN Management",     href: "/grn",                 iconName: "Hash" },
  { key: "admissions",         label: "Admissions",         href: "/admissions",          iconName: "UserPlus" },
  { key: "enrollment",         label: "Enrollment",         href: "/enrollment",          iconName: "UserCheck" },
  { key: "batches",            label: "Batch Management",   href: "/batches",             iconName: "Layers" },
  { key: "teachers",           label: "Teachers",           href: "/teachers",            iconName: "GraduationCap" },
  { key: "attendance",         label: "Attendance",         href: "/attendance",          iconName: "CalendarCheck" },
  { key: "attendanceReport",   label: "Attendance Report",  href: "/attendance-report",   iconName: "CalendarCheck" },
  { key: "timetable",          label: "Timetable",          href: "/timetable",           iconName: "Clock" },
  { key: "calendar",           label: "Calendar",           href: "/calendar",            iconName: "Calendar" },
  { key: "fees",               label: "Fees",               href: "/fees",                iconName: "IndianRupee",    badge: "" },
  { key: "feesReport",         label: "Fees Report",        href: "/fees/report",         iconName: "FileSpreadsheet" },
  { key: "marks",              label: "Marks & Reports",    href: "/marks",               iconName: "FileCheck" },
  { key: "leaves",             label: "Leaves",             href: "/leaves",              iconName: "CalendarDays" },
  { key: "camera",             label: "Camera Capture",     href: "/camera",              iconName: "Camera" },
  { key: "whatsapp",           label: "WhatsApp",           href: "/whatsapp",            iconName: "MessageCircle" },
  { key: "classroom",          label: "Classroom",          href: "/classroom",           iconName: "GraduationCap" },
  { key: "integrations",       label: "Integrations",       href: "/integrations",        iconName: "Plug" },
  { key: "import",             label: "Import Data",        href: "/import",              iconName: "Upload" },
];

/** Pages in the Credentials & Settings section */
export const CREDENTIALS_NAV_PAGES: PageConfig[] = [
  { key: "student-credentials", label: "Student Credentials", href: "/student-credentials", iconName: "Key" },
];

/** Settings page (bottom of sidebar) */
export const SETTINGS_PAGE: PageConfig = {
  key: "settings",
  label: "Settings",
  href: "/settings",
  iconName: "Settings",
};

// ─── Derived Lists ───────────────────────────────────────────────────────────

/** Every page key that can be toggled by super admin */
export const ALL_PAGE_KEYS: string[] = [
  ...MAIN_NAV_PAGES.map((p) => p.key),
  ...CREDENTIALS_NAV_PAGES.map((p) => p.key),
  SETTINGS_PAGE.key,
];

/** Page key → label mapping for toggle dialog display */
export function getPageLabel(key: string): string {
  const all = [...MAIN_NAV_PAGES, ...CREDENTIALS_NAV_PAGES, SETTINGS_PAGE];
  return all.find((p) => p.key === key)?.label ?? key;
}

/** All admin pages for the super admin toggle (key + label pairs) */
export const ALL_ADMIN_PAGES: { key: string; label: string }[] = ALL_PAGE_KEYS.map((key) => ({
  key,
  label: getPageLabel(key),
}));

/** Build default page access (all true) */
export function buildDefaultPageAccess(): Record<string, boolean> {
  return Object.fromEntries(ALL_PAGE_KEYS.map((k) => [k, true]));
}

/**
 * Filter nav items based on pageAccess, grouping pages that share an accessKey.
 * E.g. "attendance" key controls both "Attendance" and "Attendance Report".
 * "admissions" key controls both "Admissions" and "Enrollment".
 */
export function filterNavByAccess(
  pages: PageConfig[],
  pageAccess: Record<string, boolean> | undefined
): PageConfig[] {
  if (!pageAccess) return pages;
  // A page is visible if its own key is not explicitly false.
  // Shared keys: some pages use the same accessKey for grouping.
  return pages.filter((p) => pageAccess[p.key] !== false);
}
