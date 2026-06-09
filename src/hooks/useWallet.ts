// ============================================================================
// Wallet / Credit System React Hooks
// ============================================================================

import { useState, useCallback, useEffect } from 'react';
import { getWalletService } from '@/lib/wallet-service';
import {
  Wallet,
  WalletTransaction,
  WalletUsageLog,
} from '@/types/whatsapp';

// ============================================================================
// 1. USE WALLET
// ============================================================================

export function useWallet(instituteId: string) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWallet = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const walletService = getWalletService();
      const walletData = await walletService.getOrCreateWallet(instituteId);
      setWallet(walletData);
      setBalance(walletData.balance);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching wallet:', err);
    } finally {
      setLoading(false);
    }
  }, [instituteId]);

  const deductCredits = useCallback(
    async (
      credits: number,
      description: string,
      referenceType?: string,
      referenceId?: string
    ) => {
      setLoading(true);
      setError(null);
      try {
        const walletService = getWalletService();
        const result = await walletService.deductCredits(
          instituteId,
          credits,
          description,
          referenceType as any,
          referenceId
        );

        if (result.success) {
          setBalance(result.newBalance);
          await fetchWallet();
        }

        return result;
      } catch (err: any) {
        setError(err.message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [instituteId, fetchWallet]
  );

  const addCredits = useCallback(
    async (credits: number, description: string) => {
      setLoading(true);
      setError(null);
      try {
        const walletService = getWalletService();
        const result = await walletService.addCredits(instituteId, credits, description);

        if (result.success) {
          setBalance(result.newBalance);
          await fetchWallet();
        }

        return result;
      } catch (err: any) {
        setError(err.message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [instituteId, fetchWallet]
  );

  const refundCredits = useCallback(
    async (credits: number, reason: string) => {
      setLoading(true);
      setError(null);
      try {
        const walletService = getWalletService();
        const result = await walletService.refundCredits(instituteId, credits, reason);

        if (result.success) {
          setBalance(result.newBalance);
          await fetchWallet();
        }

        return result;
      } catch (err: any) {
        setError(err.message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [instituteId, fetchWallet]
  );

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  return {
    wallet,
    balance,
    loading,
    error,
    fetchWallet,
    deductCredits,
    addCredits,
    refundCredits,
  };
}

// ============================================================================
// 2. USE WALLET TRANSACTIONS
// ============================================================================

export function useWalletTransactions(instituteId: string) {
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = useCallback(
    async (limit: number = 50, offset: number = 0) => {
      setLoading(true);
      setError(null);
      try {
        const walletService = getWalletService();
        const data = await walletService.getTransactionHistory(instituteId, limit, offset);
        setTransactions(data);
      } catch (err: any) {
        setError(err.message);
        console.error('Error fetching transactions:', err);
      } finally {
        setLoading(false);
      }
    },
    [instituteId]
  );

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  return {
    transactions,
    loading,
    error,
    fetchTransactions,
  };
}

// ============================================================================
// 3. USE WALLET ANALYTICS
// ============================================================================

export function useWalletAnalytics(instituteId: string) {
  const [dailyUsage, setDailyUsage] = useState(0);
  const [monthlyUsage, setMonthlyUsage] = useState(0);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async (days: number = 30) => {
    setLoading(true);
    setError(null);
    try {
      const walletService = getWalletService();

      const [daily, monthly, usage] = await Promise.all([
        walletService.getDailyUsage(instituteId),
        walletService.getMonthlyUsage(instituteId),
        walletService.getUsageStats(instituteId, days),
      ]);

      setDailyUsage(daily);
      setMonthlyUsage(monthly);
      setStats(usage);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching analytics:', err);
    } finally {
      setLoading(false);
    }
  }, [instituteId]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return {
    dailyUsage,
    monthlyUsage,
    stats,
    loading,
    error,
    fetchAnalytics,
  };
}

// ============================================================================
// 4. USE WALLET CHECK (For sending messages)
// ============================================================================

export function useWalletCheck(instituteId: string) {
  const [hasEnoughCredits, setHasEnoughCredits] = useState(false);
  const [requiredCredits, setRequiredCredits] = useState(0);
  const [loading, setLoading] = useState(false);

  const checkCredits = useCallback(
    async (credits: number) => {
      setLoading(true);
      setRequiredCredits(credits);
      try {
        const walletService = getWalletService();
        const hasEnough = await walletService.hasEnoughCredits(instituteId, credits);
        setHasEnoughCredits(hasEnough);
        return hasEnough;
      } catch (error) {
        console.error('Error checking credits:', error);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [instituteId]
  );

  return {
    hasEnoughCredits,
    requiredCredits,
    loading,
    checkCredits,
  };
}
