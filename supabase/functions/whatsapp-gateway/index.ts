// ─── Supabase Edge Function: whatsapp-gateway ────────────────────────────────
// Serverless control plane in front of the persistent WhatsApp gateway
// (OpenWA or the repo's Baileys server). The browser talks ONLY to this
// function — it never needs the gateway URL or API key.
//
//   Browser ──▶ Supabase Edge Function (serverless) ──▶ OpenWA / Baileys server
//
// Routes (path-based):
//   GET  /health             probe the configured gateway /api/health
//   GET  /sessions           list sessions (normalized)
//   GET  /session            status of one institute (normalized + qrCode + pairingCode)
//   GET  /qr                 QR data URL for one institute
//   POST /connect            start session
//   POST /disconnect         stop session (keeps auth)
//   POST /logout             logout session (clears auth)
//   POST /refresh-qr         force a fresh QR
//   POST /pairing-code       request WhatsApp pairing code { phone }
//   POST /send               send a text message { to, text }
//   GET  /config             get this institute's gateway config (key masked)
//   PUT  /config             save this institute's gateway config
//   POST /test               test a (possibly unsaved) gateway config
//
// Config resolution: per-institute row in `whatsapp_gateway_config` first,
// falling back to env vars:
//   WHATSAPP_GATEWAY_URL   – persistent gateway origin
//   WHATSAPP_GATEWAY_API_KEY – OpenWA API key
//   WHATSAPP_GATEWAY_TYPE  – 'baileys' | 'openwa'
//
// Deploy (public — the app has no Supabase Auth JWT yet):
//   supabase functions deploy whatsapp-gateway --no-verify-jwt
//   supabase secrets set WHATSAPP_GATEWAY_URL=... WHATSAPP_GATEWAY_API_KEY=... WHATSAPP_GATEWAY_TYPE=baileys

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-secret',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

/**
 * Optional shared-secret check. Enforced ONLY when the function has a
 * WHATSAPP_APP_SECRET secret AND the caller sends the matching x-app-secret
 * header. Opt-in hardening for multi-tenant isolation — if the secret is set
 * on the function, requests without a matching header are rejected. The
 * frontend sends it from VITE_WHATSAPP_APP_SECRET when configured.
 */
function checkAppSecret(req: Request): string | null {
  const expected = Deno.env.get('WHATSAPP_APP_SECRET') || '';
  if (!expected) return null; // not configured → allow (matches app's current model)
  const provided = req.headers.get('x-app-secret') || '';
  if (!provided || provided !== expected) {
    return 'Missing or invalid x-app-secret header';
  }
  return null;
}

/** OpenWA status → app status (mirrors src/lib/whatsapp-socket.ts) */
function mapOpenWAStatus(status?: string): string {
  switch (status) {
    case 'ready': return 'connected';
    case 'initializing':
    case 'qr_ready':
    case 'authenticating':
    case 'created': return 'connecting';
    case 'failed':
    case 'action_required': return 'error';
    case 'disconnected':
    default: return 'disconnected';
  }
}

function isOpenWA(type: string): boolean {
  return type === 'openwa';
}

/** Format a phone number as a WhatsApp chatId (91XXXXXXXXXX@c.us) */
function toChatId(to: string): string {
  if (to.includes('@')) return to;
  const digits = to.replace(/\D/g, '');
  return `${digits}@c.us`;
}

interface GatewayConfig {
  base_url: string;
  api_key: string;
  server_type: 'baileys' | 'openwa';
  session_id: string | null;
  source: 'db' | 'env';
  /** Set when the config table is missing (migration not applied) — surfaced in UI */
  config_error?: string;
}

/** Hint shown when the whatsapp_gateway_config table doesn't exist yet */
const MISSING_TABLE_HINT =
  'The whatsapp_gateway_config table is missing. Apply migrations first: npx supabase db push (or npm run deploy:whatsapp).';

