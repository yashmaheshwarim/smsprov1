import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: string;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  color?: string;
  onPress?: () => void;
}

const StatCard = React.memo(function StatCard({
  title,
  value,
  icon,
  change,
  changeType = 'neutral',
  color = '#6366f1',
  onPress,
}: StatCardProps) {
  const changeColor =
    changeType === 'positive'
      ? '#22c55e'
      : changeType === 'negative'
        ? '#ef4444'
        : '#6b7280';

  const content = (
    <View style={[styles.card, { borderLeftColor: color }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {icon && <Text style={styles.icon}>{icon}</Text>}
      </View>
      <Text style={styles.value}>{value}</Text>
      {change && (
        <Text style={[styles.change, { color: changeColor }]}>{change}</Text>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
});

export default StatCard;

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  icon: {
    fontSize: 16,
  },
  value: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  change: {
    fontSize: 12,
    fontWeight: '500',
  },
});
