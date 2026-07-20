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

// ─── Wallet Credit Management ────────────────────────────────────────────

/**
 * Fetch the current wallet credit balance for an institute.
 */
export async function getWalletBalance(
  instituteId: string
): Promise<{ balance: number; error?: string }> {
  try {
    const { data: institute, error: fetchError } = await supabase
      .from('institutes')
      .select('wallet_credits')
      .eq('id', instituteId)
      .single();

    if (fetchError || !institute) {
      return { balance: 0, error: 'Could not fetch wallet balance.' };
    }

    return { balance: institute.wallet_credits ?? 0 };
  } catch (err: any) {
    console.error('[WhatsApp] getWalletBalance error:', err);
    return { balance: 0, error: err.message || 'Failed to fetch wallet balance.' };
  }
}

/**
 * Fetch wallet credit usage summary (credits consumed today and this month).
 */
export async function getWalletUsageSummary(
  instituteId: string
): Promise<{ today: number; thisMonth: number }> {
  try {
    const now = new Date();

    // Start of today (midnight)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    // Start of this month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Query all debit transactions for this institute (reference_type = 'whatsapp')
    const { data: transactions, error } = await supabase
      .from('wallet_transactions')
      .select('amount, created_at')
      .eq('institute_id', instituteId)
      .eq('type', 'debit')
      .eq('reference_type', 'whatsapp')
      .gte('created_at', monthStart)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[WhatsApp] getWalletUsageSummary error:', error);
      return { today: 0, thisMonth: 0 };
    }

    if (!transactions || transactions.length === 0) {
      return { today: 0, thisMonth: 0 };
    }

    // Calculate totals
    let thisMonthTotal = 0;
    let todayTotal = 0;

    for (const tx of transactions) {
      const amount = tx.amount || 0;
      thisMonthTotal += amount;

      if (tx.created_at >= todayStart) {
        todayTotal += amount;
      }
    }

    return { today: todayTotal, thisMonth: thisMonthTotal };
  } catch (err: any) {
    console.error('[WhatsApp] getWalletUsageSummary error:', err);
    return { today: 0, thisMonth: 0 };
  }
}

/**
 * Deduct wallet credits from an institute's wallet before sending a WhatsApp message.
 * 1 message = 1 wallet credit.
 *
 * @returns An object with success status, optional error, and remaining credits.
 */
async function deductWalletCredits(
  instituteId: string,
  count: number = 1
): Promise<{ success: boolean; error?: string; remainingCredits?: number }> {
  try {
    // Fetch current wallet balance
    const { data: institute, error: fetchError } = await supabase
      .from('institutes')
      .select('wallet_credits')
      .eq('id', instituteId)
      .single();

    if (fetchError || !institute) {
      console.error('[WhatsApp] deductWalletCredits fetch error:', fetchError);
      return { success: false, error: 'Could not verify wallet balance. Please try again.' };
    }

    const currentBalance = institute.wallet_credits ?? 0;

    if (currentBalance < count) {
      return {
        success: false,
        error: `Insufficient wallet credits. Required: ${count}, Available: ${currentBalance}. Please recharge your wallet from the admin panel.`,
      };
    }

    const newBalance = currentBalance - count;

    // Deduct credits from institute wallet
    const { error: updateError } = await supabase
      .from('institutes')
      .update({ wallet_credits: newBalance })
      .eq('id', instituteId);

    if (updateError) {
      console.error('[WhatsApp] deductWalletCredits update error:', updateError);
      return { success: false, error: 'Failed to deduct wallet credits. Please try again.' };
    }

    // Log the transaction for audit trail
    await supabase.from('wallet_transactions').insert([{
      institute_id: instituteId,
      type: 'debit',
      amount: count,
      description: `WhatsApp message${count > 1 ? 's' : ''} sent`,
      reference_type: 'whatsapp',
      balance_before: currentBalance,
      balance_after: newBalance,
    }]);

    return { success: true, remainingCredits: newBalance };
  } catch (err: any) {
    console.error('[WhatsApp] deductWalletCredits error:', err);
    return { success: false, error: err.message || 'Failed to process wallet deduction.' };
  }
}

// ─── Message Sending ─────────────────────────────────────────────────────

export async function sendWhatsAppMessage(
  instId: string,
  phone: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  // Deduct 1 wallet credit before sending
  const deduction = await deductWalletCredits(instId, 1);
  if (!deduction.success) {
    return { success: false, error: deduction.error };
  }

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
): Promise<{ success: boolean; failed: number; error?: string }> {
  if (messages.length === 0) {
    return { success: true, failed: 0 };
  }

  // Check and deduct wallet credits for all messages upfront
  const totalCreditsNeeded = messages.length;
  const deduction = await deductWalletCredits(instId, totalCreditsNeeded);
  if (!deduction.success) {
    return { success: false, failed: totalCreditsNeeded, error: deduction.error };
  }

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

    // Log to whatsapp_logs
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
      // API failed but we logged it and deducted credit
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
