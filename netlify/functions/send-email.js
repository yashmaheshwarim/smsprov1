// ============================================================================
// Send Email Netlify Function - Multi-Provider Support
// Supports:
//   - SMTP (generic) with per-institute config from institute_integrations
//   - Brevo / Sendinblue (v3 REST API)
//   - Brevo SMTP relay
//   - Default SMTP from env vars (fallback)
// ============================================================================

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// ============================================================================
// BREVO API V3 - Native implementation (no external SDK needed)
// ============================================================================

async function sendViaBrevoApi(config, request) {
  const apiKey = config.api_key || process.env.BREVO_API_KEY || process.env.DEFAULT_BREVO_API_KEY;
  if (!apiKey) {
    throw new Error('Brevo API key not configured');
  }

  const fromEmail = config.from_email || process.env.DEFAULT_FROM_EMAIL || 'noreply@institute.com';
  const fromName = config.from_name || 'InstituteOS';

  const payload = {
    sender: { name: fromName, email: fromEmail },
    to: [{ email: request.to }],
    subject: request.subject,
    htmlContent: request.html || '',
  };

  if (request.text) payload.textContent = request.text;
  if (request.cc && request.cc.length > 0) {
    payload.cc = request.cc.map(e => ({ email: e }));
  }
  if (request.bcc && request.bcc.length > 0) {
    payload.bcc = request.bcc.map(e => ({ email: e }));
  }
  if (request.attachments && request.attachments.length > 0) {
    payload.attachment = request.attachments.map(a => ({
      name: a.filename,
      content: a.content,
    }));
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
      'Accept': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Brevo API error: ${response.status} ${response.statusText}`);
  }

  return { messageId: data.messageId || data.id };
}

// ============================================================================
// SMTP - using nodemailer
// ============================================================================

async function sendViaSmtp(config, request) {
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch (e) {
    // Fallback: try dynamic import via eval (for Netlify function bundle)
    nodemailer = require('nodemailer');
  }

  const smtpHost = config.smtp_host || process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(config.smtp_port || process.env.SMTP_PORT || '587');
  const smtpSecure = config.smtp_secure !== undefined ? config.smtp_secure : smtpPort === 465;

  // For Brevo SMTP: username is the email, password is the SMTP key
  const smtpUser = config.smtp_username || config.from_email || process.env.DEFAULT_SMTP_EMAIL;
  const smtpPass = config.smtp_password || process.env.DEFAULT_SMTP_PASSWORD;

  if (!smtpUser || !smtpPass) {
    throw new Error('SMTP credentials not configured');
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  const fromEmail = config.from_email || process.env.DEFAULT_FROM_EMAIL || smtpUser;
  const fromName = config.from_name || 'InstituteOS';

  const mailOptions = {
    from: `"${fromName}" <${fromEmail}>`,
    to: request.to,
    subject: request.subject,
    html: request.html || '',
    text: request.text || undefined,
  };

  if (request.cc && request.cc.length > 0) mailOptions.cc = request.cc.join(', ');
  if (request.bcc && request.bcc.length > 0) mailOptions.bcc = request.bcc.join(', ');

  const info = await transporter.sendMail(mailOptions);
  return { messageId: info.messageId };
}

// ============================================================================
// LOG SENDING TO MESSAGE_LOGS
// ============================================================================

async function logMessage(instituteId, channel, recipient, subject, status, messageId, errorMsg) {
  try {
    await supabase.from('message_logs').insert({
      institute_id: instituteId,
      channel: channel,
      recipient: recipient,
      message: subject || '',
      status: status,
      external_id: messageId || null,
      failed_reason: errorMsg || null,
    });
  } catch (e) {
    console.error('Failed to log message:', e);
  }
}

// ============================================================================
// HANDLER
// ============================================================================

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const {
    institute_id,
    to,
    subject,
    html,
    text,
    cc,
    bcc,
    attachments,
    // Provider-specific configs (can override per-institute config)
    provider,
    providerConfig: inlineProviderConfig,
  } = body;

  if (!to || !subject) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields: to, subject' }) };
  }

  try {
    // Determine provider and config
    let emailProvider = provider || 'smtp';
    let providerConfig = inlineProviderConfig || {};

    // If institute_id provided, try to load per-institute config
    if (institute_id && (!provider || !inlineProviderConfig)) {
      const { data: integration } = await supabase
        .from('institute_integrations')
        .select('config, provider')
        .eq('institute_id', institute_id)
        .in('provider', ['smtp', 'brevo', 'brevo_api', 'brevo_smtp'])
        .eq('status', 'connected')
        .maybeSingle();

      if (integration) {
        emailProvider = integration.provider === 'brevo' ? 'brevo_api' : integration.provider;
        providerConfig = {
          ...providerConfig,
          ...(integration.config || {}),
        };
      }
    }

    // Merge with env defaults
    if (!providerConfig.from_email) {
      providerConfig.from_email = process.env.DEFAULT_FROM_EMAIL;
    }

    let result;

    // Route to the correct provider
    if (emailProvider === 'brevo_api') {
      result = await sendViaBrevoApi(providerConfig, { to, subject, html, text, cc, bcc, attachments });
    } else if (emailProvider === 'brevo_smtp') {
      // Brevo SMTP uses specific defaults
      providerConfig.smtp_host = providerConfig.smtp_host || 'smtp-relay.brevo.com';
      providerConfig.smtp_port = providerConfig.smtp_port || 587;
      result = await sendViaSmtp(providerConfig, { to, subject, html, text, cc, bcc, attachments });
    } else {
      // Default to SMTP
      result = await sendViaSmtp(providerConfig, { to, subject, html, text, cc, bcc, attachments });
    }

    // Log success
    if (institute_id) {
      await logMessage(institute_id, 'email', to, subject, 'sent', result.messageId, null);
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ success: true, message_id: result.messageId }),
    };
  } catch (error) {
    console.error('Email send error:', error);

    // Log failure
    if (institute_id) {
      await logMessage(institute_id, 'email', to, subject, 'failed', null, error.message);
    }

    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message || 'Failed to send email' }),
    };
  }
};
