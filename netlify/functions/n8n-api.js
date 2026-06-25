// ============================================================================
// n8n API - Institute-Scoped External API for n8n Integrations
// ============================================================================
// Each institute generates an API key from the Integrations page.
// n8n calls this endpoint with the API key in the Authorization header.
// All operations are scoped to the institute that owns the API key.
//
// Endpoints:
//   POST /api/n8n/whatsapp/send                  - Send a WhatsApp message
//   GET  /api/n8n/whatsapp/balance                - Get credit balance
//   GET  /api/n8n/students                        - List students
//   GET  /api/n8n/students/:id                    - Get student details
//   GET  /api/n8n/fees/pending                    - Get pending fees
//   POST /api/n8n/sms/send                        - Send SMS
//   POST /api/n8n/notify/absent                   - Notify parents of absent students
//   GET  /api/n8n/health                          - Health check
//
// ABSENT NOTIFICATION FLOW:
//   n8n calls POST /api/n8n/notify/absent with:
//   {
//     "date": "2026-06-25",                    // optional, defaults to today
//     "batch_name": "JEE 2025 - Batch A",       // optional, filter by batch
//     "student_ids": ["uuid1", "uuid2"],         // optional, specific students
//     "message_template": "Hello {{guardian}}, your child {{name}} was absent on {{date}}"  // optional
//   }
//
//   For each absent student found, the function:
//   1. Looks up mother_phone, father_phone, guardian_phone from the students table
//   2. Sends WhatsApp message to ALL parent phone numbers
//   3. Logs each notification in message_logs
//   4. Returns a summary of sent notifications
// ============================================================================

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

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
// AUTHENTICATION - Verify API key and return institute_id
// ============================================================================

/**
 * Hash a raw API key using SHA-256.
 */
function hashApiKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Extract key prefix (first 8 chars) for DB lookup.
 */
function getKeyPrefix(rawKey) {
  return rawKey.substring(0, 8);
}

/**
 * Verify the API key from the Authorization header.
 * Returns { instituteId, keyId } or throws an error.
 */
async function authenticateRequest(event) {
  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
  const apiKey = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!apiKey) {
    throw new Error('Missing API key. Include it as: Authorization: Bearer <your-api-key>');
  }

  const keyPrefix = getKeyPrefix(apiKey);
  const keyHash = hashApiKey(apiKey);

  // Look up key by prefix + hash
  const { data, error } = await getSupabase()
    .from('institute_api_keys')
    .select('id, institute_id, is_active, scopes, expires_at')
    .eq('key_prefix', keyPrefix)
    .eq('key_hash', keyHash)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('API key lookup error:', error.message);
    throw new Error('Authentication failed');
  }

  if (!data) {
    throw new Error('Invalid or inactive API key');
  }

  // Check expiration
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    throw new Error('API key has expired');
  }

  // Update last_used_at (fire-and-forget)
  getSupabase()
    .from('institute_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {}).catch(() => {});

  return { instituteId: data.institute_id, keyId: data.id, scopes: data.scopes || [] };
}

/**
 * Check if the API key has the required scope.
 */
function checkScope(scopes, requiredScope) {
  // Empty scopes = full access (backward compatible)
  if (scopes.length === 0) return true;
  return scopes.includes(requiredScope);
}

// ============================================================================
// INSTITUTE-SCOPED HANDLERS
// ============================================================================

/**
 * Send a WhatsApp message scoped to the institute.
 * POST /api/n8n/whatsapp/send
 */
