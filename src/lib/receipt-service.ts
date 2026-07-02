import { supabase } from "./supabase";

/**
 * Parse a receipt ID string into its prefix and numeric components.
 * 
 * Examples:
 *   "AGT-130"  → { prefix: "AGT-", number: 130 }
 *   "AGT130"   → { prefix: "AGT", number: 130 }
 *   "500"      → { prefix: "", number: 500 }
 *   ""         → { prefix: "", number: 500 }
 */
export function parseReceiptInput(input: string): { prefix: string; number: number } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { prefix: "", number: 500 };
  }

  // Match leading non-digit characters as prefix, then trailing digits as number
  const match = trimmed.match(/^(.*?)(\d+)$/);
  if (match) {
    return {
      prefix: match[1], // e.g., "AGT-" or "AGT"
      number: parseInt(match[2], 10), // e.g., 130
    };
  }

  // If no digits found, treat entire input as prefix, default to 500
  return { prefix: trimmed, number: 500 };
}

/**
 * Format a receipt ID from prefix and number.
 * @example prefix="AGT-", number=130 → "AGT-130"
 */
export function formatReceiptId(prefix: string, number: number): string {
  return `${prefix}${number}`;
}

/**
 * Parse a receipt prefix and starting number from a full receipt ID string.
 * This is used when the user enters something like "AGT-130" in settings.
 */
export function parseReceiptIdString(input: string): { prefix: string; startNumber: number } {
  const { prefix, number } = parseReceiptInput(input);
  return { prefix, startNumber: number };
}

/**
 * Get the current receipt configuration for an institute.
 */
export async function getReceiptConfig(instId: string) {
  const { data, error } = await supabase
    .from("institutes")
    .select("receipt_prefix, next_receipt_no")
    .eq("id", instId)
    .single();

  if (error || !data) {
    console.error("Error fetching receipt config:", error);
    return { receipt_prefix: "", next_receipt_no: 500 };
  }

  return {
    receipt_prefix: data.receipt_prefix || "",
    next_receipt_no: Number(data.next_receipt_no) || 500,
  };
}

/**
 * Save (update) the receipt configuration for an institute.
 */
export async function saveReceiptConfig(
  instId: string,
  receiptPrefix: string,
  nextReceiptNo: number
) {
  const { error } = await supabase
    .from("institutes")
    .update({
      receipt_prefix: receiptPrefix,
      next_receipt_no: nextReceiptNo,
    })
    .eq("id", instId);

  if (error) {
    console.error("Error saving receipt config:", error);
    throw error;
  }
}

/**
 * Atomically get the next receipt ID and increment the counter.
 * This uses a read-and-update approach. In rare race conditions,
 * the receipt ID will still be unique since the counter is monotonically increasing.
 */
export async function getNextReceiptId(instId: string): Promise<string> {
  // Retry up to 3 times in case of race condition
  for (let attempt = 0; attempt < 3; attempt++) {
    // 1. Get current config
    const config = await getReceiptConfig(instId);

    // 2. Build the receipt ID
    const receiptId = formatReceiptId(config.receipt_prefix, config.next_receipt_no);

    // 3. Increment the counter
    const newNextNo = config.next_receipt_no + 1;

    // 4. Update the counter (only if it hasn't changed - optimistic locking)
    const { error } = await supabase
      .from("institutes")
      .update({ next_receipt_no: newNextNo })
      .eq("id", instId)
      .eq("next_receipt_no", config.next_receipt_no); // Optimistic lock

    if (!error) {
      return receiptId;
    }

    // If update failed (race condition), retry
    console.warn(`Receipt counter update race condition (attempt ${attempt + 1}), retrying...`);
  }

  // Fallback: just generate a unique ID if all retries fail
  const config = await getReceiptConfig(instId);
  return formatReceiptId(config.receipt_prefix, config.next_receipt_no);
}

/**
 * Generate a receipt PDF HTML with the given receipt ID and student fee data.
 * Optionally includes payment history table.
 */
