import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';

interface DrawerItem {
  name: string;
  label: string;
  icon: string;
  route?: string;
}

const superAdminItems: DrawerItem[] = [
  { name: 'Dashboard', label: 'Dashboard', icon: '📊' },
  { name: 'Analytics', label: 'Analytics', icon: '📈' },
  { name: 'Revenue', label: 'Revenue', icon: '💰' },
  { name: 'Wallet', label: 'Wallet', icon: '👛' },
  { name: 'Members', label: 'Members', icon: '👥' },
];

const adminItems: DrawerItem[] = [
  { name: 'Dashboard', label: 'Dashboard', icon: '📊', route: 'Dashboard' },
  { name: 'Students', label: 'Students', icon: '👨‍🎓', route: 'Students' },
  { name: 'Attendance', label: 'Attendance', icon: '📋', route: 'Attendance' },
  { name: 'ExamAttendance', label: 'Exam', icon: '📝', route: 'ExamAttendance' },
  { name: 'Fees', label: 'Fees', icon: '💰', route: 'Fees' },
  { name: 'Marks', label: 'Marks & Reports', icon: '📝', route: 'Marks' },
  { name: 'Batches', label: 'Batches', icon: '📚', route: 'Batches' },
  { name: 'Admissions', label: 'Admissions', icon: '📥', route: 'Admissions' },
  { name: 'Teachers', label: 'Teachers', icon: '👨‍🏫', route: 'Teachers' },
  { name: 'Announcements', label: '📣 Announce', icon: '📣', route: 'Announcements' },
  { name: 'WhatsApp', label: 'WhatsApp', icon: '💬', route: 'WhatsApp' },
  { name: 'Classroom', label: 'Classroom', icon: '🎓', route: 'Classroom' },
  { name: 'Calendar', label: 'Calendar', icon: '📅', route: 'Calendar' },
  { name: 'Settings', label: 'Settings', icon: '⚙️', route: 'Settings' },
];

const teacherItems: DrawerItem[] = [
  { name: 'Dashboard', label: 'Dashboard', icon: '📊' },
  { name: 'Notifications', label: '🔔 Notifications', icon: '🔔' },
  { name: 'Attendance', label: 'Attendance', icon: '📋' },
  { name: 'ExamAttendance', label: 'Exam Att.', icon: '📝' },
  { name: 'Marks', label: 'Marks', icon: '📝' },
  { name: 'Students', label: 'Students', icon: '👨‍🎓' },
  { name: 'Leaves', label: 'Leave Requests', icon: '📅' },
  { name: 'AttendanceReport', label: 'Att. Report', icon: '📊' },
  { name: 'MarksReport', label: 'Marks Report', icon: '📈' },
  { name: 'WhatsApp', label: 'WhatsApp', icon: '💬' },
];

const studentItems: DrawerItem[] = [
  { name: 'Dashboard', label: 'Dashboard', icon: '📊' },
  { name: 'Notifications', label: '🔔 Notifications', icon: '🔔' },
  { name: 'Attendance', label: 'Attendance', icon: '📋' },
  { name: 'Fees', label: 'Fees', icon: '💰' },
  { name: 'Marks', label: 'Marks', icon: '📝' },
];

const parentItems: DrawerItem[] = [
  { name: 'Dashboard', label: 'Dashboard', icon: '📊' },
  { name: 'Attendance', label: 'Attendance', icon: '📋' },
  { name: 'Fees', label: 'Fees', icon: '💰' },
  { name: 'Marks', label: 'Marks', icon: '📝' },
];

