import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReceiptData {
  receiptNo: string;
  instituteName: string;
  instituteAddress?: string;
  institutePhone?: string;
  instituteEmail?: string;
  studentName: string;
  enrollmentNo: string;
  batchName: string;
  description: string;
  totalFee: number;
  paidAmount: number;
  balanceDue: number;
  paymentDate: string;
  status: string;
  paymentMethod?: string;
}

interface MarksReportData {
  instituteName: string;
  examName: string;
  batchName: string;
  subjects: string[];
  students: {
    id: string;
    name: string;
    enrollmentNo: string;
    subjects: { subject: string; obtained: number; total: number }[];
  }[];
  generatedAt: string;
}

// ─── Helper: Convert number to Indian Rupees in words ────────────────────────
function numberToWords(n: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const scales = ['', 'Thousand', 'Lakh', 'Crore'];

  if (n === 0) return 'Zero';

  const num = Math.floor(n);
  if (num <= 0) return 'Zero';

  function convertBelow1000(x: number): string {
    if (x === 0) return '';
    let result = '';
    if (x >= 100) {
      result += ones[Math.floor(x / 100)] + ' Hundred ';
      x %= 100;
    }
    if (x >= 20) {
      result += tens[Math.floor(x / 10)] + ' ';
      x %= 10;
    }
    if (x > 0) {
      result += ones[x] + ' ';
    }
    return result.trim();
  }

  let result = '';
  let remaining = num;
  const parts: string[] = [];

  // Crores
  if (remaining >= 10000000) {
    const crore = Math.floor(remaining / 10000000);
    parts.push(convertBelow1000(crore) + ' Crore');
    remaining %= 10000000;
  }
  // Lakhs
  if (remaining >= 100000) {
    const lakh = Math.floor(remaining / 100000);
    parts.push(convertBelow1000(lakh) + ' Lakh');
    remaining %= 100000;
  }
  // Thousands
  if (remaining >= 1000) {
    const thousand = Math.floor(remaining / 1000);
    parts.push(convertBelow1000(thousand) + ' Thousand');
    remaining %= 1000;
  }
  // Hundreds
  if (remaining > 0) {
    parts.push(convertBelow1000(remaining));
  }

  result = parts.join(' ').replace(/\s+/g, ' ').trim();
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROFESSIONAL FEE RECEIPT
// ═══════════════════════════════════════════════════════════════════════════════
export async function generateReceipt(data: ReceiptData): Promise<void> {
  const amountInWords = numberToWords(data.paidAmount);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page {
      margin: 12mm 15mm 15mm 15mm;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Courier New', monospace;
      color: #1e293b;
      background: #fff;
      font-size: 11px;
      line-height: 1.4;
    }
    .receipt {
      max-width: 100%;
      margin: 0 auto;
      border: 2px solid #1e293b;
      padding: 20px;
      position: relative;
    }
    /* ── Header ── */
    .header {
      text-align: center;
      padding-bottom: 14px;
      border-bottom: 3px double #1e293b;
      margin-bottom: 14px;
    }
    .header h1 {
      font-size: 20px;
      font-weight: 900;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: #1e293b;
      margin-bottom: 2px;
    }
    .header .tagline {
      font-size: 9px;
      color: #64748b;
      letter-spacing: 2px;
      text-transform: uppercase;
    }
    .header .address {
      font-size: 10px;
      color: #475569;
      margin-top: 4px;
    }
    .header .contact {
      font-size: 9px;
      color: #64748b;
      margin-top: 2px;
    }
    /* ── Receipt Title ── */
    .receipt-title {
      text-align: center;
      margin-bottom: 14px;
      border: 1px solid #1e293b;
      padding: 6px 0;
      background: #f8fafc;
    }
    .receipt-title h2 {
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 3px;
      text-transform: uppercase;
    }
    .receipt-title .receipt-no {
      font-size: 10px;
      color: #475569;
      margin-top: 2px;
    }
    /* ── Info Grid ── */
    .info-grid {
      display: flex;
      flex-wrap: wrap;
      border: 1px solid #e2e8f0;
      margin-bottom: 14px;
    }
    .info-item {
      width: 50%;
      padding: 6px 10px;
      border-bottom: 1px solid #e2e8f0;
    }
    .info-item:nth-child(odd) {
      border-right: 1px solid #e2e8f0;
    }
    .info-item:nth-last-child(-n+2) {
      border-bottom: none;
    }
    .info-label {
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #64748b;
      font-weight: 600;
    }
    .info-value {
      font-size: 11px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 1px;
    }
    /* ── Fee Table ── */
    .fee-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
    }
    .fee-table th {
      background: #1e293b;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 8px 10px;
      text-align: left;
    }
    .fee-table th.right {
      text-align: right;
    }
    .fee-table td {
      padding: 7px 10px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 11px;
    }
    .fee-table td.right {
      text-align: right;
      font-weight: 700;
    }
    .fee-table .total-row td {
      font-weight: 800;
      font-size: 13px;
      border-top: 2px solid #1e293b;
      border-bottom: 2px solid #1e293b;
      padding: 8px 10px;
    }
    .fee-table .total-row .status-paid {
      color: #16a34a;
      text-transform: uppercase;
      font-weight: 800;
    }
    .fee-table .total-row .status-pending {
      color: #d97706;
      text-transform: uppercase;
      font-weight: 800;
    }
    .fee-table .total-row .status-partial {
      color: #2563eb;
      text-transform: uppercase;
      font-weight: 800;
    }
    /* ── Amount in Words ── */
    .amount-words {
      margin-bottom: 14px;
      padding: 8px 12px;
      border: 1px dashed #94a3b8;
      background: #f8fafc;
    }
    .amount-words .label {
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #64748b;
    }
    .amount-words .words {
      font-size: 11px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 2px;
      text-transform: capitalize;
    }
    /* ── Footer ── */
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 14px;
      padding-top: 14px;
      border-top: 2px solid #e2e8f0;
    }
    .footer-left p {
      font-size: 9px;
      color: #64748b;
      margin-bottom: 2px;
    }
    .footer-right {
      text-align: center;
    }
    .footer-right .signature-line {
      width: 140px;
      border-top: 1px solid #1e293b;
      margin-top: 32px;
      padding-top: 4px;
      font-size: 9px;
      font-weight: 600;
      color: #1e293b;
    }
    .footer-right .stamp {
      margin-top: 4px;
      font-size: 8px;
      color: #dc2626;
      font-weight: 700;
      border: 2px solid #dc2626;
      padding: 2px 6px;
      display: inline-block;
      border-radius: 4px;
      transform: rotate(-5deg);
    }
    /* ── Terms ── */
    .terms {
      margin-top: 14px;
      padding: 8px 12px;
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
    }
    .terms p {
      font-size: 8px;
      color: #64748b;
      margin-bottom: 1px;
    }
    .terms strong {
      color: #334155;
    }
  </style>
