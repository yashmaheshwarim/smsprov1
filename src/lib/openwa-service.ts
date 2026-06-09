// ============================================================================
// OpenWA Service - Backend API Integration
// ============================================================================

import { supabase } from './supabase';
import {
  WhatsAppSession,
  QRCodeResponse,
  OpenWASessionResponse,
  OpenWAMessageResponse,
  SendMessageRequest,
  SendBulkMessageRequest,
  MessageResponse,
  ApiResponse,
} from '@/types/whatsapp';

const OPENWA_API_URL = import.meta.env.VITE_OPENWA_API_URL || 'http://16.16.142.42:2785';
const OPENWA_API_KEY = import.meta.env.VITE_OPENWA_API_KEY || '';

interface OpenWAServiceConfig {
  apiUrl: string;
  apiKey?: string;
}

class OpenWAService {
  private apiUrl: string;
  private apiKey?: string;

  constructor(config?: Partial<OpenWAServiceConfig>) {
    this.apiUrl = config?.apiUrl || OPENWA_API_URL;
    this.apiKey = config?.apiKey || OPENWA_API_KEY;
  }

  // ========================================================================
  // SESSION MANAGEMENT
  // ========================================================================

  /**
   * Create a new WhatsApp session
   */
  async createSession(instituteId: string, sessionName: string): Promise<WhatsAppSession> {
    try {
      const response = await fetch(`${this.apiUrl}/sessions/create`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          sessionId: `${instituteId}-${sessionName}-${Date.now()}`,
          name: sessionName,
          instituteId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create session: ${response.statusText}`);
      }

      const data: OpenWASessionResponse = await response.json();

      // Save to database
      const { data: session, error } = await supabase
        .from('whatsapp_sessions')
        .insert({
          institute_id: instituteId,
          session_id: data.sessionId,
          session_name: sessionName,
          qr_code: data.qrCode || null,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;

      return session;
    } catch (error) {
      console.error('Error creating WhatsApp session:', error);
      throw error;
    }
  }

  /**
   * Get QR code for session
   */
  async getQRCode(sessionId: string): Promise<QRCodeResponse> {
    try {
      const response = await fetch(`${this.apiUrl}/sessions/${sessionId}/qr`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to get QR code: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        qr_code: data.qrCode,
        session_id: sessionId,
        status: data.status || 'pending',
      };
    } catch (error) {
      console.error('Error fetching QR code:', error);
      throw error;
    }
  }

  /**
   * Get session status
   */
  async getSessionStatus(sessionId: string): Promise<WhatsAppSession | null> {
    try {
      // First get from database
      const { data: dbSession } = await supabase
        .from('whatsapp_sessions')
        .select('*')
        .eq('session_id', sessionId)
        .single();

      if (!dbSession) return null;

      // Then check with OpenWA API
      const response = await fetch(`${this.apiUrl}/sessions/${sessionId}/status`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.ok) {
        const apiData = await response.json();

        // Update in database
        const { data: updated } = await supabase
          .from('whatsapp_sessions')
          .update({
            status: apiData.status,
            phone_number: apiData.phoneNumber,
            last_activity_at: new Date().toISOString(),
          })
          .eq('session_id', sessionId)
          .select()
          .single();

        return updated || dbSession;
      }

      return dbSession;
    } catch (error) {
      console.error('Error fetching session status:', error);
      throw error;
    }
  }

  /**
   * Disconnect session
   */
  async disconnectSession(sessionId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/sessions/${sessionId}/disconnect`, {
        method: 'POST',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to disconnect session: ${response.statusText}`);
      }

      // Update in database
      await supabase
        .from('whatsapp_sessions')
        .update({
          status: 'disconnected',
          phone_number: null,
          qr_code: null,
        })
        .eq('session_id', sessionId);

      return true;
    } catch (error) {
      console.error('Error disconnecting session:', error);
      throw error;
    }
  }

  /**
   * Reconnect session
   */
  async reconnectSession(sessionId: string): Promise<QRCodeResponse> {
    try {
      const response = await fetch(`${this.apiUrl}/sessions/${sessionId}/reconnect`, {
        method: 'POST',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to reconnect session: ${response.statusText}`);
      }

      const data = await response.json();

      // Update in database
      await supabase
        .from('whatsapp_sessions')
        .update({
          status: 'pending',
          qr_code: data.qrCode,
        })
        .eq('session_id', sessionId);

      return {
        qr_code: data.qrCode,
        session_id: sessionId,
        status: 'pending',
      };
    } catch (error) {
      console.error('Error reconnecting session:', error);
      throw error;
    }
  }

  // ========================================================================
  // MESSAGING
  // ========================================================================

