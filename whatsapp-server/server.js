// ============================================================================
// Independent WhatsApp Web Server
// Built with @whiskeysockets/baileys - no external dependencies
// Manages multi-tenant WhatsApp sessions with QR auth
// ============================================================================

import express from 'express';
import cors from 'cors';
import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 2785;
const SESSIONS_DIR = join(__dirname, 'sessions');
const SESSIONS_DB = join(__dirname, 'sessions.json');

// Ensure directories exist
if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true });

// ============================================================================
// DATABASE (simple JSON file for session tracking)
// ============================================================================

function loadSessionsDb() {
  try {
    if (existsSync(SESSIONS_DB)) {
      return JSON.parse(readFileSync(SESSIONS_DB, 'utf-8'));
    }
  } catch (e) { /* ignore */ }
  return {};
}

function saveSessionsDb(data) {
  writeFileSync(SESSIONS_DB, JSON.stringify(data, null, 2));
}

// ============================================================================
// SOCKET MANAGER
// ============================================================================

const activeSockets = new Map(); // sessionId -> { sock, qr, status, phone }
const reconnectAttempts = new Map(); // sessionId -> number
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 3000;

function createLogger(sessionId) {
  return pino({
    level: 'silent',
    transport: {
      target: 'pino/file',
      options: { destination: join(SESSIONS_DIR, `${sessionId}.log`) }
    }
  });
}

async function startSocket(sessionId, isRetry = false) {
  const sessionDir = join(SESSIONS_DIR, sessionId);
  if (!existsSync(sessionDir)) mkdirSync(sessionDir, { recursive: true });

  // Track reconnect attempts
  if (!isRetry) {
    reconnectAttempts.set(sessionId, 0);
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const logger = createLogger(sessionId);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger,
    browser: ['SMS Pro WhatsApp', 'Chrome', '1.0.0'],
  });

  const existing = activeSockets.get(sessionId);
  const sessionData = existing || { sock: null, qr: null, status: 'connecting', phone: null };
  sessionData.sock = sock;

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        sessionData.qr = await QRCode.toDataURL(qr);
        sessionData.status = 'pending';
        // Reset reconnect counter on successful QR generation (new auth flow started)
        reconnectAttempts.set(sessionId, 0);
        console.log(`[${sessionId}] 📱 QR code generated, scan to connect.`);
      } catch (e) {
        console.error(`[${sessionId}] QR generation error:`, e.message);
      }
    }

    if (connection === 'open') {
      sessionData.status = 'active';
      sessionData.phone = sock.user?.id || null;
      // Reset reconnect counter on successful connection
      reconnectAttempts.set(sessionId, 0);

      // Update DB
      const db = loadSessionsDb();
      if (db[sessionId]) {
        db[sessionId].status = 'active';
        db[sessionId].phone = sock.user?.id || null;
        db[sessionId].lastActivity = new Date().toISOString();
        saveSessionsDb(db);
      }

      console.log(`[${sessionId}] ✅ Connected: ${sock.user?.id}`);
    }

    if (connection === 'close') {
      const isLoggedOut = lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut;
      const currentAttempts = reconnectAttempts.get(sessionId) || 0;

      console.log(
        `[${sessionId}] ❌ Disconnected. loggedOut: ${isLoggedOut}, attempt: ${currentAttempts + 1}/${MAX_RECONNECT_ATTEMPTS}`
      );

      // Always update session data state
      sessionData.status = isLoggedOut ? 'logged_out' : 'disconnected';
      sessionData.qr = isLoggedOut ? null : sessionData.qr;

      // Update DB
      const db = loadSessionsDb();
      if (db[sessionId]) {
        db[sessionId].status = isLoggedOut ? 'disconnected' : 'disconnected';
        db[sessionId].phone = null;
        db[sessionId].lastActivity = new Date().toISOString();
        saveSessionsDb(db);
      }

      // Reconnect logic with max attempts
      if (!isLoggedOut && currentAttempts < MAX_RECONNECT_ATTEMPTS) {
        const nextAttempt = currentAttempts + 1;
        reconnectAttempts.set(sessionId, nextAttempt);

        console.log(
          `[${sessionId}] 🔄 Reconnecting (${nextAttempt}/${MAX_RECONNECT_ATTEMPTS}) in ${RECONNECT_DELAY_MS}ms...`
        );

        setTimeout(() => startSocket(sessionId, true), RECONNECT_DELAY_MS);
      } else if (isLoggedOut) {
        console.log(
          `[${sessionId}] 🔐 Session logged out. Delete session directory and scan new QR code to reconnect.`
        );
        // Clean up stale auth state so reconnect endpoint generates fresh QR
        sessionData.status = 'logged_out';
      } else {
        console.log(
          `[${sessionId}] ⛔ Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Use /reconnect endpoint to force new QR.`
        );
        sessionData.status = 'disconnected';
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', (m) => {
    // Handle incoming messages if needed
  });

  activeSockets.set(sessionId, sessionData);
  return sock;
}

