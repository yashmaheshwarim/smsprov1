import { Tabs } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  const { role, logout } = useAuth();

  const handleLogout = () => {
    logout();
  };

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#1e293b' },
        headerTintColor: '#f8fafc',
        tabBarStyle: { backgroundColor: '#1e293b', borderTopColor: '#334155' },
        tabBarActiveTintColor: '#3b82f6',
        tabBarInactiveTintColor: '#94a3b8',
        headerRight: () => (
          <TouchableOpacity onPress={handleLogout} style={{ marginRight: 16 }}>
            <Ionicons name="log-out-outline" size={24} color="#f8fafc" />
          </TouchableOpacity>
        ),
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
        name="attendance"
        options={{
          title: 'Attendance',
          tabBarIcon: ({ color }) => <Ionicons name="calendar-outline" size={24} color={color} />,
          href: role && role !== 'superadmin' ? '/(tabs)/attendance' : null,
        }}
      />
    </Tabs>
  );
}
