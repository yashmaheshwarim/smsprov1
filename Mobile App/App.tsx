import React, { useEffect } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { NativeModules, TurboModuleRegistry } from 'react-native';

import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { NotificationProvider } from './src/contexts/NotificationContext';
import { RealtimeDataProvider } from './src/contexts/RealtimeDataContext';
import ErrorBoundary from './src/components/ErrorBoundary';
import LoginScreen from './src/screens/LoginScreen';
import * as Updates from 'expo-updates';


// Role-based navigators
import SuperAdminNavigator from './src/screens/super-admin/SuperAdminNavigator';
import AdminNavigator from './src/screens/admin/AdminNavigator';
import TeacherNavigator from './src/screens/teacher/TeacherNavigator';
import StudentNavigator from './src/screens/student/StudentNavigator';
import ParentNavigator from './src/screens/parent/ParentNavigator';

// ─── Navigation ref for cross-component navigation ──────────────────────
// This ref allows the notification response handler (which is outside the
// component tree) to navigate to the correct screen when the user taps
// on a push notification.
// Must use createNavigationContainerRef() — not React.createRef() — for
// React Navigation v7 compatibility.
export const navigationRef = createNavigationContainerRef<any>();

/**
 * Inner component that has access to the auth state.
 */
function AppContent() {
  const { isAuthenticated, user, isLoading } = useAuth();

  // ── AdMob initialization ───────────────────────────────────────────
  useEffect(() => {
    const hasAdMob =
      NativeModules.RNGoogleMobileAdsModule != null ||
      TurboModuleRegistry?.get('RNGoogleMobileAdsModule') != null;

    if (!hasAdMob) return;

    try {
      const adMobModule = require('react-native-google-mobile-ads');
      if (adMobModule && typeof adMobModule.mobileAds === 'function') {
        adMobModule.mobileAds().initialize();
      } else {
        console.warn('[AdMob] module loaded but mobileAds() is not a function');
      }
    } catch (err: any) {
      console.warn('[AdMob] Failed to initialize:', err?.message ?? err);
    }
  }, []);

  // ── OTA update handling ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function handleUpdates() {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable && !cancelled) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch (err: any) {
        console.warn('[OTA Update] Failed to fetch update:', err?.message ?? err);
      }
    }

    if (Updates.isEmbeddedLaunch) {
      handleUpdates();
    }

    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  switch (user?.role) {
    case 'super_admin':
      return <SuperAdminNavigator />;
    case 'admin':
      return <AdminNavigator />;
    case 'teacher':
      return <TeacherNavigator />;
    case 'student':
      return <StudentNavigator />;
    case 'parent':
      return <ParentNavigator />;
    default:
      return <LoginScreen />;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <NotificationProvider>
          <RealtimeDataProvider>
          <NavigationContainer ref={navigationRef}>
            <StatusBar style="auto" />
            <AppContent />
          </NavigationContainer>
          </RealtimeDataProvider>
          </NotificationProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
