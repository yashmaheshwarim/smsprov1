// ============================================================================
// WhatsApp Web Service - Local Baileys Server Integration
// ============================================================================

import { supabase } from './supabase';
import {
  WhatsAppSession,
  QRCodeResponse,
  SendMessageRequest,
  SendBulkMessageRequest,
  MessageResponse,
} from '@/types/whatsapp';

const OPENWA_API_URL = import.meta.env.VITE_OPENWA_API_URL || 'http://localhost:2785';
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
   * Our local server returns: { sessionId, qrCode (data URL), status }
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
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to create session: ${response.statusText}`);
      }

      const data = await response.json();

      // data.qrCode is a full data URL like "data:image/png;base64,..."
      // Extract just the base64 part for storage
      const qrBase64 = data.qrCode ? data.qrCode.replace(/^data:image\/png;base64,/, '') : null;

      // Save to database
      const { data: session, error } = await supabase
        .from('whatsapp_sessions')
        .insert({
          institute_id: instituteId,
          session_id: data.sessionId,
          session_name: sessionName,
          qr_code: qrBase64,
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
   * Our local server returns: { qrCode (data URL), sessionId, status }
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

      // data.qrCode is a full data URL - extract base64 part
      const qrBase64 = data.qrCode ? data.qrCode.replace(/^data:image\/png;base64,/, '') : null;

      return {
        qr_code: qrBase64,
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

      // Then check with local server
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
   * Reconnect session - forces new QR code
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

      const qrBase64 = data.qrCode ? data.qrCode.replace(/^data:image\/png;base64,/, '') : null;

      // Update in database
      await supabase
        .from('whatsapp_sessions')
        .update({
          status: 'pending',
          qr_code: qrBase64,
        })
        .eq('session_id', sessionId);

      return {
        qr_code: qrBase64,
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
      // Format phone number - remove all non-digits
      const formattedPhone = request.recipient_phone.replace(/[^\d]/g, '');

      const response = await fetch(`${this.apiUrl}/sessions/${sessionId}/send`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          phone: formattedPhone,
          message: request.message_content,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to send message: ${response.statusText}`);
      }

      const data = await response.json();

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
      const formattedPhones = request.recipients.map((phone) => phone.replace(/[^\d]/g, ''));

      const response = await fetch(`${this.apiUrl}/sessions/${sessionId}/send-bulk`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          phones: formattedPhones,
          message: request.message_content,
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

  // ========================================================================
  // UTILITY METHODS
  // ========================================================================

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