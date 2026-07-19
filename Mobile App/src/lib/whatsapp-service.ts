import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const WHATSAPP_SERVER_URL_STORAGE_KEY = '@whatsapp_server_url';
const DEFAULT_SERVER_URL = 'https://smsprov1-production.up.railway.app';

let cachedServerUrl: string | null = null;

// ─── Server URL Management ───────────────────────────────────────────────

export function getWhatsAppServerUrl(): string {
  return cachedServerUrl || DEFAULT_SERVER_URL;
}

export function setWhatsAppServerUrl(url: string): void {
  cachedServerUrl = url;
}

export async function saveServerUrl(url: string): Promise<void> {
  cachedServerUrl = url;
  await AsyncStorage.setItem(WHATSAPP_SERVER_URL_STORAGE_KEY, url);
}

export async function loadServerUrl(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(WHATSAPP_SERVER_URL_STORAGE_KEY);
    if (saved) {
      cachedServerUrl = saved;
      return saved;
    }
  } catch {
    // ignore
  }
  return DEFAULT_SERVER_URL;
}

// ─── Session Management ──────────────────────────────────────────────────

export async function fetchSessionStatus(
  instId: string
): Promise<{ status: string; phone?: string; error?: string } | null> {
  try {
    const url = getWhatsAppServerUrl();
    const res = await fetch(`${url}/api/session-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instituteId: instId }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('[WhatsApp] fetchSessionStatus error:', err);
    return null;
  }
}

export async function disconnectSession(instId: string): Promise<boolean> {
  try {
    const url = getWhatsAppServerUrl();
    const res = await fetch(`${url}/api/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instituteId: instId }),
    });
    return res.ok;
  } catch (err) {
    console.error('[WhatsApp] disconnectSession error:', err);
    return false;
  }
}

// ─── Message Sending ─────────────────────────────────────────────────────

export async function sendWhatsAppMessage(
  instId: string,
  phone: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const url = getWhatsAppServerUrl();
    const res = await fetch(`${url}/api/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instituteId: instId, to: phone, text: message }),
    });
    const data = await res.json();
    return { success: res.ok, error: data?.error };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function sendBulkWhatsAppMessages(
  instId: string,
  messages: { to: string; text: string }[]
): Promise<{ success: boolean; failed: number }> {
  try {
    const url = getWhatsAppServerUrl();
    const res = await fetch(`${url}/api/send-bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instituteId: instId, messages }),
    });
    const data = await res.json();
    return { success: res.ok, failed: data?.failed || 0 };
  } catch (err) {
    console.error('[WhatsApp] sendBulkWhatsAppMessages error:', err);
    return { success: false, failed: messages.length };
  }
}

// ─── Absent Student Notifications (used by Attendance screens) ───────────

interface AbsentStudent {
  id: string;
  name: string;
  parent_phone?: string;
  mother_phone?: string;
  father_phone?: string;
}

/**
 * Send a WhatsApp message about an absent student.
 * Compatible signature used by both admin and teacher Attendance screens.
 * Callers pass (instId, phone, studentName) or (instId, student, date, batchName).
 */
export async function sendAbsentNotification(
  instituteId: string,
  phoneOrStudent: string | AbsentStudent,
  studentNameOrDate?: string,
  batchName?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    let phone: string;
    let name: string;
    let date: string;
    let batch: string;

    if (typeof phoneOrStudent === 'string') {
      // Called as sendAbsentNotification(instId, phone, studentName)
      phone = phoneOrStudent;
      name = studentNameOrDate || 'Student';
      date = new Date().toISOString().split('T')[0];
      batch = batchName || '';
    } else {
      // Called as sendAbsentNotification(instId, student, date, batchName)
      const student = phoneOrStudent;
      phone = student.parent_phone || student.mother_phone || student.father_phone || '';
      name = student.name;
      date = studentNameOrDate || new Date().toISOString().split('T')[0];
      batch = batchName || '';
    }

    if (!phone) {
      return { success: false, error: 'No phone number available' };
    }

    const message = `Dear Parent, your ward ${name} was marked absent on ${date}${batch ? ` (${batch})` : ''}. Please contact the institute for details.`;

    // Log to message_queue
    await (supabase as any).from('whatsapp_logs').insert([{
      institute_id: instituteId,
      recipient: phone,
      recipient_name: name,
      message,
      channel: 'whatsapp',
    }]);

    // Also try API send
    try {
      const apiResult = await sendWhatsAppMessage(instituteId, phone, message);
      return apiResult;
    } catch {
      // API failed but we logged it
      return { success: true, error: 'Message queued for later delivery' };
    }
  } catch (err: any) {
    console.error('[WhatsApp] sendAbsentNotification error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Send bulk absent notifications to multiple students.
 */
export async function sendBulkAbsentNotifications(
  instituteId: string,
  students: { phone: string; name: string }[]
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const student of students) {
    const ok = await sendAbsentNotification(instituteId, student.phone, student.name);
    if (ok.success) sent++;
    else failed++;
  }
  return { sent, failed };
}
