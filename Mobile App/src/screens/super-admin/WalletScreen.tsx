import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';

export default function SuperAdminWallet() {
  const [loading, setLoading] = useState(true);
  const [institutes, setInstitutes] = useState<any[]>([]);
  const [rechargeId, setRechargeId] = useState<string | null>(null);
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [recharging, setRecharging] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: instData } = await supabase
        .from('institutes')
        .select('id, name, wallet_credits, status')
        .order('name');

      setInstitutes(instData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRecharge = async (instId: string, currentBalance: number) => {
    const amount = parseInt(rechargeAmount);
    if (!amount || amount < 10) {
      Alert.alert('Error', 'Minimum recharge is 10 credits.');
      return;
    }

    setRecharging(true);
    try {
      const { error } = await supabase
        .from('institutes')
        .update({ wallet_credits: currentBalance + amount })
        .eq('id', instId);

      if (error) throw error;

      await supabase.from('wallet_transactions').insert([{
        institute_id: instId,
        type: 'credit',
        amount,
        description: 'Mobile app recharge',
        reference_type: 'recharge',
        balance_before: currentBalance,
        balance_after: currentBalance + amount,
      }]);

      Alert.alert('Success', `${amount} credits added.`);
      setRechargeId(null);
      setRechargeAmount('');
      fetchData();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setRecharging(false);
    }
  };

  const totalCredits = institutes.reduce((a: number, i: any) => a + (i.wallet_credits || 0), 0);

  return (
    <ScrollView style={styles.container}>
      <StatCard title="Total Wallet Credits" value={totalCredits.toLocaleString()} color="#6366f1" />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Institute Wallets</Text>

        {loading ? (
          <ActivityIndicator size="large" color="#6366f1" style={{ marginTop: 20 }} />
        ) : (
          institutes.map((inst) => (
            <View key={inst.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.instName}>{inst.name}</Text>
                <StatusBadge variant={inst.status === 'active' ? 'success' : 'danger'}>
                  {inst.status}
                </StatusBadge>
              </View>
              <Text style={styles.balanceText}>
                Balance: <Text style={styles.balanceAmount}>{inst.wallet_credits || 0}</Text> credits
              </Text>

              {rechargeId === inst.id ? (
                <View style={styles.rechargeRow}>
                  <TextInput
                    style={styles.rechargeInput}
                    placeholder="Amount"
                    placeholderTextColor="#9ca3af"
                    value={rechargeAmount}
                    onChangeText={setRechargeAmount}
                    keyboardType="numeric"
                  />
                  <TouchableOpacity
                    style={styles.rechargeButton}
                    onPress={() => handleRecharge(inst.id, inst.wallet_credits || 0)}
                    disabled={recharging}
                  >
                    <Text style={styles.rechargeButtonText}>
                      {recharging ? '...' : 'Add'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => {
                      setRechargeId(null);
                      setRechargeAmount('');
                    }}
                  >
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.rechargeAction}
                  onPress={() => setRechargeId(inst.id)}
                >
                  <Text style={styles.rechargeActionText}>💳 Recharge</Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 16,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  instName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  balanceText: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 12,
  },
  balanceAmount: {
    fontWeight: '700',
    color: '#6366f1',
    fontSize: 18,
  },
  rechargeRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  rechargeInput: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  rechargeButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  rechargeButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  cancelText: {
    color: '#6b7280',
    fontWeight: '500',
  },
  rechargeAction: {
    backgroundColor: '#eef2ff',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  rechargeActionText: {
    color: '#6366f1',
    fontWeight: '600',
    fontSize: 13,
  },
});
