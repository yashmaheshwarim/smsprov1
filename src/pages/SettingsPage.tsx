import { Settings, Building2, Users, Shield, Bell, Database } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  const sections = [
    { icon: Building2, title: "Institute Profile", description: "Manage institute name, logo, branches, and contact details" },
    { icon: Users, title: "User Management", description: "Add admins, manage roles and permissions" },
    { icon: Shield, title: "Security", description: "Password policies, 2FA, session management" },
    { icon: Bell, title: "Notifications", description: "Configure email, SMS, and push notification preferences" },
    { icon: Database, title: "Data & Storage", description: "Backup settings, storage usage, data export" },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <h2 className="text-lg font-semibold text-foreground">Settings</h2>
      <div className="space-y-3 max-w-2xl">
        {sections.map((s) => (
          <div key={s.title} className="surface-interactive rounded-lg p-4 cursor-pointer">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-md bg-primary/10 shrink-0">
                <s.icon className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">{s.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
              </div>
              <Button variant="outline" size="sm">Configure</Button>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-6 border-t border-border max-w-2xl">
        <p className="text-xs text-muted-foreground">
          InstituteOS v1.0 · Powered by Maheshwari Tech · © 2025
        </p>
      </div>
    </div>
  );
}
