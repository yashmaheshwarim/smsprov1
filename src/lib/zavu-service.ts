import { supabase, isUuid } from './supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ZavuChannel = 'sms' | 'sms_oneway' | 'whatsapp' | 'email' | 'voice' | 'telegram' | 'instagram' | 'auto' | 'smart';

export interface ZavuMessageParams {
  to: string;
  text?: string;
  channel?: ZavuChannel;
  subject?: string;           // email
  htmlBody?: string;          // email
  messageType?: 'text' | 'image' | 'video' | 'audio' | 'document' | 'buttons' | 'list' | 'template';
  content?: Record<string, any>;
  idempotencyKey?: string;
  voiceLanguage?: string;
}

export interface ZavuMessageResult {
  message: { id: string; status: string };
}

export interface ZavuBroadcast {
  id: string;
  name: string;
  channel: string;
  status: string;
  createdAt?: string;
}

export interface ZavuBroadcastProgress {
  percentComplete: number;
  delivered: number;
  failed: number;
  pending: number;
  total: number;
  estimatedCompletionAt?: string;
}

export interface ZavuContact {
  id: string;
  displayName: string;
  availableChannels: string[];
  channels: { channel: string; identifier: string; isPrimary: boolean }[];
}

export interface ZavuTemplate {
  id: string;
  name: string;
  body: string;
  status: string;          // draft | pending | approved | rejected
  language: string;
  whatsappCategory?: string;
  variables?: string[];
}

export interface ZavuPhoneNumber {
  id: string;
  phoneNumber: string;
  friendlyName?: string;
  status: string;
  capabilities?: { sms: boolean; voice: boolean; mms: boolean };
}

export interface ZavuSender {
  id: string;
  name: string;
  phoneNumber?: string;
  status: string;
}

export interface IntegrationConfig {
  id?: string;
  institute_id: string;
  provider: string;
  config: Record<string, any>;
  status: 'connected' | 'disconnected' | 'error';
}

// ─── Configuration helpers ───────────────────────────────────────────────────

export async function getZavuConfig(instituteId: string): Promise<IntegrationConfig | null> {
  if (!isUuid(instituteId)) return null;

  const { data, error } = await supabase
    .from('institute_integrations')
    .select('*')
    .eq('institute_id', instituteId)
    .eq('provider', 'zavu')
    .maybeSingle();

  if (error || !data) return null;
  return data as IntegrationConfig;
}

export async function saveZavuConfig(
  instituteId: string,
  apiKey: string,
  status: 'connected' | 'disconnected' | 'error' = 'connected'
): Promise<boolean> {
  const { error } = await supabase
    .from('institute_integrations')
    .upsert(
      {
        institute_id: instituteId,
        provider: 'zavu',
        config: { api_key: apiKey },
        status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'institute_id,provider' }
    );

  return !error;
}

export async function disconnectZavu(instituteId: string): Promise<boolean> {
  const { error } = await supabase
    .from('institute_integrations')
    .update({ status: 'disconnected', config: {}, updated_at: new Date().toISOString() })
    .eq('institute_id', instituteId)
    .eq('provider', 'zavu');

  return !error;
}

// ─── Zavu API Service ────────────────────────────────────────────────────────

const ZAVU_BASE = 'https://api.zavu.dev/v1';

