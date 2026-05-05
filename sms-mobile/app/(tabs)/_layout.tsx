import { Tabs } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { TouchableOpacity, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { DrawerMenu, DrawerHeader } from './drawer-layout';

export default function TabLayout() {
  const { role, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleLogout = () => {
    logout();
  };

  return (
    <View style={{ flex: 1 }}>
      <DrawerHeader onMenuPress={() => setDrawerOpen(true)} />
      <DrawerMenu isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { backgroundColor: '#ffffff', borderTopColor: '#e2e8f0', borderTopWidth: 1 },
          tabBarActiveTintColor: '#3b82f6',
          tabBarInactiveTintColor: '#94a3b8',
          tabBarLabelStyle: { fontSize: 12, fontWeight: '500' },
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color }) => <Ionicons name="grid-outline" size={24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="institutes"
          options={{
            title: 'Institutes',
            tabBarIcon: ({ color }) => <Ionicons name="business-outline" size={24} color={color} />,
            href: role === 'superadmin' ? '/(tabs)/institutes' : null,
          }}
        />
        <Tabs.Screen
          name="analytics"
          options={{
            title: 'Analytics',
            tabBarIcon: ({ color }) => <Ionicons name="stats-chart-outline" size={24} color={color} />,
            href: role === 'superadmin' ? '/(tabs)/analytics' : null,
          }}
        />
        <Tabs.Screen
          name="students"
          options={{
            title: 'Students',
            tabBarIcon: ({ color }) => <Ionicons name="people-outline" size={24} color={color} />,
            href: role === 'admin' || role === 'teacher' ? '/(tabs)/students' : null,
          }}
        />
        <Tabs.Screen
          name="teachers"
          options={{
            title: 'Teachers',
            tabBarIcon: ({ color }) => <Ionicons name="school-outline" size={24} color={color} />,
            href: role === 'admin' ? '/(tabs)/teachers' : null,
          }}
        />
        <Tabs.Screen
          name="attendance"
          options={{
            title: 'Attendance',
            tabBarIcon: ({ color }) => <Ionicons name="calendar-outline" size={24} color={color} />,
            href: role && role !== 'superadmin' ? '/(tabs)/attendance' : null,
          }}
        />
        <Tabs.Screen
          name="fees"
          options={{
            title: 'Fees',
            tabBarIcon: ({ color }) => <Ionicons name="cash-outline" size={24} color={color} />,
            href: role === 'admin' ? '/(tabs)/fees' : null,
          }}
        />
      </Tabs>
    </View>
  );
}
