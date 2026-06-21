const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'POST,OPTIONS'
      },
      body: ''
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

  const { institute_id, to, subject, html } = body;

  if (!institute_id || !to || !subject) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  const defaultEmail = process.env.DEFAULT_SMTP_EMAIL;
  const defaultPass = process.env.DEFAULT_SMTP_PASSWORD;
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587');

  if (!defaultEmail || !defaultPass) {
    return { statusCode: 500, body: JSON.stringify({ error: 'SMTP not configured' }) };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: defaultEmail,
        pass: defaultPass
      }
    });

    const info = await transporter.sendMail({
      from: `"InstituteOS" <${defaultEmail}>`,
      to: to,
      subject: subject,
      html: html || ''
    });

    await supabase.from('message_logs').insert({
      institute_id,
      channel: 'email',
      recipient: to,
      message: subject,
      status: 'sent',
      external_id: info.messageId
    });

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ success: true, message_id: info.messageId })
    };
  } catch (error) {
    console.error('Email send error:', error);

    await supabase.from('message_logs').insert({
      institute_id,
      channel: 'email',
      recipient: to,
      message: subject || '',
      status: 'failed',
      failed_reason: error.message
    });

    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message || 'Failed to send email' })
    };
  }
};
