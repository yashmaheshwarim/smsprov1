import { supabase } from './supabase';
import { createZavuServiceForInstitute } from './zavu-service';

export interface WhatsAppNotification {
  phone: string;
  studentName: string;
  instituteId: string;
  date: string;
}

/**
 * Send an absent notification via WhatsApp.
 * - If Zavu is configured for the institute → uses Zavu API (channel: whatsapp)
 * - Otherwise → falls back to wa.me link for manual sending
 */
export const sendWhatsAppAbsentNotification = async (notif: WhatsAppNotification) => {
  const message = `Hello, this is to inform you that ${notif.studentName} is marked ABSENT today (${notif.date}). Please contact the institute for any queries.`;

  // Try Zavu first
  try {
    const zavuSvc = await createZavuServiceForInstitute(notif.instituteId);
    if (zavuSvc) {
      const cleanPhone = notif.phone.replace(/[^0-9+]/g, '');
      const formattedPhone = cleanPhone.startsWith('+') ? cleanPhone : `+91${cleanPhone}`;

      const result = await zavuSvc.sendMessage({
        to: formattedPhone,
        text: message,
        channel: 'whatsapp',
      });

      // Log to Supabase
      await supabase.from('message_logs').insert([{
        institute_id: notif.instituteId,
        channel: 'whatsapp',
        recipient: formattedPhone,
        message: message,
        status: 'sent',
        zavu_message_id: result.message.id,
      }]);

      return `zavu:${result.message.id}`;
    }
  } catch (err) {
    console.error('Zavu WhatsApp send failed, falling back to wa.me:', err);
  }

  // Fallback: Log to database + return wa.me link
  try {
    await supabase.from('message_logs').insert([{
      institute_id: notif.instituteId,
      channel: 'whatsapp',
      recipient: notif.phone,
      message: message,
      status: 'pending',
    }]);
  } catch (e) {
    console.error('Failed to log message:', e);
  }

  const cleanPhone = notif.phone.replace(/[^0-9]/g, '');
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

  const instId = notifications[0]?.instituteId;
  let zavuSvc: Awaited<ReturnType<typeof createZavuServiceForInstitute>> = null;

  try {
    zavuSvc = await createZavuServiceForInstitute(instId);
  } catch {
    // Zavu not available, will fallback
  }

  const results: { name: string; link: string; sent: boolean }[] = [];

  for (const n of notifications) {
    if (zavuSvc) {
      try {
        const cleanPhone = n.phone.replace(/[^0-9+]/g, '');
        const formattedPhone = cleanPhone.startsWith('+') ? cleanPhone : `+91${cleanPhone}`;
        const msg = `Hello, this is to inform you that ${n.studentName} is marked ABSENT today (${n.date}). Please contact the institute for any queries.`;

        const result = await zavuSvc.sendMessage({
          to: formattedPhone,
          text: msg,
          channel: 'whatsapp',
        });

        await supabase.from('message_logs').insert([{
          institute_id: n.instituteId,
          channel: 'whatsapp',
          recipient: formattedPhone,
          message: msg,
          status: 'sent',
          zavu_message_id: result.message.id,
        }]);

        results.push({ name: n.studentName, link: `zavu:${result.message.id}`, sent: true });
        continue;
      } catch (err) {
        console.error(`Zavu send failed for ${n.studentName}:`, err);
      }
    }

    // Fallback to wa.me
    const cleanPhone = n.phone.replace(/[^0-9]/g, '');
    results.push({
      name: n.studentName,
      link: `https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Hello, this is to inform you that ${n.studentName} is marked ABSENT today (${n.date}).`)}`,
      sent: false,
    });
  }

  return results;
};

// Legacy function kept for backwards compatibility
export const getWhatsAppBulkLink = (notifications: WhatsAppNotification[]) => {
  if (notifications.length === 0) return null;
  return notifications.map(n => ({
    name: n.studentName,
    link: `https://wa.me/${n.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hello, this is to inform you that ${n.studentName} is marked ABSENT today (${n.date}).`)}`
  }));
};
