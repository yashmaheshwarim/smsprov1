import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, type ViewStyle } from 'react-native';

interface SkeletonBlockProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

function SkeletonBlock({ width = '100%', height = 16, borderRadius = 8, style }: SkeletonBlockProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius, backgroundColor: '#d1d5db', opacity },
        style,
      ]}
    />
  );
}

export function CardSkeleton() {
  return (
    <View style={cardStyles.card}>
      <View style={cardStyles.header}>
        <SkeletonBlock width="60%" height={14} />
        <SkeletonBlock width={40} height={32} borderRadius={8} />
      </View>
      <SkeletonBlock width={80} height={28} borderRadius={6} style={{ marginTop: 8 }} />
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});

export function ListSkeleton({ rows = 5, rowHeight = 60 }: { rows?: number; rowHeight?: number }) {
  return (
    <View style={{ gap: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: 12,
            backgroundColor: '#fff',
            borderRadius: 12,
            height: rowHeight,
          }}
        >
          <SkeletonBlock width={40} height={40} borderRadius={20} />
          <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
            <SkeletonBlock width="70%" height={12} />
            <SkeletonBlock width="40%" height={10} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function DashboardSkeleton() {
  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc', padding: 16 }}>
      {/* Welcome banner skeleton */}
      <SkeletonBlock width="100%" height={80} borderRadius={20} style={{ marginBottom: 20 }} />
      {/* Stats grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={{ width: '48%' }}>
            <CardSkeleton />
          </View>
        ))}
      </View>
      {/* Section title */}
      <SkeletonBlock width={140} height={18} borderRadius={6} style={{ marginBottom: 12 }} />
      {/* Action items */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
        {[1, 2, 3].map((i) => (
          <SkeletonBlock key={i} width="30%" height={80} borderRadius={14} />
        ))}
      </View>
      {/* List */}
      <SkeletonBlock width={160} height={18} borderRadius={6} style={{ marginBottom: 12 }} />
      <ListSkeleton rows={3} rowHeight={64} />
    </View>
  );
}

export function ScreenSkeleton() {
  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc', padding: 16 }}>
      <SkeletonBlock width={180} height={22} borderRadius={6} style={{ marginBottom: 20 }} />
      <ListSkeleton rows={6} />
    </View>
  );
}

export default SkeletonBlock;
