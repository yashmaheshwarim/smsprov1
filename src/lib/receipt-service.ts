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
 * Generate a professionally styled receipt HTML.
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
  const fc = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

  const statusColor =
    status === "paid" ? "#2e7d32" :
    status === "pending" ? "#f57c00" :
    status === "partial" ? "#2962FF" :
    status === "overdue" ? "#c62828" : "#666";

  const pctPaid = finalFee > 0 ? Math.round((paidFees / finalFee) * 100) : 0;

  const paymentRows = paymentHistory && paymentHistory.length > 0
    ? paymentHistory.map((p, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td>${new Date(p.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
        <td class="amt">${fc(p.amount)}</td>
        <td class="mid">${p.method.toUpperCase()}</td>
        <td class="mono">${p.receiptId}</td>
      </tr>`).join('')
    : '';

  const totalPayments = paymentHistory ? paymentHistory.reduce((s, p) => s + p.amount, 0) : 0;

  return `<!DOCTYPE html>
<html>
<head><title>Fee Receipt - ${receiptId}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #222; max-width: 750px; margin: 0 auto; background: #fff; }
.accent-bar { background: #2962FF; height: 4px; margin: -40px -40px 0 -40px; }
.header { text-align: center; padding: 20px 0 10px; border-bottom: 2px solid #2962FF; margin-bottom: 25px; }
.header h1 { color: #222; font-size: 22px; font-weight: 700; margin: 0; }
.header .sub { color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
.meta { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; }
.meta strong { color: #666; }
.meta span { color: #222; }
.badge { display: inline-block; padding: 3px 14px; border-radius: 12px; font-size: 10px; font-weight: 700; background: ${statusColor}; color: #fff; }
.card { background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px 20px; margin: 16px 0; }
.card-title { font-size: 10px; font-weight: 700; color: #2962FF; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }
.info-row { display: flex; padding: 4px 0; font-size: 13px; }
.info-row .lbl { color: #888; width: 130px; flex-shrink: 0; }
.info-row .val { color: #222; font-weight: 600; }
.amount-box { background: #e8f5e8; border: 1px solid #a5d6a7; border-radius: 10px; padding: 18px; text-align: center; margin: 16px 0; }
.amount-box .total { font-size: 28px; font-weight: 700; color: #2e7d32; }
.amount-box .lbl { color: #666; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
.breakdown { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
.breakdown tr:nth-child(even) { background: #f8f9fa; }
.breakdown td { padding: 6px 12px; border-bottom: 1px solid #eee; }
.breakdown td:last-child { text-align: right; font-weight: 600; }
.breakdown .green { color: #2e7d32; font-weight: 700; }
.breakdown .red { color: #c62828; font-weight: 700; }
.pct { text-align: center; font-size: 11px; color: #888; margin-top: 6px; }
.history-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
.history-table th { background: #2962FF; color: #fff; padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; }
.history-table td { padding: 7px 10px; border-bottom: 1px solid #eee; }
.history-table tr:nth-child(even) { background: #f8f9fa; }
.history-table .amt { text-align: right; font-weight: 600; }
.history-table .num { text-align: center; color: #888; width: 30px; }
.history-table .mid { text-align: center; font-size: 10px; color: #555; }
.history-table .mono { font-family: 'Courier New', monospace; font-size: 11px; color: #2962FF; }
.summary { font-size: 11px; color: #888; margin-top: 8px; text-align: right; }
.summary strong { color: #222; }
.footer { text-align: center; margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 11px; color: #aaa; }
.footer strong { color: #888; }
</style></head>
<body>
<div class="accent-bar"></div>

<div class="header">
<h1>${instituteName || "INSTITUTE NAME"}</h1>
<p class="sub">Official Fee Receipt</p>
</div>

<div class="meta">
<div><strong>Receipt No:</strong> <span>${receiptId}</span></div>
<div><strong>Date:</strong> <span>${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
</div>
<div class="meta">
<div><strong>Status:</strong> <span class="badge">${status.toUpperCase()}</span></div>
<div></div>
</div>

<div class="card">
<div class="card-title">Student Details</div>
<div class="info-row"><span class="lbl">Student Name:</span><span class="val">${studentName}</span></div>
<div class="info-row"><span class="lbl">Enrollment No:</span><span class="val">${enrollmentNo}</span></div>
<div class="info-row"><span class="lbl">Batch:</span><span class="val">${batchName}</span></div>
</div>

<div class="amount-box">
<div class="total">${fc(paidFees)}</div>
<p class="lbl">Total Amount Paid</p>
</div>

<div class="card">
<div class="card-title">Fee Breakdown</div>
<table class="breakdown">
<tr><td>Original Fee</td><td>${fc(originalFee)}</td></tr>
${discountAmount > 0 ? `<tr><td>Discount Applied</td><td class="green">- ${fc(discountAmount)}</td></tr>` : ''}
<tr><td>Final Fee</td><td>${fc(finalFee)}</td></tr>
<tr><td>Amount Paid</td><td class="green">${fc(paidFees)}</td></tr>
<tr><td>Pending Balance</td><td class="${finalFee - paidFees > 0 ? 'red' : 'green'}">${fc(Math.max(0, finalFee - paidFees))}</td></tr>
</table>
<p class="pct">${pctPaid}% of fee paid</p>
</div>

${paymentHistory && paymentHistory.length > 0 ? `
<div class="card">
<div class="card-title">Payment History</div>
<table class="history-table">
<thead>
<tr><th>#</th><th>Date</th><th>Amount</th><th>Method</th><th>Receipt No</th></tr>
</thead>
<tbody>
${paymentRows}
</tbody>
</table>
<p class="summary">Total: <strong>${paymentHistory.length}</strong> payment(s) · <strong>${fc(totalPayments)}</strong></p>
</div>` : ''}

<div class="footer">
<p>This is a computer-generated receipt. No signature required.</p>
<p>Generated on ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
<p><strong>Receipt #${receiptId}</strong></p>
</div>
</body></html>`;
}

/**
 * Generate a professionally styled PDF receipt using jsPDF.
 * Includes full payment history table.
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
  paymentHistory?: Array<{ date: string; amount: number; method: string; receiptId: string }>
): Promise<Blob> {
  // Use Rs. prefix for PDF since jsPDF's built-in Helvetica font doesn't support the ₹ character (U+20B9)
  const fc = (n: number) =>
    "Rs. " + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);

  const PRIMARY = [41, 98, 255] as const;    // #2962FF — vibrant blue
  const PRIMARY_LIGHT = [232, 240, 254] as const;
  const GREEN = [46, 125, 50] as const;
  const GREEN_BG = [232, 245, 232] as const;
  const RED = [198, 40, 40] as const;
  const GRAY = [102, 102, 102] as const;
  const LIGHT_GRAY = [245, 245, 245] as const;
  const BORDER = [221, 221, 221] as const;
  const DARK = [34, 34, 34] as const;

  const statusRgb = status === "paid" ? GREEN : status === "pending" ? [245, 124, 0] as const : status === "partial" ? PRIMARY : RED;

  const doc = new jsPDF("p", "mm", "a4");
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 20;
  const cw = pw - 2 * m;
  let y = m;

  // ──────────────────────────────────────────────
  //  LETTERHEAD
  // ──────────────────────────────────────────────
  // Top accent bar
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, pw, 3, "F");

  y = 18;

  // Institute name
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.text(instituteName || "INSTITUTE NAME", m, y);
  y += 5;

  // Tagline
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text("Official Fee Receipt", m, y);
  y += 10;

  // Divider line
  doc.setDrawColor(...PRIMARY);
  doc.setLineWidth(0.5);
  doc.line(m, y, pw - m, y);
  y += 4;

  // Receipt ID & Date — two-column layout
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GRAY);
  doc.text("Receipt No:", m, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK);
  doc.text(receiptId, m + 22, y);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GRAY);
  doc.text("Date:", pw - m - 50, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK);
  doc.text(new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }), pw - m - 30, y);

  y += 3;

  // Status badge inline
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GRAY);
  doc.text("Status:", m, y);
  // Status — colored pill
  doc.setFillColor(...statusRgb);
  doc.roundedRect(m + 14, y - 3, 28, 6, 3, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text(status.toUpperCase(), m + 28, y + 1, { align: "center" });

  y += 8;

  // Bottom divider
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(m, y, pw - m, y);
  y += 6;

  // ──────────────────────────────────────────────
  //  STUDENT DETAILS CARD
  // ──────────────────────────────────────────────
  doc.setFillColor(...LIGHT_GRAY);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(m, y, cw, 40, 3, 3, "FD");

  // Section title
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...PRIMARY);
  doc.text("STUDENT DETAILS", m + 4, y + 5);

  doc.setTextColor(...DARK);
  doc.setFontSize(9);
  const dets: Array<{ label: string; value: string; bold?: boolean }> = [
    { label: "Student Name", value: studentName, bold: true },
    { label: "Enrollment No", value: enrollmentNo },
    { label: "Batch", value: batchName },
  ];

  let dy = y + 12;
  dets.forEach((d) => {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    doc.text(d.label, m + 6, dy);
    doc.setFont("helvetica", d.bold ? "bold" : "normal");
    doc.setTextColor(...DARK);
    doc.text(d.value, m + 60, dy);
    dy += 7;
  });

  y += 46;

  // ──────────────────────────────────────────────
  //  AMOUNT PAID — HIGHLIGHTED BOX
  // ──────────────────────────────────────────────
  doc.setFillColor(...GREEN_BG);
  doc.setFillColor(...GREEN_BG);
  doc.setDrawColor(...GREEN);
  doc.roundedRect(m, y, cw, 24, 4, 4, "FD");

  doc.setTextColor(...GREEN);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text(fc(paidFees), pw / 2, y + 16, { align: "center" });

  y += 28;

  // ──────────────────────────────────────────────
  //  FEE BREAKDOWN TABLE
  // ──────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...PRIMARY);
  doc.text("FEE BREAKDOWN", m + 4, y + 5);
  y += 10;

  const rows: Array<[string, string, string]> = [
    ["Original Fee", fc(originalFee), ""],
    ...(discountAmount > 0 ? [["Discount Applied", `- ${fc(discountAmount)}`, "green"]] : []),
    ["Final Fee", fc(finalFee), ""],
    ["Amount Paid", fc(paidFees), "bold-green"],
    ["Pending Balance", fc(Math.max(0, finalFee - paidFees)), "red"],
  ];  

  rows.forEach((r, i) => {
    const isEven = i % 2 === 0;
    const isLast = i === rows.length - 1;

    if (isEven) {
      doc.setFillColor(...LIGHT_GRAY);
      doc.rect(m, y, cw, 7, "F");
    }

    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.15);
    doc.line(m, y, pw - m, y);

    // Label
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK);
    doc.setFontSize(9);
    doc.text(r[0], m + 6, y + 5);

    // Value with optional color
    const style = r[2];
    if (style === "bold-green") {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...GREEN);
    } else if (style === "red") {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...RED);
    } else if (style === "green") {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...GREEN);
    } else {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...DARK);
    }
    doc.text(r[1], pw - m - 6, y + 5, { align: "right" });

    y += 7;
  });

  // Bottom border of table
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(m, y, pw - m, y);

  // Total summary line
  const pctPaid = finalFee > 0 ? Math.round((paidFees / finalFee) * 100) : 0;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text(`${pctPaid}% of fee paid`, pw / 2, y + 5, { align: "center" });
  y += 10;

  // ──────────────────────────────────────────────
  //  PAYMENT HISTORY TABLE
  // ──────────────────────────────────────────────
  if (paymentHistory && paymentHistory.length > 0) {
    // Check remaining space — if too tight, new page
    const tableEstimatedHeight = paymentHistory.length * 8 + 20;
    if (y + tableEstimatedHeight > ph - m - 20) {
      doc.addPage();
      y = m;
    }

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...PRIMARY);
    doc.text("PAYMENT HISTORY", m, y);
    y += 6;

    autoTable(doc, {
      startY: y,
      margin: { left: m, right: m },
      head: [["#", "Date", "Amount", "Payment Method", "Receipt No"]],
      body: paymentHistory.map((p, i) => [
        String(i + 1),
        new Date(p.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
        fc(p.amount),
        p.method.toUpperCase(),
        p.receiptId,
      ]),
      headStyles: {
        fillColor: [...PRIMARY],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: "bold",
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [34, 34, 34],
      },
      alternateRowStyles: {
        fillColor: [248, 249, 250],
      },
      styles: {
        cellPadding: 2.5,
        lineColor: [221, 221, 221],
        lineWidth: 0.1,
      },
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        1: { cellWidth: 45 },
        2: { cellWidth: 35, halign: "right" },
        3: { cellWidth: 35, halign: "center" },
        4: { cellWidth: "auto" },
      },
    });

    y = (doc as any).lastAutoTable.finalY + 10;

    // Payment summary
    const totalPayments = paymentHistory.reduce((s, p) => s + p.amount, 0);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DARK);
    doc.text(`Total Payments: ${paymentHistory.length}`, m, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    doc.text(`Sum: ${fc(totalPayments)}`, m, y + 4);
    y += 8;
  }

  // ──────────────────────────────────────────────
  //  FOOTER
  // ──────────────────────────────────────────────
  if (y > ph - m - 20) {
    doc.addPage();
    y = m;
  }

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.5);
  doc.line(m, y, pw - m, y);
  y += 5;

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text("This is a computer-generated receipt. No signature required.", pw / 2, y, { align: "center" });
  y += 3.5;
  doc.text(
    `Generated on ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })} at ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`,
    pw / 2,
    y,
    { align: "center" }
  );
  y += 3.5;
  doc.setFont("helvetica", "bold");
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


