import React, { lazy, Suspense } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DrawerContent from '../../components/DrawerContent';
import BackButton from '../../components/BackButton';

const AdminDashboard = lazy(() => import('./DashboardScreen'));
const StudentsScreen = lazy(() => import('./StudentsScreen'));
const StudentDetailScreen = lazy(() => import('./StudentDetailScreen'));
const AttendanceScreen = lazy(() => import('./AttendanceScreen'));
const ExamAttendanceScreen = lazy(() => import('./ExamAttendanceScreen'));
const FeesScreen = lazy(() => import('./FeesScreen'));
const MarksScreen = lazy(() => import('./MarksScreen'));
const BatchesScreen = lazy(() => import('./BatchesScreen'));
const AdmissionsScreen = lazy(() => import('./AdmissionsScreen'));
const TeachersScreen = lazy(() => import('./TeachersScreen'));
const WhatsAppScreen = lazy(() => import('./WhatsAppScreen'));
const CalendarScreen = lazy(() => import('./CalendarScreen'));
const ClassroomScreen = lazy(() => import('./ClassroomScreen'));
const SettingsScreen = lazy(() => import('./SettingsScreen'));
const AnnouncementsScreen = lazy(() => import('./AnnouncementsScreen'));

const Drawer = createDrawerNavigator();
const StudentsStack = createNativeStackNavigator();

function Loader() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
      <ActivityIndicator size="large" color="#6366f1" />
    </View>
  );
}

function StudentsStackScreen() {
  return (
    <StudentsStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#6366f1' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <StudentsStack.Screen
        name="StudentsList"
        options={{ title: 'Students', headerLeft: () => <BackButton /> }}
      >
        {() => <Suspense fallback={<Loader />}><StudentsScreen /></Suspense>}
      </StudentsStack.Screen>
      <StudentsStack.Screen name="StudentDetail" options={{ title: 'Details' }}>
        {() => <Suspense fallback={<Loader />}><StudentDetailScreen /></Suspense>}
      </StudentsStack.Screen>
    </StudentsStack.Navigator>
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

export default function AdminNavigator() {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={defaultOptions}
    >
      <Drawer.Screen name="Dashboard" options={{ title: 'Dashboard', drawerLabel: 'Dashboard', drawerIcon: () => null }}>
        {() => <Suspense fallback={<Loader />}><AdminDashboard /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="Students" options={{ title: 'Students', headerShown: false, drawerLabel: 'Students' }}>
        {() => <Suspense fallback={<Loader />}><StudentsStackScreen /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="Attendance" options={withBack('Attendance')}>
        {() => <Suspense fallback={<Loader />}><AttendanceScreen /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="ExamAttendance" options={withBack('Exam Attendance')}>
        {() => <Suspense fallback={<Loader />}><ExamAttendanceScreen /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="Fees" options={withBack('Fees & Invoices')}>
        {() => <Suspense fallback={<Loader />}><FeesScreen /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="Marks" options={withBack('Marks & Reports')}>
        {() => <Suspense fallback={<Loader />}><MarksScreen /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="Batches" options={withBack('Batches')}>
        {() => <Suspense fallback={<Loader />}><BatchesScreen /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="Admissions" options={withBack('Admissions')}>
        {() => <Suspense fallback={<Loader />}><AdmissionsScreen /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="Teachers" options={withBack('Teachers')}>
        {() => <Suspense fallback={<Loader />}><TeachersScreen /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="WhatsApp" options={withBack('WhatsApp')}>
        {() => <Suspense fallback={<Loader />}><WhatsAppScreen /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="Classroom" options={withBack('Classroom')}>
        {() => <Suspense fallback={<Loader />}><ClassroomScreen /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="Calendar" options={withBack('Calendar')}>
        {() => <Suspense fallback={<Loader />}><CalendarScreen /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="Announcements" options={withBack('Announcements')}>
        {() => <Suspense fallback={<Loader />}><AnnouncementsScreen /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="Settings" options={withBack('Settings')}>
        {() => <Suspense fallback={<Loader />}><SettingsScreen /></Suspense>}
      </Drawer.Screen>
    </Drawer.Navigator>
  );
}
