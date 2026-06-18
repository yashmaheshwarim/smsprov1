import { Settings, Building2, Users, Shield, Bell, Database, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { supabase, isUuid } from "@/lib/supabase";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const instId = isAdmin ? (user as AdminUser).instituteId : undefined;
  const instituteName = isAdmin ? (user as AdminUser).instituteName : "";

  const [receiptIdStart, setReceiptIdStart] = useState(101);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isAdmin && isUuid(instId)) {
      supabase
        .from("institutes")
        .select("receipt_id_start")
        .eq("id", instId)
        .single()
        .then(({ data }) => {
          if (data?.receipt_id_start) setReceiptIdStart(data.receipt_id_start);
        });
    }
  }, [instId, isAdmin]);

  const handleSaveReceiptId = async () => {
    if (!instId || !isUuid(instId)) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("institutes")
        .update({ receipt_id_start: receiptIdStart })
        .eq("id", instId);
      if (error) throw error;
      toast({ title: "Saved", description: "Receipt ID start value updated." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

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

      {isAdmin && (
        <div className="pt-6 border-t border-border max-w-2xl space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Fee Receipt Settings</h3>
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-muted-foreground w-40">Start Receipt ID</label>
            <Input
              type="number"
              value={receiptIdStart}
              onChange={(e) => setReceiptIdStart(parseInt(e.target.value) || 101)}
              className="w-32 h-8"
            />
            <Button size="sm" onClick={handleSaveReceiptId} disabled={saving}>
              {saving ? "Saving..." : <Save className="w-3 h-3" />}
            </Button>
          </div>
        </div>
      )}

      <div className="pt-6 border-t border-border max-w-2xl">
        <p className="text-xs text-muted-foreground">
          InstituteOS v1.0 · Powered by Maheshwari Tech · © 2025
        </p>
      </div>
    </div>
  );
}