/** True when a Supabase error means the table doesn't exist (migration pending).
 * Postgres code 42P01 is the precise "undefined_table" signal; also accept a
 * message mentioning both "relation" AND "does not exist" (avoiding false
 * positives on unrelated errors that merely contain the word "relation"). */
function isMissingTableError(err: any): boolean {
  const msg = `${err?.message || ''}`.toLowerCase();
  return err?.code === '42P01' || (msg.includes('does not exist') && msg.includes('relation'));
}

async function loadConfig(supabase: any, instituteId: string): Promise<GatewayConfig> {
  const envUrl = Deno.env.get('WHATSAPP_GATEWAY_URL') || '';
  const envKey = Deno.env.get('WHATSAPP_GATEWAY_API_KEY') || '';
  const envType = (Deno.env.get('WHATSAPP_GATEWAY_TYPE') || 'baileys') as GatewayConfig['server_type'];

  if (!instituteId || instituteId.length !== 36) {
    // Not a real institute UUID — fall back to global env config (used by /health probes)
    return { base_url: envUrl, api_key: envKey, server_type: envType, session_id: null, source: 'env' };
  }

  try {
    const { data, error } = await supabase
      .from('whatsapp_gateway_config')
      .select('base_url, api_key, server_type, session_id')
      .eq('institute_id', instituteId)
      .maybeSingle();
    if (error) {
      if (isMissingTableError(error)) {
        return { base_url: '', api_key: '', server_type: envType, session_id: null, source: 'env', config_error: MISSING_TABLE_HINT };
      }
      throw error;
    }
    if (data?.base_url) {
      return {
        base_url: data.base_url,
        api_key: data.api_key || '',
        server_type: data.server_type === 'openwa' ? 'openwa' : 'baileys',
        session_id: data.session_id || null,
        source: 'db',
      };
    }
  } catch (err) {
    console.error('loadConfig error:', err);
  }

  return { base_url: envUrl, api_key: envKey, server_type: envType, session_id: null, source: 'env' };
}

async function saveSessionId(supabase: any, instituteId: string, sessionId: string): Promise<void> {
  try {
    await supabase
      .from('whatsapp_gateway_config')
      .upsert(
        { institute_id: instituteId, session_id: sessionId, updated_at: new Date().toISOString() },
        { onConflict: 'institute_id' }
      );
  } catch (err) {
    console.error('saveSessionId error:', err);
  }
}

/** Normalize a gateway base URL (strip trailing slash + trailing /api) */
function normalizeBaseUrl(url: string): string {
  const clean = url.replace(/\/+$/, '');
  return clean.replace(/\/api$/i, '');
}

/** Proxy a request to the persistent gateway with the right auth headers */
async function proxyGateway(cfg: GatewayConfig, path: string, method = 'GET', body?: unknown): Promise<Response> {
  const base = normalizeBaseUrl(cfg.base_url);
  if (!base) throw new Error('No WhatsApp gateway configured. Set it in Server Settings or the WHATSAPP_GATEWAY_URL env var.');

  const headers: Record<string, string> = {};
  if (isOpenWA(cfg.server_type) && cfg.api_key) headers['X-API-Key'] = cfg.api_key;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });

  if (res.status === 204) return json({ ok: true }, 200);
  let data: unknown = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const msg = (data as any)?.message || (data as any)?.error || `Gateway error ${res.status}`;
    return json({ error: msg, status: res.status }, res.status >= 500 ? 502 : res.status);
  }
  return json(data ?? { ok: true }, 200);
}

/**
 * Resolve the OpenWA session id for an institute (create on first use).
 * Baileys gateways address sessions directly by institute id.
 */