</head>
<body>
  <div class="receipt">
    <!-- Header -->
    <div class="header">
      <h1>${escapeHtml(data.instituteName)}</h1>
      <div class="tagline">Educational Institute</div>
      ${data.instituteAddress ? `<div class="address">${escapeHtml(data.instituteAddress)}</div>` : ''}
      ${data.institutePhone || data.instituteEmail ? `<div class="contact">${data.institutePhone ? '📞 ' + escapeHtml(data.institutePhone) : ''}${data.institutePhone && data.instituteEmail ? ' &nbsp;|&nbsp; ' : ''}${data.instituteEmail ? '✉ ' + escapeHtml(data.instituteEmail) : ''}</div>` : ''}
    </div>

    <!-- Receipt Title -->
    <div class="receipt-title">
      <h2>Payment Receipt</h2>
      <div class="receipt-no">Receipt No: ${escapeHtml(data.receiptNo)} &nbsp;|&nbsp; Date: ${escapeHtml(data.paymentDate)}</div>
    </div>

    <!-- Student Info -->
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">Student Name</div>
        <div class="info-value">${escapeHtml(data.studentName)}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Enrollment No</div>
        <div class="info-value">${escapeHtml(data.enrollmentNo)}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Batch / Class</div>
        <div class="info-value">${escapeHtml(data.batchName)}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Payment Method</div>
        <div class="info-value">${escapeHtml(data.paymentMethod || 'Cash')}</div>
      </div>
    </div>

    <!-- Fee Breakdown -->
    <table class="fee-table">
      <thead>
        <tr>
          <th>Description</th>
          <th class="right">Amount (₹)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${escapeHtml(data.description)}</td>
          <td class="right">${formatIndianCurrency(data.totalFee)}</td>
        </tr>
        <tr>
          <td>Discount / Adjustment</td>
          <td class="right">—</td>
        </tr>
        <tr>
          <td>Amount Paid</td>
          <td class="right" style="color:#16a34a">${formatIndianCurrency(data.paidAmount)}</td>
        </tr>
        <tr class="total-row">
          <td>
            <strong>Balance Due</strong><br/>
            <span class="${getStatusClass(data.status)}">${data.status.toUpperCase()}</span>
          </td>
          <td class="right">${formatIndianCurrency(Math.max(0, data.balanceDue))}</td>
        </tr>
      </tbody>
    </table>

    <!-- Amount in Words -->
    <div class="amount-words">
      <div class="label">Amount Received (in words)</div>
      <div class="words">Indian Rupees ${amountInWords} Only</div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <div class="footer-left">
        <p><strong>₹ ${formatIndianCurrency(data.paidAmount)}</strong> received on ${escapeHtml(data.paymentDate)}</p>
        <p>This is a computer-generated receipt.</p>
      </div>
      <div class="footer-right">
        <div class="signature-line">
          Authorised Signatory
        </div>
        <div class="stamp">🔴 PAID</div>
      </div>
    </div>

    <!-- Terms & Conditions -->
    <div class="terms">
      <p><strong>Terms & Conditions:</strong></p>
      <p>1. This receipt is valid only for the student mentioned above.</p>
      <p>2. Fees once paid are non-refundable and non-transferable.</p>
      <p>3. Please retain this receipt for future reference.</p>
      <p><strong>${escapeHtml(data.instituteName)}</strong> | Powered by Maheshwari Tech</p>
    </div>
  </div>
