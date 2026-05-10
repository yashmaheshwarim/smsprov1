const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
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
    console.log("WaPlus Outgoing webhook:", body);

    // Supabase service key client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Update status for sent message (match by ID or phone/timestamp)
    const { message_id, phone, status = 'delivered' } = body || {};
    
    const { data: institutes } = await supabase.from('institutes').select('id').limit(1);
    const instituteId = institutes?.[0]?.id;

    await supabase
      .from('whatsapp_webhooks')
      .update({ status, raw_payload: body })
      .eq('type', 'outgoing')
      .eq('from_phone', phone)
      .gte('created_at', new Date(Date.now() - 24*60*60*1000).toISOString()); // last 24h

    console.log('Updated outgoing WhatsApp status:', status);

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
};
