import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import StatCard from '../../components/StatCard';
import { formatCurrency } from '../../lib/utils';

export default function SuperAdminRevenue() {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<any[]>([]);
  const [totals, setTotals] = useState({
    totalSms: 0,
    totalWa: 0,
    totalValue: 0,
    instituteCount: 0,
  });

  useEffect(() => {
    fetchRevenue();
  }, []);

  const fetchRevenue = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('institutes')
        .select('id, name, sms_credits, whatsapp_credits, wallet_credits');

      if (data) {
        const mapped = data.map((i: any) => ({
          id: i.id,
          instituteName: i.name || 'N/A',
          smsCredits: i.sms_credits || 0,
          waCredits: i.whatsapp_credits || 0,
          walletCredits: i.wallet_credits || 0,
          estimatedValue: (i.sms_credits || 0) * 0.25 + (i.whatsapp_credits || 0) * 0.20,
        }));

        setEntries(mapped);
        setTotals({
          totalSms: mapped.reduce((a: number, e: any) => a + e.smsCredits, 0),
          totalWa: mapped.reduce((a: number, e: any) => a + e.waCredits, 0),
          totalValue: mapped.reduce((a: number, e: any) => a + e.estimatedValue, 0),
          instituteCount: mapped.length,
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.statsGrid}>
        <StatCard title="Institutes" value={totals.instituteCount} color="#6366f1" />
        <StatCard title="SMS Credits" value={totals.totalSms.toLocaleString()} color="#22c55e" />
        <StatCard title="WA Credits" value={totals.totalWa.toLocaleString()} color="#3b82f6" />
        <StatCard title="Est. Revenue" value={formatCurrency(totals.totalValue)} color="#f59e0b" />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Institute Credit Breakdown</Text>
        {entries.map((entry) => (
          <View key={entry.id} style={styles.entryCard}>
            <View style={styles.entryHeader}>
              <Text style={styles.entryName}>{entry.instituteName}</Text>
            </View>
            <View style={styles.entryDetails}>
              <Text style={styles.detailText}>📨 SMS: {entry.smsCredits}</Text>
              <Text style={styles.detailText}>💬 WA: {entry.waCredits}</Text>
              <Text style={styles.detailText}>👛 Wallet: {entry.walletCredits}</Text>
            </View>
          </View>
        ))}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  entryCard: {
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
  entryHeader: {
    marginBottom: 8,
  },
  entryName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  entryDetails: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  detailText: {
    fontSize: 12,
    color: '#374151',
  },
});
