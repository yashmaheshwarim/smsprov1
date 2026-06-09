#!/usr/bin/env node
// Simple script to register a webhook on an OpenWA API server
// Usage: node scripts/register-openwa-webhook.js <baseUrl> <sessionId> <apiKey> <webhookUrl>

async function main() {
  const [,, baseUrl, sessionId, apiKey, webhookUrl] = process.argv;

  if (!baseUrl || !sessionId || !apiKey || !webhookUrl) {
    console.error('Usage: node scripts/register-openwa-webhook.js <baseUrl> <sessionId> <apiKey> <webhookUrl>');
    process.exit(2);
  }

  const endpoint = `${baseUrl.replace(/\/$/, '')}/api/sessions/${encodeURIComponent(sessionId)}/webhooks`;

  const body = {
    url: webhookUrl,
    events: ['message.received','message.sent','*']
  };

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify(body),
    });

    const text = await resp.text();
    let json;
    try { json = JSON.parse(text); } catch { json = null; }

    if (!resp.ok) {
      console.error('Failed to create webhook:', resp.status, resp.statusText);
      if (json) console.error(JSON.stringify(json, null, 2)); else console.error(text);
      process.exit(1);
    }

    console.log('Webhook created successfully:');
    if (json) console.log(JSON.stringify(json, null, 2)); else console.log(text);
  } catch (err) {
    console.error('Error connecting to OpenWA API:', err.message || err);
    process.exit(1);
  }
}

main();
