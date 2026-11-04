const { getDefaultConfig } = require('@expo/metro-config');

// The app is a self-contained Expo project: its entry is `expo-router/entry`
// (declared in package.json "main"), and every Expo/React Native dependency is
// declared here rather than duplicated in the repository root. Expo SDK 52's
// default config resolves workspace packages in this monorepo, so no manual
// nodeModulesPaths override is needed.
module.exports = getDefaultConfig(__dirname);
