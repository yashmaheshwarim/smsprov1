// ============================================================================
// API Keys Panel - Generate & manage institute API keys for n8n integrations
// ============================================================================

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Key, Plus, Copy, Trash2, Eye, EyeOff, ExternalLink, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

// Generate a cryptographically strong random API key
// Format: apex_<prefix>_<random64>
function generateApiKey(): string {
  const prefix = Math.random().toString(36).substring(2, 8);
  const randomPart = Array.from({ length: 32 }, () =>
    Math.random().toString(36).substring(2, 3)
  ).join('');
  return `apex_${prefix}_${randomPart}`;
}

interface ApiKey {
  id: string;
  institute_id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  is_active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

interface ApiKeysPanelProps {
  instituteId: string;
}

const AVAILABLE_SCOPES = [
  { value: 'whatsapp:send', label: 'Send WhatsApp Messages' },
  { value: 'whatsapp:read', label: 'Read WhatsApp Balance' },
  { value: 'students:read', label: 'List/View Students' },
  { value: 'fees:read', label: 'View Pending Fees' },
  { value: 'sms:send', label: 'Send SMS' },
];

export default function ApiKeysPanel({ instituteId }: ApiKeysPanelProps) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>([]);
  const [newKeyExpiresDays, setNewKeyExpiresDays] = useState('30');
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('institute_api_keys')
        .select('*')
        .eq('institute_id', instituteId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setKeys(data || []);
    } catch (err: any) {
      console.error('Failed to fetch API keys:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (instituteId) {
      fetchKeys();
    }
  }, [instituteId]);

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      toast({ title: 'Error', description: 'Please enter a key name', variant: 'destructive' });
      return;
    }

    setCreating(true);
    try {
      const rawKey = generateApiKey();
      const keyPrefix = rawKey.substring(0, 12);
      const keyHash = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawKey)))
      ).map(b => b.toString(16).padStart(2, '0')).join('');

      // Calculate expiration
      let expiresAt: string | null = null;
      if (newKeyExpiresDays && parseInt(newKeyExpiresDays) > 0) {
        const date = new Date();
        date.setDate(date.getDate() + parseInt(newKeyExpiresDays));
        expiresAt = date.toISOString();
      }

      const { error } = await supabase.from('institute_api_keys').insert({
        institute_id: instituteId,
        name: newKeyName.trim(),
        key_prefix: keyPrefix,
        key_hash: keyHash,
        scopes: newKeyScopes,
        expires_at: expiresAt,
      });

      if (error) throw error;

      setGeneratedKey(rawKey);
      toast({
        title: 'API Key Created',
        description: 'Copy this key now - it will not be shown again!',
      });

      await fetchKeys();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    try {
      const { error } = await supabase
        .from('institute_api_keys')
        .update({ is_active: false })
        .eq('id', keyId);

      if (error) throw error;
      await fetchKeys();
      toast({ title: 'Key Revoked', description: 'API key has been deactivated' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    try {
      const { error } = await supabase
        .from('institute_api_keys')
        .delete()
        .eq('id', keyId);

      if (error) throw error;
      setKeys(prev => prev.filter(k => k.id !== keyId));
      toast({ title: 'Key Deleted', description: 'API key has been permanently deleted' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied', description: 'Copied to clipboard' });
  };

  const toggleScope = (scope: string) => {
    setNewKeyScopes(prev =>
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
    );
  };

  const closeGeneratedKey = () => {
    setGeneratedKey(null);
    setShowCreateDialog(false);
    setNewKeyName('');
    setNewKeyScopes([]);
    setNewKeyExpiresDays('30');
  };

  if (!instituteId) return null;

  return (
    <div className="space-y-6">
      {/* Info Card */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <ExternalLink className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-800">n8n Integration Ready</p>
              <p className="text-xs text-blue-700 mt-1">
                Use these API keys with n8n to securely access institute-scoped data.
                The base URL is: <code className="bg-blue-100 px-1 rounded">https://apexsms.netlify.app/api/n8n/</code>
              </p>
              <p className="text-xs text-blue-600 mt-1">
                Pass the API key as: <code className="bg-blue-100 px-1 rounded">{'Authorization: Bearer <your-api-key>'}</code>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create Key Button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">API Keys ({keys.length})</h3>
          <p className="text-xs text-muted-foreground">Manage keys for external integrations (n8n, etc.)</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} size="sm">
          <Plus className="w-4 h-4 mr-1" /> Generate New Key
        </Button>
      </div>

      {/* Keys List */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : keys.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Key className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No API keys generated yet</p>
            <p className="text-xs mt-1">Generate a key to enable n8n integrations</p>
          </div>
        ) : (
          keys.map((key) => (
            <div key={key.id} className="flex items-center justify-between p-4 border rounded-lg bg-card">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{key.name}</p>
                  <StatusBadge variant={key.is_active ? 'success' : 'secondary'}>
                    {key.is_active ? 'Active' : 'Revoked'}
                  </StatusBadge>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">
                    {key.key_prefix}...
                  </code>
                  <span className="text-xs text-muted-foreground">
                    Created: {new Date(key.created_at).toLocaleDateString()}
                  </span>
                  {key.last_used_at && (
                    <span className="text-xs text-muted-foreground">
                      Last used: {new Date(key.last_used_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {key.scopes && key.scopes.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {key.scopes.map(scope => (
                      <span key={scope} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                        {scope}
                      </span>
                    ))}
                  </div>
                )}
                {key.expires_at && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Expires: {new Date(key.expires_at).toLocaleDateString()}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-4">
                {key.is_active && (
                  <Button variant="ghost" size="sm" onClick={() => handleRevokeKey(key.id)} className="h-8 w-8 p-0">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => handleDeleteKey(key.id)} className="h-8 w-8 p-0">
                  <Trash2 className="w-4 h-4 text-muted-foreground" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Key Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              Generate New API Key
            </DialogTitle>
          </DialogHeader>

          {generatedKey ? (
            <div className="space-y-4 pt-2">
              <div className="p-4 border-2 border-amber-200 bg-amber-50 rounded-lg">
                <div className="flex items-center gap-2 text-amber-800 mb-2">
                  <AlertCircle className="w-5 h-5" />
                  <p className="text-sm font-semibold">Copy this key now!</p>
                </div>
                <p className="text-xs text-amber-700 mb-3">
                  This is the only time you'll see this key. It cannot be retrieved later.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-white border p-2 rounded font-mono break-all select-all">
                    {generatedKey}
                  </code>
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(generatedKey)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 text-green-800 mb-2">
                  <CheckCircle2 className="w-5 h-5" />
                  <p className="text-sm font-semibold">n8n Setup</p>
                </div>
                <p className="text-xs text-green-700 mb-2">Add this HTTP Request node in n8n:</p>
                <div className="text-xs space-y-1 font-mono bg-green-100 p-2 rounded">
                  <p><span className="text-green-600">URL:</span> https://apexsms.netlify.app/api/n8n/whatsapp/send</p>
                  <p><span className="text-green-600">Method:</span> POST</p>
                  <p><span className="text-green-600">Header:</span> {'Authorization: Bearer <your-api-key>'}</p>
                </div>
              </div>

              <DialogFooter>
                <Button onClick={closeGeneratedKey} className="w-full">Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              <div>
                <Label className="text-xs">Key Name</Label>
                <Input
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g., n8n Production"
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs">Expires In</Label>
                <Select value={newKeyExpiresDays} onValueChange={setNewKeyExpiresDays}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select expiry" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="365">1 year</SelectItem>
                    <SelectItem value="0">Never expires</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Permissions (optional - leave empty for full access)</Label>
                <div className="grid grid-cols-1 gap-2 mt-2">
                  {AVAILABLE_SCOPES.map(scope => (
                    <label key={scope.value} className="flex items-center gap-2 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={newKeyScopes.includes(scope.value)}
                        onChange={() => toggleScope(scope.value)}
                        className="rounded"
                      />
                      {scope.label}
                    </label>
                  ))}
                </div>
              </div>

              <Button
                className="w-full"
                onClick={handleCreateKey}
                disabled={creating || !newKeyName.trim()}
              >
                {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Key className="w-4 h-4 mr-2" />}
                Generate API Key
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}