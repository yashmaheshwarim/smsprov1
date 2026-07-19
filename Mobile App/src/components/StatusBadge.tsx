import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'default' | 'primary';

interface StatusBadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
}

const variantStyles: Record<BadgeVariant, { bg: string; text: string }> = {
  success: { bg: '#dcfce7', text: '#166534' },
  warning: { bg: '#fef3c7', text: '#92400e' },
  danger: { bg: '#fee2e2', text: '#991b1b' },
  info: { bg: '#dbeafe', text: '#1e40af' },
  default: { bg: '#f3f4f6', text: '#374151' },
  primary: { bg: '#eef2ff', text: '#4338ca' },
};

const StatusBadge = React.memo(function StatusBadge({ variant = 'default', children }: StatusBadgeProps) {
  const colors = variantStyles[variant];

  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.text, { color: colors.text }]}>{children}</Text>
    </View>
  );
});

export default StatusBadge;

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
});
