// MUST be first import for @react-navigation/drawer to work
import 'react-native-gesture-handler';

import { registerRootComponent } from 'expo';
import App from './App';

// Set up global error handler to catch any unhandled errors that might
// otherwise silently prevent AppRegistry.registerComponent from being called
if (typeof ErrorUtils !== 'undefined') {
  const originalHandler = ErrorUtils.getGlobalHandler && ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    console.error('[GlobalErrorHandler]', error?.message, error?.stack);
    if (originalHandler) {
      originalHandler(error, isFatal);
    }
  });
}

// Catch unhandled promise rejections
if (typeof process !== 'undefined' && process.on) {
  process.on('unhandledRejection', (reason) => {
    console.error('[UnhandledRejection]', reason);
  });
}

// Explicitly register the root component for Expo SDK 52 + Bridgeless mode
registerRootComponent(App);