async function ensureSession(supabase: any, cfg: GatewayConfig, instituteId: string): Promise<string> {
  if (!isOpenWA(cfg.server_type)) return instituteId;
  if (cfg.session_id) return cfg.session_id;

  const base = normalizeBaseUrl(cfg.base_url);
  const headers: Record<string, string> = {};
  if (cfg.api_key) headers['X-API-Key'] = cfg.api_key;

  const listRes = await fetch(`${base}/api/sessions`, { headers, signal: AbortSignal.timeout(15000) });
  const list = listRes.ok ? await listRes.json() : [];
  const found = (Array.isArray(list) ? list : []).find((s: any) => s.name === instituteId);

  if (found?.id) {
    await saveSessionId(supabase, instituteId, found.id);
    return found.id;
  }

  // Create the session (name = institute UUID, matches OpenWA's ^[a-zA-Z0-9-]+$ rule)
  const createRes = await fetch(`${base}/api/sessions`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: instituteId }),
    signal: AbortSignal.timeout(15000),
  });
  if (!createRes.ok) throw new Error(`Could not create gateway session (${createRes.status})`);
  const created = await createRes.json();
  if (created?.id) {
    await saveSessionId(supabase, instituteId, created.id);
    return created.id;
  }
  throw new Error('Gateway session could not be resolved');
}

/** Normalize a gateway session object into the app's SessionInfo shape */
function normalizeSession(cfg: GatewayConfig, raw: any, instituteId: string) {
  if (isOpenWA(cfg.server_type)) {
    return {
      instituteId,
      status: mapOpenWAStatus(raw.status),
      phone: raw.phone || undefined,
      qrCode: raw.qrCode || undefined,
      pairingCode: raw.pairingCode || undefined,
      error: raw.lastError || undefined,
    };
  }
  return {
    instituteId,
    status: raw.status || 'disconnected',
    phone: raw.phone || undefined,
    qrCode: raw.qrCode || undefined,
    pairingCode: raw.pairingCode || undefined,
    connectedAt: raw.connectedAt || undefined,
    lastDisconnectedAt: raw.lastDisconnectedAt || undefined,
    error: raw.error || undefined,
  };
}

