// ============================================================================
// OpenWA Webhook Handler
// ============================================================================
// Receives webhook events from OpenWA WhatsApp API server.
// Endpoint: https://apexsms.netlify.app/.netlify/functions/openwa
//
// OpenWA sends events when:
//   - A message is received or sent (event: "message")
//   - A message status changes — sent, delivered, read, failed (event: "status")
//   - A QR code is generated/updated (event: "qr")
//   - Authentication state changes (event: "auth")
//
// The sessionId in the payload is used to look up the institute via
// the whatsapp_sessions table.
// ============================================================================

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const openwaWebhookSecret = process.env.OPENWA_WEBHOOK_SECRET || '';
let supabaseClient = null;

function getSupabase() {
  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return supabaseClient;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Strip JID suffix from a phone number.
 * E.g. "919876543210@s.whatsapp.net" -> "919876543210"
 */
function stripJid(phone) {
  if (!phone) return null;
  return phone.split('@')[0];
}

/**
 * Look up institute by session_id from the whatsapp_sessions table.
 */
async function findInstituteBySession(sessionId) {
  try {
    const { data, error } = await getSupabase()
      .from('whatsapp_sessions')
      .select('institute_id, id, status')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (error || !data) return null;
    return data;
  } catch (e) {
    console.error('Error looking up session:', e.message);
    return null;
  }
}

/**
 * Log event to whatsapp_webhooks table.
 */
async function logWebhook(instituteId, eventType, sessionId, rawPayload, eventSource) {
  const fromPhone = stripJid(rawPayload.from || rawPayload.phone || null);
  const toPhone = stripJid(rawPayload.to || null);

  try {
    const { error } = await getSupabase().from('whatsapp_webhooks').insert({
      institute_id: instituteId,
      type: eventType === 'message' ? 'incoming' : 'outgoing',
      from_phone: fromPhone,
      to_phone: toPhone,
      message: rawPayload.body || rawPayload.message || null,
      status: rawPayload.status || 'received',
      raw_payload: { ...rawPayload, event_source: eventSource },
    });

    if (error) {
      console.error('Failed to log webhook:', error.message);
    }
  } catch (e) {
    console.error('Failed to log webhook:', e.message);
  }
}

/**
 * Update message status in whatsapp_messages by external_message_id.
 */
async function updateMessageStatus(externalMessageId, status, sessionInstituteId) {
  if (!externalMessageId) return;

  try {
    const { error } = await getSupabase()
      .from('whatsapp_messages')
      .update({
        status: status,
        ...(status === 'sent' ? { sent_at: new Date().toISOString() } : {}),
        ...(status === 'delivered' ? { delivered_at: new Date().toISOString() } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('external_message_id', externalMessageId)
      .eq('institute_id', sessionInstituteId);

    if (error) {
      console.error('Failed to update message status:', error.message);
    }
  } catch (e) {
    console.error('Failed to update message status:', e.message);
  }
}

/**
 * Update session status in whatsapp_sessions.
 */
async function updateSessionStatus(sessionId, status, phoneNumber) {
  const updateData = {
    status: status,
    updated_at: new Date().toISOString(),
  };

  if (phoneNumber) {
    updateData.phone_number = stripJid(phoneNumber);
  }

  if (status === 'active') {
    updateData.last_activity_at = new Date().toISOString();
  }

  try {
    const { error } = await getSupabase()
      .from('whatsapp_sessions')
      .update(updateData)
      .eq('session_id', sessionId);

    if (error) {
      console.error('Failed to update session status:', error.message);
    }
  } catch (e) {
    console.error('Failed to update session status:', e.message);
  }
}

/**
 * Log a message to message_logs for incoming messages.
 */
async function logIncomingMessage(instituteId, fromPhone, messageBody) {
  try {
    await getSupabase().from('message_logs').insert({
      institute_id: instituteId,
      channel: 'whatsapp',
      recipient: stripJid(fromPhone),
      message: messageBody || '(media or empty)',
      status: 'received',
    });
  } catch (e) {
    console.error('Failed to log incoming message:', e.message);
  }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Handle message events (incoming or outgoing messages).
 */
async function handleMessageEvent(sessionId, data, instituteId, fullBody) {
  // Pass data (inner payload) for field extraction, fullBody for raw_payload context
  await logWebhook(instituteId, 'incoming', sessionId, data, 'message');

  // If it's an incoming message, log to message_logs
  if (data.from) {
    const fromPhone = stripJid(data.from);
    await logIncomingMessage(instituteId, fromPhone, data.body || data.message);
  }
}

/**
 * Handle status update events (sent, delivered, read, failed).
 */
async function handleStatusEvent(sessionId, data, instituteId, fullBody) {
  const externalMessageId = data.messageId || data.id || data.key?.id;
  const status = mapOpenwaStatus(data.status);

  await logWebhook(instituteId, 'outgoing', sessionId, data, 'status');

  if (externalMessageId) {
    await updateMessageStatus(externalMessageId, status, instituteId);
  }
}

/**
 * Map OpenWA status string to internal message status.
 */
function mapOpenwaStatus(status) {
  const map = {
    sent: 'sent',
    delivered: 'delivered',
    read: 'read',
    failed: 'failed',
    pending: 'pending',
    error: 'failed',
  };
  return map[status] || 'pending';
}

/**
 * Handle QR code events.
 */
async function handleQrEvent(sessionId, data, instituteId, fullBody) {
  await logWebhook(instituteId, 'outgoing', sessionId, data, 'qr');
}

/**
 * Handle authentication events (connection state changes).
 */
async function handleAuthEvent(sessionId, data, instituteId, fullBody) {
  const status = mapAuthStatus(data.status);
  const phoneNumber = data.phoneNumber || data.phone || null;

  await updateSessionStatus(sessionId, status, phoneNumber);
  await logWebhook(instituteId, 'outgoing', sessionId, data, 'auth');
}

/**
 * Map OpenWA auth status to internal session status.
 */
function mapAuthStatus(status) {
  const map = {
    active: 'active',
    connected: 'active',
    authenticated: 'active',
    pending: 'pending',
    connecting: 'pending',
    disconnected: 'disconnected',
    logout: 'disconnected',
    logged_out: 'disconnected',
    error: 'error',
    failed: 'error',
  };
  return map[status] || 'inactive';
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
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-API-Key',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      },
      body: '',
    };
  }

  // Only accept POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  // Check required env vars
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Server configuration error' }),
    };
  }

  // ========================================================================
  // API KEY / WEBHOOK SECRET VERIFICATION
  // ========================================================================
  // If OPENWA_WEBHOOK_SECRET env var is set, require the caller to include
  // it in the X-API-Key header (matching OpenWA's convention).
  // Falls back to checking Authorization: Bearer <secret>.
  // If no secret is configured, skip verification (backward compatible).
  if (openwaWebhookSecret) {
    const requestKey = event.headers['x-api-key']
      || event.headers['X-API-Key']
      || (event.headers['authorization'] || '').replace(/^Bearer\s+/i, '')
      || '';

    if (!requestKey || requestKey !== openwaWebhookSecret) {
      console.warn('OpenWA webhook rejected: invalid or missing API key');
      return {
        statusCode: 401,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Unauthorized: invalid or missing API key' }),
      };
    }

    console.log('OpenWA webhook API key verified');
  }

  try {
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseErr) {
      body = { raw: event.body };
    }

    console.log('OpenWA webhook received:', JSON.stringify(body).substring(0, 500));

    // Extract the payload — OpenWA sends either:
    //   { event, sessionId, data }  (structured)
    //   { messages: [...] }         (batch of messages from frontend)
    //   { ... }                     (flat payload)
    const payloadEvent = body.event;
    const sessionId = body.sessionId || body.session_id || body.instance_id;
    const data = body.data || body;

    // Handle batch of messages (from frontend -> OpenWA callback)
    if (body.messages && Array.isArray(body.messages)) {
      console.log('Batch messages callback received:', body.messages.length);

      // Try to find institute if available in payload
      const batchInstituteId = body.institute_id || body.instituteId || null;
      if (batchInstituteId) {
        for (const msg of body.messages) {
          await logWebhook(batchInstituteId, 'outgoing', sessionId, {
            ...msg,
            event: 'message_callback',
          });
        }
      }

      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ success: true, received: body.messages.length }),
      };
    }

    // Find institute by session ID
    let instituteId = body.institute_id || body.instituteId || null;

    if (!instituteId && sessionId) {
      const session = await findInstituteBySession(sessionId);
      if (session) {
        instituteId = session.institute_id;
      }
    }

    // Route event to appropriate handler
    if (payloadEvent === 'message') {
      await handleMessageEvent(sessionId, data, instituteId, body);
    } else if (payloadEvent === 'status') {
      await handleStatusEvent(sessionId, data, instituteId, body);
    } else if (payloadEvent === 'qr') {
      await handleQrEvent(sessionId, data, instituteId, body);
    } else if (payloadEvent === 'auth') {
      await handleAuthEvent(sessionId, data, instituteId, body);
    } else {
      // Unknown event type — log it anyway
      console.log('Unknown OpenWA event type:', payloadEvent);

      if (instituteId) {
        await logWebhook(instituteId, 'incoming', sessionId, body, payloadEvent);
      } else {
        try {
          await getSupabase().from('whatsapp_webhooks').insert({
            type: 'incoming',
            from_phone: stripJid(data.from || data.phone || null),
            message: data.body || data.message || null,
            status: 'received',
            raw_payload: { event: payloadEvent, ...body },
          });
        } catch (e) {
          console.error('Failed to log unknown event:', e.message);
        }
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    console.error('OpenWA webhook error:', error.message || error);

    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message || 'Internal server error' }),
    };
  }
};
