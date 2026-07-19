/**
 * Web stub for expo-updates.
 *
 * `expo-updates` is a native-only module.  On web, Metro would fail with a
 * 500 error trying to resolve it.  This stub provides the same API surface
 * so that shared code (e.g. App.tsx) can safely import `expo-updates`
 * regardless of platform.
 *
 * This file is substituted for `expo-updates` at the Metro level via
 * `resolveRequest` in `metro.config.js`.
 */

exports.checkForUpdateAsync = async function () {
  return { isAvailable: false };
};

exports.fetchUpdateAsync = async function () {};

exports.reloadAsync = async function () {
  if (typeof window !== 'undefined') {
    window.location.reload();
  }
};

exports.isEmbeddedLaunch = true;

exports.useUpdates = function () {
  return { currentlyRunning: { isEmbeddedLaunch: true } };
};
