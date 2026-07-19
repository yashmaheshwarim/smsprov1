import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

interface ReceiptData {
  receiptNo: string;
  instituteName: string;
  studentName: string;
  enrollmentNo: string;
  batchName: string;
  description: string;
  totalFee: number;
  paidAmount: number;
  balanceDue: number;
  paymentDate: string;
  status: string;
}

function generateHtml(title: string, subtitle: string, headers: string[], rows: string[][]): string {
  const headerRow = headers.map((h) => `<th style="padding:8px;text-align:left;border-bottom:2px solid #6366f1;font-size:12px;font-weight:600;color:#374151;">${h}</th>`).join('');
  const bodyRows = rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280;">${cell}</td>`).join('')}</tr>`
    )
    .join('');

  return `
    <html>
    <head>
      <style>
        body { font-family: sans-serif; padding: 24px; }
        h1 { color: #111827; font-size: 20px; margin-bottom: 4px; }
        .subtitle { color: #6b7280; font-size: 14px; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      <p class="subtitle">${subtitle}</p>
      <table>${headerRow}${bodyRows}</table>
    </body>
    </html>
  `;
}

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
    // Legacy 3-argument format
    const html = generateHtml('Fee Report', dataOrName, headers, rows);
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
  } else if (typeof dataOrName === 'object') {
    // New object format
    const data = dataOrName;
    const rowHeaders = ['Description', 'Amount', 'Paid', 'Due Date', 'Last Payment', 'Status'];
    const rowData = data.items.map((item) => [
      item.description,
      `₹${item.amount.toLocaleString('en-IN')}`,
      `₹${item.paidAmount.toLocaleString('en-IN')}`,
      item.dueDate || 'N/A',
      item.lastPaymentDate ? new Date(item.lastPaymentDate).toLocaleDateString('en-IN') : 'N/A',
      item.status,
    ]);
    rowData.push(['', '', '', '', '', '']);
    rowData.push(['Total Fees', `₹${data.totalFees.toLocaleString('en-IN')}`, '', '', '', '']);
    rowData.push(['Total Paid', `₹${data.totalPaid.toLocaleString('en-IN')}`, '', '', '', '']);
    rowData.push(['Pending', `₹${data.pending.toLocaleString('en-IN')}`, '', '', '', '']);

    const html = generateHtml(
      'Fee Report',
      `${data.instituteName} - ${data.studentName} (${data.enrollmentNo})`,
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
  const html = generateHtml(title, subtitle, headers, rows);
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
}

export async function generateReceipt(data: ReceiptData): Promise<void> {
  const html = `
    <html>
    <head>
      <style>
        body { font-family: sans-serif; padding: 24px; color: #111827; }
        .header { text-align: center; margin-bottom: 24px; }
        .header h1 { font-size: 22px; margin-bottom: 4px; }
        .header p { color: #6b7280; font-size: 13px; }
        .divider { border: none; border-top: 2px dashed #e5e7eb; margin: 16px 0; }
        .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
        .label { color: #6b7280; }
        .value { font-weight: 600; }
        .total { font-size: 16px; font-weight: 700; padding-top: 8px; border-top: 2px solid #6366f1; margin-top: 8px; }
        .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
        .paid { background: #dcfce7; color: #16a34a; }
        .pending { background: #fef3c7; color: #d97706; }
        .partial { background: #dbeafe; color: #2563eb; }
        .footer { text-align: center; color: #9ca3af; font-size: 11px; margin-top: 24px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${data.instituteName}</h1>
        <p>Payment Receipt</p>
      </div>
      <hr class="divider" />
      <div class="row"><span class="label">Receipt No.</span><span class="value">${data.receiptNo}</span></div>
      <div class="row"><span class="label">Student</span><span class="value">${data.studentName}</span></div>
      <div class="row"><span class="label">Enrollment</span><span class="value">${data.enrollmentNo}</span></div>
      <div class="row"><span class="label">Batch</span><span class="value">${data.batchName}</span></div>
      <div class="row"><span class="label">Description</span><span class="value">${data.description}</span></div>
      <hr class="divider" />
      <div class="row"><span class="label">Total Fee</span><span class="value">₹${data.totalFee.toLocaleString('en-IN')}</span></div>
      <div class="row"><span class="label">Amount Paid</span><span class="value">₹${data.paidAmount.toLocaleString('en-IN')}</span></div>
      <div class="row"><span class="label">Balance Due</span><span class="value">₹${data.balanceDue.toLocaleString('en-IN')}</span></div>
      <div class="row total"><span class="label">Status</span><span class="badge ${data.status}">${data.status.toUpperCase()}</span></div>
      <div class="row"><span class="label">Payment Date</span><span class="value">${data.paymentDate}</span></div>
      <hr class="divider" />
      <div class="footer">This is a computer-generated receipt. Maheshwari Tech</div>
    </body>
    </html>
  `;
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
}
