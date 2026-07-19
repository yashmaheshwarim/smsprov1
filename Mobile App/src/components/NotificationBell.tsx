import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TouchableOpacity, Text, View, StyleSheet, Animated } from 'react-native';

interface NotificationBellProps {
  count?: number;
  onPress?: () => void;
  size?: number;
  badgeColor?: string;
}

export default function NotificationBell({
  count = 0,
  onPress,
  size = 24,
  badgeColor = '#ef4444',
}: NotificationBellProps) {
  const [pulsing, setPulsing] = useState(count > 0);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const startPulse = useCallback(() => {
    if (!pulsing) return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
      { iterations: 3 }
    ).start();
  }, [pulsing, pulseAnim]);

  const stopPulse = useCallback(() => {
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
  }, [pulseAnim]);

  useEffect(() => {
    setPulsing(count > 0);
    if (count > 0) {
      startPulse();
      const timer = setTimeout(stopPulse, 3600);
      return () => clearTimeout(timer);
    } else {
      stopPulse();
    }
  }, [count, startPulse, stopPulse]);

  return (
    <TouchableOpacity onPress={onPress} style={styles.container} activeOpacity={0.7}>
      <Animated.View style={{ transform: [{ scale: pulsing ? pulseAnim : 1 }] }}>
        <Text style={{ fontSize: size }}>🔔</Text>
      </Animated.View>
      {count > 0 && (
        <View style={[styles.badge, { backgroundColor: badgeColor, minWidth: size * 0.7, height: size * 0.7, borderRadius: size * 0.35 }]}>
          <Text style={[styles.badgeText, { fontSize: size * 0.4 }]}>
            {count > 99 ? '99+' : count}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    padding: 4,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  badgeText: {
    color: '#fff',
    fontWeight: '700',
  },
});