</body>
</html>`;

  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 }); // A4
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROFESSIONAL MARKS REPORT CARD
// ═══════════════════════════════════════════════════════════════════════════════
export async function generateMarksReport(data: MarksReportData): Promise<void> {
  const subjects = data.subjects;
  const subjectCount = subjects.length;

  // Build table rows
  const rows = data.students.map((student) => {
    const subjectMap = new Map<string, { obtained: number; total: number }>();
    student.subjects.forEach((s) => subjectMap.set(s.subject, s));

    let totalObt = 0;
    let totalMax = 0;
    const subjectCells = subjects.map((subj) => {
      const marks = subjectMap.get(subj);
      if (marks) {
        totalObt += marks.obtained;
        totalMax += marks.total;
        return `<td class="marks-cell">${marks.obtained}<span class="out-of">/${marks.total}</span></td>`;
      }
      return '<td class="marks-cell">—</td>';
    }).join('');

    const pct = totalMax > 0 ? Math.round((totalObt / totalMax) * 100) : 0;
    const grade = getGrade(pct);
    const pctColor = getPctColor(pct);

    return `
      <tr>
        <td class="name-cell">
          <div class="student-name">${escapeHtml(student.name)}</div>
          <div class="student-enroll">${escapeHtml(student.enrollmentNo)}</div>
        </td>
        ${subjectCells}
        <td class="total-cell">
          <div class="total-obt">${totalObt}</div>
          <div class="total-max">/${totalMax}</div>
        </td>
        <td class="pct-cell" style="color:${pctColor}; font-weight:800">${pct}%</td>
        <td class="grade-cell" style="color:${pctColor}">${grade}</td>
      </tr>`;
  }).join('');

  // Header row for subjects
  const subjectHeaders = subjects.map((s) => `<th>${escapeHtml(s)}</th>`).join('');

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page {
      margin: 12mm 12mm 15mm 12mm;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Helvetica', 'Arial', sans-serif;
      color: #1e293b;
      background: #fff;
      font-size: 10px;
      line-height: 1.3;
    }
    /* ── Report Container ── */
    .report {
      max-width: 100%;
    }
    /* ── Header ── */
    .header {
      text-align: center;
      padding-bottom: 10px;
      border-bottom: 4px solid #334155;
      margin-bottom: 12px;
      position: relative;
    }
    .header .logo-placeholder {
      width: 50px;
      height: 50px;
      border: 2px solid #334155;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 4px;
      font-size: 16px;
      font-weight: 900;
      color: #334155;
    }
    .header h1 {
      font-size: 18px;
      font-weight: 900;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      color: #1e293b;
      margin-bottom: 2px;
    }
    .header h2 {
      font-size: 14px;
      font-weight: 700;
      color: #475569;
      margin-bottom: 2px;
    }
    .header .exam-info {
      font-size: 10px;
      color: #64748b;
      margin-top: 4px;
    }
    .header .exam-info span {
      margin: 0 8px;
    }
    /* ── Stats Bar ── */
    .stats-bar {
      display: flex;
      justify-content: center;
      gap: 20px;
      margin-bottom: 12px;
      padding: 6px 12px;
      background: #f1f5f9;
      border-radius: 6px;
      font-size: 9px;
    }
    .stats-bar .stat-item {
      text-align: center;
    }
    .stats-bar .stat-value {
      font-weight: 800;
      color: #0f172a;
    }
    .stats-bar .stat-label {
      color: #64748b;
      font-size: 8px;
      text-transform: uppercase;
    }
    /* ── Table ── */
    .marks-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
    }
    .marks-table th {
      background: #1e293b;
      color: #fff;
      font-size: 8px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      padding: 7px 6px;
      text-align: center;
      border: 0.5px solid #334155;
    }
    .marks-table th:first-child {
      text-align: left;
      min-width: 140px;
    }
    .marks-table td {
      padding: 5px 6px;
      text-align: center;
      border: 0.5px solid #e2e8f0;
      font-size: 10px;
    }
    .marks-table .name-cell {
      text-align: left;
    }
    .marks-table .student-name {
      font-weight: 600;
      color: #0f172a;
      font-size: 10px;
    }
    .marks-table .student-enroll {
      font-size: 8px;
      color: #94a3b8;
    }
    .marks-table .marks-cell {
      font-weight: 700;
      font-size: 11px;
    }
    .marks-table .out-of {
      font-weight: 400;
      color: #94a3b8;
      font-size: 8px;
    }
    .marks-table .total-cell {
      font-weight: 700;
    }
    .marks-table .total-obt {
      font-size: 12px;
    }
    .marks-table .total-max {
      font-size: 9px;
      color: #94a3b8;
    }
    .marks-table .grade-cell {
      font-weight: 800;
      font-size: 12px;
    }
    /* Alternating row colors */
    .marks-table tbody tr:nth-child(even) {
      background: #f8fafc;
    }
    .marks-table tbody tr:hover {
      background: #f1f5f9;
    }
    /* ── Summary Section ── */
    .summary {
      display: flex;
      gap: 10px;
      margin-bottom: 12px;
    }
    .summary-box {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      text-align: center;
    }
    .summary-box .box-label {
      font-size: 8px;
      text-transform: uppercase;
      color: #64748b;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }
    .summary-box .box-value {
      font-size: 16px;
      font-weight: 800;
      color: #0f172a;
    }
    .summary-box .box-sub {
      font-size: 8px;
      color: #94a3b8;
    }
    /* ── Grade Legend ── */
    .grade-legend {
      margin-bottom: 12px;
      padding: 8px 12px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      background: #f8fafc;
    }
    .grade-legend h4 {
      font-size: 9px;
      font-weight: 700;
      color: #475569;
      margin-bottom: 4px;
    }
    .grade-legend .grades {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      font-size: 8px;
      color: #64748b;
    }
    .grade-legend .grades span {
      margin-right: 4px;
    }
    /* ── Footer ── */
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding-top: 10px;
      border-top: 2px solid #e2e8f0;
      margin-top: 8px;
    }
    .footer-left {
      font-size: 8px;
      color: #94a3b8;
    }
    .footer-right {
      text-align: center;
    }
    .footer-right .signature {
      width: 120px;
      border-top: 1px solid #1e293b;
      margin-top: 28px;
      padding-top: 3px;
      font-size: 8px;
      font-weight: 600;
      color: #1e293b;
    }
    .page-footer {
      text-align: center;
      font-size: 7px;
      color: #cbd5e1;
      margin-top: 8px;
      padding-top: 4px;
      border-top: 1px solid #f1f5f9;
    }
  </style>
</head>
<body>
  <div class="report">
    <!-- Header -->
    <div class="header">
      <div class="logo-placeholder">📚</div>
      <h1>${escapeHtml(data.instituteName)}</h1>
      <h2>Student Report Card</h2>
      <div class="exam-info">
        <span>📝 ${escapeHtml(data.examName)}</span>
        <span>📋 ${escapeHtml(data.batchName)}</span>
        <span>📅 ${formatDateDisplay(data.generatedAt)}</span>
      </div>
    </div>

    <!-- Stats Bar -->
    <div class="stats-bar">
      <div class="stat-item">
        <div class="stat-value">${data.students.length}</div>
        <div class="stat-label">Students</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${subjectCount}</div>
        <div class="stat-label">Subjects</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${calcOverallPct(data.students)}%</div>
        <div class="stat-label">Class Avg</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${calcTopScore(data.students)}%</div>
        <div class="stat-label">Top Score</div>
      </div>
    </div>

    <!-- Marks Table -->
    <table class="marks-table">
      <thead>
        <tr>
          <th>Student</th>
          ${subjectHeaders}
          <th>Total</th>
          <th>%</th>
          <th>Grade</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <!-- Summary -->
    <div class="summary">
      <div class="summary-box">
        <div class="box-label">Total Students</div>
        <div class="box-value">${data.students.length}</div>
      </div>
      <div class="summary-box">
        <div class="box-label">Subjects</div>
        <div class="box-value">${subjectCount}</div>
      </div>
      <div class="summary-box" style="border-color: #22c55e">
        <div class="box-label">Pass Rate</div>
        <div class="box-value" style="color:#16a34a">${calcPassRate(data.students)}%</div>
      </div>
      <div class="summary-box" style="border-color: #6366f1">
        <div class="box-label">Distinctions</div>
        <div class="box-value" style="color:#6366f1">${calcDistinctions(data.students)}</div>
        <div class="box-sub">≥ 75%</div>
      </div>
    </div>

    <!-- Grade Legend -->
    <div class="grade-legend">
      <h4>Grading Scale</h4>
      <div class="grades">
        <span><span style="color:#16a34a;font-weight:700">A+</span> ≥ 90%</span>
        <span><span style="color:#22c55e;font-weight:700">A</span> ≥ 75%</span>
        <span><span style="color:#d97706;font-weight:700">B</span> ≥ 60%</span>
        <span><span style="color:#ea580c;font-weight:700">C</span> ≥ 45%</span>
        <span><span style="color:#dc2626;font-weight:700">D</span> ≥ 33%</span>
        <span><span style="color:#991b1b;font-weight:700">F</span> &lt; 33%</span>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <div class="footer-left">
        Generated on ${formatDateDisplay(data.generatedAt)}<br/>
        This is a computer-generated report card.
      </div>
      <div class="footer-right">
        <div class="signature">Class Teacher / Principal</div>
      </div>
    </div>

    <div class="page-footer">
      ${escapeHtml(data.instituteName)} | Report Card - ${escapeHtml(data.examName)} | Powered by Maheshwari Tech
    </div>
  </div>
</body>
</html>`;

  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 }); // A4
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEGACY REPORT GENERATORS (refactored)
// ═══════════════════════════════════════════════════════════════════════════════

