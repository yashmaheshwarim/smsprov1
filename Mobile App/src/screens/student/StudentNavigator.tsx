import React, { lazy, Suspense } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import DrawerContent from '../../components/DrawerContent';
import BackButton from '../../components/BackButton';

const StudentDashboard = lazy(() => import('./DashboardScreen'));
const StudentAttendance = lazy(() => import('./AttendanceScreen'));
const StudentFees = lazy(() => import('./FeesScreen'));
const StudentMarks = lazy(() => import('./MarksScreen'));
const StudentNotifications = lazy(() => import('./NotificationsScreen'));
const StudentClassroom = lazy(() => import('./ClassroomScreen'));

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

export default function StudentNavigator() {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={defaultOptions}
    >
      <Drawer.Screen name="Dashboard" options={withBack('Dashboard')}>
        {() => <Suspense fallback={<Loader />}><StudentDashboard /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="Attendance" options={withBack('Attendance')}>
        {() => <Suspense fallback={<Loader />}><StudentAttendance /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="Fees" options={withBack('Fees')}>
        {() => <Suspense fallback={<Loader />}><StudentFees /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="Marks" options={withBack('Marks')}>
        {() => <Suspense fallback={<Loader />}><StudentMarks /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="Notifications" options={withBack('Notifications')}>
        {() => <Suspense fallback={<Loader />}><StudentNotifications /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="Classroom" options={withBack('Classroom')}>
        {() => <Suspense fallback={<Loader />}><StudentClassroom /></Suspense>}
      </Drawer.Screen>
    </Drawer.Navigator>
  );
}