export class ZavuService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(method: string, path: string, body?: any): Promise<T> {
    const res = await fetch(`${ZAVU_BASE}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
      throw new Error(err?.error?.message || err?.message || `Zavu API error: ${res.status}`);
    }

    return res.json();
  }

  // ── Validation ──────────────────────────────────────────────────────────

  async validateKey(): Promise<boolean> {
    try {
      await this.request<any>('GET', '/senders?limit=1');
      return true;
    } catch {
      return false;
    }
  }

  // ── Messages ────────────────────────────────────────────────────────────

  async sendMessage(params: ZavuMessageParams): Promise<ZavuMessageResult> {
    return this.request<ZavuMessageResult>('POST', '/messages', params);
  }

  async getMessage(messageId: string) {
    return this.request<{ message: { id: string; status: string; to: string; text: string } }>(
      'GET', `/messages/${messageId}`
    );
  }

  async listMessages(params?: { status?: string; limit?: number; cursor?: string }) {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.cursor) qs.set('cursor', params.cursor);
    const q = qs.toString();
    return this.request<{ items: any[]; nextCursor?: string }>('GET', `/messages${q ? `?${q}` : ''}`);
  }

  // ── Broadcasts ──────────────────────────────────────────────────────────

  async createBroadcast(params: { name: string; channel: ZavuChannel; text: string; emailSubject?: string }) {
    return this.request<{ broadcast: ZavuBroadcast }>('POST', '/broadcasts', params);
  }

  async addBroadcastContacts(broadcastId: string, contacts: { recipient: string; templateVariables?: Record<string, string> }[]) {
    return this.request<{ added: number; duplicates: number; invalid: number }>(
      'POST', '/broadcasts/contacts', { broadcastId, contacts }
    );
  }

  async sendBroadcast(broadcastId: string, scheduledAt?: string) {
    return this.request<any>('POST', '/broadcasts/send', { broadcastId, ...(scheduledAt ? { scheduledAt } : {}) });
  }

  async getBroadcastProgress(broadcastId: string) {
    return this.request<ZavuBroadcastProgress>('GET', `/broadcasts/${broadcastId}/progress`);
  }

  async listBroadcasts(params?: { limit?: number; cursor?: string }) {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.cursor) qs.set('cursor', params.cursor);
    const q = qs.toString();
    return this.request<{ items: ZavuBroadcast[]; nextCursor?: string }>('GET', `/broadcasts${q ? `?${q}` : ''}`);
  }

  async cancelBroadcast(broadcastId: string) {
    return this.request<any>('POST', '/broadcasts/cancel', { broadcastId });
  }

  // ── Contacts ────────────────────────────────────────────────────────────

  async createContact(params: { displayName: string; channels: { channel: string; identifier: string; isPrimary?: boolean }[]; metadata?: Record<string, string> }) {
    return this.request<{ id: string }>('POST', '/contacts', params);
  }

  async listContacts(params?: { phoneNumber?: string; limit?: number; cursor?: string }) {
    const qs = new URLSearchParams();
    if (params?.phoneNumber) qs.set('phoneNumber', params.phoneNumber);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.cursor) qs.set('cursor', params.cursor);
    const q = qs.toString();
    return this.request<{ items: ZavuContact[]; nextCursor?: string }>('GET', `/contacts${q ? `?${q}` : ''}`);
  }

  async getContactByPhone(phone: string) {
    return this.request<ZavuContact>('GET', `/contacts/phone/${encodeURIComponent(phone)}`);
  }

  // ── Templates ───────────────────────────────────────────────────────────

  async createTemplate(params: { name: string; language: string; body: string; whatsappCategory: string; variables?: string[]; buttons?: any[] }) {
    return this.request<{ id: string; status: string }>('POST', '/templates', params);
  }

  async listTemplates(params?: { limit?: number; cursor?: string }) {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.cursor) qs.set('cursor', params.cursor);
    const q = qs.toString();
    return this.request<{ items: ZavuTemplate[]; nextCursor?: string }>('GET', `/templates${q ? `?${q}` : ''}`);
  }

  async submitTemplate(templateId: string, senderId: string, category: string) {
    return this.request<{ status: string }>('POST', '/templates/submit', { templateId, senderId, category });
  }

  async deleteTemplate(templateId: string) {
    return this.request<void>('DELETE', `/templates/${templateId}`);
  }

  // ── Phone Numbers ───────────────────────────────────────────────────────

  async listPhoneNumbers(params?: { status?: string }) {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    const q = qs.toString();
    return this.request<{ items: ZavuPhoneNumber[] }>('GET', `/phone-numbers${q ? `?${q}` : ''}`);
  }

  async searchAvailableNumbers(params: { countryCode: string; type?: string; contains?: string; limit?: number }) {
    const qs = new URLSearchParams();
    qs.set('countryCode', params.countryCode);
    if (params.type) qs.set('type', params.type);
    if (params.contains) qs.set('contains', params.contains);
    if (params.limit) qs.set('limit', String(params.limit));
    return this.request<{ items: ZavuPhoneNumber[] }>('GET', `/phone-numbers/available?${qs.toString()}`);
  }

  // ── Senders ─────────────────────────────────────────────────────────────

  async listSenders(params?: { limit?: number }) {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return this.request<{ items: ZavuSender[] }>('GET', `/senders${q ? `?${q}` : ''}`);
  }
}

// ── Factory: create ZavuService from institute ID ─────────────────────────

export async function createZavuServiceForInstitute(instituteId: string): Promise<ZavuService | null> {
  const config = await getZavuConfig(instituteId);
  if (!config || config.status !== 'connected' || !config.config?.api_key) return null;
  return new ZavuService(config.config.api_key);
}
