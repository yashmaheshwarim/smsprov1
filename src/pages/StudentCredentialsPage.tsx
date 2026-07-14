import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
import { supabase, isUuid } from "@/lib/supabase";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import {
  Key, Search, Eye, EyeOff, Loader2, CheckCircle2, XCircle, Save, RefreshCw,
  Shield, Users, Plus
} from "lucide-react";

interface StudentCredential {
  id: string;
  name: string;
  enrollment_no: string;
  login_id: string | null;
  login_password: string | null;
  batch_name: string | null;
  status: string;
  hasCredentials: boolean;
}

export default function StudentCredentialsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const DEFAULT_UUID = "00000000-0000-0000-0000-000000000001";
  const instId = isAdmin ? (user as AdminUser).instituteId : DEFAULT_UUID;

  const [students, setStudents] = useState<StudentCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const perPage = 20;

  // Password visibility
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());

  // Set password dialog
  const [credDialogOpen, setCredDialogOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentCredential | null>(null);
  const [passwordForm, setPasswordForm] = useState({ login_id: "", login_password: "" });
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  // Bulk set dialog
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);

  useEffect(() => {
    if (isUuid(instId)) {
      fetchStudents();
    } else {
      setLoading(false);
    }
  }, [instId]);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("students")
        .select("id, name, enrollment_no, login_id, login_password, batch_name, status")
        .eq("institute_id", instId)
        .eq("status", "active")
        .order("name", { ascending: true });

      if (error) throw error;

      setStudents((data || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        enrollment_no: s.enrollment_no || "",
        login_id: s.login_id || null,
        login_password: s.login_password || null,
        batch_name: s.batch_name || null,
        status: s.status,
        hasCredentials: !!(s.login_id && s.login_password),
      })));
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    return students.filter((s) => {
      const matchSearch = !search || 
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.enrollment_no.toLowerCase().includes(search.toLowerCase()) ||
        (s.login_id || "").toLowerCase().includes(search.toLowerCase());
      const matchFilter = filterStatus === "all" ||
        (filterStatus === "has" && s.hasCredentials) ||
        (filterStatus === "missing" && !s.hasCredentials);
      return matchSearch && matchFilter;
    });
  }, [students, search, filterStatus]);

  const paginated = filtered.slice((page - 1) * perPage, page * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openSetDialog = (student: StudentCredential) => {
    setEditingStudent(student);
    setPasswordForm({
      login_id: student.login_id || student.enrollment_no,
      login_password: student.enrollment_no, // Default: enrollment number as password
    });
    setShowNewPassword(false);
    setCredDialogOpen(true);
  };

  const handleSetCredentials = async () => {
    if (!editingStudent || !passwordForm.login_id || !passwordForm.login_password) {
      toast({ title: "Error", description: "Login ID and password are required.", variant: "destructive" });
      return;
    }

    if (passwordForm.login_password.length < 4) {
      toast({ title: "Error", description: "Password must be at least 4 characters.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      // Check for duplicate login_id
      const { data: existing } = await supabase
        .from("students")
        .select("id, login_id")
        .eq("login_id", passwordForm.login_id)
        .neq("id", editingStudent.id)
        .limit(1);

      if (existing && existing.length > 0) {
        toast({ title: "Duplicate Login ID", description: "This login ID is already taken by another student.", variant: "destructive" });
        setSaving(false);
        return;
      }

      const { error } = await supabase
        .from("students")
        .update({
          login_id: passwordForm.login_id,
          login_password: passwordForm.login_password,
        })
        .eq("id", editingStudent.id);

      if (error) throw error;

      setStudents((prev) =>
        prev.map((s) =>
          s.id === editingStudent.id
            ? { ...s, login_id: passwordForm.login_id, login_password: passwordForm.login_password, hasCredentials: true }
            : s
        )
      );

      setCredDialogOpen(false);
      toast({ title: "Credentials Saved", description: `Login credentials set for ${editingStudent.name}` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveCredentials = async (studentId: string) => {
    if (!confirm("Are you sure you want to remove login credentials for this student?")) return;

    try {
      const { error } = await supabase
        .from("students")
        .update({ login_id: null, login_password: null })
        .eq("id", studentId);

      if (error) throw error;

      setStudents((prev) =>
        prev.map((s) =>
          s.id === studentId
            ? { ...s, login_id: null, login_password: null, hasCredentials: false }
            : s
        )
      );

      toast({ title: "Credentials Removed", description: "Student login credentials have been removed." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleBulkSet = async () => {
    setBulkSaving(true);
    try {
      // Get all active students that don't have credentials
      const studentsWithoutCreds = students.filter((s) => !s.hasCredentials);

      const updates = studentsWithoutCreds.map((s) => ({
        id: s.id,
        login_id: s.enrollment_no,
        login_password: s.enrollment_no, // Password = enrollment number
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from("students")
          .update({ login_id: update.login_id, login_password: update.login_password })
          .eq("id", update.id);

        if (error) throw error;
      }

      setStudents((prev) =>
        prev.map((s) => ({ ...s, login_id: s.enrollment_no, login_password: s.enrollment_no, hasCredentials: true }))
      );

      setBulkOpen(false);
      toast({ title: "Bulk Credentials Set", description: `All ${updates.length} students can now login using their enrollment number.` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setBulkSaving(false);
    }
  };

  const resetAllCredentials = async () => {
    const studentsWithCreds = students.filter((s) => s.hasCredentials);
    if (studentsWithCreds.length === 0) {
      toast({ title: "No Credentials", description: "No students have credentials to reset.", variant: "destructive" });
      return;
    }

    if (!confirm(`Reset all ${studentsWithCreds.length} student passwords?`)) return;

    const newPassword = prompt("Enter a new password for all students (min 4 chars):");
    if (!newPassword || newPassword.length < 4) {
      toast({ title: "Error", description: "Invalid password.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      for (const s of studentsWithCreds) {
        const { error } = await supabase
          .from("students")
          .update({ login_password: newPassword })
          .eq("id", s.id);

        if (error) throw error;
      }

      setStudents((prev) =>
        prev.map((s) => (s.hasCredentials ? { ...s, login_password: newPassword } : s))
      );

      toast({ title: "Passwords Reset", description: `All ${studentsWithCreds.length} student passwords reset.` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const credentialsCounts = {
    total: students.length,
    hasCredentials: students.filter((s) => s.hasCredentials).length,
    missingCredentials: students.filter((s) => !s.hasCredentials).length,
  };

  if (loading) {
    return <DataTableSkeleton columnCount={5} rowCount={10} showFilters={false} loadingText="Loading student credentials..." />;
  }

  const columns = [
    {
      key: "name",
      title: "Student",
      render: (s: StudentCredential) => (
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-semibold text-primary">
              {s.name.split(" ").filter(Boolean).map((n) => n[0]).join("").substring(0, 2)}
            </span>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{s.name}</p>
            <p className="text-xs text-muted-foreground">{s.enrollment_no}</p>
          </div>
        </div>
      ),
    },
    {
      key: "batch_name",
      title: "Batch",
      render: (s: StudentCredential) => (
        <span className="text-sm text-muted-foreground">{s.batch_name || "—"}</span>
      ),
    },
    {
      key: "login_id",
      title: "Login ID",
      render: (s: StudentCredential) => (
        <div className="flex items-center gap-2">
          {s.hasCredentials ? (
            <>
              <code className="text-xs font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                {s.login_id}
              </code>
              <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
            </>
          ) : (
            <span className="text-xs text-muted-foreground italic">Not set</span>
          )}
        </div>
      ),
    },
    {
      key: "password",
      title: "Password",
      render: (s: StudentCredential) => (
        <div className="flex items-center gap-2">
          {s.hasCredentials && s.login_password ? (
            <>
              <code className="text-xs font-mono bg-secondary/50 px-1.5 py-0.5 rounded">
                {visiblePasswords.has(s.id) ? s.login_password : "••••••••"}
              </code>
              <button
                onClick={() => togglePasswordVisibility(s.id)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                {visiblePasswords.has(s.id) ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
            </>
          ) : (
            <span className="text-xs text-muted-foreground italic">—</span>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      title: "",
      render: (s: StudentCredential) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => openSetDialog(s)}
          >
            {s.hasCredentials ? "Update" : "Set Credentials"}
          </Button>
          {s.hasCredentials && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={() => handleRemoveCredentials(s.id)}
            >
              Remove
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Key className="w-5 h-5 text-primary" />
            Student Credentials
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage login IDs and passwords for student portal access
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchStudents}
            disabled={loading}
            className="h-8 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={resetAllCredentials}
            className="h-8 text-xs"
          >
            Reset All Passwords
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkOpen(true)}
            disabled={credentialsCounts.missingCredentials === 0}
            className="h-8 text-xs"
          >
            <Users className="w-3.5 h-3.5 mr-1" />
            Bulk Set ({credentialsCounts.missingCredentials})
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="surface-elevated rounded-lg p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-primary/10">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground tabular-nums">{credentialsCounts.total}</p>
            <p className="text-xs text-muted-foreground">Total Active Students</p>
          </div>
        </div>
        <div className="surface-elevated rounded-lg p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-success/10">
            <CheckCircle2 className="w-5 h-5 text-success" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground tabular-nums">{credentialsCounts.hasCredentials}</p>
            <p className="text-xs text-muted-foreground">Has Login Credentials</p>
          </div>
        </div>
        <div className="surface-elevated rounded-lg p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-warning/10">
            <XCircle className="w-5 h-5 text-warning" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground tabular-nums">{credentialsCounts.missingCredentials}</p>
            <p className="text-xs text-muted-foreground">Missing Credentials</p>
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className="p-3 rounded-md bg-primary/5 border border-primary/20">
        <p className="text-xs text-foreground">
          <strong>💡 Student Login:</strong> Students use their <strong>Enrollment Number</strong> as both Login ID <em>and</em> default Password
          to access the Student Portal. You can customize the password per student, or use the <strong>Bulk Set</strong> option below.
        </p>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-card border border-border w-full sm:w-72">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Search by name, enrollment, or login ID..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground"
        >
          <option value="all">All Students</option>
          <option value="has">Has Credentials</option>
          <option value="missing">Missing Credentials</option>
        </select>
      </div>

      {/* Table */}
      <div className="surface-elevated rounded-lg border border-border overflow-hidden">
        <DataTable columns={columns} data={paginated} emptyMessage="No students found." />
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} of {filtered.length} students
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
              Prev
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Set Credentials Dialog */}
      <Dialog open={credDialogOpen} onOpenChange={setCredDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              {editingStudent?.hasCredentials ? "Update Credentials" : "Set Login Credentials"}
            </DialogTitle>
          </DialogHeader>
          {editingStudent && (
            <div className="space-y-4 pt-2">
              <div className="p-3 rounded-lg bg-secondary/50 border border-border">
                <p className="text-sm font-medium text-foreground">{editingStudent.name}</p>
                <p className="text-xs text-muted-foreground">{editingStudent.enrollment_no}</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">Login ID</label>
                <Input
                  value={passwordForm.login_id}
                  onChange={(e) => setPasswordForm((p) => ({ ...p, login_id: e.target.value }))}
                  placeholder="e.g., MT-2025000"
                  className="font-mono text-sm"
                />
                <p className="text-[10px] text-muted-foreground">
                  Students will use this as their username to login
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">Password</label>
                <div className="relative">
                  <Input
                    type={showNewPassword ? "text" : "password"}
                    value={passwordForm.login_password}
                    onChange={(e) => setPasswordForm((p) => ({ ...p, login_password: e.target.value }))}
                    placeholder="Default: enrollment number"
                    className="font-mono text-sm pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Defaults to enrollment number. Minimum 4 characters. Students use this to login.
                </p>
              </div>

              <Button className="w-full" onClick={handleSetCredentials} disabled={saving}>
                {saving ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
                ) : (
                  <><Save className="w-4 h-4 mr-2" />Save Credentials</>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Set Credentials Dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Bulk Set Credentials
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="p-4 rounded-lg bg-success/10 border border-success/20">
              <p className="text-sm text-foreground">
                This will set credentials for <strong>{credentialsCounts.missingCredentials}</strong> students who don't have login credentials yet.
              </p>
              <div className="mt-2 space-y-1">
                <p className="text-xs text-foreground">
                  ✅ <strong>Login ID</strong> = Enrollment Number
                </p>
                <p className="text-xs text-foreground">
                  ✅ <strong>Password</strong> = Enrollment Number
                </p>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Each student will use their own enrollment number to login. You can customize individual passwords later.
              </p>
            </div>

            <Button className="w-full" onClick={handleBulkSet} disabled={bulkSaving || credentialsCounts.missingCredentials === 0}>
              {bulkSaving ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Setting Credentials...</>
              ) : (
                <><Save className="w-4 h-4 mr-2" />Set All as Enrollment Number</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
