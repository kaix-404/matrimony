const path = require('path');
const { getDefaultConfig } = require('@expo/metro-config');

const config = getDefaultConfig(__dirname);

// Captured before it is replaced below, so the pass-through does not recurse.
const defaultResolveRequest = config.resolver.resolveRequest;

// React and React DOM must resolve to ONE copy, the one this app depends on.
//
// The repository root depends on React 19 for the admin dashboard, and npm
// hoists this app's shared Expo/React Native packages (expo, expo-router,
// react-native, react-native-screens, ...) up there. A module's `require('react')`
// is resolved from its own location, so those hoisted packages picked up the
// root's React 19 while this app's own code used the React 18 nested here.
// Two Reacts reached the bundle, and React Native 0.76's renderer reads
// `React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED`, which React 19
// renamed. It therefore read undefined and the app died the moment it opened.
//
// Pinning the specifier here keeps that from depending on where npm happens to
// place packages.
const appNodeModules = path.resolve(__dirname, 'node_modules');

function isReactSingleton(moduleName) {
  return (
    moduleName === 'react' ||
    moduleName === 'react-dom' ||
    moduleName.startsWith('react-dom/')
  );
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (isReactSingleton(moduleName)) {
    return {
      type: 'sourceFile',
      filePath: require.resolve(moduleName, { paths: [appNodeModules] }),
    };
  }

  return (defaultResolveRequest ?? context.resolveRequest)(
    context,
    moduleName,
    platform,
  );
};

module.exports = config;