export async function generateFeeReport(
  dataOrName: string | {
    instituteName: string;
    studentName: string;
    enrollmentNo: string;
    batchName: string;
    totalFees: number;
    totalPaid: number;
    pending: number;
    items: {
      description: string;
      amount: number;
      paidAmount: number;
      dueDate: string;
      lastPaymentDate: string | null;
      status: string;
    }[];
  },
  headers?: string[],
  rows?: string[][]
): Promise<void> {
  if (typeof dataOrName === 'string' && headers && rows) {
    const html = generateSimpleHtml('Fee Report', dataOrName, headers, rows);
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
  } else if (typeof dataOrName === 'object') {
    const data = dataOrName;
    const rowHeaders = ['Description', 'Amount', 'Paid', 'Due Date', 'Last Payment', 'Status'];
    const rowData = data.items.map((item) => [
      item.description,
      `₹${item.amount.toLocaleString('en-IN')}`,
      `₹${item.paidAmount.toLocaleString('en-IN')}`,
      item.dueDate || 'N/A',
      item.lastPaymentDate ? formatDateDisplay(item.lastPaymentDate) : 'N/A',
      item.status,
    ]);
    rowData.push(['', '', '', '', '', '']);
    rowData.push(['Total Fees', `₹${data.totalFees.toLocaleString('en-IN')}`, '', '', '', '']);
    rowData.push(['Total Paid', `₹${data.totalPaid.toLocaleString('en-IN')}`, '', '', '', '']);
    rowData.push(['Pending', `₹${data.pending.toLocaleString('en-IN')}`, '', '', '', '']);

    const html = generateSimpleHtml(
      'Fee Report',
      `${data.instituteName} — ${data.studentName} (${data.enrollmentNo})`,
      rowHeaders,
      rowData
    );
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
  }
}

