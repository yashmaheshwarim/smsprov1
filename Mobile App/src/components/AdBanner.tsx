import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, NativeModules, TurboModuleRegistry } from 'react-native';

interface AdBannerProps {
  size?: 'banner' | 'largeBanner' | 'smartBanner';
}

type AdState =
  | { status: 'loading' }
  | { status: 'initializing' }
  | { status: 'unavailable' }
  | { status: 'ready' }
  | { status: 'failed'; error?: string }
  | { status: 'retrying'; attempt: number; nextRetry: number };

/**
 * Google AdMob Banner Component
 *
 * - In production builds (via EAS), renders a real AdMob banner
 * - In Expo Go, shows a styled placeholder with retry hint
 * - Auto-retries on failure with exponential backoff
 * - Tracks component visibility to reload ads when coming back to screen
 *
 * Test IDs (from Google):
 *   Android: ca-app-pub-3940256099942544/6300978111
 *   iOS:     ca-app-pub-3940256099942544/2934735716
 *
 * Production ad unit (replace with your own):
 */
const REAL_AD_UNIT_ID = 'ca-app-pub-4912868489225376/9429127408';
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 10_000; // 10 seconds, then 20s, then 40s

export default function AdBanner({ size = 'banner' }: AdBannerProps) {
  const [adState, setAdState] = useState<AdState>({ status: 'initializing' });
  const [adModules, setAdModules] = useState<{
    BannerAd: any;
    BannerAdSize: any;
    TestIds: any;
  } | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  const attemptLoad = useCallback(() => {
    if (!mountedRef.current) return;

    // Check if the native module exists
    const hasAdMob =
      NativeModules.RNGoogleMobileAdsModule != null ||
      TurboModuleRegistry?.get('RNGoogleMobileAdsModule') != null;

    if (!hasAdMob) {
      setAdState({ status: 'unavailable' });
      return;
    }

    try {
      const mod = require('react-native-google-mobile-ads');
      if (mod && mod.BannerAd && mod.BannerAdSize && mod.TestIds) {
        if (mountedRef.current) {
          setAdModules({ BannerAd: mod.BannerAd, BannerAdSize: mod.BannerAdSize, TestIds: mod.TestIds });
          setAdState({ status: 'ready' });
          retryCountRef.current = 0; // Reset retry count on success
        }
      } else {
        console.warn('[AdBanner] Module loaded but exports are incomplete');
        handleRetry('Module exports incomplete');
      }
    } catch (err: any) {
      console.warn('[AdBanner] Failed to load ad module:', err?.message ?? err);
      handleRetry(err?.message || 'Failed to load module');
    }
  }, []);

  const handleRetry = useCallback((errorMessage: string) => {
    retryCountRef.current += 1;
    const attempt = retryCountRef.current;

    if (attempt > MAX_RETRIES) {
      if (mountedRef.current) {
        setAdState({ status: 'failed', error: `Ad unavailable after ${MAX_RETRIES} retries` });
      }
      return;
    }

    const delay = RETRY_BASE_DELAY * Math.pow(2, attempt - 1);
    if (mountedRef.current) {
      setAdState({ status: 'retrying', attempt, nextRetry: delay / 1000 });
    }

    retryTimerRef.current = setTimeout(() => {
      if (mountedRef.current) {
        setAdState({ status: 'loading' });
        attemptLoad();
      }
    }, delay);
  }, [attemptLoad]);

  const handleAdFailed = useCallback((error: any) => {
    console.warn('[AdMob] Banner ad failed to load:', error);
    handleRetry(error?.message || 'Ad load failed');
  }, [handleRetry]);

  // Initialize on mount
  useEffect(() => {
    // Small delay to let the app initialize fully
    const initTimer = setTimeout(() => {
      attemptLoad();
    }, 500);

    return () => {
      clearTimeout(initTimer);
    };
  }, [attemptLoad]);

  // Auto-retry when back from failed/unavailable state on screen re-focus
  // Component remounts on navigation which triggers the init useEffect above

  // ─── Render by state ────────────────────────────────────────────

  // Loading state
  if (adState.status === 'initializing' || adState.status === 'loading') {
    return (
      <View style={styles.container}>
        <View style={styles.adBanner}>
          <View style={styles.adLabel}>
            <Text style={styles.adLabelText}>AD</Text>
          </View>
          <Text style={styles.adLoadingText}>Loading ad...</Text>
        </View>
      </View>
    );
  }

  // Retrying state
  if (adState.status === 'retrying') {
    return (
      <View style={styles.container}>
        <View style={styles.adBanner}>
          <View style={styles.adLabel}>
            <Text style={styles.adLabelText}>AD</Text>
          </View>
          <Text style={styles.adRetryText}>
            Retrying ad... (attempt {adState.attempt}/{MAX_RETRIES})
          </Text>
          <Text style={styles.adRetrySubtext}>in {adState.nextRetry}s</Text>
        </View>
      </View>
    );
  }

  // Native module unavailable (Expo Go)
  if (adState.status === 'unavailable') {
    return (
      <View style={styles.container}>
        <View style={styles.adBanner}>
          <View style={styles.adLabel}>
            <Text style={styles.adLabelText}>AD</Text>
          </View>
          <Text style={styles.adUnavailableText}>📢 Advertisement</Text>
          <Text style={styles.adSubText}>
            Build with EAS to see live ads
          </Text>
        </View>
      </View>
    );
  }

  // Ad permanently failed
  if (adState.status === 'failed') {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={[styles.adBanner, styles.adBannerFailed]}
          activeOpacity={0.7}
          onPress={() => {
            retryCountRef.current = 0;
            setAdState({ status: 'loading' });
            attemptLoad();
          }}
        >
          <View style={styles.adLabel}>
            <Text style={styles.adLabelText}>AD</Text>
          </View>
          <Text style={styles.adFailedText}>📢 Advertisement</Text>
          <Text style={styles.adRetrySubtext}>Tap to retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Ready: render real AdMob banner ──────────────────────────────
  if (!adModules) {
    return null;
  }

  const { BannerAd, BannerAdSize, TestIds } = adModules;

  let bannerSize: any;
  switch (size) {
    case 'largeBanner':
      bannerSize = BannerAdSize.LARGE_BANNER;
      break;
    case 'smartBanner':
      bannerSize = BannerAdSize.ANCHORED_ADAPTIVE_BANNER;
      break;
    case 'banner':
    default:
      bannerSize = BannerAdSize.BANNER;
      break;
  }

  return (
    <View style={styles.container}>
      <BannerAd
        unitId={__DEV__ ? TestIds.BANNER : REAL_AD_UNIT_ID}
        size={bannerSize}
        onAdLoaded={() => {
          console.log('[AdMob] Banner ad loaded successfully');
          if (mountedRef.current) {
            setAdState({ status: 'ready' });
          }
        }}
        onAdFailedToLoad={handleAdFailed}
        onAdOpened={() => console.log('[AdMob] Banner ad opened')}
        onAdClosed={() => console.log('[AdMob] Banner ad closed')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
    marginVertical: 8,
  },
  adBanner: {
    width: '100%',
    height: 56,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    position: 'relative',
  },
  adBannerFailed: {
    borderColor: '#fca5a5',
    borderStyle: 'dashed',
  },
  adLabel: {
    position: 'absolute',
    top: 2,
    left: 4,
    backgroundColor: '#e5e7eb',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
  },
  adLabelText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#6b7280',
    letterSpacing: 0.5,
  },
  adLoadingText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  adRetryText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  adRetrySubtext: {
    fontSize: 10,
    color: '#d1d5db',
    marginTop: 2,
  },
  adUnavailableText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6b7280',
  },
  adSubText: {
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 2,
  },
  adFailedText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#9ca3af',
  },
});
