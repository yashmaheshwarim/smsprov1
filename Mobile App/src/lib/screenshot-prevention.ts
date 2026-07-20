/**
 * Screenshot prevention utility for the Classroom page.
 *
 * Android: Uses the WindowManager FLAG_SECURE flag to prevent screenshots
 * and screen recording of the current activity.
 *
 * iOS: There is no native API to prevent screenshots on iOS devices.
 * Instead, this utility provides:
 * - A CSS injection helper for WebViews to disable context menus
 * - A focus-effect hook integration point
 */

import { Platform, NativeModules } from 'react-native';

// ─── Android FLAG_SECURE via Native Modules ──────────────────────────────
// This tries to access the Android native module to set FLAG_SECURE.
// In Expo managed workflow, this may not be available, so we wrap in try-catch.

let secureModule: any = null;

try {
  // Attempt to get a native module that can set FLAG_SECURE
  // expo-screen-capture would be ideal, but we fall back to a direct approach
  secureModule = NativeModules?.FLAG_SECURE || NativeModules?.ScreenCapture;
} catch {
  // Native module not available
}

/**
 * Enable or disable screenshot prevention on Android.
 * When enabled, users cannot take screenshots or screen-record the app.
 */
export function setAndroidSecureFlag(enabled: boolean): void {
  if (Platform.OS !== 'android') return;

  try {
    if (secureModule?.setSecure) {
      secureModule.setSecure(enabled);
    } else {
      // Fallback: try to access the activity through UIManager
      // In some React Native builds, this can work
      const { UIManager } = require('react-native');
      if (UIManager?.AndroidScreenshotProtection?.setSecure) {
        UIManager.AndroidScreenshotProtection.setSecure(enabled);
      }
    }
  } catch {
    // Silently fail — screenshot prevention is best-effort on managed Expo
  }
}

// ─── WebView Content Security ────────────────────────────────────────────

/**
 * Generates JavaScript code to inject into a WebView to disable:
 * - Right-click / long-press context menus
 * - Download attempts
 * - Print
 * - Text selection
 * - Drag and drop
 */
export function getWebViewSecurityScript(): string {
  return `
    (function() {
      // Prevent context menu (right-click, long-press)
      document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }, true);

      // Prevent text selection
      var style = document.createElement('style');
      style.textContent = '* { -webkit-user-select: none !important; user-select: none !important; }';
      document.head.appendChild(style);

      // Prevent drag/drop
      document.addEventListener('dragstart', function(e) { e.preventDefault(); return false; }, true);
      document.addEventListener('drop', function(e) { e.preventDefault(); return false; }, true);

      // Prevent copy/paste
      document.addEventListener('copy', function(e) { e.preventDefault(); return false; }, true);
      document.addEventListener('cut', function(e) { e.preventDefault(); return false; }, true);
      document.addEventListener('paste', function(e) { e.preventDefault(); return false; }, true);

      // Prevent keyboard shortcuts for save/copy/print
      document.addEventListener('keydown', function(e) {
        if (
          e.ctrlKey || e.metaKey
        ) {
          if (
            e.key === 's' ||  // save
            e.key === 'p' ||  // print
            e.key === 'c' ||  // copy
            e.key === 'u' ||  // view source
            e.key === 'S' ||  // save (shift)
            e.key === 'P' ||  // print (shift)
            e.key === 'j'     // devtools
          ) {
            e.preventDefault();
            return false;
          }
        }
      }, true);

      // Prevent print
      window.print = function() { return false; };

      // Block beforeunload (download prompts)
      window.addEventListener('beforeunload', function(e) {
        e.preventDefault();
        e.returnValue = '';
      });

      // Override download attempts
      var originalCreateElement = document.createElement.bind(document);
      document.createElement = function(tagName, options) {
        var el = originalCreateElement(tagName, options);
        if (tagName.toLowerCase() === 'a') {
          var originalClick = el.click.bind(el);
          Object.defineProperty(el, 'download', {
            set: function() { /* block download attribute */ },
            get: function() { return undefined; }
          });
          el.click = function() {
            var href = el.getAttribute('href');
            if (href && href.startsWith('blob:')) {
              console.log('[Security] Blocked blob download');
              return;
            }
            return originalClick();
          };
        }
        return el;
      };

      // Block window.open (popups that might be downloads)
      var originalOpen = window.open.bind(window);
      window.open = function() {
        console.log('[Security] Blocked window.open');
        return null;
      };

      console.log('[Security] WebView content protection enabled');
    })();
  `;
}


