import { supabase } from './supabase';

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

export interface WhatsAppNotification {
  phone: string;
  studentName: string;
  instituteId: string;
  date: string;
}

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
 * - If Zavu is configured for the institute → uses Zavu API (channel: whatsapp)
 * - Otherwise → falls back to wa.me link for manual sending
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
 * Generate bulk WhatsApp links (or send via Zavu if configured).
 * Returns either Zavu message IDs or wa.me links.
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
