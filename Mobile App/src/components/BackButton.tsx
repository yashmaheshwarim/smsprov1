import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';

interface BackButtonProps {
  fallback?: string;
}

export default function BackButton({ fallback = 'Dashboard' }: BackButtonProps) {
  const navigation = useNavigation<any>();

  const handlePress = () => {
    try {
      navigation.navigate(fallback);
    } catch {
      navigation.goBack();
    }
  };

  return (
    <TouchableOpacity onPress={handlePress} style={styles.button} activeOpacity={0.7}>
      <Text style={styles.icon}>←</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingLeft: 8,
    paddingRight: 12,
    paddingVertical: 8,
  },
  icon: {
    fontSize: 22,
    color: '#fff',
    fontWeight: '600',
  },
});
