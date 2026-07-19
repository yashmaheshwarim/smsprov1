// Learn more https://docs.expo.io/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Ensure .cjs and .mjs extensions are resolvable
config.resolver.sourceExts = [
  ...config.resolver.sourceExts,
  'cjs',
  'mjs',
];

// Redirect native-only modules to local stubs for web.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // @iabtcf/core has "type": "module" + a conflicting "main" field that
  // Metro cannot reliably resolve, especially on Windows.
  if (moduleName === '@iabtcf/core') {
    return {
      filePath: path.resolve(__dirname, 'src/lib/iabtcf-core-stub.js'),
      type: 'sourceFile',
    };
  }

  // expo-updates is a native-only module — stub it out on web to avoid
  // a 500 error when Metro tries to resolve it for the web platform.
  if (platform === 'web' && moduleName === 'expo-updates') {
    return {
      filePath: path.resolve(__dirname, 'src/lib/expo-updates-stub.js'),
      type: 'sourceFile',
    };
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
