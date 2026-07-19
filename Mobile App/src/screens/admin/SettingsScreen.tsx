import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';

export default function SettingsScreen() {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.profileSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.name?.split(' ').map((n) => n[0]).join('').toUpperCase()}
          </Text>
        </View>
        <Text style={styles.userName}>{user?.name}</Text>
        <Text style={styles.userEmail}>{user?.email}</Text>
        <Text style={styles.userRole}>Role: {user?.role}</Text>
      </View>

      <View style={styles.menuSection}>
        <Text style={styles.menuTitle}>Settings</Text>
        <View style={styles.menuItem}>
          <Text style={styles.menuIcon}>🏛️</Text>
          <Text style={styles.menuLabel}>Institute Profile</Text>
        </View>
        <View style={styles.menuItem}>
          <Text style={styles.menuIcon}>🔒</Text>
          <Text style={styles.menuLabel}>Security</Text>
        </View>
        <View style={styles.menuItem}>
          <Text style={styles.menuIcon}>🔔</Text>
          <Text style={styles.menuLabel}>Notifications</Text>
        </View>
        <View style={styles.menuItem}>
          <Text style={styles.menuIcon}>💾</Text>
          <Text style={styles.menuLabel}>Data & Storage</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>🚪 Logout</Text>
      </TouchableOpacity>

      <Text style={styles.version}>Apex SMS v1.0 · Powered by Maheshwari Tech</Text>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  profileSection: { alignItems: 'center', marginBottom: 32, marginTop: 16 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: { fontSize: 24, fontWeight: '700', color: '#6366f1' },
  userName: { fontSize: 20, fontWeight: '700', color: '#111827' },
  userEmail: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  userRole: { fontSize: 13, color: '#6366f1', fontWeight: '600', marginTop: 4, textTransform: 'capitalize' },
  menuSection: { marginBottom: 24 },
  menuTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 12 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  menuIcon: { fontSize: 20, marginRight: 12 },
  menuLabel: { fontSize: 15, color: '#374151', fontWeight: '500' },
  logoutButton: {
    backgroundColor: '#fee2e2',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  logoutText: { color: '#ef4444', fontSize: 16, fontWeight: '600' },
  version: { textAlign: 'center', fontSize: 12, color: '#9ca3af' },
});
