// ============================================================================
// Email Service - Multi-Provider Abstraction Layer
// Supports: Brevo (Sendinblue) via SMTP + REST API, Generic SMTP
// Extensible: Add new providers by implementing EmailProvider interface
// ============================================================================

import { supabase } from './supabase';

// ============================================================================
// TYPES
// ============================================================================

export type EmailProviderType = 'smtp' | 'brevo_api' | 'brevo_smtp' | 'ses' | 'mailgun' | 'sendgrid';

export interface EmailConfig {
  provider: EmailProviderType;
  // SMTP fields
  smtp_host?: string;
  smtp_port?: number;
  smtp_username?: string;
  smtp_password?: string;
  smtp_secure?: boolean;
  // API key fields (Brevo, SendGrid, Mailgun, etc.)
  api_key?: string;
  api_url?: string;
  // Sender
  from_email?: string;
  from_name?: string;
}

export interface SendEmailRequest {
  to: string;
  subject: string;
  html: string;
  text?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: Array<{ filename: string; content: string; encoding?: string }>;
}

export interface SendEmailResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface InstituteEmailConfig {
  instituteId: string;
  notificationEmail: string;
  notificationsEnabled: boolean;
  provider: EmailProviderType;
  providerConfig: EmailConfig;
}

// ============================================================================
// PROVIDER INTERFACE
// ============================================================================

export interface EmailProvider {
  readonly type: EmailProviderType;
  readonly name: string;
  send(request: SendEmailRequest, config: EmailConfig): Promise<SendEmailResponse>;
  verifyConfig(config: EmailConfig): Promise<{ valid: boolean; message?: string }>;
}

// ============================================================================
// SMTP PROVIDER
// ============================================================================

export class SmtpEmailProvider implements EmailProvider {
  readonly type: EmailProviderType = 'smtp';
  readonly name = 'SMTP';

