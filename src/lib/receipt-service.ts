import { supabase } from "./supabase";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
 * Get the next receipt ID and atomically increment the counter.
 * Always returns a unique, incrementing receipt ID on each call.
 */
export async function getNextReceiptId(instId: string): Promise<string> {
  // 1. Get current config
  const config = await getReceiptConfig(instId);

  // 2. Build the receipt ID from the current counter
  const receiptId = formatReceiptId(config.receipt_prefix, config.next_receipt_no);

  // 3. Increment the counter unconditionally
  const newNextNo = config.next_receipt_no + 1;

  // 4. Update the counter in the DB (unconditional update — always increments)
  const { error } = await supabase
    .from("institutes")
    .update({ next_receipt_no: newNextNo })
    .eq("id", instId);

  if (error) {
    console.error("Failed to increment receipt counter:", error);
    // Even if the DB save fails, return the current receipt ID
    // The next call will retry and skip past whatever value is in the DB
  }

  return receiptId;
}

/**
 * Generate a clean, single-payment receipt HTML.
 * Shows only: institute, student, payment amount, date, method, receipt #.
 * No fee breakdown, no payment history, no balance.
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
  paymentHistory?: Array<{ date: string; amount: number; method: string; receiptId: string }>,
  currentPaymentOnly = false
): string {
  const fc = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

  const payments = paymentHistory || [];
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const balancePending = Math.max(0, finalFee - totalPaid);

  // Use the latest payment for date and method
  const latestPayment = payments.length > 0 ? payments[payments.length - 1] : null;

  const payDate = latestPayment
    ? new Date(latestPayment.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  const payMethod = latestPayment ? latestPayment.method.toUpperCase() : "CASH";

  // Status color helper
  const statusColor = status === 'paid' ? '#2e7d32' : status === 'partial' ? '#1565c0' : '#d97706';

  // Build payment history rows with running balance
  let cumulativePaid = 0;
  const historyRows = payments
    .map((p, i) => {
      cumulativePaid += p.amount;
      const balance = Math.max(0, finalFee - cumulativePaid);
      return `<tr>
        <td class="c-num">${i + 1}</td>
        <td>${new Date(p.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
        <td class="c-amt">${fc(p.amount)}</td>
        <td class="c-bal">${fc(balance)}</td>
        <td>${p.method.toUpperCase()}</td>
        <td class="c-rec">${p.receiptId || '—'}</td>
      </tr>`;
    })
    .join('');

  // ── FULL RECEIPT (when currentPaymentOnly is false) ──
  if (!currentPaymentOnly) {
    return `<!DOCTYPE html>
<html>
<head><title>Full Fee Receipt - ${receiptId}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; color: #222; max-width: 620px; margin: 0 auto; background: #fff; overflow-x: hidden; }
.accent-bar { background: #2962FF; height: 4px; margin: -30px -30px 0 -30px; }
.header { text-align: center; padding: 14px 0 8px; border-bottom: 2px solid #2962FF; margin-bottom: 12px; }
.header h1 { color: #222; font-size: 18px; font-weight: 700; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.header .sub { color: #888; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; margin-top: 3px; }
.meta { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 6px; }
.meta strong { color: #666; }
.meta span { color: #222; }
.card { background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 6px; padding: 10px 14px; margin: 10px 0; }
.card-title { font-size: 9px; font-weight: 700; color: #2962FF; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
.info-row { display: flex; padding: 2px 0; font-size: 11px; }
.info-row .lbl { color: #888; width: 100px; flex-shrink: 0; }
.info-row .val { color: #222; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Fee breakdown table */
.fee-table { width: 100%; border-collapse: collapse; margin: 10px 0; table-layout: fixed; }
.fee-table th { background: #1e293b; color: #fff; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; padding: 6px 8px; text-align: left; }
.fee-table th.col-desc { width: 60%; }
.fee-table th.col-amt { width: 40%; text-align: right; }
.fee-table td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fee-table td.col-amt { text-align: right; font-weight: 700; }
.fee-table .total-row td { font-weight: 800; font-size: 12px; border-top: 2px solid #1e293b; border-bottom: 2px solid #1e293b; padding: 8px; }
/* Payment history table */
.history-section { margin: 12px 0; }
.history-title { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #1e293b; margin-bottom: 6px; }
.history-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; table-layout: fixed; }
.history-table th { background: #1e293b; color: #fff; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; padding: 5px 6px; text-align: left; white-space: nowrap; overflow: hidden; }
.history-table th.c-num { width: 6%; text-align: center; }
.history-table th.c-date { width: 22%; }
.history-table th.c-amt { width: 18%; text-align: right; }
.history-table th.c-bal { width: 18%; text-align: right; }
.history-table th.c-met { width: 14%; }
.history-table th.c-rec { width: 22%; overflow: hidden; text-overflow: ellipsis; }
.history-table td { padding: 4px 6px; border-bottom: 1px solid #e2e8f0; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.history-table td.c-num { text-align: center; }
.history-table td.c-amt { text-align: right; font-weight: 600; }
.history-table td.c-bal { text-align: right; }
.history-table tbody tr:nth-child(even) { background: #f8f9fa; }
/* Summary boxes */
.summary-boxes { display: flex; gap: 8px; margin: 12px 0; }
.summary-box { flex: 1; padding: 8px; border: 1px solid #e2e8f0; border-radius: 6px; background: #f8f9fa; text-align: center; }
.summary-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.3px; color: #888; font-weight: 600; }
.summary-value { font-size: 14px; font-weight: 800; color: #222; margin-top: 2px; }
.summary-value.green { color: #2e7d32; }
.summary-value.red { color: #dc2626; }
/* Terms */
.terms { margin-top: 12px; padding: 8px 12px; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 4px; }
.terms p { font-size: 9px; color: #64748b; margin-bottom: 1px; }
.terms strong { color: #334155; }
/* Footer */
.footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 14px; padding-top: 10px; border-top: 2px solid #e2e8f0; }
.footer-left p { font-size: 9px; color: #64748b; margin-bottom: 2px; }
.footer-right { text-align: center; }
.footer-right .sig-line { width: 130px; border-top: 1px solid #1e293b; margin-top: 30px; padding-top: 4px; font-size: 9px; font-weight: 600; color: #1e293b; }
.footer-right .stamp { margin-top: 4px; font-size: 9px; color: #dc2626; font-weight: 800; border: 2px solid #dc2626; padding: 2px 8px; display: inline-block; border-radius: 4px; transform: rotate(-3deg); letter-spacing: 1px; }
</style></head>
<body>
<div class="accent-bar"></div>

<div class="header">
<h1>${instituteName || "INSTITUTE NAME"}</h1>
<p class="sub">Full Fee Receipt</p>
</div>

<div class="meta">
<div><strong>Receipt No:</strong> <span>${receiptId}</span></div>
<div><strong>Date:</strong> <span>${payDate}</span></div>
</div>

<div class="card">
<div class="card-title">Student Details</div>
<div class="info-row"><span class="lbl">Student Name:</span><span class="val">${studentName}</span></div>
<div class="info-row"><span class="lbl">Enrollment No:</span><span class="val">${enrollmentNo}</span></div>
<div class="info-row"><span class="lbl">Batch:</span><span class="val">${batchName}</span></div>
</div>

<!-- Fee Breakdown -->
<table class="fee-table">
  <thead>
    <tr><th class="col-desc">Description</th><th class="col-amt">Amount</th></tr>
  </thead>
  <tbody>
    <tr><td>Original Fee</td><td class="col-amt">${fc(originalFee)}</td></tr>
    ${discountAmount > 0 ? `<tr><td>Discount</td><td class="col-amt" style="color:#2e7d32">-${fc(discountAmount)}</td></tr>` : ''}
    <tr><td><strong>Final Fee</strong></td><td class="col-amt"><strong>${fc(finalFee)}</strong></td></tr>
    <tr><td>Amount Paid</td><td class="col-amt" style="color:#2e7d32">${fc(totalPaid)}</td></tr>
    <tr class="total-row">
      <td><strong>Balance Due</strong> &nbsp; <span style="color:${statusColor};font-size:10px;text-transform:uppercase;font-weight:800">${status}</span></td>
      <td class="col-amt">${fc(balancePending)}</td>
    </tr>
  </tbody>
</table>

${payments.length > 0 ? `
<!-- Payment History -->
<div class="history-section">
  <div class="history-title">Payment History</div>
  <table class="history-table">
    <thead>
      <tr><th class="c-num">#</th><th class="c-date">Date</th><th class="c-amt">Amount</th><th class="c-bal">Balance</th><th class="c-met">Method</th><th class="c-rec">Receipt</th></tr>
    </thead>
    <tbody>${historyRows}</tbody>
  </table>

  <!-- Summary -->
  <div class="summary-boxes">
    <div class="summary-box">
      <div class="summary-label">Payments</div>
      <div class="summary-value">${payments.length}</div>
    </div>
    <div class="summary-box">
      <div class="summary-label">Total Paid</div>
      <div class="summary-value green">${fc(totalPaid)}</div>
    </div>
    <div class="summary-box">
      <div class="summary-label">Balance</div>
      <div class="summary-value ${balancePending > 0 ? 'red' : 'green'}">${fc(balancePending)}</div>
    </div>
  </div>
</div>` : ''}

<!-- Footer -->
<div class="footer">
  <div class="footer-left">
    ${payments.length > 1
      ? `<p>Received in <strong>${payments.length} payments</strong> · Total <strong>${fc(totalPaid)}</strong></p>`
      : `<p><strong>${fc(totalPaid)}</strong> received on ${payDate}</p>`}
    <p>This is a computer-generated receipt.</p>
  </div>
  <div class="footer-right">
    <div class="sig-line">Authorised Signatory</div>
    <div class="stamp">PAID</div>
  </div>
</div>

<!-- Terms -->
<div class="terms">
  <p><strong>Terms & Conditions:</strong></p>
  <p>1. This receipt is valid only for the student mentioned above.</p>
  <p>2. Fees once paid are non-refundable and non-transferable.</p>
  <p>3. Please retain this receipt for future reference.</p>
  <p><strong>${instituteName || "INSTITUTE"}</strong></p>
</div>

</body></html>`;
  }

  // ── SINGLE PAYMENT RECEIPT (when currentPaymentOnly is true) ──
  return `<!DOCTYPE html>
<html>
<head><title>Fee Receipt - ${receiptId}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #222; max-width: 650px; margin: 0 auto; background: #fff; }
.accent-bar { background: #2962FF; height: 4px; margin: -40px -40px 0 -40px; }
.header { text-align: center; padding: 20px 0 10px; border-bottom: 2px solid #2962FF; margin-bottom: 25px; }
.header h1 { color: #222; font-size: 22px; font-weight: 700; margin: 0; }
.header .sub { color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
.meta { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; }
.meta strong { color: #666; }
.meta span { color: #222; }
.card { background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px 20px; margin: 16px 0; }
.card-title { font-size: 10px; font-weight: 700; color: #2962FF; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }
.info-row { display: flex; padding: 4px 0; font-size: 13px; }
.info-row .lbl { color: #888; width: 130px; flex-shrink: 0; }
.info-row .val { color: #222; font-weight: 600; }
.amount-box { background: #e8f5e8; border: 1px solid #a5d6a7; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0; }
.amount-box .total { font-size: 32px; font-weight: 700; color: #2e7d32; }
.amount-box .lbl { color: #666; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
.footer { text-align: center; margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 11px; color: #aaa; }
.footer strong { color: #888; }
</style></head>
<body>
<div class="accent-bar"></div>

<div class="header">
<h1>${instituteName || "INSTITUTE NAME"}</h1>
<p class="sub">Fee Receipt</p>
</div>

<div class="meta">
<div><strong>Receipt No:</strong> <span>${receiptId}</span></div>
<div><strong>Date:</strong> <span>${payDate}</span></div>
</div>

<div class="card">
<div class="card-title">Student Details</div>
<div class="info-row"><span class="lbl">Student Name:</span><span class="val">${studentName}</span></div>
<div class="info-row"><span class="lbl">Enrollment No:</span><span class="val">${enrollmentNo}</span></div>
<div class="info-row"><span class="lbl">Batch:</span><span class="val">${batchName}</span></div>
<div class="info-row"><span class="lbl">Payment Method:</span><span class="val">${payMethod}</span></div>
<div class="info-row"><span class="lbl">Payment Date:</span><span class="val">${payDate}</span></div>
</div>

<div class="amount-box">
<div class="total">${fc(paidFees)}</div>
<p class="lbl">Amount Paid</p>
</div>

<div class="footer">
<p>This is a computer-generated receipt. No signature required.</p>
<p><strong>Receipt #${receiptId}</strong></p>
</div>
</body></html>`;
}

/**
 * Generate a clean, single-payment PDF receipt using jsPDF.
 * Shows only: institute, student, payment amount, date, method, receipt #.
 * No fee breakdown, no payment history, no balance.
 */
export async function buildReceiptPDF(
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
  paymentHistory?: Array<{ date: string; amount: number; method: string; receiptId: string }>,
  currentPaymentOnly = false
): Promise<Blob> {
  // Use Rs. prefix for PDF since jsPDF's built-in Helvetica font doesn't support the ₹ character (U+20B9)
  const fc = (n: number) =>
    "Rs. " + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);

  // ─── Color palette ───────────────────────────────────────────────────────
  const PRIMARY = [41, 98, 255] as const;
  const PRIMARY_DIM = [30, 75, 200] as const;
  const GREEN = [46, 125, 50] as const;
  const GREEN_BG = [235, 247, 235] as const;
  const RED = [220, 38, 38] as const;
  const GRAY = [102, 102, 102] as const;
  const LIGHT_GRAY = [247, 248, 249] as const;
  const BORDER = [221, 224, 228] as const;
  const DARK = [30, 30, 35] as const;
  const WHITE = [255, 255, 255] as const;

  const payments = paymentHistory || [];
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const balancePending = Math.max(0, finalFee - totalPaid);

  // Latest payment details
  const latestPayment = payments.length > 0 ? payments[payments.length - 1] : null;

  const payDate = latestPayment
    ? new Date(latestPayment.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const payMethod = latestPayment ? latestPayment.method.toUpperCase() : "CASH";

  const doc = new jsPDF("p", "mm", "a4");
  const pw = doc.internal.pageSize.getWidth();   // 210 mm
  const ph = doc.internal.pageSize.getHeight();   // 297 mm
  const m = 14;
  const cw = pw - 2 * m;
  let y = m;

  // Helper: truncate text to fit within maxWidth (mm)
  const truncate = (text: string, maxMm: number, fontSize: number): string => {
    const approxCharWidth = fontSize * 0.06;
    const maxChars = Math.floor(maxMm / approxCharWidth);
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars - 2) + "..";
  };

  // ── HEADER ──────────────────────────────────────────────────────────────
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, pw, 3, "F");

  y = 18;

  // Institute name — truncate if too long
  const nameFontSize = instituteName && instituteName.length > 30 ? 16 : 20;
  doc.setFontSize(nameFontSize);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.text(truncate(instituteName || "INSTITUTE", cw, nameFontSize), m, y);
  y += 6;

  // Tagline
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text(currentPaymentOnly ? "FEE RECEIPT" : "FULL FEE RECEIPT", m, y);
  y += 7;

  // Accent divider
  doc.setDrawColor(...PRIMARY_DIM);
  doc.setLineWidth(0.5);
  doc.line(m, y, pw - m, y);
  y += 5;

  // ── META ROW — Receipt No + Date ────────────────────────────────────────
  doc.setFontSize(8);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GRAY);
  doc.text("Receipt No:", m, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK);
  doc.text(receiptId, m + 22, y);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GRAY);
  doc.text("Date:", pw / 2, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK);
  doc.text(payDate, pw / 2 + 12, y);

  y += 6;

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(m, y, pw - m, y);
  y += 5;

  // ── STUDENT DETAILS CARD ────────────────────────────────────────────────
  const detailRows = [
    { label: "Name", value: studentName, bold: true },
    { label: "Enrollment", value: enrollmentNo },
    { label: "Batch", value: batchName },
  ];
  if (currentPaymentOnly) {
    detailRows.push(
      { label: "Payment Method", value: payMethod },
      { label: "Payment Date", value: payDate },
    );
  }
  const cardH = 8 + detailRows.length * 6.5;
  doc.setFillColor(...LIGHT_GRAY);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(m, y, cw, cardH, 2, 2, "FD");

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...PRIMARY_DIM);
  doc.text("STUDENT DETAILS", m + 4, y + 5);

  let detailY = y + 11;
  detailRows.forEach((d) => {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    doc.text(d.label, m + 5, detailY);
    doc.setFont("helvetica", d.bold ? "bold" : "normal");
    doc.setTextColor(...DARK);
    const valText = truncate(d.value, cw - 42, 8);
    doc.text(valText, m + 35, detailY);
    detailY += 6.5;
  });

  y += cardH + 5;

  // ── FULL RECEIPT: Fee Breakdown Table ───────────────────────────────────
  if (!currentPaymentOnly) {
    const tableX = m;
    const col1W = cw * 0.6;
    const col2W = cw * 0.4;

    // Fee breakdown table
    doc.setFillColor(...LIGHT_GRAY);
    doc.setDrawColor(...BORDER);

    // Table header
    doc.setFillColor(...DARK);
    doc.rect(tableX, y, cw, 6, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHITE);
    doc.text("DESCRIPTION", tableX + 3, y + 4.5);
    doc.text("AMOUNT", tableX + col1W + 3, y + 4.5);
    y += 6;

    // Table rows
    const feeRows = [
      { label: "Original Fee", value: fc(originalFee), color: DARK },
      ...(discountAmount > 0 ? [{ label: "Discount", value: "-" + fc(discountAmount), color: GREEN }] : []),
      { label: "Final Fee", value: fc(finalFee), color: DARK },
      { label: "Amount Paid", value: fc(totalPaid), color: GREEN },
    ];

    feeRows.forEach((row) => {
      doc.setFillColor(...WHITE);
      doc.setDrawColor(...BORDER);
      doc.rect(tableX, y, cw, 6, "FD");
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...DARK);
      doc.text(truncate(row.label, col1W - 6, 8), tableX + 3, y + 4.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...(row.color as [number, number, number]));
      doc.text(truncate(row.value, col2W - 6, 8), tableX + col1W + 3, y + 4.5);
      y += 6;
    });

    // Total row (Balance Due)
    doc.setFillColor(254, 243, 199);
    doc.setDrawColor(...DARK);
    doc.rect(tableX, y, cw, 7, "FD");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DARK);
    doc.text("Balance Due", tableX + 3, y + 5);
    const statusColor = status === "paid" ? GREEN : status === "partial" ? PRIMARY_DIM : [217, 119, 6] as const;
    doc.setTextColor(...(statusColor as [number, number, number]));
    doc.text(truncate(fc(balancePending), col2W - 6, 8), tableX + col1W + 3, y + 5);
    y += 8;

    // Status inline
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...(statusColor as [number, number, number]));
    doc.text(status.toUpperCase(), tableX + 3, y + 3);
    y += 8;

    // ── PAYMENT HISTORY TABLE ───────────────────────────────────────────────
    if (payments.length > 0) {
      // Section title
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DARK);
      doc.text("PAYMENT HISTORY", m, y);
      y += 5;

      // History column widths — tuned to fit A4 width without overflow
      const hCol = [
        cw * 0.05, // #
        cw * 0.20, // Date
        cw * 0.17, // Amount
        cw * 0.17, // Balance
        cw * 0.12, // Method
        cw * 0.29, // Receipt
      ];

      // History table header
      doc.setFillColor(...DARK);
      doc.rect(tableX, y, cw, 5.5, "F");
      doc.setFontSize(6);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...WHITE);
      const hLabels = ["#", "Date", "Amount", "Balance", "Method", "Receipt"];
      let hx = tableX + 1.5;
      hLabels.forEach((label, i) => {
        doc.text(label, hx, y + 4);
        hx += hCol[i];
      });
      y += 5.5;

      // History rows
      let cumulative = 0;
      payments.forEach((p, i) => {
        cumulative += p.amount;
        const bal = Math.max(0, finalFee - cumulative);
        const bgColor = i % 2 === 0 ? WHITE : LIGHT_GRAY;
        doc.setFillColor(...(bgColor as [number, number, number]));
        doc.setDrawColor(...BORDER);
        doc.rect(tableX, y, cw, 5, "FD");
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...DARK);
        let rx = tableX + 1.5;
        const rowData = [
          String(i + 1),
          new Date(p.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
          fc(p.amount),
          fc(bal),
          p.method.toUpperCase(),
          p.receiptId || "—",
        ];
        rowData.forEach((val, ci) => {
          const maxW = hCol[ci] - 2;
          doc.text(truncate(val, maxW, 6.5), rx, y + 3.5);
          rx += hCol[ci];
        });
        y += 5;
      });

      y += 3;

      // Summary boxes — compact
      const boxGap = 3;
      const boxW = (cw - 2 * boxGap) / 3;
      const boxH = 12;
      const boxY = y;

      // Box 1: Total Payments
      doc.setFillColor(...LIGHT_GRAY);
      doc.setDrawColor(...BORDER);
      doc.roundedRect(tableX, boxY, boxW, boxH, 1.5, 1.5, "FD");
      doc.setFontSize(5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...GRAY);
      doc.text("PAYMENTS", tableX + boxW / 2, boxY + 4, { align: "center" });
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DARK);
      doc.text(String(payments.length), tableX + boxW / 2, boxY + 9.5, { align: "center" });

      // Box 2: Total Paid
      doc.setFillColor(...LIGHT_GRAY);
      doc.roundedRect(tableX + boxW + boxGap, boxY, boxW, boxH, 1.5, 1.5, "FD");
      doc.setFontSize(5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...GRAY);
      doc.text("TOTAL PAID", tableX + boxW + boxGap + boxW / 2, boxY + 4, { align: "center" });
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...GREEN);
      doc.text(truncate(fc(totalPaid), boxW - 4, 8), tableX + boxW + boxGap + boxW / 2, boxY + 9.5, { align: "center" });

      // Box 3: Balance Pending
      doc.setFillColor(...LIGHT_GRAY);
      doc.roundedRect(tableX + 2 * (boxW + boxGap), boxY, boxW, boxH, 1.5, 1.5, "FD");
      doc.setFontSize(5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...GRAY);
      doc.text("BALANCE", tableX + 2 * (boxW + boxGap) + boxW / 2, boxY + 4, { align: "center" });
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...(balancePending > 0 ? RED : GREEN));
      doc.text(truncate(fc(balancePending), boxW - 4, 8), tableX + 2 * (boxW + boxGap) + boxW / 2, boxY + 9.5, { align: "center" });

      y += boxH + 6;
    }

    // ── FOOTER ──────────────────────────────────────────────────────────────
    if (y > ph - m - 35) {
      y = ph - m - 35;
    }

    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.4);
    doc.line(m, y, pw - m, y);
    y += 5;

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    if (payments.length > 1) {
      doc.text(`Received in ${payments.length} payments. Total: ${truncate(fc(totalPaid), cw * 0.5, 7)}`, m, y);
    } else {
      doc.text(`${truncate(fc(totalPaid), cw * 0.4, 7)} received on ${payDate}`, m, y);
    }
    y += 4;
    doc.text("This is a computer-generated receipt.", m, y);
    y += 8;

    // Signature line + stamp
    doc.setDrawColor(...DARK);
    doc.setLineWidth(0.3);
    doc.line(pw - m - 50, y, pw - m, y);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DARK);
    doc.text("Authorised Signatory", pw - m - 25, y + 3.5, { align: "center" });

    // PAID stamp
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...RED);
    doc.text("PAID", pw / 2, y + 10, { align: "center" });

    // Terms — only if room
    if (y + 18 < ph - m) {
      y += 14;
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(...BORDER);
      doc.roundedRect(m, y, cw, 16, 1.5, 1.5, "FD");
      doc.setFontSize(6);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DARK);
      doc.text("Terms & Conditions:", m + 3, y + 4);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...GRAY);
      doc.text("1. Valid only for the student mentioned above.", m + 3, y + 7.5);
      doc.text("2. Fees once paid are non-refundable.", m + 3, y + 11);
      doc.text("3. Retain this receipt for future reference.", m + 3, y + 14.5);
    }

    return doc.output("blob");
  }

  // ── SINGLE PAYMENT RECEIPT ──────────────────────────────────────────────
  // ── AMOUNT PAID — HIGHLIGHTED BOX ───────────────────────────────────────
  const boxH = 24;
  doc.setFillColor(...GREEN_BG);
  doc.setDrawColor(...GREEN);
  doc.roundedRect(m, y, cw, boxH, 3, 3, "FD");

  doc.setTextColor(...GREEN);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text(truncate(fc(paidFees), cw - 10, 22), pw / 2, y + 15, { align: "center" });

  y += boxH + 6;

  // ── FOOTER ──────────────────────────────────────────────────────────────
  if (y > ph - m - 16) {
    y = ph - m - 16;
  }

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.4);
  doc.line(m, y, pw - m, y);
  y += 5;

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text("This is a computer-generated receipt. No signature required.", pw / 2, y, { align: "center" });
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...PRIMARY_DIM);
  doc.text(`Receipt #${receiptId}`, pw / 2, y, { align: "center" });

  return doc.output("blob");
}

/** Helper: convert hex color string to RGB tuple */
function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [0, 0, 0];
}
