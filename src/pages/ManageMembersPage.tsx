import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { ArrowLeft, UserCog } from "lucide-react";

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

const mockAdmins: AdminPermissions[] = [
  { id: "ADM-001", name: "Rajesh Admin", institute: "Excel Coaching Classes", canAddTeachers: true, canAddStudents: true, canAddParents: true, maxStudents: 500, maxTeachers: 20, maxParents: 500 },
  { id: "ADM-002", name: "Suresh Patel", institute: "Pinnacle Academy", canAddTeachers: false, canAddStudents: true, canAddParents: false, maxStudents: 300, maxTeachers: 10, maxParents: 0 },
  { id: "ADM-003", name: "Kavita Nair", institute: "Bright Future Institute", canAddTeachers: true, canAddStudents: false, canAddParents: false, maxStudents: 0, maxTeachers: 15, maxParents: 0 },
  { id: "ADM-004", name: "Amit Kumar", institute: "Scholar's Hub", canAddTeachers: false, canAddStudents: false, canAddParents: false, maxStudents: 100, maxTeachers: 5, maxParents: 100 },
];

export default function ManageMembersPage() {
  const navigate = useNavigate();
  const [admins, setAdmins] = useState(mockAdmins);

  const togglePerm = (id: string, field: "canAddTeachers" | "canAddStudents" | "canAddParents") => {
    setAdmins(prev => prev.map(a => a.id === id ? { ...a, [field]: !a[field] } : a));
  };
  
  const updateLimit = (id: string, field: keyof AdminPermissions, value: string) => {
    const num = parseInt(value) || 0;
    setAdmins(prev => prev.map(a => a.id === id ? { ...a, [field]: num } : a));
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
              {admins.map(admin => (
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