  async send(request: SendEmailRequest, config: EmailConfig): Promise<SendEmailResponse> {
    try {
      const response = await fetch('/.netlify/functions/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'smtp',
          providerConfig: {
            smtp_host: config.smtp_host,
            smtp_port: config.smtp_port,
            smtp_username: config.smtp_username,
            smtp_password: config.smtp_password,
            smtp_secure: config.smtp_secure,
            from_email: config.from_email,
            from_name: config.from_name,
          },
          to: request.to,
          subject: request.subject,
          html: request.html,
          text: request.text,
          cc: request.cc,
          bcc: request.bcc,
          attachments: request.attachments,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'SMTP send failed');
      return { success: true, messageId: data.message_id };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async verifyConfig(config: EmailConfig): Promise<{ valid: boolean; message?: string }> {
    if (!config.smtp_host) return { valid: false, message: 'SMTP Host is required' };
    if (!config.smtp_username) return { valid: false, message: 'SMTP Username is required' };
    if (!config.smtp_password) return { valid: false, message: 'SMTP Password is required' };
    if (!config.from_email) return { valid: false, message: 'From email is required' };
    return { valid: true };
  }
}

// ============================================================================
// BREVO API PROVIDER (REST API v3)
// ============================================================================

export class BrevoApiEmailProvider implements EmailProvider {
  readonly type: EmailProviderType = 'brevo_api';
  readonly name = 'Brevo API';

  async send(request: SendEmailRequest, config: EmailConfig): Promise<SendEmailResponse> {
    try {
      const response = await fetch('/.netlify/functions/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'brevo_api',
          providerConfig: {
            api_key: config.api_key,
            from_email: config.from_email,
            from_name: config.from_name,
          },
          to: request.to,
          subject: request.subject,
          html: request.html,
          text: request.text,
          cc: request.cc,
          bcc: request.bcc,
          attachments: request.attachments,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Brevo API send failed');
      return { success: true, messageId: data.message_id };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async verifyConfig(config: EmailConfig): Promise<{ valid: boolean; message?: string }> {
    if (!config.api_key) return { valid: false, message: 'Brevo API Key is required' };
    if (!config.from_email) return { valid: false, message: 'From email is required' };
    return { valid: true };
  }
}

// ============================================================================
// BREVO SMTP PROVIDER (Compatible with Brevo SMTP relay)
// ============================================================================

export class BrevoSmtpEmailProvider extends SmtpEmailProvider {
  override readonly type: EmailProviderType = 'brevo_smtp';
  override readonly name = 'Brevo SMTP';

  override verifyConfig(config: EmailConfig): Promise<{ valid: boolean; message?: string }> {
    if (!config.api_key && !config.smtp_password) {
      return Promise.resolve({ valid: false, message: 'Brevo SMTP Password or API Key is required' });
    }
    if (!config.from_email) {
      return Promise.resolve({ valid: false, message: 'From email is required' });
    }
    return Promise.resolve({ valid: true });
  }
}

// ============================================================================
// PROVIDER FACTORY
// ============================================================================

class EmailServiceRegistry {
  private providers = new Map<EmailProviderType, EmailProvider>();

  register(provider: EmailProvider): void {
    this.providers.set(provider.type, provider);
  }

  getProvider(type: EmailProviderType): EmailProvider {
    const provider = this.providers.get(type);
    if (!provider) {
      throw new Error(`No email provider registered for type: ${type}`);
    }
    return provider;
  }

  getAllProviders(): EmailProvider[] {
    return Array.from(this.providers.values());
  }
}

// Register built-in providers
const registry = new EmailServiceRegistry();
registry.register(new SmtpEmailProvider());
registry.register(new BrevoApiEmailProvider());
registry.register(new BrevoSmtpEmailProvider());

export function getEmailProvider(type: EmailProviderType): EmailProvider {
  return registry.getProvider(type);
}

export function getAllEmailProviders(): EmailProvider[] {
  return registry.getAllProviders();
}

// ============================================================================
// INSTITUTE EMAIL CONFIG FETCHER
// ============================================================================

/**
 * Fetch the full email configuration for an institute.
 * Reads from institute_integrations table for provider config,
 * and from institutes table for notification_email + enabled flag.
 */
export async function getInstituteEmailConfig(
  instituteId: string
): Promise<InstituteEmailConfig | null> {
  try {
    // Fetch institute notification settings
    const { data: institute } = await supabase
      .from('institutes')
      .select('notification_email, fee_email_notifications_enabled')
      .eq('id', instituteId)
      .single();

    if (!institute?.notification_email) return null;
    if (institute?.fee_email_notifications_enabled === false) return null;

    // Fetch email provider config from institute_integrations
    const { data: integration } = await supabase
      .from('institute_integrations')
      .select('config, status, provider')
      .eq('institute_id', instituteId)
      .in('provider', ['smtp', 'brevo', 'brevo_api', 'brevo_smtp'])
      .eq('status', 'connected')
      .maybeSingle();

    // Determine provider and config
    let providerType: EmailProviderType = 'smtp';
    let providerConfig: EmailConfig = { provider: 'smtp' };

    if (integration) {
      const cfg = integration.config || {};
      const integrationProvider = integration.provider;

      if (integrationProvider === 'brevo' || integrationProvider === 'brevo_api') {
        providerType = 'brevo_api';
        providerConfig = {
          provider: 'brevo_api',
          api_key: cfg.api_key,
          from_email: cfg.from_email || institute.notification_email,
          from_name: cfg.from_name || undefined,
        };
      } else if (integrationProvider === 'brevo_smtp') {
        providerType = 'brevo_smtp';
        providerConfig = {
          provider: 'brevo_smtp',
          smtp_host: cfg.smtp_host || 'smtp-relay.brevo.com',
          smtp_port: cfg.smtp_port || 587,
          smtp_username: cfg.smtp_username,
          smtp_password: cfg.smtp_password || cfg.api_key,
          from_email: cfg.from_email || institute.notification_email,
          from_name: cfg.from_name || undefined,
        };
      } else {
        // Generic SMTP
        providerType = 'smtp';
        providerConfig = {
          provider: 'smtp',
          smtp_host: cfg.smtp_host,
          smtp_port: cfg.smtp_port || 587,
          smtp_username: cfg.smtp_username,
          smtp_password: cfg.smtp_password,
          smtp_secure: cfg.smtp_secure || cfg.smtp_port === 465,
          from_email: cfg.from_email || institute.notification_email,
          from_name: cfg.from_name || undefined,
        };
      }
    } else {
      // Use default SMTP from env
      providerConfig = {
        provider: 'smtp',
        from_email: institute.notification_email,
      };
    }

    return {
      instituteId,
      notificationEmail: institute.notification_email,
      notificationsEnabled: institute.fee_email_notifications_enabled !== false,
      provider: providerType,
      providerConfig,
    };
  } catch (error) {
    console.error('Error fetching institute email config:', error);
    return null;
  }
}

// ============================================================================
// HIGH-LEVEL SEND FUNCTION
// ============================================================================

/**
 * Send an email using the institute's configured email provider.
 * Automatically detects and uses the correct provider.
 */
export async function sendInstituteEmail(
  instituteId: string,
  request: SendEmailRequest
): Promise<SendEmailResponse> {
  try {
    const config = await getInstituteEmailConfig(instituteId);
    if (!config) {
      return { success: false, error: 'Email not configured for this institute' };
    }

    const provider = getEmailProvider(config.provider);
    return await provider.send(request, config.providerConfig);
  } catch (error: any) {
    console.error('Error sending institute email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Helper to send a fee payment notification email.
 */
export async function sendFeePaymentEmailNotification(
  instituteId: string,
  details: {
    studentName: string;
    enrollmentNo: string;
    batchName: string;
    receiptId: string;
    feeTitle: string;
    originalFee: number;
    discountAmount: number;
    finalFee: number;
    paidFees: number;
    paymentAmount: number;
    paymentMethod: string;
    paymentDate: string;
    status: string;
  }
): Promise<SendEmailResponse> {
  const config = await getInstituteEmailConfig(instituteId);
  if (!config) {
    return { success: false, error: 'Email not configured for this institute' };
  }

  const paymentDateFormatted = new Date(details.paymentDate).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const subject = `Fee Payment Received - ${details.studentName} (Receipt: ${details.receiptId})`;

  const discountRow = details.discountAmount > 0
    ? `<tr style="background: #f8f9fa;">
        <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Discount Applied</td>
        <td style="padding: 10px; border: 1px solid #e0e0e0; color: #c62828;">-₹${details.discountAmount.toLocaleString('en-IN')}</td>
      </tr>`
    : '';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a73e8;">Fee Payment Receipt Notification</h2>
      <p>A fee payment has been recorded successfully. Here are the complete payment details:</p>

      <h3 style="color: #333; border-bottom: 1px solid #e0e0e0; padding-bottom: 8px;">Student Information</h3>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr style="background: #f8f9fa;">
          <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Student Name</td>
          <td style="padding: 10px; border: 1px solid #e0e0e0;">${details.studentName}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Enrollment No</td>
          <td style="padding: 10px; border: 1px solid #e0e0e0;">${details.enrollmentNo}</td>
        </tr>
        <tr style="background: #f8f9fa;">
          <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Batch</td>
          <td style="padding: 10px; border: 1px solid #e0e0e0;">${details.batchName}</td>
        </tr>
      </table>

      <h3 style="color: #333; border-bottom: 1px solid #e0e0e0; padding-bottom: 8px;">Fee Details</h3>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr style="background: #f8f9fa;">
          <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Receipt ID</td>
          <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold; font-family: monospace;">${details.receiptId}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Fee Title</td>
          <td style="padding: 10px; border: 1px solid #e0e0e0;">${details.feeTitle}</td>
        </tr>
      </table>

      <h3 style="color: #333; border-bottom: 1px solid #e0e0e0; padding-bottom: 8px;">Payment Summary</h3>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr style="background: #f8f9fa;">
          <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Original Fee</td>
          <td style="padding: 10px; border: 1px solid #e0e0e0;">₹${details.originalFee.toLocaleString('en-IN')}</td>
        </tr>
        ${discountRow}
        <tr style="background: #f8f9fa;">
          <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Final Fee</td>
          <td style="padding: 10px; border: 1px solid #e0e0e0;">₹${details.finalFee.toLocaleString('en-IN')}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Payment Amount</td>
          <td style="padding: 10px; border: 1px solid #e0e0e0; color: #2e7d32; font-weight: bold;">₹${details.paymentAmount.toLocaleString('en-IN')}</td>
        </tr>
        <tr style="background: #f8f9fa;">
          <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Total Paid</td>
          <td style="padding: 10px; border: 1px solid #e0e0e0;">₹${details.paidFees.toLocaleString('en-IN')}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Pending Amount</td>
          <td style="padding: 10px; border: 1px solid #e0e0e0;">₹${Math.max(0, details.finalFee - details.paidFees).toLocaleString('en-IN')}</td>
        </tr>
        <tr style="background: #f8f9fa;">
          <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Payment Method</td>
          <td style="padding: 10px; border: 1px solid #e0e0e0;">${details.paymentMethod}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Payment Date</td>
          <td style="padding: 10px; border: 1px solid #e0e0e0;">${paymentDateFormatted}</td>
        </tr>
        <tr style="background: #f8f9fa;">
          <td style="padding: 10px; border: 1px solid #e0e0e0; font-weight: bold;">Status</td>
          <td style="padding: 10px; border: 1px solid #e0e0e0;">${details.status.toUpperCase()}</td>
        </tr>
      </table>

      <p style="color: #666; font-size: 12px; margin-top: 20px;">This is an automated notification from your InstituteOS.</p>
      <p style="color: #999; font-size: 11px;">Generated on ${new Date().toLocaleString('en-IN')}</p>
    </div>
  `;

  return await sendInstituteEmail(instituteId, {
    to: config.notificationEmail,
    subject,
    html,
  });
}
