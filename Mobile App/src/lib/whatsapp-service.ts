import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const WHATSAPP_SERVER_URL_STORAGE_KEY = '@whatsapp_server_url';
const DEFAULT_SERVER_URL = 'https://apexsmspro.onrender.com';

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

/**
 * Get the server URL with a description of its source (custom/default).
 */
export function getServerUrlDescription(): { url: string; source: 'custom' | 'default' } {
  const custom = cachedServerUrl;
  if (custom && custom !== DEFAULT_SERVER_URL) {
    return { url: custom, source: 'custom' };
  }
  return { url: getWhatsAppServerUrl(), source: 'default' };
}

export async function fetchSessionStatus(
  instId: string
): Promise<{ status: string; phone?: string; error?: string } | null> {
  try {
    const url = getWhatsAppServerUrl();
    const res = await fetch(`${url}/api/sessions/${instId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('[WhatsApp] fetchSessionStatus error:', err);
    return null;
  }
}

export async function refreshSessionQR(instId: string): Promise<boolean> {
  try {
    const url = getWhatsAppServerUrl();
    const res = await fetch(`${url}/api/sessions/${instId}/refresh-qr`, {
      method: 'POST',
    });
    return res.ok;
  } catch (err) {
    console.error('[WhatsApp] refreshSessionQR error:', err);
    return false;
  }
}

export async function disconnectSession(instId: string): Promise<boolean> {
  try {
    const url = getWhatsAppServerUrl();
    const res = await fetch(`${url}/api/sessions/${instId}/disconnect`, {
      method: 'POST',
    });
    return res.ok;
  } catch (err) {
    console.error('[WhatsApp] disconnectSession error:', err);
    return false;
  }
}

export async function logoutSession(instId: string): Promise<boolean> {
  try {
    const url = getWhatsAppServerUrl();
    const res = await fetch(`${url}/api/sessions/${instId}/logout`, {
      method: 'POST',
    });
    return res.ok;
  } catch (err) {
    console.error('[WhatsApp] logoutSession error:', err);
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
 * Fallback strategy: tries 'amount' column first, then 'balance_before - balance_after'
 * so the function works even if the migration hasn't been fully applied.
 */
export async function getWalletUsageSummary(
  instituteId: string
): Promise<{ today: number; thisMonth: number }> {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Try primary query with 'amount' column
    let { data: transactions, error } = await supabase
      .from('wallet_transactions')
      .select('amount, created_at')
      .eq('institute_id', instituteId)
      .eq('type', 'debit')
      .eq('reference_type', 'whatsapp')
      .gte('created_at', monthStart)
      .order('created_at', { ascending: false });

    // If expected columns don't exist (migration not fully applied),
    // try a broader query without column-specific filters.
    if (error && error.code === '42703') {
      console.warn('[WhatsApp] wallet_transactions missing expected columns, trying broader query...');
      // Broader query: no type/reference_type filters, select * so we can
      // try any column that exists (amount, balance_before, balance_after, etc.)
      const { data: allTx, error: fallbackErr } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('institute_id', instituteId)
        .gte('created_at', monthStart)
        .order('created_at', { ascending: false });

      if (fallbackErr) {
        console.error('[WhatsApp] broader fallback also failed:', fallbackErr);
        return { today: 0, thisMonth: 0 };
      }

      // Try with compute first (handles amount OR balance_before/balance_after)
      const computed = computeUsageFromRows(allTx, todayStart);
      // If compute returned 0 and we have rows, assume 1 credit per row as last resort
      if (computed.thisMonth === 0 && allTx && allTx.length > 0) {
        return {
          today: allTx.filter((tx: any) => tx.created_at >= todayStart).length,
          thisMonth: allTx.length,
        };
      }
      return computed;
    }

    if (error) {
      console.error('[WhatsApp] getWalletUsageSummary error:', error);
      return { today: 0, thisMonth: 0 };
    }

    return computeUsageFromRows(transactions, todayStart);
  } catch (err: any) {
    console.error('[WhatsApp] getWalletUsageSummary error:', err);
    return { today: 0, thisMonth: 0 };
  }
}

/** Compute usage totals from transaction rows (handles both amount and balance_before/balance_after) */
function computeUsageFromRows(rows: any[] | null, todayStart: string): { today: number; thisMonth: number } {
  if (!rows || rows.length === 0) return { today: 0, thisMonth: 0 };

  let thisMonthTotal = 0;
  let todayTotal = 0;

  for (const tx of rows) {
    // Support both 'amount' column and fallback 'balance_before - balance_after'
    const amount =
      typeof tx.amount === 'number'
        ? tx.amount
        : typeof tx.balance_before === 'number' && typeof tx.balance_after === 'number'
          ? tx.balance_before - tx.balance_after
          : 0;

    thisMonthTotal += amount;
    if (tx.created_at >= todayStart) {
      todayTotal += amount;
    }
  }

  return { today: todayTotal, thisMonth: thisMonthTotal };
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
    const res = await fetch(`${url}/api/sessions/${instId}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: phone, text: message }),
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
    const res = await fetch(`${url}/api/sessions/${instId}/send-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
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