  /**
   * Send a single WhatsApp message
   */
  async sendMessage(
    sessionId: string,
    request: SendMessageRequest
  ): Promise<MessageResponse> {
    try {
      // Format phone number
      const formattedPhone = this.formatPhoneNumber(request.recipient_phone);

      const response = await fetch(`${this.apiUrl}/sessions/${sessionId}/send`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          phone: formattedPhone,
          message: request.message_content,
          mediaUrl: request.media_url,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.statusText}`);
      }

      const data: OpenWAMessageResponse = await response.json();

      return {
        success: data.status !== 'failed',
        message_id: data.messageId,
        status: data.status === 'sent' ? 'sent' : 'pending',
        credits_used: 1,
      };
    } catch (error) {
      console.error('Error sending WhatsApp message:', error);
      throw error;
    }
  }

  /**
   * Send bulk messages
   */
  async sendBulkMessages(
    sessionId: string,
    request: SendBulkMessageRequest
  ): Promise<MessageResponse> {
    try {
      const formattedPhones = request.recipients.map((phone) => this.formatPhoneNumber(phone));

      const response = await fetch(`${this.apiUrl}/sessions/${sessionId}/send-bulk`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          phones: formattedPhones,
          message: request.message_content,
          scheduledTime: request.scheduled_at,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to send bulk messages: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        success: true,
        message_id: data.campaignId,
        status: 'pending',
        credits_used: request.recipients.length,
      };
    } catch (error) {
      console.error('Error sending bulk WhatsApp messages:', error);
      throw error;
    }
  }

  /**
   * Send message template
   */
  async sendTemplate(
    sessionId: string,
    recipientPhone: string,
    templateName: string,
    variables: Record<string, string>
  ): Promise<MessageResponse> {
    try {
      const formattedPhone = this.formatPhoneNumber(recipientPhone);

      const response = await fetch(`${this.apiUrl}/sessions/${sessionId}/send-template`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          phone: formattedPhone,
          templateName,
          parameters: Object.values(variables),
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to send template: ${response.statusText}`);
      }

      const data: OpenWAMessageResponse = await response.json();

      return {
        success: data.status !== 'failed',
        message_id: data.messageId,
        status: data.status === 'sent' ? 'sent' : 'pending',
        credits_used: 1,
      };
    } catch (error) {
      console.error('Error sending WhatsApp template:', error);
      throw error;
    }
  }

  // ========================================================================
  // CONTACTS
  // ========================================================================

  /**
   * Get contacts from session
   */
  async getSessionContacts(sessionId: string): Promise<Record<string, any>[]> {
    try {
      const response = await fetch(`${this.apiUrl}/sessions/${sessionId}/contacts`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch contacts: ${response.statusText}`);
      }

      const data = await response.json();
      return data.contacts || [];
    } catch (error) {
      console.error('Error fetching session contacts:', error);
      throw error;
    }
  }

  /**
   * Sync contacts from WhatsApp to database
   */
  async syncContacts(
    instituteId: string,
    sessionId: string
  ): Promise<{ synced: number; failed: number }> {
    try {
      const contacts = await this.getSessionContacts(sessionId);

      let synced = 0;
      let failed = 0;

      for (const contact of contacts) {
        try {
          await supabase.from('whatsapp_contacts').insert({
            institute_id: instituteId,
            name: contact.name || contact.phone,
            phone: contact.phone,
            source: 'sync',
          });
          synced++;
        } catch (error) {
          console.error(`Failed to sync contact ${contact.phone}:`, error);
          failed++;
        }
      }

      return { synced, failed };
    } catch (error) {
      console.error('Error syncing contacts:', error);
      throw error;
    }
  }

  // ========================================================================
  // UTILITY METHODS
  // ========================================================================

  /**
   * Format phone number for WhatsApp
   */
  private formatPhoneNumber(phone: string): string {
    // Remove all non-digit characters except +
    let formatted = phone.replace(/[^\d+]/g, '');

    // If it doesn't start with +, add country code
    if (!formatted.startsWith('+')) {
      if (formatted.length === 10) {
        formatted = `+91${formatted}`;
      } else if (formatted.length === 12 && formatted.startsWith('91')) {
        formatted = `+${formatted}`;
      } else if (!formatted.startsWith('+')) {
        formatted = `+${formatted}`;
      }
    }

    return formatted;
  }

  /**
   * Get request headers
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    return headers;
  }

  /**
   * Set API configuration
   */
  setConfig(config: Partial<OpenWAServiceConfig>) {
    if (config.apiUrl) this.apiUrl = config.apiUrl;
    if (config.apiKey) this.apiKey = config.apiKey;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/health`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

// ============================================================================
// Singleton instance
// ============================================================================

let openwaServiceInstance: OpenWAService | null = null;

export function getOpenWAService(config?: Partial<OpenWAServiceConfig>): OpenWAService {
  if (!openwaServiceInstance) {
    openwaServiceInstance = new OpenWAService(config);
  }
  return openwaServiceInstance;
}

export function createOpenWAServiceForInstitute(
  instituteId: string,
  config?: Partial<OpenWAServiceConfig>
): OpenWAService {
  return new OpenWAService(config);
}

export default OpenWAService;
