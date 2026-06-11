// ============================================================================
// WhatsApp Manager Page
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useAuth, AdminUser } from '@/contexts/AuthContext';
import { useWhatsAppSessions, useWhatsAppContacts, useWhatsAppTemplates, useWhatsAppMessages } from '@/hooks/useWhatsApp';
import { useWallet, useWalletAnalytics } from '@/hooks/useWallet';
import { getOpenWAService } from '@/lib/openwa-service';
import { getWalletService } from '@/lib/wallet-service';
import { supabase } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';

// UI Components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';

// Icons
import {
  MessageCircle, QrCode, Phone, Settings, Plus, Upload, Download, Send, Loader2,
  AlertCircle, CheckCircle, Trash2, Edit2, Archive, Users, Zap, TrendingUp,
  RefreshCw, Eye, EyeOff, Copy, Smartphone
} from 'lucide-react';

type TabName = 'connection' | 'contacts' | 'messaging' | 'templates' | 'history' | 'analytics';

interface FormState {
  sessionName: string;
  contactName: string;
  contactPhone: string;
  contactGroup: string;
  messageContent: string;
  templateName: string;
  templateContent: string;
}

export default function WhatsAppManagerPage() {
  // ========================================================================
  // CONTEXT & HOOKS
  // ========================================================================
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const instituteId = isAdmin ? (user as AdminUser).instituteId : '';

  // WhatsApp hooks
  const { sessions, activeSession, loading: sessionsLoading, createSession, getQRCode, disconnectSession } = useWhatsAppSessions(instituteId);
  const { contacts, loading: contactsLoading, fetchContacts, addContact } = useWhatsAppContacts(instituteId);
  const { templates, loading: templatesLoading, createTemplate } = useWhatsAppTemplates(instituteId);
  const { messages, loading: messagesLoading, fetchMessages, sendMessage } = useWhatsAppMessages(instituteId);

  // Wallet hooks
  const { wallet, balance, loading: walletLoading, deductCredits } = useWallet(instituteId);
  const { dailyUsage, monthlyUsage } = useWalletAnalytics(instituteId);

  // ========================================================================
  // LOCAL STATE
  // ========================================================================
  const [activeTab, setActiveTab] = useState<TabName>('connection');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [formState, setFormState] = useState<FormState>({
    sessionName: '',
    contactName: '',
    contactPhone: '',
    contactGroup: '',
    messageContent: '',
    templateName: '',
    templateContent: '',
  });
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);

  // ========================================================================
  // SECTION 1: WHATSAPP CONNECTION
  // ========================================================================

  const handleCreateSession = async () => {
    if (!formState.sessionName) {
      toast({ title: 'Error', description: 'Please enter session name', variant: 'destructive' });
      return;
    }
    try {
      const newSession = await createSession(formState.sessionName);
      const qr = await getQRCode(newSession.session_id);
      setQrCode(qr.qr_code);
      setShowQrModal(true);
      setFormState({ ...formState, sessionName: '' });
      toast({ title: 'Success', description: 'WhatsApp session created! Scan QR code to connect.' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleDisconnect = async (sessionId: string) => {
    try {
      await disconnectSession(sessionId);
      toast({ title: 'Success', description: 'Session disconnected' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const renderConnectionSection = () => (
    <div className="space-y-6">
      {/* Current Session Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5" />
            Active Session
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeSession ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Session Name</p>
                  <p className="font-semibold">{activeSession.session_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Phone Number</p>
                  <p className="font-semibold">{activeSession.phone_number || 'Not connected'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <StatusBadge status={activeSession.status} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Last Activity</p>
                  <p className="text-sm">{new Date(activeSession.last_activity_at || activeSession.created_at).toLocaleString()}</p>
                </div>
              </div>
              <div className="flex gap-2">
                {activeSession.status === 'active' && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDisconnect(activeSession.id)}
                    disabled={sessionsLoading}
                  >
                    Disconnect
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No active WhatsApp session</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create New Session */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Create New Session
          </CardTitle>
          <CardDescription>Connect a new WhatsApp account</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Session Name</label>
              <Input
                placeholder="e.g., Main Account"
                value={formState.sessionName}
                onChange={(e) => setFormState({ ...formState, sessionName: e.target.value })}
              />
            </div>
            <Button
              onClick={sendNow}
              disabled={!activeSession || selectedContacts.length === 0 || sending}
              className="w-full"
            >
              {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Send Now
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Session History */}
      {sessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Session History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sessions.map((session) => (
                <div key={session.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium">{session.session_name}</p>
                    <p className="text-sm text-muted-foreground">{session.phone_number || 'Not connected'}</p>
                  </div>
                  <StatusBadge status={session.status} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  // ========================================================================
  // SECTION 2: CONTACTS MANAGEMENT
  // ========================================================================

  const handleAddContact = async () => {
    if (!formState.contactName || !formState.contactPhone) {
      toast({ title: 'Error', description: 'Please fill all fields', variant: 'destructive' });
      return;
    }
    try {
      await addContact({
        name: formState.contactName,
        phone: formState.contactPhone,
        group_name: formState.contactGroup || undefined,
      });
      setFormState({
        ...formState,
        contactName: '',
        contactPhone: '',
        contactGroup: '',
      });
      toast({ title: 'Success', description: 'Contact added successfully' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const renderContactsSection = () => (
    <div className="space-y-6">
      {/* Add Contact */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Add New Contact
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                placeholder="Contact Name"
                value={formState.contactName}
                onChange={(e) => setFormState({ ...formState, contactName: e.target.value })}
              />
              <Input
                placeholder="Phone Number"
                value={formState.contactPhone}
                onChange={(e) => setFormState({ ...formState, contactPhone: e.target.value })}
              />
              <Input
                placeholder="Group Name (optional)"
                value={formState.contactGroup}
                onChange={(e) => setFormState({ ...formState, contactGroup: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAddContact} className="flex-1" disabled={contactsLoading}>
                {contactsLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                Add Contact
              </Button>
              <Button variant="outline" className="flex-1">
                <Upload className="w-4 h-4 mr-2" />
                Import CSV
              </Button>
              <Button variant="outline" className="flex-1">
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contacts Table */}
      <Card>
        <CardHeader>
          <CardTitle>Contacts ({contacts.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {contacts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Name</th>
                    <th className="text-left py-2">Phone</th>
                    <th className="text-left py-2">Group</th>
                    <th className="text-left py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.slice(0, 10).map((contact) => (
                    <tr key={contact.id} className="border-b hover:bg-muted">
                      <td className="py-2">{contact.name}</td>
                      <td className="py-2">{contact.phone}</td>
                      <td className="py-2">{contact.group_name || '-'}</td>
                      <td className="py-2">
                        <Button variant="ghost" size="sm">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No contacts yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  // ========================================================================
  // SECTION 3: BULK MESSAGING
  // ========================================================================

  const renderMessagingSection = () => (
    <div className="space-y-6">
      {/* Wallet Balance Card */}
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-900">
            <Zap className="w-5 h-5" />
            Wallet Balance
          </CardTitle>
        </CardHeader>
        <CardContent className="text-amber-900">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm opacity-75">Available Credits</p>
              <p className="text-3xl font-bold">{balance}</p>
            </div>
            <div>
              <p className="text-sm opacity-75">Used Today</p>
              <p className="text-2xl font-bold">{dailyUsage}</p>
            </div>
            <div>
              <p className="text-sm opacity-75">Used This Month</p>
              <p className="text-2xl font-bold">{monthlyUsage}</p>
            </div>
          </div>
          {balance < 50 && (
            <div className="mt-4 p-3 bg-yellow-100 text-yellow-800 rounded flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              <span>Low balance warning. Please contact administrator.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Send Message */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="w-5 h-5" />
            Send Bulk Message
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Message Content</label>
              <Textarea
                placeholder="Enter your message here..."
                value={formState.messageContent}
                onChange={(e) => setFormState({ ...formState, messageContent: e.target.value })}
                className="min-h-24"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Select Recipients</label>
              <div className="border rounded-lg p-4 max-h-48 overflow-y-auto space-y-2">
                {contacts.map((contact) => (
                  <label key={contact.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedContacts.includes(contact.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedContacts([...selectedContacts, contact.id]);
                        } else {
                          setSelectedContacts(selectedContacts.filter((id) => id !== contact.id));
                        }
                      }}
                    />
                    <span>{contact.name} ({contact.phone})</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              Selected: {selectedContacts.length} contacts | Credits needed: {selectedContacts.length}
              {selectedContacts.length > balance && (
                <span className="text-red-500 ml-2">⚠️ Insufficient credits!</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const sendNow = async () => {
    if (!activeSession || selectedContacts.length === 0) return;
    if (balance < selectedContacts.length) {
      toast({ title: 'Insufficient Credits', description: 'Buy more credits to continue.', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const walletService = getWalletService();
      const result = await walletService.deductCredits(
        instituteId,
        selectedContacts.length,
        `Bulk WhatsApp send to ${selectedContacts.length} contacts`,
        'whatsapp_message',
      );
      if (!result.success) {
        toast({ title: 'Payment Failed', description: result.message, variant: 'destructive' });
        setSending(false);
        return;
      }
      toast({ title: 'Queued', description: `${selectedContacts.length} message(s) credited and queued.` });
      setSelectedContacts([]);
      setFormState((prev) => ({ ...prev, messageContent: '' }));
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  // ========================================================================
  // SECTION 4: TEMPLATES
  // ========================================================================

  const handleCreateTemplate = async () => {
    if (!formState.templateName || !formState.templateContent) {
      toast({ title: 'Error', description: 'Please fill all fields', variant: 'destructive' });
      return;
    }
    try {
      await createTemplate({
        name: formState.templateName,
        content: formState.templateContent,
      });
      setFormState({
        ...formState,
        templateName: '',
        templateContent: '',
      });
      toast({ title: 'Success', description: 'Template created successfully' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const renderTemplatesSection = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Create Template
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Input
              placeholder="Template Name"
              value={formState.templateName}
              onChange={(e) => setFormState({ ...formState, templateName: e.target.value })}
            />
            <Textarea
              placeholder="Template Content"
              value={formState.templateContent}
              onChange={(e) => setFormState({ ...formState, templateContent: e.target.value })}
              className="min-h-24"
            />
            <Button onClick={handleCreateTemplate} disabled={templatesLoading} className="w-full">
              {templatesLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Create Template
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Templates ({templates.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {templates.length > 0 ? (
            <div className="space-y-3">
              {templates.map((template) => (
                <div key={template.id} className="p-4 border rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-semibold">{template.name}</p>
                      <p className="text-sm text-muted-foreground mt-1">{template.content}</p>
                    </div>
                    <Badge variant={template.is_approved ? 'default' : 'outline'}>
                      {template.is_approved ? 'Approved' : 'Pending'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">No templates yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );

  // ========================================================================
  // SECTION 5: MESSAGE HISTORY
  // ========================================================================

  const renderHistorySection = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Message History</CardTitle>
        </CardHeader>
        <CardContent>
          {messages.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Recipient</th>
                    <th className="text-left py-2">Message</th>
                    <th className="text-left py-2">Status</th>
                    <th className="text-left py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {messages.slice(0, 20).map((msg) => (
                    <tr key={msg.id} className="border-b hover:bg-muted">
                      <td className="py-2">{msg.recipient_phone}</td>
                      <td className="py-2 truncate max-w-xs">{msg.message_content}</td>
                      <td className="py-2">
                        <StatusBadge status={msg.status} />
                      </td>
                      <td className="py-2 text-xs">{new Date(msg.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">No messages yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );

  // ========================================================================
  // SECTION 6: ANALYTICS
  // ========================================================================

  const renderAnalyticsSection = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard
          icon={MessageCircle}
          title="Total Messages"
          value={messages.length.toString()}
          description="All time"
        />
        <StatCard
          icon={CheckCircle}
          title="Delivered"
          value={messages.filter((m) => m.status === 'delivered').length.toString()}
          description={`${Math.round((messages.filter((m) => m.status === 'delivered').length / messages.length || 0) * 100)}% success rate`}
        />
        <StatCard
          icon={Users}
          title="Active Contacts"
          value={contacts.length.toString()}
          description="Total contacts"
        />
        <StatCard
          icon={Zap}
          title="Credits Used This Month"
          value={monthlyUsage.toString()}
          description={`Balance: ${balance}`}
        />
      </div>
    </div>
  );

  // ========================================================================
  // QR CODE MODAL
  // ========================================================================

  const renderQRModal = () => (
    <Dialog open={showQrModal} onOpenChange={setShowQrModal}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Scan QR Code</DialogTitle>
        </DialogHeader>
        {qrCode ? (
          <div className="flex justify-center py-4">
            <img
              src={`data:image/png;base64,${qrCode}`}
              alt="WhatsApp QR Code"
              className="w-64 h-64 border-2 border-dashed"
            />
          </div>
        ) : (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        )}
        <p className="text-sm text-muted-foreground text-center">
          Scan this QR code with your WhatsApp mobile app to connect your account
        </p>
        <DialogFooter>
          <Button onClick={() => setShowQrModal(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // ========================================================================
  // MAIN RENDER
  // ========================================================================

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-2 text-red-500" />
          <p>Only admins can access this page</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2 mb-2">
          <MessageCircle className="w-8 h-8 text-green-500" />
          WhatsApp Manager
        </h1>
        <p className="text-muted-foreground">
          Manage WhatsApp sessions, contacts, and bulk messaging
        </p>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabName)}>
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-6">
          <TabsTrigger value="connection">Connection</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="messaging">Messaging</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="connection">{renderConnectionSection()}</TabsContent>
          <TabsContent value="contacts">{renderContactsSection()}</TabsContent>
          <TabsContent value="messaging">{renderMessagingSection()}</TabsContent>
          <TabsContent value="templates">{renderTemplatesSection()}</TabsContent>
          <TabsContent value="history">{renderHistorySection()}</TabsContent>
          <TabsContent value="analytics">{renderAnalyticsSection()}</TabsContent>
        </div>
      </Tabs>

      {/* QR Code Modal */}
      {renderQRModal()}
    </div>
  );
}
