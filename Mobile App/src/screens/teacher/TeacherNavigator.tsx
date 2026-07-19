import React, { lazy, Suspense } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import DrawerContent from '../../components/DrawerContent';
import BackButton from '../../components/BackButton';

const TeacherDashboard = lazy(() => import('./DashboardScreen'));
const TeacherAttendance = lazy(() => import('./AttendanceScreen'));
const TeacherExamAttendance = lazy(() => import('./ExamAttendanceScreen'));
const TeacherMarks = lazy(() => import('./MarksScreen'));
const TeacherLeaves = lazy(() => import('./LeavesScreen'));
const TeacherStudents = lazy(() => import('./StudentsScreen'));
const TeacherWhatsApp = lazy(() => import('./WhatsAppScreen'));
const TeacherAttendanceReport = lazy(() => import('./AttendanceReportScreen'));
const TeacherMarksReport = lazy(() => import('./MarksReportScreen'));
const TeacherNotifications = lazy(() => import('./NotificationsScreen'));

const Drawer = createDrawerNavigator();

function Loader() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
      <ActivityIndicator size="large" color="#f59e0b" />
    </View>
  );
}

const defaultOptions = {
  headerStyle: { backgroundColor: '#f59e0b' },
  headerTintColor: '#fff',
  headerTitleStyle: { fontWeight: '700' as const },
  drawerActiveBackgroundColor: '#fffbeb',
  drawerActiveTintColor: '#f59e0b',
  drawerInactiveTintColor: '#374151',
  drawerLabelStyle: { fontSize: 14, fontWeight: '500' as const },
};

const withBack = (title: string) => ({
  title,
  headerLeft: () => <BackButton />,
});

export default function TeacherNavigator() {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={defaultOptions}
    >
      <Drawer.Screen name="Dashboard" options={{ title: 'Dashboard' }}>
        {() => <Suspense fallback={<Loader />}><TeacherDashboard /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="Attendance" options={withBack('Attendance')}>
        {() => <Suspense fallback={<Loader />}><TeacherAttendance /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="ExamAttendance" options={withBack('Exam Attendance')}>
        {() => <Suspense fallback={<Loader />}><TeacherExamAttendance /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="Marks" options={withBack('Marks')}>
        {() => <Suspense fallback={<Loader />}><TeacherMarks /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="Students" options={withBack('Students')}>
        {() => <Suspense fallback={<Loader />}><TeacherStudents /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="WhatsApp" options={withBack('WhatsApp')}>
        {() => <Suspense fallback={<Loader />}><TeacherWhatsApp /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="AttendanceReport" options={withBack('Attendance Report')}>
        {() => <Suspense fallback={<Loader />}><TeacherAttendanceReport /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="MarksReport" options={withBack('Marks Report')}>
        {() => <Suspense fallback={<Loader />}><TeacherMarksReport /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="Leaves" options={withBack('Leave Requests')}>
        {() => <Suspense fallback={<Loader />}><TeacherLeaves /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="Notifications" options={withBack('Notifications')}>
        {() => <Suspense fallback={<Loader />}><TeacherNotifications /></Suspense>}
      </Drawer.Screen>
    </Drawer.Navigator>
  );
}
