// ============================================================================
// OpenWA API Proxy
// ============================================================================
// Forwards /api/openwa/* requests to the actual OpenWA server.
// The target URL is configured via the OPENWA_PROXY_TARGET env var.
// This allows the production HTTPS site to reach the local/in-office
// OpenWA server through a public tunnel (e.g. ngrok) without Mixed Content errors.
//
// Env vars:
//   OPENWA_PROXY_TARGET — base URL of the OpenWA server (e.g. https://abc123.ngrok.io)
//   OPENWA_PROXY_API_KEY — optional API key to add as X-API-Key header
// ============================================================================

const TARGET = process.env.OPENWA_PROXY_TARGET || '';
const API_KEY = process.env.OPENWA_PROXY_API_KEY || '';

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-API-Key',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      },
      body: '',
    };
  }

  // Check that proxy target is configured
  if (!TARGET) {
    console.error('OPENWA_PROXY_TARGET env var not set');
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'OpenWA proxy not configured',
        hint: 'Set OPENWA_PROXY_TARGET env var in Netlify dashboard to your ngrok URL',
      }),
    };
  }

  try {
    // Netlify redirects /api/openwa/* → /.netlify/functions/openwa-proxy/:splat
    // So event.path = /.netlify/functions/openwa-proxy/sessions/create (for example)
    // Strip the function prefix to get the API sub-path
    const functionPath = '/.netlify/functions/openwa-proxy';
    let apiPath = event.path.replace(functionPath, '');

    // Normalize empty path
    if (!apiPath || apiPath === '/') {
      apiPath = '';
    }

    // Reconstruct the full target URL
    const queryString = event.queryStringParameters
      ? '?' + new URLSearchParams(event.queryStringParameters).toString()
      : '';
    const targetUrl = `${TARGET.replace(/\/+$/, '')}${apiPath}${queryString}`;

    console.log(`OpenWA proxy: ${event.httpMethod} ${apiPath || '/'} -> ${targetUrl}`);

    // Build forward headers — preserve the original Authorization header
    // from the frontend (openwa-service.ts sends Authorization: Bearer <key>)
    const headers = {
      'Content-Type': event.headers['content-type'] || 'application/json',
    };

    if (event.headers['authorization']) {
      headers['Authorization'] = event.headers['authorization'];
    }

    if (API_KEY) {
      headers['X-API-Key'] = API_KEY;
    }

    // Forward the request to the target OpenWA server
    const response = await fetch(targetUrl, {
      method: event.httpMethod,
      headers: headers,
      body: event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD' && event.body
        ? event.body
        : undefined,
    });

    // Read response body
    const responseText = await response.text();
    let responseBody;
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = responseText;
    }

    // Return the proxied response
    return {
      statusCode: response.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': response.headers?.['content-type'] || 'application/json',
      },
      body: typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody),
    };
  } catch (error) {
    console.error('OpenWA proxy error:', error.message || error);

    return {
      statusCode: 502,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to reach OpenWA server',
        detail: error.message,
        hint: 'Make sure ngrok is running and OPENWA_PROXY_TARGET env var is set correctly',
      }),
    };
  }
};