export async function generateListReport(
  title: string,
  subtitle: string,
  headers: string[],
  rows: string[][]
): Promise<void> {
  const html = generateSimpleHtml(title, subtitle, headers, rows);
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function generateSimpleHtml(title: string, subtitle: string, headers: string[], rows: string[][]): string {
  const headerRow = headers.map((h) =>
    `<th style="padding:8px 10px;text-align:left;border-bottom:2px solid #6366f1;font-size:11px;font-weight:600;color:#374151;background:#f8fafc;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(h)}</th>`
  ).join('');
  const bodyRows = rows.map((row) =>
    `<tr>${row.map((cell) => `<td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280;">${escapeHtml(cell)}</td>`).join('')}</tr>`
  ).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Helvetica', sans-serif; padding: 24px; }
    h1 { color: #111827; font-size: 22px; margin-bottom: 4px; }
    .subtitle { color: #6b7280; font-size: 14px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; }
    .footer { text-align: center; color: #9ca3af; font-size: 10px; margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="subtitle">${escapeHtml(subtitle)}</p>
  <table>${headerRow}${bodyRows}</table>
  <div class="footer">Generated on ${new Date().toLocaleDateString('en-IN')} | Powered by Maheshwari Tech</div>
</body>
</html>`;
}

function formatIndianCurrency(n: number): string {
  return '₹ ' + n.toLocaleString('en-IN');
}

function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function getStatusClass(status: string): string {
  switch (status) {
    case 'paid': return 'status-paid';
    case 'pending': return 'status-pending';
    case 'partial': return 'status-partial';
    default: return 'status-pending';
  }
}

function getGrade(pct: number): string {
  if (pct >= 90) return 'A+';
  if (pct >= 75) return 'A';
  if (pct >= 60) return 'B';
  if (pct >= 45) return 'C';
  if (pct >= 33) return 'D';
  return 'F';
}

function getPctColor(pct: number): string {
  if (pct >= 75) return '#16a34a';
  if (pct >= 60) return '#d97706';
  if (pct >= 45) return '#ea580c';
  if (pct >= 33) return '#dc2626';
  return '#991b1b';
}

function calcOverallPct(students: MarksReportData['students']): number {
  const totals = students.reduce(
    (acc, s) => {
      const subjTotals = s.subjects.reduce((a, sub) => ({ obt: a.obt + sub.obtained, max: a.max + sub.total }), { obt: 0, max: 0 });
      return { obt: acc.obt + subjTotals.obt, max: acc.max + subjTotals.max };
    },
    { obt: 0, max: 0 }
  );
  if (totals.max === 0) return 0;
  return Math.round((totals.obt / totals.max) * 100);
}

function calcTopScore(students: MarksReportData['students']): number {
  let maxPct = 0;
  students.forEach((s) => {
    const subjTotals = s.subjects.reduce((a, sub) => ({ obt: a.obt + sub.obtained, max: a.max + sub.total }), { obt: 0, max: 0 });
    const pct = subjTotals.max > 0 ? (subjTotals.obt / subjTotals.max) * 100 : 0;
    if (pct > maxPct) maxPct = pct;
  });
  return Math.round(maxPct);
}

function calcPassRate(students: MarksReportData['students']): number {
  if (students.length === 0) return 0;
  const passed = students.filter((s) => {
    const subjTotals = s.subjects.reduce((a, sub) => ({ obt: a.obt + sub.obtained, max: a.max + sub.total }), { obt: 0, max: 0 });
    const pct = subjTotals.max > 0 ? (subjTotals.obt / subjTotals.max) * 100 : 0;
    return pct >= 33;
  }).length;
  return Math.round((passed / students.length) * 100);
}

function calcDistinctions(students: MarksReportData['students']): number {
  return students.filter((s) => {
    const subjTotals = s.subjects.reduce((a, sub) => ({ obt: a.obt + sub.obtained, max: a.max + sub.total }), { obt: 0, max: 0 });
    const pct = subjTotals.max > 0 ? (subjTotals.obt / subjTotals.max) * 100 : 0;
    return pct >= 75;
  }).length;
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
