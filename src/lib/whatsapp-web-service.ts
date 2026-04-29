import { supabase, isUuid } from './supabase';

export interface WhatsAppWebMessageParams {
  to: string;
  text: string;
}

export interface WhatsAppWebMessageResult {
  id: string;
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

export async function getWhatsAppWebConfig(instituteId: string): Promise<IntegrationConfig | null> {
  if (!isUuid(instituteId)) return null;

  const { data, error } = await supabase
    .from('institute_integrations')
    .select('*')
    .eq('institute_id', instituteId)
    .eq('provider', 'whatsapp_web')
    .maybeSingle();

  if (error || !data) return null;
  return data as IntegrationConfig;
}

export async function saveWhatsAppWebConfig(
  instituteId: string,
  token: string,
  instanceId: string,
  status: 'connected' | 'disconnected' | 'error' = 'connected'
): Promise<boolean> {
  const { error } = await supabase
    .from('institute_integrations')
    .upsert(
      {
        institute_id: instituteId,
        provider: 'whatsapp_web',
        config: { token, instance_id: instanceId },
        status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'institute_id,provider' }
    );

  return !error;
}

export async function disconnectWhatsAppWeb(instituteId: string): Promise<boolean> {
  const { error } = await supabase
    .from('institute_integrations')
    .update({ status: 'disconnected', config: {}, updated_at: new Date().toISOString() })
    .eq('institute_id', instituteId)
    .eq('provider', 'whatsapp_web');

  return !error;
}

// ─── WhatsApp Web API Service ────────────────────────────────────────────────

const ULTRAMSG_BASE = 'https://api.ultramsg.com';

export class WhatsAppWebService {
  private token: string;
  private instanceId: string;

  constructor(token: string, instanceId: string) {
    this.token = token;
    this.instanceId = instanceId;
  }

  private async request<T>(method: string, path: string, body?: any): Promise<T> {
    const url = `${ULTRAMSG_BASE}/${this.instanceId}${path}?token=${this.token}`;
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err?.error || `WhatsApp Web API error: ${res.status}`);
    }

    return res.json();
  }

  // ── Validation ──────────────────────────────────────────────────────────

  async validateKey(): Promise<boolean> {
    try {
      await this.request<any>('GET', '/instance/status');
      return true;
    } catch {
      return false;
    }
  }

  // ── Messages ────────────────────────────────────────────────────────────

  async sendMessage(params: WhatsAppWebMessageParams): Promise<WhatsAppWebMessageResult> {
    const body = {
      to: params.to,
      body: params.text,
    };
    const result = await this.request<any>('POST', '/messages/chat', body);
    return {
      id: result.id || result.messageId,
      status: result.status || 'sent',
    };
  }

  async getInstanceStatus() {
    return this.request<any>('GET', '/instance/status');
  }

  async getQRCode() {
    return this.request<{ qr: string }>('GET', '/instance/qr');
  }
}

// ── Factory: create WhatsAppWebService from institute ID ───────────────────

export async function createWhatsAppWebServiceForInstitute(instituteId: string): Promise<WhatsAppWebService | null> {
  const config = await getWhatsAppWebConfig(instituteId);
  if (!config || config.status !== 'connected' || !config.config?.token || !config.config?.instance_id) return null;
  return new WhatsAppWebService(config.config.token, config.config.instance_id);
}