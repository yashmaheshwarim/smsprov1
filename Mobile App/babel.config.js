module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-reanimated v4+ no longer requires the babel plugin.
    // Including it can cause runtime initialization failures.
  };
};
