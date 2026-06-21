import { Settings, Building2, Users, Shield, Bell, Database, Save, Mail, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useState, useEffect } from "react";
import { supabase, isUuid } from "@/lib/supabase";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const instId = isAdmin ? (user as AdminUser).instituteId : undefined;
  const instituteName = isAdmin ? (user as AdminUser).instituteName : "";

  const [receiptIdPattern, setReceiptIdPattern] = useState("101");
  const [notificationEmail, setNotificationEmail] = useState("");
  const [feeEmailNotificationsEnabled, setFeeEmailNotificationsEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isAdmin && isUuid(instId)) {
      supabase
        .from("institutes")
        .select("receipt_id_pattern, receipt_id_start, notification_email, fee_email_notifications_enabled")
        .eq("id", instId)
        .single()
        .then(({ data }) => {
          if (data?.receipt_id_pattern) setReceiptIdPattern(data.receipt_id_pattern);
          else if (data?.receipt_id_start) setReceiptIdPattern(String(data.receipt_id_start));
          if (data?.notification_email) setNotificationEmail(data.notification_email);
          if (data?.fee_email_notifications_enabled !== undefined) setFeeEmailNotificationsEnabled(data.fee_email_notifications_enabled);
        });
    }
  }, [instId, isAdmin]);

  const handleSaveReceiptPattern = async () => {
    if (!instId || !isUuid(instId)) return;
    setSaving(true);
    try {
      // Extract the numeric part from the pattern to also update receipt_id_start
      const numericPart = receiptIdPattern.replace(/[^0-9]/g, '');
      const startNum = parseInt(numericPart) || 1;
      
      const { error } = await supabase
        .from("institutes")
        .update({ 
          receipt_id_pattern: receiptIdPattern,
          receipt_id_start: startNum
        })
        .eq("id", instId);
      if (error) throw error;
      toast({ title: "Saved", description: "Receipt ID pattern updated." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotificationSettings = async () => {
    if (!instId || !isUuid(instId)) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("institutes")
        .update({ 
          notification_email: notificationEmail || null,
          fee_email_notifications_enabled: feeEmailNotificationsEnabled 
        })
        .eq("id", instId);
      if (error) throw error;
      toast({ title: "Saved", description: "Notification settings updated." });
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

  // Preview the next receipt ID based on pattern
  const getPreviewNextId = () => {
    const prefix = receiptIdPattern.replace(/[0-9]/g, '');
    const numStr = receiptIdPattern.replace(/[^0-9]/g, '');
    const num = parseInt(numStr) || 1;
    const nextNum = num + 1;
    const paddedLength = numStr.length;
    const nextPadded = String(nextNum).padStart(paddedLength, '0');
    return prefix + nextPadded;
  };

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
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-muted-foreground w-40">Receipt ID Pattern</label>
              <Input
                value={receiptIdPattern}
                onChange={(e) => setReceiptIdPattern(e.target.value)}
                placeholder="e.g., AGT-500 or 101"
                className="w-48 h-8 font-mono"
              />
              <Button size="sm" onClick={handleSaveReceiptPattern} disabled={saving}>
                {saving ? "Saving..." : <Save className="w-3 h-3" />}
              </Button>
            </div>
            <div className="flex items-start gap-3 text-xs text-muted-foreground">
              <Info className="w-3 h-3 mt-0.5 shrink-0" />
              <div>
                <p>Enter a pattern with a prefix and starting number. Examples:</p>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  <li><code className="bg-muted px-1 rounded">AGT-500</code> → generates AGT-500, AGT-501, AGT-502...</li>
                  <li><code className="bg-muted px-1 rounded">101</code> → generates 101, 102, 103...</li>
                  <li><code className="bg-muted px-1 rounded">RCPT-001</code> → generates RCPT-001, RCPT-002...</li>
                </ul>
                {receiptIdPattern && (
                  <p className="mt-2">
                    Next receipt will be: <strong className="text-foreground font-mono">{receiptIdPattern}</strong>
                    , then: <strong className="text-foreground font-mono">{getPreviewNextId()}</strong>
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="pt-6 border-t border-border max-w-2xl space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Fee Email Notifications</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-muted-foreground w-40">Notification Email</label>
              <Input
                type="email"
                value={notificationEmail}
                onChange={(e) => setNotificationEmail(e.target.value)}
                placeholder="admin@institute.com"
                className="flex-1 h-8"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-muted-foreground w-40">Enable Email Notifications</label>
              <Switch
                checked={feeEmailNotificationsEnabled}
                onCheckedChange={setFeeEmailNotificationsEnabled}
              />
              <span className="text-xs text-muted-foreground">
                {feeEmailNotificationsEnabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            <Button size="sm" onClick={handleSaveNotificationSettings} disabled={saving}>
              {saving ? "Saving..." : <Save className="w-3 h-3" />}
              Save Notification Settings
            </Button>
            <p className="text-xs text-muted-foreground">
              When enabled, an email with full payment details will be sent to this address whenever a fee payment is recorded for any student.
            </p>
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