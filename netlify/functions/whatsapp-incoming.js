import { createClient } from '@supabase/supabase-js';

export async function handler(event, context) {
  // Handle OPTIONS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
      },
      body: ''
    };
  }

  try {
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseErr) {
      console.log('Non-JSON body:', event.body?.substring(0, 200));
      body = { raw: event.body };
    }
    console.log("WaPlus Incoming webhook:", body);

    // Supabase service key client (server-side, full access)
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase env vars');
      return { statusCode: 500, body: 'Server config error' };
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Expected WaPlus payload structure (adjust based on actual docs)
    const { phone, message, timestamp, instance_id, from, to } = body || {};
    
    // Find institute by phone or other identifier (simplified - enhance with actual logic)
    // For demo: assume first institute or log only
    const { data: institutes } = await supabase.from('institutes').select('id').limit(1);
    const instituteId = institutes?.[0]?.id;

    await supabase.from('whatsapp_webhooks').insert({
      institute_id: instituteId,
      type: 'incoming',
      from_phone: phone || from,
      to_phone: to,
      message: message,
      raw_payload: body,
      status: 'received'
    });

    console.log('Logged incoming WhatsApp message');

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({ success: true })
    };
  } catch (error) {
    console.error('Webhook error:', error);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid payload' })
    };
  }
}
