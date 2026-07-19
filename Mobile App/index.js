// MUST be first import for @react-navigation/drawer to work
import 'react-native-gesture-handler';

import { registerRootComponent } from 'expo';
import App from './App';

// ── Global JS Error Handler ──────────────────────────────────────────
// Wraps ErrorUtils.setGlobalHandler safely; in some RN 0.81 / New Arch
// configurations the API shape differs, so we check the type before
// assigning.
if (typeof ErrorUtils !== 'undefined') {
  const originalHandler =
    typeof ErrorUtils.getGlobalHandler === 'function'
      ? ErrorUtils.getGlobalHandler()
      : null;

  if (typeof ErrorUtils.setGlobalHandler === 'function') {
    ErrorUtils.setGlobalHandler((error, isFatal) => {
      console.error('[GlobalErrorHandler]', error?.message, error?.stack);
      if (typeof originalHandler === 'function') {
        originalHandler(error, isFatal);
      }
    });
  }
}

// ── Unhandled Promise Rejections ─────────────────────────────────────
// Hermes / RN does not always expose process.on – guard safely.
try {
  if (typeof process !== 'undefined' && typeof process.on === 'function') {
    process.on('unhandledRejection', (reason) => {
      console.error('[UnhandledRejection]', reason);
    });
  }
} catch {
  // process.on may throw in some environments
}

// Explicitly register the root component for Expo SDK 52 + Bridgeless mode
registerRootComponent(App);