export default function DrawerContent(props: any) {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const role = user?.role || 'admin';

  let items: DrawerItem[] = [];
  let roleLabel = '';
  let roleIcon = '';
  let accentColor = '#6366f1';
  let bgGradient = '#eef2ff';

  switch (role) {
    case 'super_admin':
      items = superAdminItems;
      roleLabel = 'Super Admin';
      roleIcon = '🛡️';
      accentColor = '#8b5cf6';
      bgGradient = '#f5f3ff';
      break;
    case 'admin':
      items = adminItems;
      roleLabel = 'Institute Admin';
      roleIcon = '🏛️';
      accentColor = '#6366f1';
      bgGradient = '#eef2ff';
      break;
    case 'teacher':
      items = teacherItems;
      roleLabel = 'Teacher';
      roleIcon = '👨‍🏫';
      accentColor = '#f59e0b';
      bgGradient = '#fffbeb';
      break;
    case 'student':
      items = studentItems;
      roleLabel = 'Student';
      roleIcon = '🎓';
      accentColor = '#06b6d4';
      bgGradient = '#ecfeff';
      break;
    case 'parent':
      items = parentItems;
      roleLabel = 'Parent';
      roleIcon = '👨‍👩‍👧‍👦';
      accentColor = '#22c55e';
      bgGradient = '#f0fdf4';
      break;
  }

  const handleLogout = useCallback(() => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: logout },
      ]
    );
  }, [logout]);

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === 'ios' ? insets.top : StatusBar.currentHeight || 0 }]}>
      {/* Gradient Header */}
      <View style={[styles.compactHeader, { backgroundColor: accentColor }]} />

      {/* User Info Section */}
      <View style={[styles.userSection, { backgroundColor: bgGradient }]}>
        <View style={[styles.userAvatar, { backgroundColor: accentColor + '20' }]}>
          <Text style={[styles.userAvatarText, { color: accentColor }]}>
            {user?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
          </Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{user?.name || 'User'}</Text>
          <Text style={styles.userEmail} numberOfLines={1}>{user?.email || ''}</Text>
          <View style={[styles.roleBadge, { backgroundColor: accentColor + '15' }]}>
            <Text style={[styles.roleText, { color: accentColor }]}>{roleIcon} {roleLabel}</Text>
          </View>
        </View>
      </View>

      <View style={styles.divider} />

      {/* Navigation Items */}
      <ScrollView style={styles.navList} showsVerticalScrollIndicator={false}>
        {items.map((item, index) => {
          const isActive = props.state?.routeNames?.[props.state.index] === item.name;
          return (
            <TouchableOpacity
              key={item.name}
              style={[
                styles.navItem,
                isActive && { backgroundColor: accentColor + '12' },
                index === 0 && { marginTop: 0 },
              ]}
              onPress={() => {
                if (item.route) {
                  props.navigation.navigate(item.route);
                } else {
                  props.navigation.navigate(item.name);
                }
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.navIcon}>{item.icon}</Text>
              <Text
                style={[
                  styles.navLabel,
                  isActive && { color: accentColor, fontWeight: '700' as const },
                ]}
              >
                {item.label}
              </Text>
              {isActive && (
                <View style={[styles.activeIndicator, { backgroundColor: accentColor }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.divider} />

      {/* Bottom Actions */}
      <View style={[styles.bottomSection, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity style={[styles.logoutButton]} onPress={handleLogout} activeOpacity={0.7}>
          <Text style={styles.logoutIcon}>🚪</Text>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
        <Text style={styles.versionText}>v1.0 · Maheshwari Tech</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  compactHeader: {
    height: 3,
    backgroundColor: '#6366f1',
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  userAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6366f1',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 4,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#eef2ff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  roleText: {
    fontSize: 10,
    color: '#6366f1',
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
  },
  navList: {
    flex: 1,
    paddingVertical: 8,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginHorizontal: 12,
    marginVertical: 1,
    borderRadius: 12,
    position: 'relative',
  },
  navIcon: {
    fontSize: 18,
    marginRight: 12,
    width: 28,
    textAlign: 'center',
  },
  navLabel: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
    flex: 1,
  },
  navLabelActive: {
    color: '#6366f1',
    fontWeight: '600',
  },
  activeIndicator: {
    width: 4,
    height: 20,
    backgroundColor: '#6366f1',
    borderRadius: 2,
    position: 'absolute',
    left: 0,
  },
  bottomSection: {
    padding: 16,
    backgroundColor: '#fff',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
  },
  logoutIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ef4444',
  },
  versionText: {
    fontSize: 11,
    color: '#9ca3af',
    textAlign: 'center',
  },
});
