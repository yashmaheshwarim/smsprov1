// ============================================================================
// Wallet / Credit System Service
// ============================================================================

import { supabase } from '@/lib/supabase';
import {
  Wallet,
  WalletTransaction,
  WalletUsageLog,
  AddCreditsRequest,
  DeductCreditsRequest,
  TransactionType,
  TransactionReferenceType,
} from '@/types/whatsapp';

class WalletService {
  /**
   * Get or create wallet for institute
   */
  async getOrCreateWallet(instituteId: string): Promise<Wallet> {
    try {
      // Try to get existing wallet
      const { data: wallet, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('institute_id', instituteId)
        .single();

      if (error && error.code === 'PGRST116') {
        // Wallet doesn't exist, create it
        const { data: newWallet, error: createError } = await supabase
          .from('wallets')
          .insert({
            institute_id: instituteId,
            balance: 0,
            total_credited: 0,
            total_debited: 0,
            low_balance_threshold: 50,
          })
          .select()
          .single();

        if (createError) throw createError;

        return newWallet;
      }

      if (error) throw error;

      return wallet;
    } catch (error) {
      console.error('Error getting wallet:', error);
      throw error;
    }
  }

  /**
   * Get wallet balance
   */
  async getBalance(instituteId: string): Promise<number> {
    try {
      const wallet = await this.getOrCreateWallet(instituteId);
      return wallet.balance;
    } catch (error) {
      console.error('Error getting balance:', error);
      throw error;
    }
  }

  /**
   * Check if institute has enough credits
   */
  async hasEnoughCredits(instituteId: string, requiredCredits: number): Promise<boolean> {
    try {
      const balance = await this.getBalance(instituteId);
      return balance >= requiredCredits;
    } catch (error) {
      console.error('Error checking credits:', error);
      throw error;
    }
  }

  /**
   * Deduct credits from wallet
   */
  async deductCredits(
    instituteId: string,
    credits: number,
    description: string,
    referenceType: TransactionReferenceType = 'other',
    referenceId?: string
  ): Promise<{ success: boolean; newBalance: number; message: string }> {
    try {
      // Check balance first
      const hasEnough = await this.hasEnoughCredits(instituteId, credits);
      if (!hasEnough) {
        return {
          success: false,
          newBalance: await this.getBalance(instituteId),
          message: 'Insufficient credits',
        };
      }

      // Get wallet
      const wallet = await this.getOrCreateWallet(instituteId);

      // Update wallet balance
      const newBalance = wallet.balance - credits;
      const { error: updateError } = await supabase
        .from('wallets')
        .update({
          balance: newBalance,
          total_debited: wallet.total_debited + credits,
        })
        .eq('id', wallet.id);

      if (updateError) throw updateError;

      // Create transaction record
      await supabase.from('wallet_transactions').insert({
        institute_id: instituteId,
        wallet_id: wallet.id,
        transaction_type: 'debit',
        credits: credits,
        previous_balance: wallet.balance,
        new_balance: newBalance,
        description: description,
        reference_type: referenceType,
        reference_id: referenceId,
      });

      return {
        success: true,
        newBalance: newBalance,
        message: 'Credits deducted successfully',
      };
    } catch (error) {
      console.error('Error deducting credits:', error);
      throw error;
    }
  }

  /**
   * Add credits to wallet (Admin only)
   */
  async addCredits(
    instituteId: string,
    credits: number,
    description: string
  ): Promise<{ success: boolean; newBalance: number; message: string }> {
    try {
      // Get or create wallet
      const wallet = await this.getOrCreateWallet(instituteId);

      // Update wallet balance
      const newBalance = wallet.balance + credits;
      const { error: updateError } = await supabase
        .from('wallets')
        .update({
          balance: newBalance,
          total_credited: wallet.total_credited + credits,
        })
        .eq('id', wallet.id);

      if (updateError) throw updateError;

      // Create transaction record
      await supabase.from('wallet_transactions').insert({
        institute_id: instituteId,
        wallet_id: wallet.id,
        transaction_type: 'credit',
        credits: credits,
        previous_balance: wallet.balance,
        new_balance: newBalance,
        description: description,
        reference_type: 'admin_recharge',
      });

      return {
        success: true,
        newBalance: newBalance,
        message: 'Credits added successfully',
      };
    } catch (error) {
      console.error('Error adding credits:', error);
      throw error;
    }
  }

  /**
   * Log message usage
   */
  async logUsage(
    instituteId: string,
    messageId: string,
    recipientPhone: string,
    creditsUsed: number,
    messageStatus: string
  ): Promise<WalletUsageLog> {
    try {
      const { data, error } = await supabase
        .from('wallet_usage_logs')
        .insert({
          institute_id: instituteId,
          message_id: messageId,
          recipient_phone: recipientPhone,
          credits_used: creditsUsed,
          message_status: messageStatus,
        })
        .select()
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('Error logging usage:', error);
      throw error;
    }
  }

  /**
   * Get transaction history
   */
  async getTransactionHistory(
    instituteId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<WalletTransaction[]> {
    try {
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('institute_id', instituteId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error fetching transaction history:', error);
      throw error;
    }
  }

  /**
   * Get usage statistics
   */
  async getUsageStats(instituteId: string, days: number = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data: logs, error } = await supabase
        .from('wallet_usage_logs')
        .select('credits_used, created_at')
        .eq('institute_id', instituteId)
        .gte('created_at', startDate.toISOString());

      if (error) throw error;

      const totalUsed = logs?.reduce((sum, log) => sum + log.credits_used, 0) || 0;
      const dailyBreakdown: Record<string, number> = {};

      logs?.forEach((log) => {
        const date = new Date(log.created_at).toLocaleDateString();
        dailyBreakdown[date] = (dailyBreakdown[date] || 0) + log.credits_used;
      });

      return {
        total_used: totalUsed,
        daily_breakdown: dailyBreakdown,
        entries_count: logs?.length || 0,
      };
    } catch (error) {
      console.error('Error getting usage stats:', error);
      throw error;
    }
  }

  /**
   * Get daily usage
   */
  async getDailyUsage(instituteId: string): Promise<number> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('wallet_usage_logs')
        .select('credits_used')
        .eq('institute_id', instituteId)
        .gte('created_at', today.toISOString());

      if (error) throw error;

      return data?.reduce((sum, log) => sum + log.credits_used, 0) || 0;
    } catch (error) {
      console.error('Error getting daily usage:', error);
      throw error;
    }
  }

  /**
   * Get monthly usage
   */
  async getMonthlyUsage(instituteId: string): Promise<number> {
    try {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

      const { data, error } = await supabase
        .from('wallet_usage_logs')
        .select('credits_used')
        .eq('institute_id', instituteId)
        .gte('created_at', firstDay.toISOString());

      if (error) throw error;

      return data?.reduce((sum, log) => sum + log.credits_used, 0) || 0;
    } catch (error) {
      console.error('Error getting monthly usage:', error);
      throw error;
    }
  }

  /**
   * Refund credits (for failed messages)
   */
  async refundCredits(
    instituteId: string,
    credits: number,
    reason: string
  ): Promise<{ success: boolean; newBalance: number }> {
    try {
      const wallet = await this.getOrCreateWallet(instituteId);
      const newBalance = wallet.balance + credits;

      const { error: updateError } = await supabase
        .from('wallets')
        .update({
          balance: newBalance,
        })
        .eq('id', wallet.id);

      if (updateError) throw updateError;

      await supabase.from('wallet_transactions').insert({
        institute_id: instituteId,
        wallet_id: wallet.id,
        transaction_type: 'refund',
        credits: credits,
        previous_balance: wallet.balance,
        new_balance: newBalance,
        description: reason,
        reference_type: 'other',
      });

      return {
        success: true,
        newBalance: newBalance,
      };
    } catch (error) {
      console.error('Error refunding credits:', error);
      throw error;
    }
  }
}

// ============================================================================
// Singleton instance
// ============================================================================

let walletServiceInstance: WalletService | null = null;

export function getWalletService(): WalletService {
  if (!walletServiceInstance) {
    walletServiceInstance = new WalletService();
  }
  return walletServiceInstance;
}

export default WalletService;
