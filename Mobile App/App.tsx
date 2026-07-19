import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { NativeModules, TurboModuleRegistry } from 'react-native';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { NotificationProvider } from './src/contexts/NotificationContext';
import ErrorBoundary from './src/components/ErrorBoundary';
import LoginScreen from './src/screens/LoginScreen';
import * as Updates from 'expo-updates';

// Role-based navigators
import SuperAdminNavigator from './src/screens/super-admin/SuperAdminNavigator';
import AdminNavigator from './src/screens/admin/AdminNavigator';
import TeacherNavigator from './src/screens/teacher/TeacherNavigator';
import StudentNavigator from './src/screens/student/StudentNavigator';
import ParentNavigator from './src/screens/parent/ParentNavigator';

function AppContent() {
  const { isAuthenticated, user, isLoading } = useAuth();

  // ── AdMob initialization ───────────────────────────────────────────
  // Only runs in native builds (not Expo Go). Must safely handle the
  // dynamic require because the module may not export what we expect in
  // all React Native / New Architecture configurations.
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

  // ── OTA update handling ────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function handleUpdates() {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable && !cancelled) {
          await Updates.fetchUpdateAsync();
          // Reload to apply the freshly downloaded update
          await Updates.reloadAsync();
        }
      } catch (err: any) {
        // Swallow update errors so they don't crash the app.
        // The embedded bundle will still run fine.
        console.warn('[OTA Update] Failed to fetch update:', err?.message ?? err);
      }
    }

    // Only check for updates when running the embedded bundle (fresh install),
    // not right after an OTA update was just applied and the app reloaded.
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

  // Role-based navigation
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
          <NavigationContainer>
            <StatusBar style="auto" />
            <AppContent />
          </NavigationContainer>
          </NotificationProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
