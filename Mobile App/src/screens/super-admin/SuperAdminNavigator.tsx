import React, { lazy, Suspense } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import DrawerContent from '../../components/DrawerContent';
import BackButton from '../../components/BackButton';

const SuperAdminDashboard = lazy(() => import('./DashboardScreen'));
const SuperAdminAnalytics = lazy(() => import('./AnalyticsScreen'));
const SuperAdminRevenue = lazy(() => import('./RevenueScreen'));
const SuperAdminWallet = lazy(() => import('./WalletScreen'));
const ManageMembers = lazy(() => import('./MembersScreen'));

const Drawer = createDrawerNavigator();

function Loader() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
      <ActivityIndicator size="large" color="#8b5cf6" />
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

export default function SuperAdminNavigator() {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={defaultOptions}
    >
      <Drawer.Screen name="Dashboard">
        {() => <Suspense fallback={<Loader />}><SuperAdminDashboard /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="Analytics" options={withBack('Analytics')}>
        {() => <Suspense fallback={<Loader />}><SuperAdminAnalytics /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="Revenue" options={withBack('Revenue')}>
        {() => <Suspense fallback={<Loader />}><SuperAdminRevenue /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="Wallet" options={withBack('Wallet')}>
        {() => <Suspense fallback={<Loader />}><SuperAdminWallet /></Suspense>}
      </Drawer.Screen>
      <Drawer.Screen name="Members" options={withBack('Members')}>
        {() => <Suspense fallback={<Loader />}><ManageMembers /></Suspense>}
      </Drawer.Screen>
    </Drawer.Navigator>
  );
}
