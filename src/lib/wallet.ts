import { supabase, isUuid } from "@/lib/supabase";

/**
 * Get the current wallet credit balance for an institute.
 * Returns null when the query fails (so callers can treat it as "unknown").
 */
export async function getWalletCredits(instId: string): Promise<number | null> {
  if (!isUuid(instId)) return null;
  try {
    const { data } = await supabase
      .from("institutes")
      .select("wallet_credits")
      .eq("id", instId)
      .single();
    return data?.wallet_credits ?? 0;
  } catch {
    return null;
  }
}

/**
 * Debit `count` wallet credits from the institute (atomic read-then-update),
 * recording a wallet_transactions row. Returns the new balance on success,
 * or null when there are insufficient credits / an error occurred.
 */
export async function debitWalletCredits(
  instId: string,
  count: number,
  description = "WhatsApp message"
): Promise<{ success: boolean; balance: number; error?: string }> {
  if (!isUuid(instId)) return { success: false, balance: 0, error: "Invalid institute ID" };
  if (count <= 0) return { success: true, balance: 0 };
  try {
    const { data: inst } = await supabase
      .from("institutes")
      .select("wallet_credits")
      .eq("id", instId)
      .single();
    const currentBalance = inst?.wallet_credits || 0;
    if (currentBalance < count) {
      return {
        success: false,
        balance: currentBalance,
        error: `Insufficient credits. Need ${count}, have ${currentBalance}.`,
      };
    }
    const newBalance = currentBalance - count;
    await supabase
      .from("institutes")
      .update({ wallet_credits: newBalance })
      .eq("id", instId);
    await supabase.from("wallet_transactions").insert([
      {
        institute_id: instId,
        type: "debit",
        amount: count,
        description,
        reference_type: "whatsapp",
        balance_before: currentBalance,
        balance_after: newBalance,
      },
    ]);
    return { success: true, balance: newBalance };
  } catch (err: any) {
    return { success: false, balance: 0, error: err?.message || "Debit failed" };
  }
}
