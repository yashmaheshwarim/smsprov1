import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, NativeModules, TurboModuleRegistry } from 'react-native';

interface AdBannerProps {
  size?: 'banner' | 'largeBanner' | 'smartBanner';
}

/**
 * Google AdMob Banner Component
 *
 * In production / development builds (via EAS), this renders a real AdMob
 * banner. In Expo Go, where native modules are unavailable, it shows a
 * simple placeholder so the app doesn't crash.
 *
 * Test IDs (from Google):
 * - Android: ca-app-pub-3940256099942544/6300978111
 * - iOS:     ca-app-pub-3940256099942544/2934735716
 *
 * In production (__DEV__ = false), uses the REAL_AD_UNIT_ID below.
 * Replace REAL_AD_UNIT_ID with your actual AdMob ad unit ID from the console.
 */
export default function AdBanner({ size = 'banner' }: AdBannerProps) {
  const [adState, setAdState] = useState<
    | { status: 'loading' }
    | { status: 'unavailable' }
    | { status: 'ready'; BannerAd: any; BannerAdSize: any; TestIds: any }
    | { status: 'failed' }
  >({ status: 'loading' });

  useEffect(() => {
    // Check if the native module exists BEFORE loading the library.
    // Must check both NativeModules (legacy) and TurboModuleRegistry (new arch).
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
        setAdState({
          status: 'ready',
          BannerAd: mod.BannerAd,
          BannerAdSize: mod.BannerAdSize,
          TestIds: mod.TestIds,
        });
      } else {
        console.warn('[AdBanner] Module loaded but exports are incomplete');
        setAdState({ status: 'unavailable' });
      }
    } catch (err) {
      console.warn('[AdBanner] Failed to load ad module:', err);
      setAdState({ status: 'unavailable' });
    }
  }, []);

  const REAL_AD_UNIT_ID = 'ca-app-pub-4912868489225376/9429127408';

  // Still checking native availability
  if (adState.status === 'loading') {
    return (
      <View style={styles.container}>
        <View style={styles.fallbackBanner}>
          <Text style={styles.fallbackText}>📢</Text>
        </View>
      </View>
    );
  }

  // Native module unavailable (Expo Go)
  if (adState.status === 'unavailable') {
    return (
      <View style={styles.container}>
        <View style={styles.fallbackBanner}>
          <Text style={styles.fallbackText}>📢 Ad Placeholder</Text>
          <Text style={styles.subText}>Build with EAS to see live ads</Text>
        </View>
      </View>
    );
  }

  // Ad failed to load
  if (adState.status === 'failed') {
    return (
      <View style={styles.container}>
        <View style={styles.fallbackBanner}>
          <Text style={styles.fallbackText}>📢 Ad</Text>
        </View>
      </View>
    );
  }

  // --- Native module is available — render real AdMob banner ---
  const { BannerAd, BannerAdSize, TestIds } = adState;

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
        onAdLoaded={() => console.log('[AdMob] Banner ad loaded')}
        onAdFailedToLoad={(error: any) => {
          console.warn('[AdMob] Banner ad failed to load:', error);
          setAdState({ status: 'failed' });
        }}
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
  },
  fallbackBanner: {
    width: '100%',
    height: 50,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  fallbackText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  subText: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
  },
});