serve(async (req) => {    // ── CORS preflight ──────────────────────────────────────────────────────
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      // Optional shared-secret enforcement (see checkAppSecret)
      const secretErr = checkAppSecret(req);
      if (secretErr) return error(secretErr, 401);

      const url = new URL(req.url);
      // Route = first segment after /functions/v1/whatsapp-gateway/
      const parts = url.pathname.split('/').filter(Boolean);
      const fnIdx = parts.findIndex((p) => p === 'whatsapp-gateway');
      const route = (fnIdx >= 0 ? parts[fnIdx + 1] : parts[0]) || '';

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, serviceKey);

      /** Verify the institute exists — cheap guard against arbitrary UUIDs */
      const instituteExists = async (id: string): Promise<boolean> => {
        try {
          const { data } = await supabase.from('institutes').select('id').eq('id', id).maybeSingle();
          return !!data;
        } catch {
          return false;
        }
      };

    // institute_id comes from the query string (GET) or the JSON body (POST/PUT)
    let body: any = {};
    if (req.method === 'POST' || req.method === 'PUT') {
      try { body = await req.json(); } catch { body = {}; }
    }
    const instituteId: string = url.searchParams.get('institute_id') || body.institute_id || '';

    // ── /health — probe the configured gateway ───────────────────────────
    if (route === 'health' && req.method === 'GET') {
      const cfg = await loadConfig(supabase, instituteId);
      if (!cfg.base_url) {
        return json({ ok: false, message: cfg.config_error || 'No WhatsApp gateway configured (set it in Server Settings or the WHATSAPP_GATEWAY_URL env var)' }, 200);
      }
      try {
        const startedAt = Date.now();
        const res = await fetch(`${normalizeBaseUrl(cfg.base_url)}/api/health`, {
          headers: isOpenWA(cfg.server_type) && cfg.api_key ? { 'X-API-Key': cfg.api_key } : {},
          signal: AbortSignal.timeout(8000),
        });
        let version: string | undefined;
        let gw: any = {};
        try { gw = await res.json(); version = gw.version; } catch { /* empty */ }
        return json({
          ok: res.ok,
          status: res.status,
          version,
          latencyMs: Date.now() - startedAt,
          gatewayType: cfg.server_type,
          source: cfg.source,
        }, 200);
      } catch (err: any) {
        return json({ ok: false, message: err?.message || 'Cannot reach gateway', gatewayType: cfg.server_type }, 200);
      }
    }

    // Everything below needs an institute
    if (!instituteId) return error('Missing institute_id');

    // ── GET /config — read this institute's gateway config (key masked) ──
    // Runs BEFORE the saved-config gate so the settings dialog can always
    // read the current state (and tell the admin what's missing).
    if (route === 'config' && req.method === 'GET') {
      const cfg = await loadConfig(supabase, instituteId);
      return json({
        configured: !!cfg.base_url,
        base_url: cfg.base_url,
        server_type: cfg.server_type,
        source: cfg.source,
        config_error: cfg.config_error,
        // Never send the real key back to the browser
        api_key_masked: cfg.api_key ? `${cfg.api_key.slice(0, 4)}••••${cfg.api_key.slice(-4)}` : '',
        has_api_key: !!cfg.api_key,
      }, 200);
    }

    // ── PUT /config — save this institute's gateway config ───────────────
    // Also runs BEFORE the gate — this is HOW the config gets saved in the
    // first place (chicken-and-egg: it can't require a saved config).
    if (route === 'config' && req.method === 'PUT') {
      if (!(await instituteExists(instituteId))) return error('Unknown institute', 404);
      const base_url = normalizeBaseUrl(String(body.base_url || '').trim());
      const server_type: GatewayConfig['server_type'] = body.server_type === 'openwa' ? 'openwa' : 'baileys';
      if (!base_url) return error('Missing base_url');
      try { new URL(base_url); } catch { return error('base_url must be a valid http(s) URL'); }

      // Preserve the saved API key when the incoming value is empty
      // ("leave empty to keep the currently saved key")
      let api_key = String(body.api_key || '').trim();
      if (!api_key) {
        const { data: existing } = await supabase
          .from('whatsapp_gateway_config')
          .select('api_key')
          .eq('institute_id', instituteId)
          .maybeSingle();
        if (existing?.api_key) api_key = existing.api_key;
      }

      const { error: upsertErr } = await supabase
        .from('whatsapp_gateway_config')
        .upsert(
          { institute_id: instituteId, base_url, api_key, server_type, updated_at: new Date().toISOString() },
          { onConflict: 'institute_id' }
        );
      if (upsertErr) {
        console.error('config upsert error:', upsertErr);
        return json({ ok: false, error: isMissingTableError(upsertErr) ? MISSING_TABLE_HINT : upsertErr.message }, 500);
      }
      return json({ ok: true, base_url, server_type, has_api_key: !!api_key }, 200);
    }

    // ── POST /test — test a (possibly unsaved) gateway config ────────────
    // Runs before the gate so "Test Connection" works even before the first save.
    if (route === 'test' && req.method === 'POST') {
      const saved = await loadConfig(supabase, instituteId);
      const testCfg: GatewayConfig = {
        base_url: body.base_url ? normalizeBaseUrl(String(body.base_url)) : saved.base_url,
        api_key: body.api_key !== undefined ? String(body.api_key).trim() : saved.api_key,
        server_type: body.server_type === 'openwa' ? 'openwa' : body.server_type === 'baileys' ? 'baileys' : saved.server_type,
        session_id: saved.session_id,
        source: saved.source,
      };
      if (!testCfg.base_url) return error('No gateway URL to test');
      try {
        const startedAt = Date.now();
        const res = await fetch(`${normalizeBaseUrl(testCfg.base_url)}/api/health`, {
          headers: isOpenWA(testCfg.server_type) && testCfg.api_key ? { 'X-API-Key': testCfg.api_key } : {},
          signal: AbortSignal.timeout(8000),
        });
        const latencyMs = Date.now() - startedAt;
        let version: string | undefined;
        try { version = (await res.json())?.version; } catch { /* empty */ }
        if (!res.ok) {
          return json({ ok: false, message: `Gateway responded with status ${res.status}`, latencyMs }, 200);
        }
        // Validate the API key against the (authenticated) sessions endpoint
        if (isOpenWA(testCfg.server_type)) {
          const keyRes = await fetch(`${normalizeBaseUrl(testCfg.base_url)}/api/sessions`, {
            headers: testCfg.api_key ? { 'X-API-Key': testCfg.api_key } : {},
            signal: AbortSignal.timeout(8000),
          });
          if (keyRes.status === 401 || keyRes.status === 403) {
            return json({ ok: false, message: 'Gateway is reachable, but the API key is missing or invalid', latencyMs }, 200);
          }
        }
        return json({ ok: true, version, latencyMs, gatewayType: testCfg.server_type }, 200);
      } catch (err: any) {
        return json({ ok: false, message: err?.message || 'Cannot reach gateway', latencyMs: undefined }, 200);
      }
    }

    // Everything below needs a saved gateway config
    const cfg = await loadConfig(supabase, instituteId);
    if (!cfg.base_url) {
      return error(cfg.config_error || 'No WhatsApp gateway configured for this institute. Open Server Settings and save one.');
    }

    // ── GET /sessions — list all sessions ────────────────────────────────
    if (route === 'sessions' && req.method === 'GET') {
      const res = await proxyGateway(cfg, '/api/sessions', 'GET');
      const data = await res.json();
      const list = data?.sessions || data || [];
      const normalized = (Array.isArray(list) ? list : []).map((s: any) =>
        normalizeSession(cfg, s, s.instituteId || s.name || s.id)
      );
      return json({ sessions: normalized }, res.status);
    }

    // ── GET /session — status of one institute ───────────────────────────
    if (route === 'session' && req.method === 'GET') {
      const sessionId = await ensureSession(supabase, cfg, instituteId);
      const res = await proxyGateway(cfg, `/api/sessions/${sessionId}`, 'GET');
      const raw = await res.json();
      return json(normalizeSession(cfg, raw, instituteId), res.status);
    }

    // ── GET /qr — QR data URL ────────────────────────────────────────────
    if (route === 'qr' && req.method === 'GET') {
      const sessionId = await ensureSession(supabase, cfg, instituteId);
      const res = await proxyGateway(cfg, `/api/sessions/${sessionId}/qr`, 'GET');
      const data = await res.json();
      return json({ qrCode: data?.qrCode || null }, res.status);
    }

    // ── POST /connect ────────────────────────────────────────────────────
    if (route === 'connect' && req.method === 'POST') {
      const sessionId = await ensureSession(supabase, cfg, instituteId);
      const path = isOpenWA(cfg.server_type)
        ? `/api/sessions/${sessionId}/start`
        : `/api/sessions/${instituteId}/connect`;
      const res = await proxyGateway(cfg, path, 'POST', {});
      const data = await res.json();
      // 400 = already started/starting — treat as success
      return json({ ...(data || {}), ok: res.ok || res.status === 400 }, res.ok || res.status === 400 ? 200 : res.status);
    }

    // ── POST /disconnect ─────────────────────────────────────────────────
    if (route === 'disconnect' && req.method === 'POST') {
      const sessionId = await ensureSession(supabase, cfg, instituteId);
      const path = isOpenWA(cfg.server_type)
        ? `/api/sessions/${sessionId}/stop`
        : `/api/sessions/${instituteId}/disconnect`;
      const res = await proxyGateway(cfg, path, 'POST', {});
      const data = await res.json();
      return json({ ...(data || {}), ok: res.ok || res.status === 400 }, res.ok || res.status === 400 ? 200 : res.status);
    }

    // ── POST /logout ─────────────────────────────────────────────────────
    if (route === 'logout' && req.method === 'POST') {
      const sessionId = await ensureSession(supabase, cfg, instituteId);
      const path = `/api/sessions/${sessionId}/logout`;
      const res = await proxyGateway(cfg, path, 'POST', {});
      // Session id is invalid after logout — drop the cache
      if (isOpenWA(cfg.server_type)) await saveSessionId(supabase, instituteId, '');
      const data = await res.json();
      return json({ ...(data || {}), ok: res.ok }, res.status);
    }

    // ── POST /refresh-qr ─────────────────────────────────────────────────
    if (route === 'refresh-qr' && req.method === 'POST') {
      if (isOpenWA(cfg.server_type)) {
        // stop → brief pause → start, forcing a fresh QR
        const sessionId = await ensureSession(supabase, cfg, instituteId);
        await proxyGateway(cfg, `/api/sessions/${sessionId}/stop`, 'POST', {}).catch(() => {});
        await new Promise((r) => setTimeout(r, 800));
        const res = await proxyGateway(cfg, `/api/sessions/${sessionId}/start`, 'POST', {});
        const data = await res.json();
        return json({ ...(data || {}), ok: res.ok || res.status === 400 }, res.ok || res.status === 400 ? 200 : res.status);
      }
      const res = await proxyGateway(cfg, `/api/sessions/${instituteId}/refresh-qr`, 'POST', {});
      const data = await res.json();
      return json({ ...(data || {}), ok: res.ok }, res.status);
    }

    // ── POST /pairing-code — WhatsApp "link with phone number" ───────────
    if (route === 'pairing-code' && req.method === 'POST') {
      const phone = String(body.phone || '').replace(/\D/g, '');
      if (!phone) return error('Missing phone number');
      if (isOpenWA(cfg.server_type)) {
        // OpenWA may not expose pairing — try it, surface a clear message if not.
        const sessionId = await ensureSession(supabase, cfg, instituteId);
        const res = await proxyGateway(cfg, `/api/sessions/${sessionId}/pairing-code`, 'POST', { phone });
        const data = await res.json();
        if (!res.ok && (res.status === 404 || res.status === 405)) {
          return error('This OpenWA gateway does not support pairing codes. Use the QR code, or point the gateway at the Baileys server (which supports both).', 400);
        }
        return json({ ...(data || {}), ok: res.ok }, res.status);
      }
      const res = await proxyGateway(cfg, `/api/sessions/${instituteId}/pairing-code`, 'POST', { phone });
      const data = await res.json();
      return json({ ...(data || {}), ok: res.ok }, res.status);
    }

    // ── POST /send — send a text message ─────────────────────────────────
    if (route === 'send' && req.method === 'POST') {
      const { to, text } = body;
      if (!to || !text) return error('Missing to or text');
      const sessionId = await ensureSession(supabase, cfg, instituteId);
      if (isOpenWA(cfg.server_type)) {
        const res = await proxyGateway(cfg, `/api/sessions/${sessionId}/messages/send-text`, 'POST', {
          chatId: toChatId(to),
          text,
        });
        const data = await res.json();
        return json({ success: res.ok, messageId: data?.messageId, ...(data || {}) }, res.status);
      }
      const res = await proxyGateway(cfg, `/api/sessions/${instituteId}/send`, 'POST', { to, text });
      const data = await res.json();
      return json({ ...(data || {}), success: data?.success === true || res.ok }, res.status);
    }

    return error(`Unknown route: ${route || '(none)'}`, 404);
  } catch (err: any) {
    console.error('whatsapp-gateway error:', err);
    return json({ error: err?.message || 'Unexpected error' }, 500);
  }
});
