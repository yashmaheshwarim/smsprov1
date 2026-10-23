import { supabase } from './supabase';

/**
 * Delete a single payment row (a partial installment) and rebalance the parent
 * student_fees record: paid_fees becomes the SUM of the surviving payments and
 * status/pay-date/receipt-id come from what is left. Mirrors the web app's
 * deletePayment so both platforms behave the same.
 */
export async function deleteStudentFeePayment(
  studentFeeId: string,
  paymentId: string
): Promise<void> {
  // 1. Verify the payment belongs to this fee and capture its amount
  const { data: payment, error: payErr } = await supabase
    .from('payments')
    .select('id, amount, student_fee_id')
    .eq('id', paymentId)
    .maybeSingle();
  if (payErr) throw payErr;
  if (!payment) throw new Error('Payment not found — it may already be deleted.');
  if (payment.student_fee_id !== studentFeeId) {
    throw new Error('Payment does not belong to this fee record.');
  }

  // 2. Delete the payment row
  const { error: delErr } = await supabase
    .from('payments')
    .delete()
    .eq('id', paymentId);
  if (delErr) throw delErr;

  // 3. Read what is left so the fee record can be rebalanced
  const [{ data: remaining }, { data: fee }] = await Promise.all([
    supabase
      .from('payments')
      .select('amount, payment_date, receipt_id')
      .eq('student_fee_id', studentFeeId)
      .order('payment_date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('student_fees')
      .select('id, final_fee')
      .eq('id', studentFeeId)
      .maybeSingle(),
  ]);

  // Fee row can itself be gone (e.g. the whole fee was deleted first)
  if (!fee) return;

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const newPaidFees = round2(
    (remaining || []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0)
  );
  const finalFee = round2(Number(fee.final_fee || 0));
  const newStatus =
    finalFee > 0 && newPaidFees >= finalFee ? 'paid' : newPaidFees > 0 ? 'partial' : 'pending';
  const latest = (remaining || [])[0];

  const { error: updateErr } = await supabase
    .from('student_fees')
    .update({
      paid_fees: newPaidFees,
      status: newStatus,
      last_payment_date: latest?.payment_date || null,
      receipt_id: latest?.receipt_id || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', studentFeeId);
  if (updateErr) throw updateErr;
}
