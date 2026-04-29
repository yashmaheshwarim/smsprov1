import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { ArrowLeft, UserCog, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

interface AdminPermissions {
  id: string;
  name: string;
  institute: string;
  canAddTeachers: boolean;
  canAddStudents: boolean;
  canAddParents: boolean;
  maxStudents: number;
  maxTeachers: number;
  maxParents: number;
}

// Permissions are now fetched from Supabase institutes/users tables.


export default function ManageMembersPage() {
  const navigate = useNavigate();
  const [admins, setAdmins] = useState<AdminPermissions[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAdmins();
  }, []);

  const fetchAdmins = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('users')
      .select(`
        id,
        name,
        institutes (
          name,
          student_limit,
          teacher_limit
        )
      `)
      .eq('role', 'admin');

    if (error) {
      toast({ title: "Error", description: "Failed to fetch admins from DB.", variant: "destructive" });
    } else {
      const formatted = (data || []).map((u: any) => ({
        id: u.id,
        name: u.name,
        institute: u.institutes?.name || "N/A",
        canAddTeachers: true, // Defaulting for now
        canAddStudents: true,
        canAddParents: true,
        maxStudents: u.institutes?.student_limit || 0,
        maxTeachers: u.institutes?.teacher_limit || 0,
        maxParents: 0,
      }));
      setAdmins(formatted);
    }
    setLoading(false);
  };

  const togglePerm = (id: string, field: "canAddTeachers" | "canAddStudents" | "canAddParents") => {
    setAdmins(prev => prev.map(a => a.id === id ? { ...a, [field]: !a[field] } : a));
    // In a real scenario, we'd update a 'permissions' column in Supabase users table here.
    toast({ title: "Updated local state", description: "Permission toggled." });
  };
  
  const updateLimit = async (id: string, field: keyof AdminPermissions, value: string) => {
    const num = parseInt(value) || 0;
    setAdmins(prev => prev.map(a => a.id === id ? { ...a, [field]: num } : a));
    
    // Example: Updating institute limits in real DB
    const admin = admins.find(a => a.id === id);
    if (!admin) return;

    if (field === "maxStudents" || field === "maxTeachers") {
      const dbField = field === "maxStudents" ? "student_limit" : "teacher_limit";
      const { error } = await supabase
        .from('institutes')
        .update({ [dbField]: num })
        .eq('name', admin.institute); // Using name as a simple lookup for now
        
      if (error) {
        toast({ title: "DB Sync Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Database Saved", description: `${field} updated successfully.` });
      }
    }
  };

  return (
    <div className="min-h-screen bg-surface p-4 lg:p-6 max-w-[1400px] mx-auto space-y-4 animate-fade-in">
      <div className="flex items-center gap-4 border-b border-border pb-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <UserCog className="w-5 h-5" /> Manage Members Permissions
          </h2>
          <p className="text-sm text-muted-foreground">Control hierarchy and restrict addition of members for individual admins</p>
        </div>
      </div>

      <div className="surface-elevated rounded-lg overflow-hidden">
        <div className="overflow-x-auto pb-4">
          <table className="w-full text-sm min-w-[1000px]">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Admin</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Institute</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Add Teachers</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Max Teachers</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Add Students</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Max Students</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Add Parents</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Max Parents</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-20 text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                    <p className="text-sm text-muted-foreground mt-2">Connecting to Supabase...</p>
                  </td>
                </tr>
              ) : admins.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-20 text-center text-muted-foreground">
                    No admins found in the database.
                  </td>
                </tr>
              ) : admins.map(admin => (
                <tr key={admin.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{admin.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{admin.institute}</td>
                  
                  <td className="px-4 py-3 text-center">
                    <Switch
                      checked={admin.canAddTeachers}
                      onCheckedChange={() => togglePerm(admin.id, "canAddTeachers")}
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                     <Input 
                      type="number" 
                      min="0"
                      className="w-20 mx-auto h-8 text-center" 
                      value={admin.maxTeachers} 
                      onChange={(e) => updateLimit(admin.id, "maxTeachers", e.target.value)}
                      disabled={!admin.canAddTeachers} 
                     />
                  </td>

                  <td className="px-4 py-3 text-center">
                    <Switch
                      checked={admin.canAddStudents}
                      onCheckedChange={() => togglePerm(admin.id, "canAddStudents")}
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                     <Input 
                      type="number" 
                      min="0"
                      className="w-24 mx-auto h-8 text-center" 
                      value={admin.maxStudents} 
                      onChange={(e) => updateLimit(admin.id, "maxStudents", e.target.value)}
                      disabled={!admin.canAddStudents} 
                     />
                  </td>

                  <td className="px-4 py-3 text-center">
                    <Switch
                      checked={admin.canAddParents}
                      onCheckedChange={() => togglePerm(admin.id, "canAddParents")}
                    />
                  </td>
                   <td className="px-4 py-3 text-center">
                     <Input 
                      type="number" 
                      min="0"
                      className="w-24 mx-auto h-8 text-center" 
                      value={admin.maxParents} 
                      onChange={(e) => updateLimit(admin.id, "maxParents", e.target.value)}
                      disabled={!admin.canAddParents} 
                     />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
