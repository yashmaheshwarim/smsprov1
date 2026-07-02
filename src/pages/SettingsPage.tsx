import { useState, useEffect } from "react";
import { Settings, Building2, Users, Shield, Bell, Database, Receipt, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth, AdminUser } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { getReceiptConfig, saveReceiptConfig, parseReceiptIdString, formatReceiptId } from "@/lib/receipt-service";
import { isUuid } from "@/lib/supabase";

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const instId = isAdmin ? (user as AdminUser).instituteId : "";

  // Receipt config state
  const [receiptPrefix, setReceiptPrefix] = useState("");
  const [nextReceiptNo, setNextReceiptNo] = useState(500);
  const [receiptInput, setReceiptInput] = useState("");
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);

  // Load current config
  useEffect(() => {
    if (!isUuid(instId)) {
      setLoadingConfig(false);
      return;
    }

    const loadConfig = async () => {
      try {
        const config = await getReceiptConfig(instId);
        setReceiptPrefix(config.receipt_prefix);
        setNextReceiptNo(config.next_receipt_no);
        setReceiptInput(formatReceiptId(config.receipt_prefix, config.next_receipt_no));
      } catch (error: any) {
        console.error("Error loading receipt config:", error);
      } finally {
        setLoadingConfig(false);
      }
    };

    loadConfig();
  }, [instId]);

  const handleSaveConfig = async () => {
    if (!isUuid(instId)) {
      toast({ title: "Error", description: "Institute ID not available.", variant: "destructive" });
      return;
    }

    setSavingConfig(true);
    try {
      // Parse the user input to extract prefix and number
      const { prefix, startNumber } = parseReceiptIdString(receiptInput);
      await saveReceiptConfig(instId, prefix, startNumber);
      
      // Update local state
      setReceiptPrefix(prefix);
      setNextReceiptNo(startNumber);

      toast({
        title: "Receipt Configuration Saved",
        description: `Next receipt will be: ${formatReceiptId(prefix, startNumber)}`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save receipt configuration.",
        variant: "destructive",
      });
    } finally {
      setSavingConfig(false);
    }
  };

  const getPreviewText = () => {
    const { prefix, number } = parseReceiptIdString(receiptInput);
    return `${formatReceiptId(prefix, number)} → ${formatReceiptId(prefix, number + 1)} → ${formatReceiptId(prefix, number + 2)}`;
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Settings className="w-6 h-6 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Settings</h2>
      </div>

      <div className="space-y-6 max-w-3xl">
        {/* Institute Profile */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">Institute Profile</CardTitle>
            </div>
            <CardDescription>Manage institute name, logo, branches, and contact details</CardDescription>
          </CardHeader>
        </Card>

        {/* Receipt ID Configuration */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">Receipt ID Configuration</CardTitle>
            </div>
            <CardDescription>
              Configure the receipt numbering system. Enter the starting receipt ID (e.g., "AGT-130", "REC-500", or just "500" for numeric).
              Receipts will auto-increment from your starting value.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingConfig ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading configuration...
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="receipt-input">Starting Receipt ID</Label>
                  <Input
                    id="receipt-input"
                    placeholder="e.g., AGT-130, REC-500, or 500"
                    value={receiptInput}
                    onChange={(e) => setReceiptInput(e.target.value)}
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Alphanumeric prefix + number. Examples: AGT-130, REC2025-001, or just 500 for plain numbers.
                  </p>
                </div>

                {/* Preview */}
                <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Preview</p>
                  <p className="text-sm font-mono text-foreground">
                    {getPreviewText()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Receipts will auto-increment from your starting value
                  </p>
                </div>

                <Button onClick={handleSaveConfig} disabled={savingConfig}>
                  {savingConfig ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Save Configuration
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* User Management */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">User Management</CardTitle>
            </div>
            <CardDescription>Add admins, manage roles and permissions</CardDescription>
          </CardHeader>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">Security</CardTitle>
            </div>
            <CardDescription>Password policies, 2FA, session management</CardDescription>
          </CardHeader>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">Notifications</CardTitle>
            </div>
            <CardDescription>Configure email, SMS, and push notification preferences</CardDescription>
          </CardHeader>
        </Card>

        {/* Data & Storage */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">Data & Storage</CardTitle>
            </div>
            <CardDescription>Backup settings, storage usage, data export</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div className="pt-6 border-t border-border max-w-3xl">
        <p className="text-xs text-muted-foreground">
          InstituteOS v1.0 · Powered by Maheshwari Tech · © 2025
        </p>
      </div>
    </div>
  );
}