async function handleSendWhatsApp(instituteId, body) {
  const { phone, message, sessionId } = body;

  if (!phone || !message) {
    return { statusCode: 400, body: { error: 'phone and message are required' } };
  }

  // Get active WhatsApp session for this institute
  const { data: session, error: sessionError } = await getSupabase()
    .from('whatsapp_sessions')
    .select('session_id, status')
    .eq('institute_id', instituteId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sessionError || !session) {
    return {
      statusCode: 400,
      body: { error: 'No active WhatsApp session for this institute. Set up WhatsApp connection first.' }
    };
  }

  // Forward to OpenWA server
  const openwaUrl = process.env.OPENWA_PROXY_TARGET || process.env.VITE_OPENWA_API_URL || 'http://localhost:2785';
  const sid = sessionId || session.session_id;

  try {
    const cleanPhone = phone.replace(/[^\d]/g, '');
    const resp = await fetch(`${openwaUrl}/sessions/${sid}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: cleanPhone, message }),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({ error: resp.statusText }));
      return { statusCode: 502, body: { error: errData.error || 'Failed to send via WhatsApp server' } };
    }

    const result = await resp.json();

    // Log to message_logs
    await getSupabase().from('message_logs').insert({
      institute_id: instituteId,
      channel: 'whatsapp',
      recipient: cleanPhone,
      message,
      status: 'sent',
      external_id: result.messageId || null,
    }).then(() => {}).catch(() => {});

    return {
      statusCode: 200,
      body: {
        success: true,
        messageId: result.messageId,
        phone: cleanPhone,
        timestamp: new Date().toISOString(),
      }
    };
  } catch (err) {
    return { statusCode: 502, body: { error: 'Failed to reach WhatsApp server: ' + err.message } };
  }
}

/**
 * Get institute WhatsApp credit balance.
 * GET /api/n8n/whatsapp/balance
 */
async function handleGetBalance(instituteId) {
  const { data, error } = await getSupabase()
    .from('institute_wallets')
    .select('*')
    .eq('institute_id', instituteId)
    .maybeSingle();

  if (error) {
    return { statusCode: 500, body: { error: error.message } };
  }

  return {
    statusCode: 200,
    body: {
      instituteId,
      smsCredits: data?.sms_credits || 0,
      whatsappCredits: data?.whatsapp_credits || 0,
      totalSpent: data?.total_spent_credits || 0,
      balance: (data?.sms_credits || 0) + (data?.whatsapp_credits || 0),
    }
  };
}

/**
 * List students for this institute.
 * GET /api/n8n/students
 */
async function handleListStudents(instituteId, queryParams) {
  let query = getSupabase()
    .from('students')
    .select('id, name, enrollment_no, phone, email, guardian_name, guardian_phone, batch_name, status, join_date')
    .eq('institute_id', instituteId);

  // Apply optional filters
  if (queryParams.status) {
    query = query.eq('status', queryParams.status);
  }
  if (queryParams.batch) {
    query = query.eq('batch_name', queryParams.batch);
  }
  if (queryParams.search) {
    query = query.or(`name.ilike.%${queryParams.search}%,enrollment_no.ilike.%${queryParams.search}%`);
  }

  // Pagination
  const limit = parseInt(queryParams.limit) || 50;
  const page = parseInt(queryParams.page) || 1;
  const offset = (page - 1) * limit;

  query = query.range(offset, offset + limit - 1).order('created_at', { ascending: false });

  const { data, error } = await query;

  if (error) {
    return { statusCode: 500, body: { error: error.message } };
  }

  return {
    statusCode: 200,
    body: { students: data || [], total: data?.length || 0, page, limit }
  };
}

/**
 * Get single student details.
 * GET /api/n8n/students/:id
 */
async function handleGetStudent(instituteId, studentId) {
  const { data, error } = await getSupabase()
    .from('students')
    .select('*')
    .eq('id', studentId)
    .eq('institute_id', instituteId)
    .single();

  if (error) {
    return { statusCode: 404, body: { error: 'Student not found' } };
  }

  return { statusCode: 200, body: data };
}

/**
 * Get pending fees for this institute.
 * GET /api/n8n/fees/pending
 */
async function handlePendingFees(instituteId, queryParams) {
  let query = getSupabase()
    .from('invoices')
    .select('id, student_id, students!inner(name, enrollment_no, phone), amount, status, due_date, description')
    .eq('institute_id', instituteId)
    .in('status', ['pending', 'overdue']);

  if (queryParams.student_id) {
    query = query.eq('student_id', queryParams.student_id);
  }

  const limit = parseInt(queryParams.limit) || 50;
  const page = parseInt(queryParams.page) || 1;
  const offset = (page - 1) * limit;

  query = query.range(offset, offset + limit - 1).order('due_date', { ascending: true });

  const { data, error } = await query;

  if (error) {
    return { statusCode: 500, body: { error: error.message } };
  }

  return {
    statusCode: 200,
    body: {
      pendingFees: (data || []).map(f => ({
        id: f.id,
        studentId: f.student_id,
        studentName: f.students?.name || 'Unknown',
        enrollmentNo: f.students?.enrollment_no || '',
        phone: f.students?.phone || '',
        amount: f.amount,
        status: f.status,
        dueDate: f.due_date,
        description: f.description,
      })),
      total: data?.length || 0
    }
  };
}

/**
 * Notify parents of absent students via WhatsApp.
 * POST /api/n8n/notify/absent
 *
 * For each absent student, sends a WhatsApp notification to:
 *   - mother_phone (if available)
 *   - father_phone (if available)
 *   - guardian_phone (if available)
 *
 * Request body:
 *   {
 *     "date": "2026-06-25",          // optional, defaults to today
 *     "batch_name": "JEE 2025",       // optional, filter by batch
 *     "student_ids": ["uuid1"],        // optional, specific students
 *     "message_template": "Hello {{guardian}}, your child {{name}} was absent on {{date}}"
 *   }
 *
 * Template variables:
 *   {{guardian}}  → "Mother", "Father", or "Guardian"
 *   {{name}}      → Student's name
 *   {{date}}      → The absence date
 *   {{institute}} → Institute name
 *
 * If no message_template is provided, uses a default message.
 * Returns a summary of all notifications sent.
 */
async function handleNotifyAbsent(instituteId, body) {
  const targetDate = body.date || new Date().toISOString().split('T')[0];
  const batchName = body.batch_name || null;
  const studentIds = body.student_ids || null;
  const messageTemplate = body.message_template || null;

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return { statusCode: 400, body: { error: 'Invalid date format. Use YYYY-MM-DD' } };
  }

  // Get institute name for message
  const { data: institute } = await getSupabase()
    .from('institutes')
    .select('name')
    .eq('id', instituteId)
    .single();
  const instituteName = institute?.name || 'Institute';

  // Get active WhatsApp session for this institute
  const { data: session } = await getSupabase()
    .from('whatsapp_sessions')
    .select('session_id, status')
    .eq('institute_id', instituteId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) {
    return {
      statusCode: 400,
      body: {
        error: 'No active WhatsApp session for this institute. Set up WhatsApp connection first.',
        absentStudentsFound: 0,
        notificationsSent: 0,
        totalRecipients: 0,
      }
    };
  }

  // Find absent students for the given date
  let attendanceQuery = getSupabase()
    .from('attendance')
    .select('student_id, date, status, students!inner(id, name, phone, guardian_phone, mother_name, mother_phone, father_name, father_phone, batch_name)')
    .eq('institute_id', instituteId)
    .eq('date', targetDate)
    .eq('status', 'absent');

  if (batchName) {
    attendanceQuery = attendanceQuery.eq('students.batch_name', batchName);
  }

  if (studentIds && studentIds.length > 0) {
    attendanceQuery = attendanceQuery.in('student_id', studentIds);
  }

  const { data: absentRecords, error: attendanceError } = await attendanceQuery;

  if (attendanceError) {
    return { statusCode: 500, body: { error: attendanceError.message } };
  }

  if (!absentRecords || absentRecords.length === 0) {
    return {
      statusCode: 200,
      body: {
        message: 'No absent students found for the given criteria',
        date: targetDate,
        absentStudentsFound: 0,
        notificationsSent: 0,
        totalRecipients: 0,
      }
    };
  }

  // Default message template
  const defaultTemplate = 'Hello {{guardian}}, this is to inform you that your ward {{name}} was absent on {{date}}. - {{institute}}';
  const template = messageTemplate || defaultTemplate;

  // Build message for each parent number
  const notifications = [];
  let totalRecipients = 0;

  for (const record of absentRecords) {
    const student = record.students;
    if (!student) continue;

    const parentContacts = [];

    // Build parent contacts: mother, father, guardian
    if (student.mother_phone && student.mother_phone.trim()) {
      parentContacts.push({
        relation: student.mother_name || 'Mother',
        phone: student.mother_phone.trim(),
      });
    }

    if (student.father_phone && student.father_phone.trim()) {
      parentContacts.push({
        relation: student.father_name || 'Father',
        phone: student.father_phone.trim(),
      });
    }

    if (student.guardian_phone && student.guardian_phone.trim()) {
      // Only add guardian if different from mother/father phones
      const alreadyAdded = parentContacts.some(p => p.phone === student.guardian_phone.trim());
      if (!alreadyAdded) {
        parentContacts.push({
          relation: student.guardian_name || 'Guardian',
          phone: student.guardian_phone.trim(),
        });
      }
    }

    // Also try student's own phone as fallback
    if (parentContacts.length === 0 && student.phone && student.phone.trim()) {
      parentContacts.push({
        relation: 'Parent',
        phone: student.phone.trim(),
      });
    }

    totalRecipients += parentContacts.length;

    // Create a notification entry for each parent contact
    for (const contact of parentContacts) {
      const message = template
        .replace(/\{\{guardian\}\}/g, contact.relation)
        .replace(/\{\{name\}\}/g, student.name)
        .replace(/\{\{date\}\}/g, targetDate)
        .replace(/\{\{institute\}\}/g, instituteName);

      notifications.push({
        studentId: student.id,
        studentName: student.name,
        relation: contact.relation,
        phone: contact.phone,
        message,
      });
    }
  }

  // Send notifications via OpenWA server
  const openwaUrl = process.env.OPENWA_PROXY_TARGET || process.env.VITE_OPENWA_API_URL || 'http://localhost:2785';
  const sid = session.session_id;
  let sentCount = 0;
  const results = [];

  for (const notif of notifications) {
    try {
      const cleanPhone = notif.phone.replace(/[^\d]/g, '');
      const resp = await fetch(`${openwaUrl}/sessions/${sid}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone, message: notif.message }),
      });

      const respData = await resp.json().catch(() => ({}));
      const success = resp.ok;

      if (success) sentCount++;

      // Log to message_logs
      await getSupabase().from('message_logs').insert({
        institute_id: instituteId,
        channel: 'whatsapp',
        recipient: cleanPhone,
        message: notif.message,
        status: success ? 'sent' : 'failed',
        external_id: respData.messageId || null,
      }).then(() => {}).catch(() => {});

      results.push({
        studentName: notif.studentName,
        relation: notif.relation,
        phone: cleanPhone,
        sent: success,
        messageId: respData.messageId || null,
      });
    } catch (err) {
      console.error(`[n8n] Failed to notify ${notif.phone}:`, err.message);
      results.push({
        studentName: notif.studentName,
        relation: notif.relation,
        phone: notif.phone,
        sent: false,
        error: err.message,
      });
    }
  }

  return {
    statusCode: 200,
    body: {
      success: true,
      date: targetDate,
      instituteName,
      absentStudentsFound: absentRecords.length,
      notificationsAttempted: notifications.length,
      notificationsSent: sentCount,
      totalRecipients,
      results,
    }
  };
}

