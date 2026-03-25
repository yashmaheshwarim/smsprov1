import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MessageSquare, Mail, Bell, CreditCard, FileText, Globe, Check, Settings2, ExternalLink } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  status: "connected" | "disconnected" | "error";
  category: string;
  fields: { key: string; label: string; placeholder: string; type?: string }[];
}

const integrations: Integration[] = [
  {
    id: "whatsapp",
    name: "WhatsApp Business API",
    description: "Send fee reminders, attendance alerts, and announcements via WhatsApp",
    icon: MessageSquare,
    status: "disconnected",
    category: "Messaging",
    fields: [
      { key: "phone_number_id", label: "Phone Number ID", placeholder: "Enter WhatsApp Phone Number ID" },
      { key: "access_token", label: "Access Token", placeholder: "Enter permanent access token", type: "password" },
      { key: "business_id", label: "Business Account ID", placeholder: "Enter Business Account ID" },
    ],
  },
  {
    id: "razorpay",
    name: "Razorpay",
    description: "Accept online fee payments via UPI, cards, and net banking",
    icon: CreditCard,
    status: "disconnected",
    category: "Payments",
    fields: [
      { key: "key_id", label: "Key ID", placeholder: "rzp_live_xxxxx" },
      { key: "key_secret", label: "Key Secret", placeholder: "Enter key secret", type: "password" },
    ],
  },
  {
    id: "smtp",
    name: "Email (SMTP)",
    description: "Send emails for notifications, reports, and communications",
    icon: Mail,
    status: "disconnected",
    category: "Email",
    fields: [
      { key: "host", label: "SMTP Host", placeholder: "smtp.gmail.com" },
      { key: "port", label: "Port", placeholder: "587" },
      { key: "username", label: "Username", placeholder: "your@email.com" },
      { key: "password", label: "Password", placeholder: "App password", type: "password" },
    ],
  },
  {
    id: "firebase",
    name: "Firebase Push Notifications",
    description: "Send push notifications to student and parent mobile apps",
    icon: Bell,
    status: "disconnected",
    category: "Notifications",
    fields: [
      { key: "project_id", label: "Project ID", placeholder: "your-firebase-project" },
      { key: "server_key", label: "Server Key", placeholder: "Enter FCM server key", type: "password" },
    ],
  },
  {
    id: "twilio",
    name: "Twilio SMS",
    description: "Send SMS notifications for attendance, fees, and alerts",
    icon: MessageSquare,
    status: "disconnected",
    category: "Messaging",
    fields: [
      { key: "account_sid", label: "Account SID", placeholder: "ACxxxxxxx" },
      { key: "auth_token", label: "Auth Token", placeholder: "Enter auth token", type: "password" },
      { key: "phone_number", label: "Phone Number", placeholder: "+91xxxxxxxxxx" },
    ],
  },
  {
    id: "google_sheets",
    name: "Google Sheets",
    description: "Import/export student data, attendance, and fee records",
    icon: FileText,
    status: "disconnected",
    category: "Data",
    fields: [
      { key: "service_account", label: "Service Account JSON", placeholder: "Paste service account JSON", type: "password" },
    ],
  },
  {
    id: "webhook",
    name: "Custom Webhook",
    description: "Send event data to any external URL for custom integrations",
    icon: Globe,
    status: "disconnected",
    category: "Developer",
    fields: [
      { key: "url", label: "Webhook URL", placeholder: "https://your-api.com/webhook" },
      { key: "secret", label: "Secret Key", placeholder: "Optional webhook secret", type: "password" },
    ],
  },
];

export default function IntegrationsPage() {
  const [statuses, setStatuses] = useState<Record<string, "connected" | "disconnected" | "error">>(
    Object.fromEntries(integrations.map((i) => [i.id, i.status]))
  );
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  const handleConnect = (integrationId: string) => {
    // Validate all fields have values
    const integration = integrations.find((i) => i.id === integrationId);
    if (!integration) return;
    const allFilled = integration.fields.every((f) => formValues[f.key]?.trim());
    if (!allFilled) {
      toast({ title: "Missing fields", description: "Please fill all required fields.", variant: "destructive" });
      return;
    }
    setStatuses((prev) => ({ ...prev, [integrationId]: "connected" }));
    setConfiguring(null);
    setFormValues({});
    toast({ title: "Connected!", description: `${integration.name} has been configured successfully.` });
  };

  const handleDisconnect = (integrationId: string) => {
    setStatuses((prev) => ({ ...prev, [integrationId]: "disconnected" }));
    toast({ title: "Disconnected", description: "Integration has been removed." });
  };

  const categories = [...new Set(integrations.map((i) => i.category))];

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Integrations</h2>
        <p className="text-sm text-muted-foreground">Connect external services to enhance InstituteOS</p>
      </div>

      {categories.map((category) => (
        <div key={category}>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{category}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {integrations
              .filter((i) => i.category === category)
              .map((integration) => {
                const status = statuses[integration.id];
                return (
                  <div key={integration.id} className="surface-elevated rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-md bg-primary/10 shrink-0">
                        <integration.icon className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-foreground truncate">{integration.name}</p>
                          <StatusBadge variant={status === "connected" ? "success" : status === "error" ? "destructive" : "default"}>
                            {status}
                          </StatusBadge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{integration.description}</p>
                        <div className="flex items-center gap-2 mt-3">
                          {status === "connected" ? (
                            <>
                              <Button variant="outline" size="sm" onClick={() => handleDisconnect(integration.id)}>
                                Disconnect
                              </Button>
                              <Button variant="ghost" size="sm">
                                <Settings2 className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          ) : (
                            <Dialog open={configuring === integration.id} onOpenChange={(open) => { setConfiguring(open ? integration.id : null); if (!open) setFormValues({}); }}>
                              <DialogTrigger asChild>
                                <Button size="sm" onClick={() => setConfiguring(integration.id)}>Configure</Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle className="flex items-center gap-2">
                                    <integration.icon className="w-5 h-5 text-primary" />
                                    Configure {integration.name}
                                  </DialogTitle>
                                </DialogHeader>
                                <div className="space-y-3 pt-2">
                                  {integration.fields.map((field) => (
                                    <div key={field.key}>
                                      <Label className="text-xs">{field.label}</Label>
                                      <Input
                                        type={field.type || "text"}
                                        placeholder={field.placeholder}
                                        value={formValues[field.key] || ""}
                                        onChange={(e) => setFormValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                                        className="mt-1"
                                      />
                                    </div>
                                  ))}
                                  <Button className="w-full" onClick={() => handleConnect(integration.id)}>
                                    <Check className="w-4 h-4 mr-1" /> Connect
                                  </Button>
                                </div>
                              </DialogContent>
                            </Dialog>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