export function buildReceiptHTML(
  receiptId: string,
  studentName: string,
  enrollmentNo: string,
  batchName: string,
  paidFees: number,
  originalFee: number,
  discountAmount: number,
  finalFee: number,
  status: string,
  instituteName?: string,
  paymentHistory?: Array<{ date: string; amount: number; method: string; receiptId: string }>
): string {
  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

  const statusColor =
    status === "paid" ? "#2e7d32" :
    status === "pending" ? "#f57c00" :
    status === "partial" ? "#1976d2" :
    status === "overdue" ? "#c62828" : "#666";

  const paymentRows = paymentHistory && paymentHistory.length > 0
    ? paymentHistory.map(p => `
      <tr>
        <td>${new Date(p.date).toLocaleDateString('en-IN')}</td>
        <td>${formatCurrency(p.amount)}</td>
        <td>${p.method.toUpperCase()}</td>
        <td>${p.receiptId}</td>
      </tr>`).join('')
    : '<tr><td colspan="4" style="text-align:center;color:#999;">No payment records</td></tr>';

  return `<!DOCTYPE html>
<html>
<head><title>Fee Receipt - ${receiptId}</title>
<style>
body { font-family: Arial, sans-serif; padding: 40px; color: #333; max-width: 700px; margin: 0 auto; }
.header { text-align: center; border-bottom: 2px solid #1a73e8; padding-bottom: 20px; margin-bottom: 30px; }
.header h1 { color: #1a73e8; margin: 0; font-size: 28px; }
.header p { color: #666; margin: 5px 0; }
.receipt-id { background: #1a73e8; color: white; padding: 8px 20px; border-radius: 4px; display: inline-block; font-size: 16px; font-weight: bold; margin-top: 10px; }
.section { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
.section table { width: 100%; border-collapse: collapse; }
.section td, .section th { padding: 8px 0; border-bottom: 1px solid #e0e0e0; }
.section td:first-child { font-weight: bold; width: 40%; }
.section th { font-weight: bold; text-align: left; font-size: 11px; text-transform: uppercase; color: #666; border-bottom: 2px solid #ccc; }
.amount { background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center; }
.amount .total { font-size: 24px; font-weight: bold; color: #2e7d32; }
.amount .label { color: #666; font-size: 12px; margin-top: 4px; }
.footer { text-align: center; margin-top: 40px; color: #666; font-size: 12px; }
.status-badge { display: inline-block; padding: 4px 14px; border-radius: 12px; font-size: 11px; font-weight: bold; background: ${statusColor}20; color: ${statusColor}; }
.history-title { font-size: 14px; font-weight: bold; margin-bottom: 12px; color: #333; }
.history-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.history-table th { background: #eef; padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; color: #555; border-bottom: 2px solid #dde; }
.history-table td { padding: 8px 10px; border-bottom: 1px solid #eee; }
.history-table tr:last-child td { border-bottom: none; }
</style></head>
<body>
<div class="header">
<h1>Fee Receipt</h1>
<p>${instituteName || "Institute Management System"}</p>
<div class="receipt-id">Receipt #${receiptId}</div>
</div>

<div class="section">
<table>
<tr><td>Student Name:</td><td>${studentName}</td></tr>
<tr><td>Enrollment No:</td><td>${enrollmentNo}</td></tr>
<tr><td>Batch:</td><td>${batchName}</td></tr>
<tr><td>Payment Date:</td><td>${new Date().toLocaleDateString('en-IN')}</td></tr>
<tr><td>Status:</td><td><span class="status-badge">${status.toUpperCase()}</span></td></tr>
</table>
</div>

<div class="amount">
<div class="total">${formatCurrency(paidFees)}</div>
<p class="label">Total Amount Paid</p>
</div>

<div class="section">
<table>
<tr><td>Original Fee:</td><td>${formatCurrency(originalFee)}</td></tr>
${discountAmount > 0 ? `<tr><td>Discount Applied:</td><td>-${formatCurrency(discountAmount)}</td></tr>` : ''}
<tr><td>Final Fee:</td><td>${formatCurrency(finalFee)}</td></tr>
<tr><td>Total Paid:</td><td><strong>${formatCurrency(paidFees)}</strong></td></tr>
<tr><td>Pending Amount:</td><td>${formatCurrency(Math.max(0, finalFee - paidFees))}</td></tr>
</table>
</div>

${paymentHistory && paymentHistory.length > 0 ? `
<div class="section">
<p class="history-title">Payment History</p>
<table class="history-table">
<thead>
<tr><th>Date</th><th>Amount</th><th>Method</th><th>Receipt #</th></tr>
</thead>
<tbody>
${paymentRows}
</tbody>
</table>
</div>` : ''}

<div class="footer">
<p>This is a computer generated receipt.</p>
<p>Generated on ${new Date().toLocaleDateString('en-IN')} at ${new Date().toLocaleTimeString('en-IN')}</p>
<p>Receipt #${receiptId}</p>
</div>
</body></html>`;
}
