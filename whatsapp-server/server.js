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

function createLogger(sessionId) {
  return pino({
    level: 'silent',
    transport: {
      target: 'pino/file',
      options: { destination: join(SESSIONS_DIR, `${sessionId}.log`) }
    }
  });
}

async function startSocket(sessionId) {
  const sessionDir = join(SESSIONS_DIR, sessionId);
  if (!existsSync(sessionDir)) mkdirSync(sessionDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const logger = createLogger(sessionId);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger,
    browser: ['SMS Pro WhatsApp', 'Chrome', '1.0.0'],
  });

  const sessionData = { sock, qr: null, status: 'connecting', phone: null };

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        sessionData.qr = await QRCode.toDataURL(qr);
        sessionData.status = 'pending';
      } catch (e) {
        console.error(`[${sessionId}] QR generation error:`, e.message);
      }
    }

    if (connection === 'open') {
      sessionData.status = 'active';
      sessionData.phone = sock.user?.id || null;

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
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      sessionData.status = 'disconnected';
      sessionData.qr = null;

      console.log(`[${sessionId}] ❌ Disconnected. Reconnect: ${shouldReconnect}`);

      const db = loadSessionsDb();
      if (db[sessionId]) {
        db[sessionId].status = 'disconnected';
        db[sessionId].phone = null;
        db[sessionId].lastActivity = new Date().toISOString();
        saveSessionsDb(db);
      }

      if (shouldReconnect) {
        setTimeout(() => startSocket(sessionId), 5000);
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
    const sessionData = activeSockets.get(sessionId);

    if (!sessionData) {
      // Try to start it
      const db = loadSessionsDb();
      if (db[sessionId]) {
        startSocket(sessionId).catch(e => {});
        await new Promise(resolve => setTimeout(resolve, 2000));
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

// Send bulk messages
app.post('/sessions/:sessionId/send-bulk', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { phones, message } = req.body;

    if (!phones || !message || !Array.isArray(phones)) {
      return res.status(400).json({ error: 'phones (array) and message are required' });
    }

    const sessionData = activeSockets.get(sessionId);
    if (!sessionData?.sock || sessionData.status !== 'active') {
      return res.status(400).json({ error: 'Session not active' });
    }

    const results = [];
    for (const phone of phones) {
      try {
        const cleanPhone = phone.replace(/[^\d]/g, '');
        const jid = `${cleanPhone}@s.whatsapp.net`;
        const result = await sessionData.sock.sendMessage(jid, { text: message });
        results.push({ phone: cleanPhone, success: true, messageId: result?.key?.id });
      } catch (e) {
        results.push({ phone, success: false, error: e.message });
      }
    }

    res.json({
      campaignId: `camp-${Date.now()}`,
      status: 'completed',
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
// STARTUP - Recover previous sessions
// ============================================================================

async function startup() {
  const db = loadSessionsDb();
  console.log(`Starting WhatsApp Web Server on port ${PORT}...`);
  console.log(`Found ${Object.keys(db).length} saved sessions`);

  for (const [sessionId, session] of Object.entries(db)) {
    if (session.status === 'active' || session.status === 'pending') {
      console.log(`Recovering session: ${sessionId} (${session.name})`);
      startSocket(sessionId).catch(e => {
        console.error(`Failed to recover ${sessionId}:`, e.message);
      });
      // Small delay between recoveries
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ WhatsApp Web Server running on http://0.0.0.0:${PORT}`);
    console.log(`✅ Health: http://localhost:${PORT}/health`);
  });
}

startup().catch(console.error);