// ============================================================================
// EXPRESS MIDDLEWARE
// ============================================================================

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', sessions: activeSockets.size });
});

// ============================================================================
// SESSION API
// ============================================================================

// Create a new WhatsApp session
app.post('/sessions/create', async (req, res) => {
  try {
    const { sessionId, name } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    // Check if session already exists
    if (activeSockets.has(sessionId)) {
      return res.status(409).json({ error: 'Session already exists' });
    }

    const db = loadSessionsDb();
    db[sessionId] = {
      name: name || sessionId,
      status: 'pending',
      phone: null,
      createdAt: new Date().toISOString(),
      lastActivity: null,
    };
    saveSessionsDb(db);

    // Start socket (non-blocking - QR will be available shortly)
    startSocket(sessionId).catch(err => {
      console.error(`[${sessionId}] Failed to start socket:`, err.message);
    });

    // Wait a bit for QR generation
    await new Promise(resolve => setTimeout(resolve, 2000));

    const sessionData = activeSockets.get(sessionId);
    const qrCode = sessionData?.qr || null;

    res.json({
      sessionId,
      qrCode,
      status: 'pending'
    });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get QR code for session
app.get('/sessions/:sessionId/qr', async (req, res) => {
  try {
    const { sessionId } = req.params;
    let sessionData = activeSockets.get(sessionId);

    if (!sessionData || sessionData.status === 'logged_out' || sessionData.status === 'disconnected') {
      // If logged out, clear stale auth state first
      if (sessionData?.status === 'logged_out') {
        const sessionDir = join(SESSIONS_DIR, sessionId);
        if (existsSync(sessionDir)) {
          const { rmSync } = await import('fs');
          rmSync(sessionDir, { recursive: true, force: true });
          console.log(`[${sessionId}] Cleared stale auth state for fresh QR generation`);
        }
      }

      // Start fresh socket
      const db = loadSessionsDb();
      if (db[sessionId]) {
        db[sessionId].status = 'pending';
        saveSessionsDb(db);
      }

      // Remove old session data and start fresh
      if (sessionData) {
        activeSockets.delete(sessionId);
      }

      startSocket(sessionId).catch(e => {
        console.error(`[${sessionId}] Failed to start socket for QR:`, e.message);
      });

      // Wait for QR generation
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        sessionData = activeSockets.get(sessionId);
        if (sessionData?.qr) break;
      }
    }

    const data = activeSockets.get(sessionId);
    res.json({
      qrCode: data?.qr || null,
      sessionId,
      status: data?.status || 'pending'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get session status
app.get('/sessions/:sessionId/status', (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionData = activeSockets.get(sessionId);
    const db = loadSessionsDb();

    res.json({
      sessionId,
      status: sessionData?.status || db[sessionId]?.status || 'unknown',
      phoneNumber: sessionData?.phone || db[sessionId]?.phone || null,
      name: db[sessionId]?.name || sessionId,
      lastActivity: db[sessionId]?.lastActivity || null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Disconnect session
app.post('/sessions/:sessionId/disconnect', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionData = activeSockets.get(sessionId);

    if (sessionData?.sock) {
      sessionData.sock.end(new Error('User disconnected'));
      activeSockets.delete(sessionId);
    }

    const db = loadSessionsDb();
    if (db[sessionId]) {
      db[sessionId].status = 'disconnected';
      db[sessionId].phone = null;
      saveSessionsDb(db);
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reconnect session
app.post('/sessions/:sessionId/reconnect', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Clean up existing socket
    const existing = activeSockets.get(sessionId);
    if (existing?.sock) {
      existing.sock.end(new Error('Reconnecting'));
      activeSockets.delete(sessionId);
    }

    // Remove auth state to force new QR
    const sessionDir = join(SESSIONS_DIR, sessionId);
    if (existsSync(sessionDir)) {
      const { rmSync } = await import('fs');
      rmSync(sessionDir, { recursive: true, force: true });
    }

    const db = loadSessionsDb();
    if (db[sessionId]) {
      db[sessionId].status = 'pending';
      db[sessionId].phone = null;
      saveSessionsDb(db);
    }

    // Start fresh
    startSocket(sessionId).catch(e => {});
    await new Promise(resolve => setTimeout(resolve, 2000));

    const sessionData = activeSockets.get(sessionId);
    res.json({
      qrCode: sessionData?.qr || null,
      sessionId,
      status: 'pending'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// MESSAGING API
// ============================================================================

// Send a message
app.post('/sessions/:sessionId/send', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ error: 'phone and message are required' });
    }

    const sessionData = activeSockets.get(sessionId);
    if (!sessionData?.sock || sessionData.status !== 'active') {
      return res.status(400).json({ error: 'Session not active' });
    }

    // Format phone: remove any +, @, etc. and add @s.whatsapp.net
    const cleanPhone = phone.replace(/[^\d]/g, '');
    const jid = `${cleanPhone}@s.whatsapp.net`;

    const result = await sessionData.sock.sendMessage(jid, {
      text: message,
    });

    res.json({
      messageId: result?.key?.id || null,
      status: 'sent',
      phoneNumber: cleanPhone,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send bulk messages (sequential with 3-5 second delay)
app.post('/sessions/:sessionId/send-bulk', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { phones, message, delayMs } = req.body;

    if (!phones || !message || !Array.isArray(phones)) {
      return res.status(400).json({ error: 'phones (array) and message are required' });
    }

    const sessionData = activeSockets.get(sessionId);
    if (!sessionData?.sock || sessionData.status !== 'active') {
      return res.status(400).json({ error: 'Session not active' });
    }

    // Use the specified delay or default to 4000ms (4 seconds)
    const delayBetweenMessages = delayMs || 4000;

    const results = [];
    for (let i = 0; i < phones.length; i++) {
      const phone = phones[i];
      try {
        const cleanPhone = phone.replace(/[^\d]/g, '');
        const jid = `${cleanPhone}@s.whatsapp.net`;
        const result = await sessionData.sock.sendMessage(jid, { text: message });
        results.push({ phone: cleanPhone, success: true, messageId: result?.key?.id });
        
        console.log(`[${sessionId}] Sent ${i + 1}/${phones.length}: ${cleanPhone}`);
        
        // Sleep between messages (skip delay after last message)
        if (i < phones.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenMessages));
        }
      } catch (e) {
        results.push({ phone, success: false, error: e.message });
      }
    }

    res.json({
      campaignId: `camp-${Date.now()}`,
      status: 'completed',
      totalPhones: phones.length,
      sentCount: results.filter(r => r.success).length,
      delayMs: delayBetweenMessages,
      results,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send delayed messages with per-message content (individual messages with varying content)
app.post('/sessions/:sessionId/send-messages-delayed', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { messages, delayMs, onProgress } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages (array) is required' });
    }

    const sessionData = activeSockets.get(sessionId);
    if (!sessionData?.sock || sessionData.status !== 'active') {
      return res.status(400).json({ error: 'Session not active' });
    }

    const delayBetween = delayMs || 4000; // Default 4 seconds
    const results = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const phone = msg.phone || msg.to;
      const text = msg.message || msg.text;

      if (!phone || !text) {
        results.push({ index: i, success: false, error: 'Missing phone or message' });
        continue;
      }

      try {
        const cleanPhone = phone.replace(/[^\d]/g, '');
        const jid = `${cleanPhone}@s.whatsapp.net`;
        const result = await sessionData.sock.sendMessage(jid, { text });
        results.push({ 
          index: i, 
          phone: cleanPhone, 
          name: msg.name || '',
          success: true, 
          messageId: result?.key?.id 
        });
        
        console.log(`[${sessionId}] Sent ${i + 1}/${messages.length}: ${msg.name || cleanPhone}`);
        
        // Notify progress via callback if provided
        if (onProgress && typeof onProgress === 'function') {
          onProgress({ current: i + 1, total: messages.length });
        }
        
        // Sleep between messages (skip delay after last message)
        if (i < messages.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayBetween));
        }
      } catch (e) {
        results.push({ index: i, phone, name: msg.name || '', success: false, error: e.message });
      }
    }

    res.json({
      campaignId: `camp-${Date.now()}`,
      status: 'completed',
      totalMessages: messages.length,
      sentCount: results.filter(r => r.success).length,
      delayMs: delayBetween,
      results,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get session contacts
app.get('/sessions/:sessionId/contacts', (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionData = activeSockets.get(sessionId);

    if (!sessionData?.sock) {
      return res.json({ contacts: [] });
    }

    res.json({ contacts: [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// EMAIL API - Proxy for local development (when Netlify function is unavailable)
// ============================================================================

// Send email via SMTP or Brevo API (proxy endpoint for local dev)
app.post('/api/send-email', async (req, res) => {
  try {
    const { institute_id, to, subject, html, text, cc, bcc, attachments, provider, providerConfig } = req.body;

    if (!to || !subject) {
      return res.status(400).json({ error: 'Missing required fields: to, subject' });
    }

    // Determine provider and config
    let emailProvider = provider || 'smtp';
    let config = providerConfig || {};

    // Try to load per-institute config from Supabase
    if (institute_id) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabaseUrl = process.env.SUPABASE_URL || '';
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
        if (supabaseUrl && supabaseKey) {
          const sb = createClient(supabaseUrl, supabaseKey);
          const { data: integration } = await sb
            .from('institute_integrations')
            .select('config, provider')
            .eq('institute_id', institute_id)
            .in('provider', ['smtp', 'brevo', 'brevo_api', 'brevo_smtp'])
            .eq('status', 'connected')
            .maybeSingle();

          if (integration) {
            emailProvider = integration.provider === 'brevo' ? 'brevo_api' : integration.provider;
            config = { ...config, ...(integration.config || {}) };
          }
        }
      } catch (e) {
        console.warn('Could not load Supabase config for email:', e.message);
      }
    }

    // Merge with env defaults
    config.from_email = config.from_email || process.env.DEFAULT_FROM_EMAIL || 'noreply@institute.local';

    let result;

    if (emailProvider === 'brevo_api') {
      // Brevo REST API
      const apiKey = config.api_key || process.env.BREVO_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: 'Brevo API key not configured. Configure it in Integrations page.' });
      }

      const payload = {
        sender: { name: config.from_name || 'InstituteOS', email: config.from_email },
        to: [{ email: to }],
        subject,
        htmlContent: html || '',
      };
      if (text) payload.textContent = text;

      const brevoResp = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': apiKey, Accept: 'application/json' },
        body: JSON.stringify(payload),
      });

      const brevoData = await brevoResp.json().catch(() => ({}));
      if (!brevoResp.ok) {
        throw new Error(brevoData.message || `Brevo API error: ${brevoResp.status}`);
      }
      result = { messageId: brevoData.messageId || brevoData.id };
    } else {
      // SMTP
      let nodemailer;
      try {
        nodemailer = (await import('nodemailer')).default;
      } catch (e) {
        return res.status(500).json({ 
          error: 'nodemailer not available. Install it: cd whatsapp-server && npm install nodemailer',
          note: 'Or configure Brevo API key in Integrations page and try again.'
        });
      }

      const smtpHost = config.smtp_host || process.env.SMTP_HOST || 'smtp.gmail.com';
      const smtpPort = parseInt(config.smtp_port || process.env.SMTP_PORT || '587');
      const smtpUser = config.smtp_username || config.from_email || process.env.DEFAULT_SMTP_EMAIL;
      const smtpPass = config.smtp_password || process.env.DEFAULT_SMTP_PASSWORD;

      if (!smtpUser || !smtpPass) {
        return res.status(400).json({ 
          error: 'SMTP credentials not configured. Configure SMTP in Integrations page or set DEFAULT_SMTP_EMAIL env var.' 
        });
      }

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });

      const info = await transporter.sendMail({
        from: `"${config.from_name || 'InstituteOS'}" <${config.from_email}>`,
        to,
        subject,
        html: html || '',
        text: text || undefined,
      });

      result = { messageId: info.messageId };
    }

    // Log to message_logs if Supabase available
    if (institute_id) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabaseUrl = process.env.SUPABASE_URL || '';
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
        if (supabaseUrl && supabaseKey) {
          const sb = createClient(supabaseUrl, supabaseKey);
          await sb.from('message_logs').insert({
            institute_id,
            channel: 'email',
            recipient: to,
            message: subject,
            status: 'sent',
            external_id: result.messageId,
          });
        }
      } catch (e) {
        console.warn('Could not log email to message_logs:', e.message);
      }
    }

    res.json({ success: true, message_id: result.messageId });
  } catch (error) {
    console.error('Email send error:', error);
    res.status(500).json({ error: error.message || 'Failed to send email' });
  }
});

// ============================================================================
// STARTUP - Recover previous sessions with error handling
// ============================================================================

async function startServer(port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`✅ WhatsApp Web Server running on http://0.0.0.0:${port}`);
      console.log(`✅ Health: http://localhost:${port}/health`);
      console.log(`✅ Email API: http://localhost:${port}/api/send-email (for local dev)`);
      resolve(server);
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${port} is already in use.`);
        server.close();
        reject(err);
      } else {
        console.error('❌ Server error:', String(err));
        reject(err);
      }
    });
  });
}

async function startup() {
  let port = parseInt(process.env.PORT) || PORT;
  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await startServer(port);
      break; // success
    } catch (err) {
      if (err.code === 'EADDRINUSE' && attempt < maxAttempts - 1) {
        port++;
        console.log(`Trying port ${port}...`);
      } else if (err.code === 'EADDRINUSE') {
        console.error(`❌ Could not find an available port after ${maxAttempts} attempts.`);
        console.error(`Please free up a port in range ${PORT}-${PORT + maxAttempts - 1} and restart.`);
        process.exit(1);
      } else {
        throw err;
      }
    }
  }

  const db = loadSessionsDb();
  console.log(`Found ${Object.keys(db).length} saved sessions`);

  let recoveredCount = 0;
  for (const [sessionId, session] of Object.entries(db)) {
    if (session.status === 'active' || session.status === 'pending') {
      recoveredCount++;
      console.log(`Recovering session: ${sessionId} (${session.name})`);
      startSocket(sessionId).catch(e => {
        console.error(`[${sessionId}] Recovery error:`, e instanceof Error ? e.message : String(e));
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  if (recoveredCount === 0) {
    console.log('ℹ️ No sessions to recover. Create a new session via the WhatsApp Manager in the app.');
  }
}

startup().catch((err) => {
  console.error('❌ Fatal startup error:', err instanceof Error ? err.message : String(err));
  console.log('Retrying in 3 seconds...');
  setTimeout(() => startup(), 3000);
});