/**
 * Send an SMS (logged as message_logs, actual SMS via configured provider).
 * POST /api/n8n/sms/send
 */
async function handleSendSms(instituteId, body) {
  const { phone, message } = body;

  if (!phone || !message) {
    return { statusCode: 400, body: { error: 'phone and message are required' } };
  }

  // Log the SMS (actual SMS sending could be integrated with a provider later)
  const { data, error } = await getSupabase()
    .from('message_logs')
    .insert({
      institute_id: instituteId,
      channel: 'sms',
      recipient: phone.replace(/[^\d+]/g, ''),
      message,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    return { statusCode: 500, body: { error: error.message } };
  }

  return {
    statusCode: 200,
    body: {
      success: true,
      messageId: data.id,
      status: 'pending',
      timestamp: data.sent_at || new Date().toISOString(),
    }
  };
}

/**
 * Health check.
 * GET /api/n8n/health
 */
function handleHealth() {
  return {
    statusCode: 200,
    body: {
      status: 'ok',
      version: '1.0.0',
      endpoints: [
        'POST /api/n8n/whatsapp/send',
        'GET /api/n8n/whatsapp/balance',
        'GET /api/n8n/students',
        'GET /api/n8n/students/:id',
        'GET /api/n8n/fees/pending',
        'POST /api/n8n/notify/absent',
        'POST /api/n8n/sms/send',
        'GET /api/n8n/health',
      ]
    }
  };
}

// ============================================================================
// ROUTER
// ============================================================================

/**
 * Parse the path to determine the route.
 * Netlify redirects /api/n8n/* → /.netlify/functions/n8n-api/*
 * So event.path = /.netlify/functions/n8n-api/whatsapp/send (for example)
 */
function parseRoute(event) {
  const functionPath = '/.netlify/functions/n8n-api';
  let path = event.path.replace(functionPath, '').replace(/\/+$/, '') || '';

  // Split into segments
  const segments = path.split('/').filter(Boolean);

  // Netlify also sends query string params via event.queryStringParameters
  const queryParams = event.queryStringParameters || {};

  return { segments, queryParams };
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
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      },
      body: '',
    };
  }

  // Check required env vars
  if (!supabaseUrl || !supabaseServiceKey) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server configuration error' }),
    };
  }

  try {
    // Parse route
    const { segments, queryParams } = parseRoute(event);

    // Health check doesn't need auth
    if (segments.length === 1 && segments[0] === 'health') {
      const result = handleHealth();
      return {
        statusCode: result.statusCode,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify(result.body),
      };
    }

    // Authenticate
    let auth;
    try {
      auth = await authenticateRequest(event);
    } catch (authError) {
      return {
        statusCode: 401,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: authError.message }),
      };
    }

    const { instituteId, scopes } = auth;

    // Parse body for POST/PUT requests
    let body = {};
    if (event.httpMethod === 'POST' || event.httpMethod === 'PUT') {
      try {
        body = JSON.parse(event.body || '{}');
      } catch (e) {
        return {
          statusCode: 400,
          headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Invalid JSON body' }),
        };
      }
    }

    // ========================================================================
    // ROUTE: whatsapp/send
    // ========================================================================
    if (segments[0] === 'whatsapp' && segments[1] === 'send' && event.httpMethod === 'POST') {
      if (!checkScope(scopes, 'whatsapp:send')) {
        return { statusCode: 403, headers: corsHeaders(), body: JSON.stringify({ error: 'API key does not have whatsapp:send scope' }) };
      }
      const result = await handleSendWhatsApp(instituteId, body);
      return {
        statusCode: result.statusCode,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(result.body),
      };
    }

    // ========================================================================
    // ROUTE: whatsapp/balance
    // ========================================================================
    if (segments[0] === 'whatsapp' && segments[1] === 'balance' && event.httpMethod === 'GET') {
      if (!checkScope(scopes, 'whatsapp:read')) {
        return { statusCode: 403, headers: corsHeaders(), body: JSON.stringify({ error: 'API key does not have whatsapp:read scope' }) };
      }
      const result = await handleGetBalance(instituteId);
      return {
        statusCode: result.statusCode,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(result.body),
      };
    }

    // ========================================================================
    // ROUTE: students (list)
    // ========================================================================
    if (segments[0] === 'students' && !segments[1] && event.httpMethod === 'GET') {
      if (!checkScope(scopes, 'students:read')) {
        return { statusCode: 403, headers: corsHeaders(), body: JSON.stringify({ error: 'API key does not have students:read scope' }) };
      }
      const result = await handleListStudents(instituteId, queryParams);
      return {
        statusCode: result.statusCode,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(result.body),
      };
    }

    // ========================================================================
    // ROUTE: students/:id
    // ========================================================================
    if (segments[0] === 'students' && segments[1] && event.httpMethod === 'GET') {
      if (!checkScope(scopes, 'students:read')) {
        return { statusCode: 403, headers: corsHeaders(), body: JSON.stringify({ error: 'API key does not have students:read scope' }) };
      }
      const result = await handleGetStudent(instituteId, segments[1]);
      return {
        statusCode: result.statusCode,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(result.body),
      };
    }

    // ========================================================================
    // ROUTE: fees/pending
    // ========================================================================
    if (segments[0] === 'fees' && segments[1] === 'pending' && event.httpMethod === 'GET') {
      if (!checkScope(scopes, 'fees:read')) {
        return { statusCode: 403, headers: corsHeaders(), body: JSON.stringify({ error: 'API key does not have fees:read scope' }) };
      }
      const result = await handlePendingFees(instituteId, queryParams);
      return {
        statusCode: result.statusCode,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(result.body),
      };
    }

    // ========================================================================
    // ROUTE: notify/absent
    // ========================================================================
    if (segments[0] === 'notify' && segments[1] === 'absent' && event.httpMethod === 'POST') {
      if (!checkScope(scopes, 'whatsapp:send')) {
        return { statusCode: 403, headers: corsHeaders(), body: JSON.stringify({ error: 'API key does not have whatsapp:send scope' }) };
      }
      const result = await handleNotifyAbsent(instituteId, body);
      return {
        statusCode: result.statusCode,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(result.body),
      };
    }

    // ========================================================================
    // ROUTE: sms/send
    // ========================================================================
    if (segments[0] === 'sms' && segments[1] === 'send' && event.httpMethod === 'POST') {
      if (!checkScope(scopes, 'sms:send')) {
        return { statusCode: 403, headers: corsHeaders(), body: JSON.stringify({ error: 'API key does not have sms:send scope' }) };
      }
      const result = await handleSendSms(instituteId, body);
      return {
        statusCode: result.statusCode,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(result.body),
      };
    }

    // ========================================================================
    // 404 - Unknown route
    // ========================================================================
    return {
      statusCode: 404,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Unknown endpoint',
        availableEndpoints: [
          'POST /api/n8n/whatsapp/send',
          'GET /api/n8n/whatsapp/balance',
          'GET /api/n8n/students',
          'GET /api/n8n/students/:id',
          'GET /api/n8n/fees/pending',
          'POST /api/n8n/notify/absent',
          'POST /api/n8n/sms/send',
          'GET /api/n8n/health',
        ]
      }),
    };
  } catch (error) {
    console.error('n8n API error:', error.message || error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error', detail: error.message }),
    };
  }
};

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*' };
}