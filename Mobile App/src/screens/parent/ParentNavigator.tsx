import React, { lazy, Suspense } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import DrawerContent from '../../components/DrawerContent';
import BackButton from '../../components/BackButton';

const ParentDashboard = lazy(() => import('./DashboardScreen'));
const ParentAttendance = lazy(() => import('./AttendanceScreen'));
const ParentFees = lazy(() => import('./FeesScreen'));
const ParentMarks = lazy(() => import('./MarksScreen'));

const Drawer = createDrawerNavigator();

function Loader() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
      <ActivityIndicator size="large" color="#6366f1" />
    </View>
  );
}

const defaultOptions = {
  headerStyle: { backgroundColor: '#6366f1' },
  headerTintColor: '#fff',
  headerTitleStyle: { fontWeight: '700' as const },
  drawerActiveBackgroundColor: '#eef2ff',
  drawerActiveTintColor: '#6366f1',
  drawerInactiveTintColor: '#374151',
  drawerLabelStyle: { fontSize: 14, fontWeight: '500' as const },
};

const withBack = (title: string) => ({
  title,
  headerLeft: () => <BackButton />,
});

export default function ParentNavigator() {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={defaultOptions}
    >
      <Drawer.Screen name="Dashboard" options={{ title: 'Dashboard' }}>
        {() => <Suspense fallback={<Loader />}><ParentDashboard /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="Attendance" options={withBack('Attendance')}>
        {() => <Suspense fallback={<Loader />}><ParentAttendance /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="Fees" options={withBack('Fees')}>
        {() => <Suspense fallback={<Loader />}><ParentFees /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="Marks" options={withBack('Marks')}>
        {() => <Suspense fallback={<Loader />}><ParentMarks /></Suspense>}
      </Drawer.Screen>
    </Drawer.Navigator>
  );
}
