import { supabase } from './supabase';

// Use direct property access so Vite's define block and build-time env substitution work correctly
// This prevents Mixed Content errors on HTTPS sites
const WHATSAPP_SERVER_URL = import.meta.env.VITE_WHATSAPP_SERVER_URL || '/api/openwa';

async function getOpenwaWebhookForInstitute(instituteId: string) {
  try {
    const { data } = await supabase.from('institute_integrations').select('config').eq('institute_id', instituteId).eq('provider', 'openwa').maybeSingle();
    const envWebhook = (import.meta as any).env?.VITE_OPENWA_WEBHOOK || (import.meta as any).env?.VITE_APEXSMS_WEBHOOK || '';
    const webhook = data?.config?.webhookUrl || data?.config?.webhook || envWebhook;
    return webhook;
  } catch (err) {
    return null;
  }
}

/**
 * Check if the local WhatsApp Web server is running
 */
function createTimeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export async function checkWhatsAppServerHealth(): Promise<boolean> {
  try {
    const resp = await fetch(`${WHATSAPP_SERVER_URL}/health`, { method: 'GET', signal: createTimeoutSignal(3000) });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Check if there's an active WhatsApp session for this institute on the local server
 */
export async function getActiveWhatsAppSession(instituteId: string): Promise<{ sessionId: string; phone: string } | null> {
  try {
    // First check if server is running
    const healthy = await checkWhatsAppServerHealth();
    if (!healthy) return null;

    // Look up active session in the database
    const { data: sessions } = await supabase
      .from('whatsapp_sessions')
      .select('session_id, phone_number')
      .eq('institute_id', instituteId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);

    if (!sessions || sessions.length === 0) return null;

    const session = sessions[0];
    if (!session.session_id) return null;

    // Verify session is active on the server
    const resp = await fetch(`${WHATSAPP_SERVER_URL}/sessions/${session.session_id}/status`, {
      method: 'GET',
      signal: createTimeoutSignal(3000),
    });

    if (!resp.ok) return null;
    const data = await resp.json();

    if (data.status === 'active') {
      return { sessionId: session.session_id, phone: session.phone_number || data.phoneNumber || '' };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Send WhatsApp messages via local WhatsApp server with 3-5 second delay between messages
 */
export async function sendBulkWhatsAppViaServer(
  sessionId: string,
  messages: Array<{ phone: string; message: string; name?: string }>,
  delayMs: number = 4000,
  onProgress?: (current: number, total: number) => void
): Promise<Array<{ name: string; phone: string; success: boolean; messageId?: string; error?: string }>> {
  try {
    const resp = await fetch(`${WHATSAPP_SERVER_URL}/sessions/${sessionId}/send-messages-delayed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, delayMs }),
      signal: createTimeoutSignal(300000), // 5 minute timeout for bulk
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `Server error: ${resp.statusText}`);
    }

    const data = await resp.json();

    return (data.results || []).map((r: any) => ({
      name: r.name || r.phone,
      phone: r.phone,
      success: r.success,
      messageId: r.messageId,
      error: r.error,
    }));
  } catch (error: any) {
    console.error('Error sending via WhatsApp server:', error);
    throw error;
  }
}

export interface WhatsAppNotification {
  phone: string;
  studentName: string;
  instituteId: string;
  date: string;
}

export interface WhatsAppExamMarksNotification extends WhatsAppNotification {
  instituteName: string;
  examName: string;
  subject: string;
  marks: number;
  totalMarks: number;
  examDate: string;
}

export interface WhatsAppPendingFeesNotification extends WhatsAppNotification {
  instituteName: string;
  feeTitle: string;
  pendingAmount: number;
  dueDate: string;
}

export interface WhatsAppAttendanceNotification extends WhatsAppNotification {
  instituteName: string;
  status: "present" | "absent" | "late";
}

export const getExamMarksWhatsAppMessage = (
  studentName: string,
  examName: string,
  subject: string,
  marks: number,
  totalMarks: number,
  examDate: string,
  instituteName?: string
) => {
  const institute = instituteName || "Institute Name";
  const percentage = ((marks / totalMarks) * 100).toFixed(1);
  return `Hello Parent,\n\nYour child ${studentName} has received marks for ${examName} (${subject}):\nMarks: ${marks}/${totalMarks}\nPercentage: ${percentage}%\nDate: ${examDate}\n\n${institute}`;
};

export const getPendingFeesWhatsAppMessage = (
  studentName: string,
  feeTitle: string,
  pendingAmount: number,
  dueDate: string,
  instituteName?: string
) => {
  const institute = instituteName || "Institute Name";
  return `Hello Parent,\n\nThis is a reminder that ${studentName} has a pending fee: ${feeTitle}\nAmount Due: ₹${pendingAmount.toLocaleString("en-IN")}\nDue Date: ${dueDate}\n\nPlease make the payment at the earliest.\n\n${institute}`;
};

export const getAttendanceWhatsAppMessage = (
  studentName: string,
  date: string,
  status: "present" | "absent" | "late",
  instituteName?: string
) => {
  const institute = instituteName || "Institute Name";
  const statusText = status === "present" ? "was present" : status === "late" ? "was late" : "was absent";
  return `Hello Parent,\n\nThis is to notify you that your child ${studentName} ${statusText} on ${date}.\n\n${institute}`;
};

export const getAbsentWhatsAppMessage = (studentName: string, date?: string, instituteName?: string) => {
  const institute = instituteName || "Institute Name";
  return `Hello Parent,\n\nThis is to notify you that your child ${studentName} was absent on today's class.\n\n${institute}`;
};

export const formatWaMePhone = (phone: string) => {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return digits;
};

async function getInstituteName(instituteId: string) {
  try {
    const { data } = await supabase.from('institutes').select('name').eq('id', instituteId).single();
    return data?.name || "Institute Name";
  } catch {
    return "Institute Name";
  }
}

/**
  * Send an absent notification via WhatsApp.
  * Uses OpenWA webhook or falls back to wa.me link for manual sending.
  */
export const sendWhatsAppAbsentNotification = async (notif: WhatsAppNotification) => {
  const instituteName = await getInstituteName(notif.instituteId);
  const message = getAbsentWhatsAppMessage(notif.studentName, notif.date, instituteName);
  // Try OpenWA webhook first (per-institute config or env fallback)
  try {
    const webhook = await getOpenwaWebhookForInstitute(notif.instituteId);
    if (webhook) {
      const cleanPhone = notif.phone.replace(/[^0-9+]/g, '');
      const formattedPhone = cleanPhone.startsWith('+') ? cleanPhone : `+91${cleanPhone}`;
      const payload = { messages: [{ to: formattedPhone, message, name: notif.studentName, channel: 'whatsapp' }] };

      const resp = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (resp.ok) {
        let externalId: any = undefined;
        try {
          const j = await resp.json().catch(() => null);
          if (j && j.id) externalId = j.id;
        } catch {}

        await supabase.from('message_logs').insert([{
          institute_id: notif.instituteId,
          channel: 'whatsapp',
          recipient: formattedPhone,
          message,
          status: 'sent',
          external_id: externalId,
        }]);

        return `openwa:${externalId || 'queued'}`;
      }
    }
  } catch (err) {
    console.error('OpenWA send failed, falling back to wa.me:', err);
  }

  // Fallback: Log to database + return wa.me link
  try {
    await supabase.from('message_logs').insert([{
      institute_id: notif.instituteId,
      channel: 'whatsapp',
      recipient: notif.phone,
      message,
      status: 'pending',
    }]);
  } catch (e) {
    console.error('Failed to log message:', e);
  }

  const cleanPhone = formatWaMePhone(notif.phone);
  const encodedMsg = encodeURIComponent(message);
  return `https://wa.me/${cleanPhone}?text=${encodedMsg}`;
};

/**
  * Generate bulk WhatsApp links using OpenWA webhook or wa.me fallback.
  */
export const sendBulkWhatsAppNotifications = async (
  notifications: WhatsAppNotification[]
): Promise<{ name: string; link: string; sent: boolean }[]> => {
  if (notifications.length === 0) return [];
  const results: { name: string; link: string; sent: boolean }[] = [];

  const instituteId = notifications[0]?.instituteId;
  const instituteName = await getInstituteName(instituteId);
  const webhook = await getOpenwaWebhookForInstitute(instituteId);

  if (webhook) {
    // send in one batch
    const payload = notifications.map((n) => {
      const cleanPhone = n.phone.replace(/[^0-9+]/g, '');
      const formatted = cleanPhone.startsWith('+') ? cleanPhone : `+91${cleanPhone}`;
      return { to: formatted, message: getAbsentWhatsAppMessage(n.studentName, n.date, instituteName), name: n.studentName, channel: 'whatsapp' };
    });

    try {
      const resp = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: payload }) });
      if (resp.ok) {
        // Log all as sent
        const logs = payload.map((p) => ({ institute_id: instituteId, channel: p.channel, recipient: p.to, message: p.message, status: 'sent' }));
        try { await supabase.from('message_logs').insert(logs); } catch (e) { console.error('Log insert failed', e); }
        payload.forEach((p) => results.push({ name: p.name, link: `openwa:queued`, sent: true }));
        return results;
      }
    } catch (err) {
      console.error('OpenWA bulk send failed, will fallback to wa.me', err);
    }
  }

  // fallback: return wa.me links and mark pending
  for (const n of notifications) {
    const cleanPhone = formatWaMePhone(n.phone);
    const msg = getAbsentWhatsAppMessage(n.studentName, n.date, instituteName);
    try {
      await supabase.from('message_logs').insert([{ institute_id: n.instituteId, channel: 'whatsapp', recipient: cleanPhone, message: msg, status: 'pending' }]);
    } catch (e) { console.error('Log insert failed', e); }
    results.push({ name: n.studentName, link: `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, sent: false });
  }

  return results;
};

// Legacy function kept for backwards compatibility
export const getWhatsAppBulkLink = (notifications: WhatsAppNotification[]) => {
  if (notifications.length === 0) return null;
  return notifications.map(n => {
    const msg = getAbsentWhatsAppMessage(n.studentName, n.date);
    return {
      name: n.studentName,
      link: `https://wa.me/${formatWaMePhone(n.phone)}?text=${encodeURIComponent(msg)}`,
    };
  });
};

/**
 * Send exam/marks notification via WhatsApp.
 */
export const sendWhatsAppExamMarksNotification = async (notif: WhatsAppExamMarksNotification): Promise<string> => {
  const message = getExamMarksWhatsAppMessage(
    notif.studentName,
    notif.examName,
    notif.subject,
    notif.marks,
    notif.totalMarks,
    notif.examDate,
    notif.instituteName
  );
  try {
    const webhook = await getOpenwaWebhookForInstitute(notif.instituteId);
    if (webhook) {
      const cleanPhone = notif.phone.replace(/[^0-9+]/g, '');
      const formattedPhone = cleanPhone.startsWith('+') ? cleanPhone : `+91${cleanPhone}`;
      const payload = { messages: [{ to: formattedPhone, message, name: notif.studentName, channel: 'whatsapp' }] };
      const resp = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (resp.ok) {
        await supabase.from('message_logs').insert([{
          institute_id: notif.instituteId,
          channel: 'whatsapp',
          recipient: formattedPhone,
          message,
          status: 'sent',
        }]);
        return `sent:openwa`;
      }
    }
  } catch (err) {
    console.error('OpenWA send failed:', err);
  }

  const cleanPhone = formatWaMePhone(notif.phone);
  const encodedMsg = encodeURIComponent(message);
  return `https://wa.me/${cleanPhone}?text=${encodedMsg}`;
};

/**
 * Send pending fees notification via WhatsApp.
 */
export const sendWhatsAppPendingFeesNotification = async (notif: WhatsAppPendingFeesNotification): Promise<string> => {
  const message = getPendingFeesWhatsAppMessage(
    notif.studentName,
    notif.feeTitle,
    notif.pendingAmount,
    notif.dueDate,
    notif.instituteName
  );
  try {
    const webhook = await getOpenwaWebhookForInstitute(notif.instituteId);
    if (webhook) {
      const cleanPhone = notif.phone.replace(/[^0-9+]/g, '');
      const formattedPhone = cleanPhone.startsWith('+') ? cleanPhone : `+91${cleanPhone}`;
      const payload = { messages: [{ to: formattedPhone, message, name: notif.studentName, channel: 'whatsapp' }] };
      const resp = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (resp.ok) {
        await supabase.from('message_logs').insert([{
          institute_id: notif.instituteId,
          channel: 'whatsapp',
          recipient: formattedPhone,
          message,
          status: 'sent',
        }]);
        return `sent:openwa`;
      }
    }
  } catch (err) {
    console.error('OpenWA send failed:', err);
  }

  const cleanPhone = formatWaMePhone(notif.phone);
  const encodedMsg = encodeURIComponent(message);
  return `https://wa.me/${cleanPhone}?text=${encodedMsg}`;
};

/**
 * Send attendance notification via WhatsApp.
 */
export const sendWhatsAppAttendanceNotification = async (notif: WhatsAppAttendanceNotification): Promise<string> => {
  const message = getAttendanceWhatsAppMessage(
    notif.studentName,
    notif.date,
    notif.status,
    notif.instituteName
  );
  try {
    const webhook = await getOpenwaWebhookForInstitute(notif.instituteId);
    if (webhook) {
      const cleanPhone = notif.phone.replace(/[^0-9+]/g, '');
      const formattedPhone = cleanPhone.startsWith('+') ? cleanPhone : `+91${cleanPhone}`;
      const payload = { messages: [{ to: formattedPhone, message, name: notif.studentName, channel: 'whatsapp' }] };
      const resp = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (resp.ok) {
        await supabase.from('message_logs').insert([{
          institute_id: notif.instituteId,
          channel: 'whatsapp',
          recipient: formattedPhone,
          message,
          status: 'sent',
        }]);
        return `sent:openwa`;
      }
    }
  } catch (err) {
    console.error('OpenWA send failed:', err);
  }

  const cleanPhone = formatWaMePhone(notif.phone);
  const encodedMsg = encodeURIComponent(message);
  return `https://wa.me/${cleanPhone}?text=${encodedMsg}`;
};
